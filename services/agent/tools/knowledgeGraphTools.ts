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
} from '../../../utils/knowledgeIntelligence';
import Fuse from 'fuse.js';

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
- **设定（是什么）**: 世界设定、物品设定、场景设定
- **规则（必须遵守）**: 创作规则、叙事规则、逻辑规则
- **禁止（绝对不能）**: 禁止词汇、禁止情节、禁止写法
- **风格（建议偏好）**: 叙事风格、对话风格、描写风格

## 查询方式
1. 按一级分类过滤
2. 按二级分类过滤
3. 按标签过滤
4. 按关键词搜索

## 排序策略
- **relevance**: 按相关性排序（默认）
- **activation**: 按激活度排序（优先返回常用知识）
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
          enum: ['relevance', 'activation'],
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
    description: `【知识管理】批量添加、更新、删除知识节点，或强化/复习已有知识。

## 记忆 vs 文档的区别
- **记忆（知识图谱）**：AI 推理用，简短摘要（见下方字数限制）
- **文档（文件）**：内容创作用，完整原文
- **长篇原文必须放进附件（attachments），禁止写入节点内容**

## 知识节点字数限制
- **名称（name）**：≤20字
- **摘要（summary）**：≤50字
- **详情（detail）**：≤300字
- 过长的内容应拆分为多个节点

## 附件（attachments）用法
- 创建节点时通过 attachments 关联源文档路径
- AI 读取时会按需加载附件中的完整原文

## 分类体系
- **设定（是什么）**: 世界设定、物品设定、场景设定
- **规则（必须遵守）**: 创作规则、叙事规则、逻辑规则
- **禁止（绝对不能）**: 禁止词汇、禁止情节、禁止写法
- **风格（建议偏好）**: 叙事风格、对话风格、描写风格

## 操作类型
- **add**: 批量添加节点（传入 nodes 数组）
- **update**: 批量更新节点（传入 updates 数组，每项包含 nodeId 和更新内容）
- **delete**: 删除节点（传入 nodeIds 数组）
- **reinforce**: 强化知识（传入 nodeIds 数组）
- **review**: 标记已复习（传入 nodeIds 数组）
`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'reinforce', 'review'],
          description: '操作类型',
        },
        // add 操作的节点数组
        nodes: {
          type: 'array',
          description: '要添加的节点列表',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['设定', '规则', '禁止', '风格'] },
              subCategory: { type: 'string' },
              topic: { type: 'string' },
              name: { type: 'string' },
              summary: { type: 'string' },
              detail: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              importance: { type: 'string', enum: ['critical', 'important', 'normal'] },
            },
            required: ['category', 'subCategory', 'name', 'summary'],
          },
        },
        // update 操作的更新数组
        updates: {
          type: 'array',
          description: '要更新的节点列表（update 时使用）',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '节点ID' },
              subCategory: { type: 'string' },
              topic: { type: 'string' },
              name: { type: 'string' },
              summary: { type: 'string' },
              detail: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              importance: { type: 'string', enum: ['critical', 'important', 'normal'] },
            },
            required: ['nodeId'],
          },
        },
        // delete/reinforce/review 操作的节点ID数组
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '节点ID列表（delete/reinforce/review 时使用）',
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
 * 列出所有知识节点
 */
