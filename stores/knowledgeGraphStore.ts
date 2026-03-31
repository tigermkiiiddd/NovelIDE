/**
 * @file knowledgeGraphStore.ts
 * @description 知识图谱状态管理 - 三级分类 + Tag系统 + 记忆智能算法
 */

import { FileNode, KnowledgeNodeMetadata, KnowledgeNodeDynamicState } from '../types';
import {
  KnowledgeCategory,
  KnowledgeNode,
  KnowledgeNodeDraft,
  KnowledgeEdge,
  KnowledgeEdgeType,
  DEFAULT_SUB_CATEGORIES,
  SUB_CATEGORY_MIGRATION,
} from '../types';
import { create } from 'zustand';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';
import { dbAPI } from '../services/persistence';
import {
  createKnowledgeNodeMetadata,
  getKnowledgeNodeDynamicState,
  applyKnowledgeNodeEvent,
  scoreKnowledgeNodeRecall,
} from '../utils/knowledgeIntelligence';
import { extractKnowledgeFromDocument, extractKnowledgeFromDialogue, KnowledgeOperation } from '../services/subAgents/knowledgeExtractionAgent';
import { AIService } from '../services/geminiService';
import { useAgentStore } from './agentStore';

// ============================================
// 类型定义
// ============================================

interface KnowledgeGraphState {
  // 数据
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  // 可用的二级分类（动态扩展）
  availableSubCategories: Record<KnowledgeCategory, string[]>;
  // 可用的标签（动态扩展）
  availableTags: string[];

  // 状态
  currentProjectId: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  isExtracting: boolean;
  extractionError: string | null;

  // 节点操作
  addNode: (draft: KnowledgeNodeDraft) => KnowledgeNode;
  updateNode: (id: string, updates: Partial<KnowledgeNode>) => void;
  deleteNode: (id: string) => void;
  getNodeById: (id: string) => KnowledgeNode | undefined;

  // 记忆智能操作
  recallNode: (id: string) => KnowledgeNode | undefined;
  reinforceNode: (id: string) => KnowledgeNode | undefined;
  getNodeDynamicState: (id: string) => KnowledgeNodeDynamicState | null;

  // 查询方法
  getNodesByCategory: (category: KnowledgeCategory) => KnowledgeNode[];
  getNodesBySubCategory: (category: KnowledgeCategory, subCategory: string) => KnowledgeNode[];
  getNodesByTag: (tag: string) => KnowledgeNode[];
  getNodesByTopic: (topic: string) => KnowledgeNode[];
  getChildNodes: (parentId: string) => KnowledgeNode[];
  searchNodes: (query: string) => KnowledgeNode[];
  searchNodesWithScore: (query: string, limit?: number) => { node: KnowledgeNode; score: number }[];

  // 边操作
  addEdge: (from: string, to: string, type: KnowledgeEdgeType, note?: string) => void;
  removeEdge: (edgeId: string) => void;
  getEdgesForNode: (nodeId: string) => KnowledgeEdge[];

  // 分类管理
  addSubCategory: (category: KnowledgeCategory, subCategory: string) => void;
  addTag: (tag: string) => void;

  // 统计
  getStats: () => {
    totalNodes: number;
    totalEdges: number;
    byCategory: Record<KnowledgeCategory, number>;
    bySubCategory: Record<string, number>;
    topTags: { tag: string; count: number }[];
  };

  // 加载/保存
  loadFromProject: (projectId: string) => Promise<void>;
  ensureInitialized: (projectId?: string) => Promise<void>;

  // 知识提取
  triggerDocumentExtraction: (
    filePath: string,
    content: string
  ) => Promise<{ added: number; updated: number; linked: number; skipped: number; summary: string } | null>;

  triggerConversationExtraction: (
    userMessage: string,
    recentMessages: Array<{ role: string; text: string }>
  ) => Promise<{ added: number; updated: number; linked: number; skipped: number; summary: string } | null>;
}


// ============================================
// 常量
// ============================================

const KNOWLEDGE_FILE_NAME = '长期记忆.json';
const KNOWLEDGE_FOLDER_NAME = '00_基础信息';

