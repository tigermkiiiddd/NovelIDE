/**
 * @file knowledgeGraphTools.ts
 * @description 知识图谱 AI 工具 - 三级分类 + Tag系统 + 记忆智能
 */

import { ToolDefinition } from '../types';
import {
  useKnowledgeGraphStore
} from '../../../stores/knowledgeGraphStore';
import {
  KnowledgeCategory,
  KnowledgeNode,
  KnowledgeNodeDraft,
  KnowledgeEdgeType,
  DEFAULT_SUB_CATEGORIES,
} from '../../../types';
import {
  scoreKnowledgeNodeRecall,
  sortKnowledgeNodesForReview,
} from '../../../utils/knowledgeIntelligence';

// ============================================
// 工具定义
// ============================================

/**
 * 查询知识图谱
 */
export const queryKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_knowledge',
    description: `【知识查询】从知识图谱中查询相关知识节点。

## 分类体系
- **设定**: 世界设定、剧情设定、物品设定、场景设定等
- **规则**: 创作规则、叙事规则、角色规则等
- **禁止**: 禁止词汇、禁止情节、禁止写法等
- **风格**: 叙事风格、对话风格、描写风格等

## 查询方式
1. 按一级分类过滤
2. 按二级分类过滤
3. 按标签过滤
4. 按关键词搜索

## 排序策略
- **relevance**: 按相关性排序（默认）
- **activation**: 按激活度排序（优先返回常用知识）
- **review_urgency**: 按复习紧急度排序（优先返回需要复习的知识）
`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，会匹配名称、摘要和标签',
        },
        category: {
          type: 'string',
          enum: ['设定', '规则', '禁止', '风格'],
          description: '按一级分类过滤（可选）',
        },
        subCategory: {
          type: 'string',
          description: '按二级分类过滤（可选）',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '按标签过滤（可选）',
        },
        sortBy: {
          type: 'string',
          enum: ['relevance', 'activation', 'review_urgency'],
          default: 'relevance',
          description: '排序策略',
        },
        limit: {
          type: 'number',
          default: 10,
          description: '返回结果数量上限',
        },
      },
    },
  },
};

/**
 * 管理知识节点
 */
export const manageKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_knowledge',
    description: `【知识管理】添加、更新、删除知识节点，或强化/复习已有知识。

## 知识节点要求
- **名称**: 简短明确，≤20字
- **摘要**: 一句话概括，≤50字
- **详情**: 详细说明，≤200字（可选）
- **简洁原则**: 如果内容过长，应该拆分为多个节点

## 一级分类（固定）
- 设定、规则、禁止、风格

## 二级分类（可扩展）
遵循命名规则：2-10个汉字，格式如「魔法设定」「战斗规则」等

## 记忆智能操作
- **reinforce**: 强化知识（提高激活度和强度，延长复习间隔）
- **review**: 标记已复习（更新复习时间）
`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'reinforce', 'review'],
          description: '操作类型',
        },
        // add 操作
        node: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['设定', '规则', '禁止', '风格'],
              description: '一级分类',
            },
            subCategory: {
              type: 'string',
              description: '二级分类',
            },
            topic: {
              type: 'string',
              description: '三级主题（可选）',
            },
            name: {
              type: 'string',
              description: '知识名称（≤20字）',
            },
            summary: {
              type: 'string',
              description: '一句话概括（≤50字）',
            },
            detail: {
              type: 'string',
              description: '详细说明（≤200字，可选）',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '标签列表',
            },
            importance: {
              type: 'string',
              enum: ['critical', 'important', 'normal'],
              default: 'normal',
              description: '重要程度',
            },
            parentId: {
              type: 'string',
              description: '父节点ID（用于层级结构，可选）',
            },
          },
          required: ['category', 'subCategory', 'name', 'summary'],
        },
        // update/delete/reinforce/review 操作
        nodeId: {
          type: 'string',
          description: '知识节点ID',
        },
        // update 操作的更新内容
        updates: {
          type: 'object',
          properties: {
            subCategory: { type: 'string' },
            topic: { type: 'string' },
            name: { type: 'string' },
            summary: { type: 'string' },
            detail: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            importance: { type: 'string', enum: ['critical', 'important', 'normal'] },
            parentId: { type: 'string' },
          },
        },
      },
      required: ['action'],
    },
  },
};

/**
 * 建立知识关系
 */
