/**
 * @file knowledgeGraphTools.ts
 * @description 知识图谱 AI 工具 - 三级分类 + Tag系统
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
    description: `【知识管理】添加、更新或删除知识节点。

## 知识节点要求
- **名称**: 简短明确，≤20字
- **摘要**: 一句话概括，≤50字
- **详情**: 详细说明，≤200字（可选）
- **简洁原则**: 如果内容过长，应该拆分为多个节点

## 一级分类（固定）
- 设定、规则、禁止、风格

## 二级分类（可扩展）
遵循命名规则：2-10个汉字，格式如「魔法设定」「战斗规则」等
`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete'],
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
        // update/delete 操作
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

// ============================================
// 执行函数
// ============================================

export const executeQueryKnowledge = async (args: {
  query?: string;
  category?: KnowledgeCategory;
  subCategory?: string;
  tags?: string[];
  limit?: number;
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { query, category, subCategory, tags, limit = 10 } = args;

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
    nodes = nodes
      .filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.summary.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)) ||
          (n.topic && n.topic.toLowerCase().includes(q))
      )
      .map((n) => ({
        ...n,
        score: calculateRelevanceScore(n, q),
      }))
      .sort((a, b) => (b as any).score - (a as any).score);
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

function calculateRelevanceScore(node: KnowledgeNode, query: string): number {
  let score = 0;
  const q = query.toLowerCase();

  if (node.name.toLowerCase().includes(q)) score += 3;
  if (node.summary.toLowerCase().includes(q)) score += 2;
  if (node.tags.some((t) => t.toLowerCase().includes(q))) score += 1;
  if (node.topic && node.topic.toLowerCase().includes(q)) score += 1;

  // 重要度加权
  if (node.importance === 'critical') score *= 1.5;
  else if (node.importance === 'important') score *= 1.2;

  return score;
}

export const executeManageKnowledge = async (args: {
  action: 'add' | 'update' | 'delete';
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

// ============================================
// 导出
// ============================================

export const knowledgeGraphToolDefinitions = [
  queryKnowledgeTool,
  manageKnowledgeTool,
  linkKnowledgeTool,
  listKnowledgeMetadataTool,
];
