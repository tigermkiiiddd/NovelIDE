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
} from '../types';
import { create } from 'zustand';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';
import {
  createKnowledgeNodeMetadata,
  getKnowledgeNodeDynamicState,
  applyKnowledgeNodeEvent,
  scoreKnowledgeNodeRecall,
} from '../utils/knowledgeIntelligence';

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

  // 节点操作
  addNode: (draft: KnowledgeNodeDraft) => KnowledgeNode;
  updateNode: (id: string, updates: Partial<KnowledgeNode>) => void;
  deleteNode: (id: string) => void;
  getNodeById: (id: string) => KnowledgeNode | undefined;

  // 记忆智能操作
  recallNode: (id: string) => KnowledgeNode | undefined;
  reinforceNode: (id: string) => KnowledgeNode | undefined;
  getReviewQueue: () => KnowledgeNode[];
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

  // ============================================
  // 节点操作
  // ============================================

  addNode: (draft: KnowledgeNodeDraft) => {
    const now = Date.now();
    const metadata = draft.metadata ?? createKnowledgeNodeMetadata(draft.importance);
    const newNode: KnowledgeNode = {
      ...draft,
      id: generateId(),
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      // 更新可用标签
      const newTags = draft.tags.filter((t) => !state.availableTags.includes(t));

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

    // 保存到文件
    setTimeout(() => saveToFile(get()), 1000);
    return newNode;
  },

  updateNode: (id: string, updates: Partial<KnowledgeNode>) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, ...updates, updatedAt: Date.now() } : node
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

  getReviewQueue: () => {
    const now = Date.now();
    return get().nodes.filter((node) => {
      if (!node.metadata) return false;
      const state = getKnowledgeNodeDynamicState(node, now);
      return state.isDueForReview;
    }).sort((a, b) => {
      const stateA = getKnowledgeNodeDynamicState(a, now);
      const stateB = getKnowledgeNodeDynamicState(b, now);
      return stateB.reviewUrgency - stateA.reviewUrgency;
    });
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
    const q = query.toLowerCase();
    return get().nodes.filter(
      (node) =>
        node.name.toLowerCase().includes(q) ||
        node.summary.toLowerCase().includes(q) ||
        node.tags.some((t) => t.toLowerCase().includes(q)) ||
        (node.topic && node.topic.toLowerCase().includes(q))
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

    if (targetProjectId) {
      await state.loadFromProject(targetProjectId);
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

  if (!knowledgeFile?.content) {
    useKnowledgeGraphStore.setState({
      nodes: [],
      edges: [],
      availableSubCategories: { ...DEFAULT_SUB_CATEGORIES },
      availableTags: [],
      currentProjectId: projectId,
      isInitialized: true,
      isLoading: false,
    });
    return;
  }

  try {
    const data = JSON.parse(knowledgeFile.content);
    // 只加载新格式数据
    useKnowledgeGraphStore.setState({
      nodes: data.nodes || [],
      edges: data.edges || [],
      availableSubCategories: data.availableSubCategories || { ...DEFAULT_SUB_CATEGORIES },
      availableTags: data.availableTags || [],
      currentProjectId: projectId,
      isInitialized: true,
      isLoading: false,
    });
  } catch (error) {
    console.error('[KnowledgeGraph] 加载数据失败:', error);
    useKnowledgeGraphStore.setState({
      nodes: [],
      edges: [],
      availableSubCategories: { ...DEFAULT_SUB_CATEGORIES },
      availableTags: [],
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

  const content = JSON.stringify(
    {
      nodes: state.nodes,
      edges: state.edges,
      availableSubCategories: state.availableSubCategories,
      availableTags: state.availableTags,
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