export const linkKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'link_knowledge',
    description: `【知识关联】建立知识节点之间的关系。

## 关系类型
- **属于**: A 属于 B（如：火球术 属于 火系魔法）
- **细化**: A 细化 B（如：施法限制 细化 魔法规则）
- **依赖**: A 依赖 B（如：设定A 依赖 设定B）
- **冲突**: A 与 B 冲突（如：规则A 冲突 规则B）
`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: '添加或移除关系',
        },
        from: {
          type: 'string',
          description: '源节点ID',
        },
        to: {
          type: 'string',
          description: '目标节点ID',
        },
        type: {
          type: 'string',
          enum: ['属于', '细化', '依赖', '冲突'],
          description: '关系类型',
        },
        note: {
          type: 'string',
          description: '关系说明（可选）',
        },
      },
      required: ['action', 'from', 'to', 'type'],
    },
  },
};

/**
 * 列出知识元数据
 */
export const listKnowledgeMetadataTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_knowledge_metadata',
    description: `【知识元数据】列出可用的二级分类和标签。

用于了解当前知识图谱中有哪些可用的分类和标签。
`,
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

/**
 * 获取复习队列
 */
export const listReviewQueueTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_review_queue',
    description: `【复习队列】获取待复习的知识节点列表。

## 记忆智能算法
基于间隔重复算法，返回需要复习的知识节点：
- 激活度衰减的节点
- 到达复习时间的节点
- 优先返回紧急度最高的节点

## 用途
- 定期复习重要知识
- 保持长期记忆
- 强化关键设定和规则
`,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 5,
          description: '返回结果数量上限',
        },
      },
    },
  },
};

// ============================================
// 执行函数
// ============================================

export const executeQueryKnowledge = async (args: {
  query?: string;
  category?: KnowledgeCategory;
  subCategory?: string;
  tags?: string[];
  sortBy?: 'relevance' | 'activation' | 'review_urgency';
  limit?: number;
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { query, category, subCategory, tags, sortBy = 'relevance', limit = 10 } = args;

  let nodes = store.nodes;

  // 按分类过滤
  if (category) {
    nodes = nodes.filter((n) => n.category === category);
  }

  // 按二级分类过滤
  if (subCategory) {
    nodes = nodes.filter((n) => n.subCategory === subCategory);
  }

  // 按标签过滤
  if (tags && tags.length > 0) {
    nodes = nodes.filter((n) => tags.some((tag) => n.tags.includes(tag)));
  }

  // 按关键词搜索
  if (query) {
    const q = query.toLowerCase();
    nodes = nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)) ||
        (n.topic && n.topic.toLowerCase().includes(q))
    );
  }

  // 排序
  const now = Date.now();
  switch (sortBy) {
    case 'activation':
      nodes = nodes.sort((a, b) => {
        const scoreA = scoreKnowledgeNodeRecall(a, query || a.name, now);
        const scoreB = scoreKnowledgeNodeRecall(b, query || b.name, now);
        return scoreB.activation - scoreA.activation;
      });
      break;
    case 'review_urgency':
      nodes = sortKnowledgeNodesForReview(nodes, now);
      break;
    default:
      if (query) {
        nodes = nodes
          .map((n) => ({ node: n, score: scoreKnowledgeNodeRecall(n, query, now) }))
          .sort((a, b) => b.score.total - a.score.total)
          .map((item) => item.node);
      }
      break;
  }

  const results = nodes.slice(0, limit);

  return JSON.stringify({
    success: true,
    count: results.length,
    nodes: results.map((n) => ({
      id: n.id,
      category: n.category,
      subCategory: n.subCategory,
      topic: n.topic,
      name: n.name,
      summary: n.summary,
      tags: n.tags,
      importance: n.importance,
    })),
  });
};