export const listAllKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_all_knowledge',
    description: `【列出全部知识】返回知识图谱中所有节点的列表，按分类分组。

当需要了解项目当前有哪些知识/设定/规则/禁止/风格时使用此工具。
返回每个节点的 id、名称、摘要、分类、标签和重要程度。
`,
    parameters: {
      type: 'object',
      properties: {
        importance: {
          type: 'string',
          enum: ['critical', 'important', 'normal'],
          description: '按重要程度过滤（可选，不传则返回全部）',
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
  sortBy?: 'relevance' | 'activation';
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

  // 按关键词搜索预过滤：使用 Fuse 进行相似度搜索
  let fuseResults: { item: KnowledgeNode; score?: number }[] | null = null;
  if (query && query.trim()) {
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
    fuseResults = fuse.search(query);
  }

  // 排序
  const now = Date.now();
  switch (sortBy) {
    case 'activation':
      if (fuseResults) {
        nodes = fuseResults
          .map((r) => r.item)
          .sort((a, b) => {
            const scoreA = scoreKnowledgeNodeRecall(a, '', now);
            const scoreB = scoreKnowledgeNodeRecall(b, '', now);
            return scoreB.activation - scoreA.activation;
          });
      } else {
        nodes = nodes.sort((a, b) => {
          const scoreA = scoreKnowledgeNodeRecall(a, '', now);
          const scoreB = scoreKnowledgeNodeRecall(b, '', now);
          return scoreB.activation - scoreA.activation;
        });
      }
      break;
    default:
      if (fuseResults) {
        nodes = fuseResults
          .map((r) => {
            const baseScore = scoreKnowledgeNodeRecall(r.item, '', now);
            const fuseLexical = (1 - (r.score || 0)) * 60; // 转化为 0~60 的分数
            const combined = fuseLexical + baseScore.importance + baseScore.activation + baseScore.strength + baseScore.review;
            return { node: r.item, total: combined };
          })
          .sort((a, b) => b.total - a.total)
          .map((item) => item.node);
      } else {
        nodes = nodes
          .map((n) => ({ node: n, score: scoreKnowledgeNodeRecall(n, '', now) }))
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
  nodes?: Array<{
    category: KnowledgeCategory;
    subCategory: string;
    topic?: string;
    name: string;
    summary: string;
    detail?: string;
    tags?: string[];
    importance?: 'critical' | 'important' | 'normal';
    attachments?: Array<{
      filePath: string;
      reason?: string;
    }>;
  }>;
  updates?: Array<{
    nodeId: string;
    subCategory?: string;
    topic?: string;
    name?: string;
    summary?: string;
    detail?: string;
    tags?: string[];
    importance?: 'critical' | 'important' | 'normal';
  }>;
  nodeIds?: string[];
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { action, nodes, updates, nodeIds } = args;

  switch (action) {
    case 'add': {
      if (!nodes || nodes.length === 0) {
        return JSON.stringify({ success: false, error: '缺少节点列表' });
      }

      const addedNodes: Array<{ id: string; name: string; category: string }> = [];
      const errors: string[] = [];

      for (const n of nodes) {
        // 验证
        if (n.name.length > 20) {
          errors.push(`"${n.name}" 名称过长`);
          continue;
        }
        if (n.summary.length > 50) {
          errors.push(`"${n.name}" 摘要过长`);
          continue;
        }

        // 处理附件
        const attachments = n.attachments?.map(a => ({
          filePath: a.filePath,
          fileName: a.filePath.split('/').pop() || a.filePath,
          attachedAt: Date.now(),
          reason: a.reason,
        }));

        const newNode = store.addNode({
          category: n.category,
          subCategory: n.subCategory,
          topic: n.topic,
          name: n.name,
          summary: n.summary,
          detail: n.detail,
          tags: n.tags || [],
          importance: n.importance || 'normal',
          attachments,
        });
        addedNodes.push({
          id: newNode.id,
          name: newNode.name,
          category: newNode.category,
        });
      }

      return JSON.stringify({
        success: true,
        added: addedNodes.length,
        failed: errors.length,
        nodes: addedNodes,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    case 'update': {
      if (!updates || updates.length === 0) {
        return JSON.stringify({ success: false, error: '缺少更新列表' });
      }

      const updatedNodes: Array<{ id: string; name: string }> = [];
      const errors: string[] = [];

      for (const update of updates) {
        const existing = store.getNodeById(update.nodeId);
        if (!existing) {
          errors.push(`节点 ${update.nodeId} 不存在`);
          continue;
        }

        store.updateNode(update.nodeId, {
          subCategory: update.subCategory,
          topic: update.topic,
          name: update.name,
          summary: update.summary,
          detail: update.detail,
          tags: update.tags,
          importance: update.importance,
        });
        updatedNodes.push({ id: update.nodeId, name: update.name || existing.name });
      }

      return JSON.stringify({
        success: true,
        updated: updatedNodes.length,
        failed: errors.length,
        nodes: updatedNodes,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    case 'delete': {
      if (!nodeIds || nodeIds.length === 0) {
        return JSON.stringify({ success: false, error: '缺少节点ID列表' });
      }

      const deletedIds: string[] = [];
      const errors: string[] = [];

      for (const id of nodeIds) {
        const existing = store.getNodeById(id);
        if (!existing) {
          errors.push(`节点 ${id} 不存在`);
          continue;
        }
        store.deleteNode(id);
        deletedIds.push(id);
      }

      return JSON.stringify({
        success: true,
        deleted: deletedIds.length,
        failed: errors.length,
        nodeIds: deletedIds,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    case 'reinforce': {
      if (!nodeIds || nodeIds.length === 0) {
        return JSON.stringify({ success: false, error: '缺少节点ID列表' });
      }

      const reinforcedNodes: Array<{ id: string; name: string; activation: number }> = [];
      const errors: string[] = [];

      for (const id of nodeIds) {
        const updatedNode = store.reinforceNode(id);
        if (!updatedNode) {
          errors.push(`节点 ${id} 不存在`);
          continue;
        }
        reinforcedNodes.push({
          id: updatedNode.id,
          name: updatedNode.name,
          activation: updatedNode.metadata?.activation || 0,
        });
      }

      return JSON.stringify({
        success: true,
        reinforced: reinforcedNodes.length,
        failed: errors.length,
        nodes: reinforcedNodes,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    case 'review': {
      if (!nodeIds || nodeIds.length === 0) {
        return JSON.stringify({ success: false, error: '缺少节点ID列表' });
      }

      const reviewedNodes: Array<{ id: string; name: string; reviewCount: number }> = [];
      const errors: string[] = [];

      for (const id of nodeIds) {
        const updatedNode = store.reinforceNode(id);
        if (!updatedNode) {
          errors.push(`节点 ${id} 不存在`);
          continue;
        }
        reviewedNodes.push({
          id: updatedNode.id,
          name: updatedNode.name,
          reviewCount: updatedNode.metadata?.reviewCount || 0,
        });
      }

      return JSON.stringify({
        success: true,
        reviewed: reviewedNodes.length,
        failed: errors.length,
        nodes: reviewedNodes,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    default:
      return JSON.stringify({ success: false, error: `未知操作: ${action}` });
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

export const executeListAllKnowledge = async (args?: {
  importance?: 'critical' | 'important' | 'normal';
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  let nodes = store.nodes;

  if (args?.importance) {
    nodes = nodes.filter((n) => n.importance === args.importance);
  }

  // 按分类分组
  const grouped: Record<string, Array<{
    id: string;
    name: string;
    summary: string;
    subCategory: string;
    tags: string[];
    importance: string;
  }>> = {};

  for (const n of nodes) {
    if (!grouped[n.category]) grouped[n.category] = [];
    grouped[n.category].push({
      id: n.id,
      name: n.name,
      summary: n.summary,
      subCategory: n.subCategory,
      tags: n.tags,
      importance: n.importance,
    });
  }

  return JSON.stringify({
    success: true,
    total: nodes.length,
    grouped,
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
  listAllKnowledgeTool,
];