const generateId = () => `kg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ============================================
// 辅助函数
// ============================================

const resolveActiveProjectId = () =>
  useProjectStore.getState().currentProjectId || useFileStore.getState().currentProjectId || null;

// ============================================
// Store 创建
// ============================================

export const useKnowledgeGraphStore = create<KnowledgeGraphState>((set, get) => ({
  // ============================================
  // 初始状态
  // ============================================
  nodes: [],
  edges: [],
  availableSubCategories: { ...DEFAULT_SUB_CATEGORIES },
  availableTags: [],
  currentProjectId: null,
  isLoading: false,
  isInitialized: false,
  isExtracting: false,
  extractionError: null,

  // ============================================
  // 节点操作
  // ============================================

  addNode: (draft: KnowledgeNodeDraft) => {
    const now = Date.now();
    const metadata = draft.metadata ?? createKnowledgeNodeMetadata(draft.importance);
    // Defensive: ensure tags is always a valid array
    const safeTags = Array.isArray(draft.tags) ? draft.tags : [];
    const newNode: KnowledgeNode = {
      ...draft,
      tags: safeTags,
      id: generateId(),
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      // 更新可用标签
      const newTags = safeTags.filter((t) => !state.availableTags.includes(t));

      // 更新可用二级分类
      const newSubCategories = { ...state.availableSubCategories };
      if (!newSubCategories[draft.category].includes(draft.subCategory)) {
        newSubCategories[draft.category] = [...newSubCategories[draft.category], draft.subCategory];
      }

      return {
        nodes: [...state.nodes, newNode],
        availableTags: [...state.availableTags, ...newTags],
        availableSubCategories: newSubCategories,
      };
    });

    // 保存到文件（用户偏好会保存到全局存储，项目知识保存到项目文件）
    setTimeout(() => saveToFile(get()), 1000);
    return newNode;
  },

  updateNode: (id: string, updates: Partial<KnowledgeNode>) => {
    // Defensive: ensure tags is always a valid array
    const safeUpdates = { ...updates };
    if ('tags' in safeUpdates) {
      safeUpdates.tags = Array.isArray(safeUpdates.tags) ? safeUpdates.tags : [];
    }
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, ...safeUpdates, updatedAt: Date.now() } : node
      ),
    }));
    setTimeout(() => saveToFile(get()), 1000);
  },

  deleteNode: (id: string) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter((edge) => edge.from !== id && edge.to !== id),
    }));
    setTimeout(() => saveToFile(get()), 1000);
  },

  getNodeById: (id: string) => {
    return get().nodes.find((node) => node.id === id);
  },

  // ============================================
  // 记忆智能操作
  // ============================================

  recallNode: (id: string) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return undefined;

    const updatedNode = applyKnowledgeNodeEvent(node, 'recall');
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? updatedNode : n)),
    }));
    setTimeout(() => saveToFile(get()), 1000);
    return updatedNode;
  },

  reinforceNode: (id: string) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return undefined;

    const updatedNode = applyKnowledgeNodeEvent(node, 'reinforce');
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? updatedNode : n)),
    }));
    setTimeout(() => saveToFile(get()), 1000);
    return updatedNode;
  },

  getNodeDynamicState: (id: string) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node || !node.metadata) return null;
    return getKnowledgeNodeDynamicState(node);
  },

  // ============================================
  // 查询方法
  // ============================================

  getNodesByCategory: (category: KnowledgeCategory) => {
    return get().nodes.filter((node) => node.category === category);
  },

  getNodesBySubCategory: (category: KnowledgeCategory, subCategory: string) => {
    return get().nodes.filter(
      (node) => node.category === category && node.subCategory === subCategory
    );
  },

  getNodesByTag: (tag: string) => {
    return get().nodes.filter((node) => node.tags.includes(tag));
  },

  getNodesByTopic: (topic: string) => {
    return get().nodes.filter((node) => node.topic === topic);
  },

  getChildNodes: (parentId: string) => {
    return get().nodes.filter((node) => node.parentId === parentId);
  },

  searchNodes: (query: string) => {
    if (!query.trim()) return get().nodes;
    const tokens = query.toLowerCase().split(/[\s,.;:!?，。；：！？、/\\|()[\]{}"'`~]+/).filter(Boolean);
    if (tokens.length === 0) return get().nodes;
    
    return get().nodes.filter((node) =>
      tokens.some((tok) =>
        node.name.toLowerCase().includes(tok) ||
        node.summary.toLowerCase().includes(tok) ||
        node.tags.some((t) => t.toLowerCase().includes(tok)) ||
        (node.topic && node.topic.toLowerCase().includes(tok))
      )
    );
  },

  searchNodesWithScore: (query: string, limit = 10) => {
    const nodes = get().nodes;
    const scored = nodes
      .map((node) => ({
        node,
        score: scoreKnowledgeNodeRecall(node, query).total,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored;
  },

  // ============================================
  // 边操作
  // ============================================

  addEdge: (from: string, to: string, type: KnowledgeEdgeType, note?: string) => {
    const newEdge: KnowledgeEdge = {
      id: generateId(),
      from,
      to,
      type,
      note,
      createdAt: Date.now(),
    };

    set((state) => ({
      edges: [...state.edges, newEdge],
    }));
    setTimeout(() => saveToFile(get()), 1000);
  },

  removeEdge: (edgeId: string) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId),
    }));
    setTimeout(() => saveToFile(get()), 1000);
  },

  getEdgesForNode: (nodeId: string) => {
    return get().edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  },

  // ============================================
  // 分类管理
  // ============================================

  addSubCategory: (category: KnowledgeCategory, subCategory: string) => {
    set((state) => {
      if (state.availableSubCategories[category].includes(subCategory)) {
        return state;
      }
      return {
        availableSubCategories: {
          ...state.availableSubCategories,
          [category]: [...state.availableSubCategories[category], subCategory],
        },
      };
    });
    setTimeout(() => saveToFile(get()), 1000);
  },

  addTag: (tag: string) => {
    set((state) => {
      if (state.availableTags.includes(tag)) {
        return state;
      }
      return {
        availableTags: [...state.availableTags, tag],
      };
    });
    setTimeout(() => saveToFile(get()), 1000);
  },

  // ============================================
  // 统计
  // ============================================

  getStats: () => {
    const state = get();
    const byCategory: Record<KnowledgeCategory, number> = {
      '设定': 0,
      '规则': 0,
      '禁止': 0,
      '风格': 0,
      '用户偏好': 0,
    };
    const bySubCategory: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    state.nodes.forEach((node) => {
      byCategory[node.category]++;
      const subKey = `${node.category}/${node.subCategory}`;
      bySubCategory[subKey] = (bySubCategory[subKey] || 0) + 1;
      node.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      totalNodes: state.nodes.length,
      totalEdges: state.edges.length,
      byCategory,
      bySubCategory,
      topTags,
    };
  },

  // ============================================
  // 加载/保存
  // ============================================

  loadFromProject: async (projectId: string) => {
    set({ isLoading: true, currentProjectId: projectId });
    try {
      await loadFromProjectInternal(projectId);
    } finally {
      set({ isLoading: false });
    }
  },

  ensureInitialized: async (projectId?: string) => {
    const state = get();
    const targetProjectId = projectId || resolveActiveProjectId();

    if (state.isInitialized && state.currentProjectId === targetProjectId) {
      return;
    }

    // 等待文件加载完成（防御性编程）
    let retryCount = 0;
    while (!useFileStore.getState().isFilesLoaded && retryCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retryCount++;
    }
    if (retryCount > 0) {
      console.log(`[KnowledgeGraph] 等待文件加载完成: ${retryCount * 100}ms`);
    }

    if (targetProjectId) {
      await state.loadFromProject(targetProjectId);
    }
  },

  // ============================================
  // 知识提取
  // ============================================

  triggerDocumentExtraction: async (filePath: string, content: string) => {
    const state = get();

    // 只处理设定、规则、风格等文档，不处理正文和角色档案
    // 正文（05_）由章节分析系统处理，角色档案（02_）由档案系统管理
    const isExcluded = filePath.startsWith('05_正文草稿/') || filePath.startsWith('02_角色档案/');
    const eligibleExtension = /\.(md|txt)$/i.test(filePath);

    if (isExcluded || !eligibleExtension || !content.trim()) return null;

    // 防止重复提取
    if (state.isExtracting) return null;

    const projectId = state.currentProjectId || resolveActiveProjectId();
    if (!projectId) return null;

    try {
      set({ isExtracting: true, extractionError: null });

      // 获取 AI 配置
      const agentStore = useAgentStore.getState();
      const aiConfig = agentStore.aiConfig;
      const lightConfig = {
        ...aiConfig,
        modelName: aiConfig.lightweightModelName || aiConfig.modelName,
      };
      const aiService = new AIService(lightConfig);

      // 调用知识提取 agent
      const result = await extractKnowledgeFromDocument(
        aiService,
        filePath,
        content,
        state.nodes,
        state.edges,
        (msg) => console.log(`[KnowledgeExtraction] ${msg}`)
      );

      if (!result.shouldExtract || result.operations.length === 0) {
        return {
          added: 0,
          updated: 0,
          linked: 0,
          skipped: result.operations.length,
          summary: result.summary,
        };
      }

      // 检查项目是否切换
      if (get().currentProjectId !== projectId) {
        console.warn('[KnowledgeGraph] 项目已切换，丢弃提取结果');
        return null;
      }

      // 应用操作
      let added = 0;
      let updated = 0;
      let linked = 0;
      let skipped = 0;

      for (const op of result.operations) {
        switch (op.action) {
          case 'add':
            if (op.node) {
              get().addNode(op.node);
              added++;
            }
            break;
          case 'update':
            if (op.nodeId && op.node) {
              get().updateNode(op.nodeId, op.node);
              updated++;
            }
            break;
          case 'link':
            if (op.from && op.to && op.edgeType) {
              get().addEdge(op.from, op.to, op.edgeType);
              linked++;
            }
            break;
          case 'skip':
          default:
            skipped++;
            break;
        }
      }

      return {
        added,
        updated,
        linked,
        skipped,
        summary: result.summary,
      };
    } catch (error: any) {
      console.error('[KnowledgeGraph] 文档提取失败:', error);
      set({ extractionError: error?.message || '文档知识提取失败' });
      return null;
    } finally {
      set({ isExtracting: false });
    }
  },

  triggerConversationExtraction: async (userMessage, recentMessages) => {
    const state = get();
    if (state.isExtracting) return null;

    const projectId = state.currentProjectId || resolveActiveProjectId();
    if (!projectId) return null;

    try {
      set({ isExtracting: true, extractionError: null });

      const agentStore = useAgentStore.getState();
      const aiConfig = agentStore.aiConfig;
      const lightConfig = {
        ...aiConfig,
        modelName: aiConfig.lightweightModelName || aiConfig.modelName,
      };
      const aiService = new AIService(lightConfig);

      const result = await extractKnowledgeFromDialogue(
        aiService,
        userMessage,
        recentMessages,
        state.nodes,
        state.edges,
        (msg) => console.log(`[ConversationExtraction] ${msg}`)
      );

      if (!result.shouldExtract || result.operations.length === 0) {
        return {
          added: 0,
          updated: 0,
          linked: 0,
          skipped: result.operations.length,
          summary: result.summary,
        };
      }

      // 检查项目是否切换
      if (get().currentProjectId !== projectId) {
        console.warn('[KnowledgeGraph] 项目已切换，丢弃对话提取结果');
        return null;
      }

      let added = 0;
      let updated = 0;
      let linked = 0;
      let skipped = 0;

      for (const op of result.operations) {
        switch (op.action) {
          case 'add':
            if (op.node) {
              get().addNode(op.node);
              added++;
            }
            break;
          case 'update':
            if (op.nodeId && op.node) {
              get().updateNode(op.nodeId, op.node);
              updated++;
            }
            break;
          case 'link':
            if (op.from && op.to && op.edgeType) {
              get().addEdge(op.from, op.to, op.edgeType);
              linked++;
            }
            break;
          case 'skip':
          default:
            skipped++;
            break;
        }
      }

      return {
        added,
        updated,
        linked,
        skipped,
        summary: result.summary,
      };
    } catch (error: any) {
      console.error('[KnowledgeGraph] 对话提取失败:', error);
      set({ extractionError: error?.message || '对话知识提取失败' });
      return null;
    } finally {
      set({ isExtracting: false });
    }
  },
}));

