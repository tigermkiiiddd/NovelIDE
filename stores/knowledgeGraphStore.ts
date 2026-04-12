/**
 * @file knowledgeGraphStore.ts
 * @description 记忆宫殿状态管理 - 三级分类 + Tag系统 + 记忆智能算法
 */

import { FileNode, KnowledgeNodeMetadata, KnowledgeNodeDynamicState, MemoryAttachment } from '../types';
import {
  KnowledgeCategory,
  KnowledgeNode,
  KnowledgeNodeDraft,
  KnowledgeEdge,
  KnowledgeEdgeType,
  KnowledgeWing,
  DEFAULT_SUB_CATEGORIES,
  SUB_CATEGORY_MIGRATION,
  CATEGORY_TO_WING_ROOM,
  WING_ROOMS,
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
import Fuse from 'fuse.js';
import { extractKnowledgeFromDocument, extractKnowledgeFromDialogue, KnowledgeOperation } from '../services/subAgents/knowledgeExtractionAgent';
import { AIService } from '../services/geminiService';
import { useAgentStore } from './agentStore';
import { findSemanticDuplicate } from '../domains/memory/vectorSearchService';
import { generateEmbedding } from '../domains/memory/embeddingService';

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
  addNodeWithEmbedding: (draft: KnowledgeNodeDraft) => Promise<KnowledgeNode>;
  updateNode: (id: string, updates: Partial<KnowledgeNode>) => void;
  updateNodeWithEmbedding: (id: string, updates: Partial<KnowledgeNode>) => Promise<void>;
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
  getNodesByWing: (wing: KnowledgeWing) => KnowledgeNode[];
  getNodesByRoom: (wing: KnowledgeWing, room: string) => KnowledgeNode[];
  getUnassignedNodes: () => KnowledgeNode[];
  migrateNodesToWingRoom: () => number;
  searchNodes: (query: string) => KnowledgeNode[];
  searchNodesWithScore: (query: string, limit?: number) => { node: KnowledgeNode; score: number }[];

  // 边操作
  addEdge: (from: string, to: string, type: KnowledgeEdgeType, note?: string) => void;
  removeEdge: (edgeId: string) => void;
  getEdgesForNode: (nodeId: string) => KnowledgeEdge[];

  // 分类管理
  addSubCategory: (category: KnowledgeCategory, subCategory: string) => void;
  addTag: (tag: string) => void;

  // 附件操作
  attachDocument: (nodeId: string, filePath: string, reason?: string) => void;
  detachDocument: (nodeId: string, filePath: string) => void;
  getNodeAttachments: (nodeId: string) => MemoryAttachment[];
  getDocumentsByPath: (filePath: string) => KnowledgeNode[];

  // 统计
  getStats: () => {
    totalNodes: number;
    totalEdges: number;
    byCategory: Record<KnowledgeCategory, number>;
    bySubCategory: Record<string, number>;
    topTags: { tag: string; count: number }[];
  };

  // Tunnel 自动发现
  discoverTunnels: () => number;
  getCrossWingConnections: () => Array<{ from: KnowledgeNode; to: KnowledgeNode; sharedTags: string[] }>;

  // 冲突解决
  resolveConflict: (edgeId: string, resolution: 'keep_old' | 'keep_new' | 'merge' | 'keep_both', mergedContent?: Partial<KnowledgeNode>) => boolean;
  getConflicts: () => Array<{ edge: KnowledgeEdge; fromNode: KnowledgeNode; toNode: KnowledgeNode }>;

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

  addNodeWithEmbedding: async (draft: KnowledgeNodeDraft) => {
    const node = get().addNode(draft);
    try {
      const text = `${node.name}。${node.summary}${node.detail ? `。${node.detail}` : ''}`;
      const embedding = await generateEmbedding(text);
      get().updateNode(node.id, { embedding } as any);
    } catch (e) {
      console.warn('[KnowledgeGraph] embedding 生成失败，节点已创建但无 embedding:', (e as Error).message);
    }
    return node;
  },

  updateNodeWithEmbedding: async (id: string, updates: Partial<KnowledgeNode>) => {
    get().updateNode(id, updates);
    // 文本字段变化时重新生成 embedding
    const textFields = ['name', 'summary', 'detail'] as const;
    if (textFields.some(f => f in updates)) {
      try {
        const node = get().nodes.find(n => n.id === id);
        if (node) {
          const text = `${updates.name ?? node.name}。${updates.summary ?? node.summary}${(updates.detail ?? node.detail) ? `。${(updates.detail ?? node.detail)}` : ''}`;
          const embedding = await generateEmbedding(text);
          get().updateNode(id, { embedding } as any);
        }
      } catch (e) {
        console.warn('[KnowledgeGraph] embedding 更新失败:', (e as Error).message);
      }
    }
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
    useAgentStore.getState().addRecalledKnowledgeNode(id);
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

  getNodesByWing: (wing: KnowledgeWing) => {
    return get().nodes.filter((node) => node.wing === wing);
  },

  getNodesByRoom: (wing: KnowledgeWing, room: string) => {
    return get().nodes.filter((node) => node.wing === wing && node.room === room);
  },

  getUnassignedNodes: () => {
    return get().nodes.filter((node) => !node.wing);
  },

  migrateNodesToWingRoom: () => {
    const nodes = get().nodes;
    let migrated = 0;
    const updatedNodes = nodes.map((node) => {
      if (node.wing) return node; // already assigned
      const mapping = CATEGORY_TO_WING_ROOM[node.category];
      if (mapping) {
        migrated++;
        return { ...node, wing: mapping.wing, room: mapping.room };
      }
      return node;
    });

    if (migrated > 0) {
      set({ nodes: updatedNodes });
      setTimeout(() => saveToFile(get()), 1000);
      console.log(`[KnowledgeGraph] 迁移了 ${migrated} 个节点到 Wing/Room`);
    }
    return migrated;
  },

  searchNodes: (query: string) => {
    if (!query.trim()) return get().nodes;
    
    const fuse = new Fuse(get().nodes, {
      keys: [
        { name: 'tags', weight: 0.4 },
        { name: 'name', weight: 0.3 },
        { name: 'summary', weight: 0.2 },
        { name: 'detail', weight: 0.1 }
      ],
      threshold: 0.5,
      ignoreLocation: true
    });
    
    return fuse.search(query).map(result => result.item);
  },

  searchNodesWithScore: (query: string, limit = 10) => {
    const nodes = get().nodes;
    if (!query.trim()) {
      return nodes
        .map((node) => ({ node, score: scoreKnowledgeNodeRecall(node, '').total }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
    
    const fuse = new Fuse(nodes, {
      keys: [
        { name: 'tags', weight: 0.4 },
        { name: 'name', weight: 0.3 },
        { name: 'summary', weight: 0.2 },
        { name: 'detail', weight: 0.1 }
      ],
      includeScore: true,
      threshold: 0.6,
      ignoreLocation: true
    });
    
    const now = Date.now();
    return fuse.search(query)
      .map(result => {
        const baseScore = scoreKnowledgeNodeRecall(result.item, '', now);
        const fuseLexical = (1 - (result.score || 0)) * 60;
        const total = fuseLexical + baseScore.importance + baseScore.activation + baseScore.strength + baseScore.review;
        return { node: result.item, score: total };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
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
  // 附件操作
  // ============================================

  attachDocument: (nodeId: string, filePath: string, reason?: string) => {
    const fileName = filePath.split('/').pop() || filePath;

    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;

        const attachments = node.attachments || [];
        // 避免重复附加
        if (attachments.some(a => a.filePath === filePath)) return node;

        return {
          ...node,
          attachments: [...attachments, {
            filePath,
            fileName,
            attachedAt: Date.now(),
            reason,
          }],
          updatedAt: Date.now(),
        };
      }),
    }));

    setTimeout(() => saveToFile(get()), 1000);
  },

  detachDocument: (nodeId: string, filePath: string) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;

        return {
          ...node,
          attachments: (node.attachments || []).filter(a => a.filePath !== filePath),
          updatedAt: Date.now(),
        };
      }),
    }));

    setTimeout(() => saveToFile(get()), 1000);
  },

  getNodeAttachments: (nodeId: string) => {
    const node = get().nodes.find(n => n.id === nodeId);
    return node?.attachments || [];
  },

  getDocumentsByPath: (filePath: string) => {
    return get().nodes.filter(n =>
      n.attachments?.some(a => a.filePath === filePath)
    );
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
    const byWing: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    state.nodes.forEach((node) => {
      byCategory[node.category]++;
      const subKey = `${node.category}/${node.subCategory}`;
      bySubCategory[subKey] = (bySubCategory[subKey] || 0) + 1;
      if (node.wing) {
        byWing[node.wing] = (byWing[node.wing] || 0) + 1;
      }
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
      byWing,
      topTags,
    };
  },

  // ============================================
  // Tunnel 自动发现
  // ============================================

  discoverTunnels: () => {
    const state = get();
    const nodes = state.nodes.filter(n => n.wing && n.category !== '用户偏好');
    const edges = state.edges;
    let tunnelsCreated = 0;

    // 按标签分组，找跨 Wing 的共享标签
    const tagNodeMap = new Map<string, KnowledgeNode[]>();
    nodes.forEach(node => {
      (node.tags || []).forEach(tag => {
        const list = tagNodeMap.get(tag) || [];
        list.push(node);
        tagNodeMap.set(tag, list);
      });
    });

    // 对每个有跨 Wing 节点的标签，创建 tunnel
    const existingEdgeKey = new Set(
      edges.map(e => `${e.from}->${e.to}:${e.type}`)
    );

    tagNodeMap.forEach((taggedNodes, tag) => {
      // 按 Wing 分组
      const byWing = new Map<KnowledgeWing, KnowledgeNode[]>();
      taggedNodes.forEach(n => {
        const list = byWing.get(n.wing!) || [];
        list.push(n);
        byWing.set(n.wing!, list);
      });

      // 至少 2 个不同的 Wing
      if (byWing.size < 2) return;

      // 取每个 Wing 的代表节点（最高 importance）
      const representatives: KnowledgeNode[] = [];
      byWing.forEach(wingNodes => {
        wingNodes.sort((a, b) => {
          const imp = { critical: 3, important: 2, normal: 1 };
          return (imp[b.importance] || 0) - (imp[a.importance] || 0);
        });
        representatives.push(wingNodes[0]);
      });

      // 在代表节点之间创建 依赖 边（如果不存在）
      for (let i = 0; i < representatives.length; i++) {
        for (let j = i + 1; j < representatives.length; j++) {
          const a = representatives[i];
          const b = representatives[j];
          const key1 = `${a.id}->${b.id}:依赖`;
          const key2 = `${b.id}->${a.id}:依赖`;
          if (!existingEdgeKey.has(key1) && !existingEdgeKey.has(key2)) {
            get().addEdge(a.id, b.id, '依赖', `隧道：共享标签[${tag}]`);
            existingEdgeKey.add(key1);
            tunnelsCreated++;
          }
        }
      }
    });

    if (tunnelsCreated > 0) {
      console.log(`[KnowledgeGraph] 发现 ${tunnelsCreated} 条跨 Wing 隧道`);
    }
    return tunnelsCreated;
  },

  getCrossWingConnections: () => {
    const state = get();
    const connections: Array<{ from: KnowledgeNode; to: KnowledgeNode; sharedTags: string[] }> = [];

    state.edges
      .filter(e => e.type === '依赖' && e.note?.startsWith('隧道：'))
      .forEach(edge => {
        const fromNode = state.nodes.find(n => n.id === edge.from);
        const toNode = state.nodes.find(n => n.id === edge.to);
        if (fromNode && toNode && fromNode.wing !== toNode.wing) {
          const sharedTags = (fromNode.tags || []).filter(t => (toNode.tags || []).includes(t));
          connections.push({ from: fromNode, to: toNode, sharedTags });
        }
      });

    return connections;
  },

  // ============================================
  // 冲突解决
  // ============================================

  resolveConflict: (edgeId, resolution, mergedContent) => {
    const state = get();
    const edge = state.edges.find(e => e.id === edgeId);
    if (!edge || edge.type !== '冲突') return false;

    const fromNode = state.nodes.find(n => n.id === edge.from);
    const toNode = state.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return false;

    switch (resolution) {
      case 'keep_old':
        // 保留旧节点，删除新节点
        get().deleteNode(edge.to);
        get().removeEdge(edgeId);
        break;
      case 'keep_new':
        // 保留新节点，删除旧节点
        get().deleteNode(edge.from);
        get().removeEdge(edgeId);
        break;
      case 'merge':
        // 合并到旧节点，删除新节点
        if (mergedContent) {
          // merge 后内容变化，需要异步更新 embedding（fire-and-forget）
          get().updateNodeWithEmbedding(edge.from, mergedContent);
        }
        get().deleteNode(edge.to);
        get().removeEdge(edgeId);
        break;
      case 'keep_both':
        // 移除冲突标记，保留两个节点
        get().removeEdge(edgeId);
        break;
    }

    return true;
  },

  getConflicts: () => {
    const state = get();
    return state.edges
      .filter(e => e.type === '冲突')
      .map(edge => {
        const fromNode = state.nodes.find(n => n.id === edge.from);
        const toNode = state.nodes.find(n => n.id === edge.to);
        return { edge, fromNode: fromNode!, toNode: toNode! };
      })
      .filter(c => c.fromNode && c.toNode);
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

      // 应用操作（带语义去重）
      let added = 0;
      let updated = 0;
      let linked = 0;
      let skipped = 0;
      let contradicted = 0;

      for (const op of result.operations) {
        switch (op.action) {
          case 'add':
            if (op.node) {
              // 语义去重：检查是否和已有节点重复
              const contentText = `${op.node.name}。${op.node.summary}${op.node.detail ? `。${op.node.detail}` : ''}`;
              try {
                const dupId = await findSemanticDuplicate(contentText, get().nodes);
                if (dupId) {
                  // 语义重复 → 走 update 而非 add
                  get().updateNode(dupId, {
                    summary: op.node.summary,
                    detail: op.node.detail || undefined,
                    tags: op.node.tags,
                    importance: op.node.importance,
                    updatedAt: Date.now(),
                  });
                  updated++;
                  console.log(`[KnowledgeGraph] 语义去重: "${op.node.name}" → 更新现有节点 ${dupId}`);
                  break;
                }
              } catch (e) {
                // embedding 模型未就绪时跳过去重，直接添加
                console.warn('[KnowledgeGraph] 语义去重跳过（模型未就绪）:', e);
              }
              await get().addNodeWithEmbedding(op.node);
              added++;
            }
            break;
          case 'update':
            if (op.nodeId && op.node) {
              await get().updateNodeWithEmbedding(op.nodeId, op.node);
              updated++;
            }
            break;
          case 'link':
            if (op.from && op.to && op.edgeType) {
              get().addEdge(op.from, op.to, op.edgeType);
              linked++;
            }
            break;
          case 'contradict':
            if (op.from && op.to) {
              get().addEdge(op.from, op.to, '冲突', op.reason);
              contradicted++;
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
        contradicted,
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
      let contradicted = 0;

      for (const op of result.operations) {
        switch (op.action) {
          case 'add':
            if (op.node) {
              const contentText = `${op.node.name}。${op.node.summary}${op.node.detail ? `。${op.node.detail}` : ''}`;
              try {
                const dupId = await findSemanticDuplicate(contentText, get().nodes);
                if (dupId) {
                  get().updateNode(dupId, {
                    summary: op.node.summary,
                    detail: op.node.detail || undefined,
                    tags: op.node.tags,
                    importance: op.node.importance,
                    updatedAt: Date.now(),
                  });
                  updated++;
                  break;
                }
              } catch (e) {
                console.warn('[KnowledgeGraph] 语义去重跳过（模型未就绪）:', e);
              }
              await get().addNodeWithEmbedding(op.node);
              added++;
            }
            break;
          case 'update':
            if (op.nodeId && op.node) {
              await get().updateNodeWithEmbedding(op.nodeId, op.node);
              updated++;
            }
            break;
          case 'link':
            if (op.from && op.to && op.edgeType) {
              get().addEdge(op.from, op.to, op.edgeType);
              linked++;
            }
            break;
          case 'contradict':
            if (op.from && op.to) {
              get().addEdge(op.from, op.to, '冲突', op.reason);
              contradicted++;
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
        contradicted,
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
    let migratedNodes = projectNodes.map((node: KnowledgeNode) => {
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

    // Wing/Room 自动迁移：为未分配 wing 的节点分配
    migratedNodes = migratedNodes.map((node: KnowledgeNode) => {
      if (node.wing) return node; // already assigned
      const mapping = CATEGORY_TO_WING_ROOM[node.category];
      if (mapping) {
        return { ...node, wing: mapping.wing, room: mapping.room };
      }
      return node;
    });

    const wingMigratedCount = projectNodes.filter((n: KnowledgeNode) => !n.wing && CATEGORY_TO_WING_ROOM[n.category]).length;
    if (wingMigratedCount > 0) {
      console.log(`[KnowledgeGraph] 自动分配了 ${wingMigratedCount} 个节点到 Wing/Room`);
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
    if (migratedCount > 0 || wingMigratedCount > 0) {
      setTimeout(() => saveToFile(useKnowledgeGraphStore.getState()), 500);
    }

    // 异步回填缺少 embedding 的节点（后台执行，不阻塞加载）
    backfillEmbeddings(allNodes);
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

/**
 * 后台回填缺少 embedding 的节点
 * 不阻塞主流程，逐个生成并更新
 */
async function backfillEmbeddings(nodes: KnowledgeNode[]) {
  const missing = nodes.filter(n => !n.embedding || n.embedding.length === 0);
  if (missing.length === 0) return;

  console.log(`[KnowledgeGraph] 开始回填 ${missing.length} 个节点的 embedding...`);

  try {
    // 尝试初始化 embedding 模型（首次会下载）
    const { initEmbeddingModel } = await import('../domains/memory/embeddingService');
    await initEmbeddingModel();

    let filled = 0;
    for (const node of missing) {
      try {
        const text = `${node.name}。${node.summary}${node.detail ? `。${node.detail}` : ''}`;
        const embedding = await generateEmbedding(text);
        // 直接更新 store 中的节点
        useKnowledgeGraphStore.getState().updateNode(node.id, { embedding } as any);
        filled++;
      } catch (e) {
        // 单个节点失败不影响整体
        console.warn(`[KnowledgeGraph] 节点 ${node.name} embedding 生成失败:`, e);
      }
    }

    if (filled > 0) {
      console.log(`[KnowledgeGraph] embedding 回填完成: ${filled}/${missing.length}`);
      setTimeout(() => saveToFile(useKnowledgeGraphStore.getState()), 1000);
    }
  } catch (e) {
    // embedding 模型初始化失败（如网络问题），静默跳过
    console.warn('[KnowledgeGraph] embedding 模型不可用，跳过回填:', (e as Error).message);
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