export const executeManageKnowledge = async (args: {
  action: 'add' | 'update' | 'delete' | 'reinforce' | 'review';
  node?: KnowledgeNodeDraft;
  nodeId?: string;
  updates?: Partial<KnowledgeNode>;
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { action, node, nodeId, updates } = args;

  switch (action) {
    case 'add': {
      if (!node) {
        return JSON.stringify({ success: false, error: '缺少节点数据' });
      }

      // 验证内容长度
      if (node.name.length > 20) {
        return JSON.stringify({ success: false, error: '名称过长，请控制在20字以内' });
      }
      if (node.summary.length > 50) {
        return JSON.stringify({ success: false, error: '摘要过长，请控制在50字以内' });
      }
      if (node.detail && node.detail.length > 200) {
        return JSON.stringify({
          success: false,
          error: '详情过长，请控制在200字以内，或拆分为多个节点',
        });
      }

      const newNode = store.addNode(node);
      return JSON.stringify({
        success: true,
        node: {
          id: newNode.id,
          name: newNode.name,
          category: newNode.category,
          subCategory: newNode.subCategory,
        },
      });
    }

    case 'update': {
      if (!nodeId || !updates) {
        return JSON.stringify({ success: false, error: '缺少节点ID或更新内容' });
      }

      // 验证更新内容长度
      if (updates.name && updates.name.length > 20) {
        return JSON.stringify({ success: false, error: '名称过长，请控制在20字以内' });
      }
      if (updates.summary && updates.summary.length > 50) {
        return JSON.stringify({ success: false, error: '摘要过长，请控制在50字以内' });
      }
      if (updates.detail && updates.detail.length > 200) {
        return JSON.stringify({
          success: false,
          error: '详情过长，请控制在200字以内，或拆分为多个节点',
        });
      }

      store.updateNode(nodeId, updates);
      return JSON.stringify({ success: true });
    }

    case 'delete': {
      if (!nodeId) {
        return JSON.stringify({ success: false, error: '缺少节点ID' });
      }

      store.deleteNode(nodeId);
      return JSON.stringify({ success: true });
    }

    case 'reinforce': {
      if (!nodeId) {
        return JSON.stringify({ success: false, error: '缺少节点ID' });
      }

      const updatedNode = store.reinforceNode(nodeId);
      if (!updatedNode) {
        return JSON.stringify({ success: false, error: '节点不存在' });
      }

      return JSON.stringify({
        success: true,
        message: `知识「${updatedNode.name}」已强化`,
        metadata: updatedNode.metadata ? {
          activation: updatedNode.metadata.activation.toFixed(2),
          strength: updatedNode.metadata.strength.toFixed(2),
          nextReviewAt: new Date(updatedNode.metadata.nextReviewAt).toISOString(),
        } : undefined,
      });
    }

    case 'review': {
      if (!nodeId) {
        return JSON.stringify({ success: false, error: '缺少节点ID' });
      }

      // review 操作等同于 reinforce，但语义上表示"复习完成"
      const updatedNode = store.reinforceNode(nodeId);
      if (!updatedNode) {
        return JSON.stringify({ success: false, error: '节点不存在' });
      }

      return JSON.stringify({
        success: true,
        message: `知识「${updatedNode.name}」复习完成`,
        metadata: updatedNode.metadata ? {
          reviewCount: updatedNode.metadata.reviewCount,
          nextReviewAt: new Date(updatedNode.metadata.nextReviewAt).toISOString(),
        } : undefined,
      });
    }

    default:
      return JSON.stringify({ success: false, error: '未知操作类型' });
  }
};

export const executeLinkKnowledge = async (args: {
  action: 'add' | 'remove';
  from: string;
  to: string;
  type: KnowledgeEdgeType;
  note?: string;
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { action, from, to, type, note } = args;

  // 验证节点存在
  const fromNode = store.getNodeById(from);
  const toNode = store.getNodeById(to);

  if (!fromNode || !toNode) {
    return JSON.stringify({
      success: false,
      error: `节点不存在: ${!fromNode ? from : to}`,
    });
  }

  switch (action) {
    case 'add':
      store.addEdge(from, to, type, note);
      return JSON.stringify({
        success: true,
        edge: { from, to, type },
      });

    case 'remove': {
      const edges = store.getEdgesForNode(from);
      const edge = edges.find((e) => e.to === to && e.type === type);
      if (edge) {
        store.removeEdge(edge.id);
      }
      return JSON.stringify({ success: true });
    }

    default:
      return JSON.stringify({ success: false, error: '未知操作类型' });
  }
};

export const executeListKnowledgeMetadata = async () => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  return JSON.stringify({
    success: true,
    availableSubCategories: store.availableSubCategories,
    availableTags: store.availableTags,
    stats: store.getStats(),
  });
};

export const executeListReviewQueue = async (args: { limit?: number } = {}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { limit = 5 } = args;
  const reviewQueue = store.getReviewQueue();
  const results = reviewQueue.slice(0, limit);

  return JSON.stringify({
    success: true,
    count: results.length,
    totalDue: reviewQueue.length,
    nodes: results.map((n) => {
      const dynamicState = store.getNodeDynamicState(n.id);
      return {
        id: n.id,
        name: n.name,
        category: n.category,
        subCategory: n.subCategory,
        summary: n.summary,
        importance: n.importance,
        dynamicState: dynamicState ? {
          activation: dynamicState.activation.toFixed(2),
          strength: dynamicState.strength.toFixed(2),
          reviewUrgency: dynamicState.reviewUrgency.toFixed(2),
          isDueForReview: dynamicState.isDueForReview,
          state: dynamicState.state,
        } : null,
      };
    }),
  });
};

// ============================================
// 导出
// ============================================

export const knowledgeGraphToolDefinitions = [
  queryKnowledgeTool,
  manageKnowledgeTool,
  linkKnowledgeTool,
  listKnowledgeMetadataTool,
  listReviewQueueTool,
];