// ============================================
// 内部函数
// ============================================

async function loadFromProjectInternal(projectId: string) {
  const fileStore = useFileStore.getState();
  const knowledgeFile = fileStore.files.find(
    (f) => f.name === KNOWLEDGE_FILE_NAME && f.parentId !== 'root'
  );

  // 加载全局用户偏好
  let globalUserPreferences: KnowledgeNode[] = [];
  try {
    globalUserPreferences = await dbAPI.getGlobalUserPreferences();
    console.log(`[KnowledgeGraph] 从全局存储加载了 ${globalUserPreferences.length} 个用户偏好节点`);
  } catch (error) {
    console.error('[KnowledgeGraph] 加载全局用户偏好失败:', error);
  }

  // 收集用户偏好的标签和二级分类
  // Defensive: ensure all global preference nodes have valid tags arrays
  globalUserPreferences = globalUserPreferences.map((n) => ({
    ...n,
    tags: Array.isArray(n.tags) ? n.tags : [],
  }));
  const userPreferenceTags = globalUserPreferences.flatMap((n) => n.tags);
  const userPreferenceSubCategories: string[] = [];
  globalUserPreferences.forEach((node) => {
    if (node.subCategory && !userPreferenceSubCategories.includes(node.subCategory)) {
      userPreferenceSubCategories.push(node.subCategory);
    }
  });

  if (!knowledgeFile?.content) {
    // 没有项目文件，只有全局用户偏好
    const subCategoriesWithUserPrefs = { ...DEFAULT_SUB_CATEGORIES };
    userPreferenceSubCategories.forEach((sub) => {
      if (!subCategoriesWithUserPrefs['用户偏好'].includes(sub)) {
        subCategoriesWithUserPrefs['用户偏好'].push(sub);
      }
    });
    useKnowledgeGraphStore.setState({
      nodes: globalUserPreferences,
      edges: [],
      availableSubCategories: subCategoriesWithUserPrefs,
      availableTags: userPreferenceTags,
      currentProjectId: projectId,
      isInitialized: true,
      isLoading: false,
    });
    return;
  }

  try {
    const data = JSON.parse(knowledgeFile.content);
    const rawNodes = data.nodes || [];

    // 过滤掉项目文件中的用户偏好节点（这些应该从全局存储加载）
    // 同时规范化 tags 字段，确保每个节点的 tags 都是数组
    const projectNodes = rawNodes
      .filter((n: KnowledgeNode) => n.category !== '用户偏好')
      .map((n: KnowledgeNode) => ({
        ...n,
        tags: Array.isArray(n.tags) ? n.tags : [],
      }));

    // 迁移旧的二级分类
    const migratedNodes = projectNodes.map((node: KnowledgeNode) => {
      if (SUB_CATEGORY_MIGRATION[node.subCategory]) {
        return {
          ...node,
          subCategory: SUB_CATEGORY_MIGRATION[node.subCategory],
        };
      }
      return node;
    });

    // 统计迁移数量
    const migratedCount = projectNodes.filter(
      (n: KnowledgeNode) => SUB_CATEGORY_MIGRATION[n.subCategory]
    ).length;

    if (migratedCount > 0) {
      console.log(`[KnowledgeGraph] 迁移了 ${migratedCount} 个节点的二级分类`);
    }

    // 过滤掉已废弃的二级分类，只保留新的
    const validSubCategories = { ...DEFAULT_SUB_CATEGORIES };
    migratedNodes.forEach((node: KnowledgeNode) => {
      if (!validSubCategories[node.category].includes(node.subCategory)) {
        validSubCategories[node.category] = [
          ...validSubCategories[node.category],
          node.subCategory,
        ];
      }
    });

    // 添加用户偏好的二级分类
    userPreferenceSubCategories.forEach((sub) => {
      if (!validSubCategories['用户偏好'].includes(sub)) {
        validSubCategories['用户偏好'].push(sub);
      }
    });

    // 合并项目节点和用户偏好节点
    const allNodes = [...migratedNodes, ...globalUserPreferences];

    // 合并标签
    const allTags = [...(data.availableTags || []), ...userPreferenceTags];
    const uniqueTags = [...new Set(allTags)];

    useKnowledgeGraphStore.setState({
      nodes: allNodes,
      edges: data.edges || [],
      availableSubCategories: validSubCategories,
      availableTags: uniqueTags,
      currentProjectId: projectId,
      isInitialized: true,
      isLoading: false,
    });

    // 如果有迁移，自动保存
    if (migratedCount > 0) {
      setTimeout(() => saveToFile(useKnowledgeGraphStore.getState()), 500);
    }
  } catch (error) {
    console.error('[KnowledgeGraph] 加载数据失败:', error);
    // 即使加载失败，也保留全局用户偏好
    const subCategoriesWithUserPrefs = { ...DEFAULT_SUB_CATEGORIES };
    userPreferenceSubCategories.forEach((sub) => {
      if (!subCategoriesWithUserPrefs['用户偏好'].includes(sub)) {
        subCategoriesWithUserPrefs['用户偏好'].push(sub);
      }
    });
    useKnowledgeGraphStore.setState({
      nodes: globalUserPreferences,
      edges: [],
      availableSubCategories: subCategoriesWithUserPrefs,
      availableTags: userPreferenceTags,
      currentProjectId: projectId,
      isInitialized: true,
      isLoading: false,
    });
  }
}

async function saveToFile(state: KnowledgeGraphState) {
  const projectId = state.currentProjectId || resolveActiveProjectId();
  if (!projectId) return;

  const fileStore = useFileStore.getState();
  const files = fileStore.files;

  // 分离用户偏好节点和项目特定节点
  const userPreferenceNodes = state.nodes.filter((n) => n.category === '用户偏好');
  const projectNodes = state.nodes.filter((n) => n.category !== '用户偏好');

  // 提取用户偏好的标签
  const userPreferenceTags = userPreferenceNodes.flatMap((n) => n.tags);
  const projectTags = state.availableTags.filter((t) => !userPreferenceTags.includes(t));

  // 保存用户偏好到全局 IndexedDB
  if (userPreferenceNodes.length > 0) {
    try {
      await dbAPI.saveGlobalUserPreferences(userPreferenceNodes);
      console.log(`[KnowledgeGraph] 已保存 ${userPreferenceNodes.length} 个用户偏好节点到全局存储`);
    } catch (error) {
      console.error('[KnowledgeGraph] 保存用户偏好失败:', error);
    }
  }

  // 构建项目特定内容（不包含用户偏好节点）
  const content = JSON.stringify(
    {
      nodes: projectNodes,
      edges: state.edges,
      availableSubCategories: state.availableSubCategories,
      availableTags: projectTags,
      version: 1,
    },
    null,
    2
  );

  // 查找现有文件
  const knowledgeFile = files.find(
    (f) => f.name === KNOWLEDGE_FILE_NAME && f.parentId !== 'root'
  );

  if (knowledgeFile) {
    // 使用文件路径更新
    const filePath = buildPath(files, knowledgeFile);
    fileStore.updateFile(filePath, content);
  } else {
    // 找到基础信息文件夹
    const infoFolder = files.find(
      (f) => f.name === KNOWLEDGE_FOLDER_NAME && f.parentId === 'root'
    );
    if (infoFolder) {
      // 使用完整路径创建文件
      const filePath = `${KNOWLEDGE_FOLDER_NAME}/${KNOWLEDGE_FILE_NAME}`;
      fileStore.createFile(filePath, content);
    }
  }
}

// 辅助函数：构建文件路径
function buildPath(files: FileNode[], node: FileNode): string {
  const parts: string[] = [node.name];
  let current = node;
  while (current.parentId && current.parentId !== 'root') {
    const parent = files.find((f) => f.id === current.parentId);
    if (parent) {
      parts.unshift(parent.name);
      current = parent;
    } else {
      break;
    }
  }
  return parts.join('/');
}

export default useKnowledgeGraphStore;
