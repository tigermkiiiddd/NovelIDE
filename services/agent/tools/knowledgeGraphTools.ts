/**
 * @file knowledgeGraphTools.ts
 * @description 记忆宫殿 AI 工具 — 5 个工具对标 MemPalace
 *   query_memory / manage_memory / link_memory / memory_status / traverse_memory
 */

import { ToolDefinition } from '../types';
import {
  useKnowledgeGraphStore
} from '../../../stores/knowledgeGraphStore';
import {
  KnowledgeCategory,
  KnowledgeNode,
  KnowledgeEdgeType,
  WING_ROOMS,
} from '../../../types';
import {
  scoreKnowledgeNodeRecall,
  getKnowledgeNodeDynamicState,
} from '../../../utils/knowledgeIntelligence';
import Fuse from 'fuse.js';
import { semanticSearch } from '../../../domains/memory/vectorSearchService';
import { semanticFileSearch } from '../../../domains/memory/fileSearchService';
import { useFileStore } from '../../../stores/fileStore';
import { getNodePath } from '../../../services/fileSystem';

// ============================================
// 工具定义
// ============================================

/**
 * 查询记忆宫殿
 */
export const queryKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_memory',
    description: `【记忆查询】从记忆宫殿中查询知识节点，结果不足时自动补充搜索项目文件。

## 宫殿结构
- **writing_rules 翼**（创作规范）：叙事规则、文风习惯、用语忌讳、格式规范、系统保护、写作技巧积累
- **world 翼**（世界知识）：力量体系、地理环境、势力分布、物品道具

## 查询方式
1. 按关键词搜索（名称、摘要、标签 + 语义匹配）
2. 按 wing 过滤（只查创作规范或只查世界知识）
3. 按 room 过滤（只查某个房间）
4. 按标签过滤

## 文件搜索补充
当记忆节点结果不足时，会自动用 embedding 搜索项目文件（角色档案、设定文档等），在 fileResults 字段中返回匹配的文件。

## 排序策略
- **relevance**: 按相关性排序（默认，综合匹配度+重要度+激活度）
- **activation**: 按激活度排序（优先返回常用知识）

## 返回格式
\`\`\`json
{
  "success": true,
  "count": 3,
  "results": [
    { "id": "kg-xxx", "name": "灵力规则", "wing": "world", "room": "力量体系",
      "summary": "施法消耗灵力，灵力耗尽昏迷...",
      "tags": ["魔法", "规则"], "importance": "important",
      "score": 85, "activation": "0.72" }
  ],
  "fileResults": [
    { "fileName": "魔法体系设定.md", "score": 78, "matchType": "semantic" }
  ],
  "mode": "memory+file"
}
\`\`\`
`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，会匹配名称、摘要和标签',
        },
        wing: {
          type: 'string',
          enum: ['writing_rules', 'world'],
          description: '按翼过滤（可选）：writing_rules=创作规范 | world=世界知识',
        },
        room: {
          type: 'string',
          description: '按房间过滤（可选）',
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
        offset: {
          type: 'number',
          default: 0,
          description: '分页偏移量。配合 limit 使用：offset=0 获取第1页，offset=10 获取第2页',
        },
      },
    },
  },
};

/**
 * 管理记忆节点
 */
export const manageKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_memory',
    description: `【记忆宫殿管理】在记忆宫殿中添加、更新、删除知识节点，或强化/复习已有记忆。

## ⚠️ 记忆宫殿仅存元认知规则，禁止存故事内容！
**可以存**：写作规则、文风禁忌、叙事技巧、用语限制、创作偏好、世界观规则
**禁止存**：剧情大纲、角色信息、伏笔内容、事件记录、章节内容
- 剧情/事件 → Timeline 工具（processOutlineInput / outline_getEvents）
- 角色 → 角色档案文件（02_角色档案/）+ character 工具
- 伏笔 → foreshadowing 系统（章节分析自动提取）

## 宫殿结构（2 个翼）
记忆宫殿有 2 个翼（Wing），每个翼下有多个房间（Room）：

### writing_rules 翼 — 创作规范（始终注入系统提示词）
存放 AI 必须遵守的写作规则和禁忌。
- 叙事规则：叙事技巧、POV规则、节奏控制
- 文风习惯：用词偏好、句式习惯、语气风格
- 用语忌讳：禁止词汇、禁止写法、禁止情节
- 格式规范：文件格式、命名规则、frontmatter
- 系统保护：不可修改的目录和文件
- 写作技巧积累：创作经验、最佳实践

### world 翼 — 世界知识（按需注入）
存放世界观相关的规则性知识。
- 力量体系：魔法/灵力/技能的规则与限制
- 地理环境：世界地理与场景规则
- 势力分布：组织架构与权力关系
- 物品道具：重要物品的设定规则

## 字数限制
- **名称（name）**：≤20字
- **摘要（summary）**：≤50字
- **详情（detail）**：≤300字

## 操作
- **add**: 添加节点（传入 nodes 数组）
- **update**: 更新节点（传入 updates 数组，需含 nodeId）
- **delete**: 删除节点（传入 nodeIds 数组）
- **resolve**: 解决冲突边（先通过 memory_status 查看冲突列表获取 edgeId）
  - keep_old: 保留旧节点，删除新节点
  - keep_new: 保留新节点，删除旧节点
  - merge: 合并到旧节点（需提供 mergedName/Summary/Detail），删除新节点
  - keep_both: 都保留，移除冲突标记
`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'resolve'],
          description: '操作类型',
        },
        nodes: {
          type: 'array',
          description: '要添加的节点列表',
          items: {
            type: 'object',
            properties: {
              wing: {
                type: 'string',
                enum: ['writing_rules', 'world'],
                description: '翼（必填，只能二选一）：writing_rules=创作规范 | world=世界知识',
              },
              room: {
                type: 'string',
                description: '房间（必填）。writing_rules 可选: 叙事规则/文风习惯/用语忌讳/格式规范/系统保护/写作技巧积累。world 可选: 力量体系/地理环境/势力分布/物品道具',
              },
              name: { type: 'string', description: '知识名称（≤20字）' },
              summary: { type: 'string', description: '一句话概括（≤50字）' },
              detail: { type: 'string', description: '详细说明（≤300字，可选）' },
              tags: { type: 'array', items: { type: 'string' }, description: '标签' },
              importance: {
                type: 'string',
                enum: ['critical', 'important', 'normal'],
                description: 'critical=始终注入，important=按需注入，normal=仅工具查询',
              },
            },
            required: ['wing', 'room', 'name', 'summary'],
          },
        },
        updates: {
          type: 'array',
          description: '要更新的节点列表（update 时使用）',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '节点ID' },
              room: { type: 'string' },
              name: { type: 'string' },
              summary: { type: 'string' },
              detail: { type: 'string' },
              subCategory: { type: 'string' },
              topic: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              importance: { type: 'string', enum: ['critical', 'important', 'normal'] },
            },
            required: ['nodeId'],
          },
        },
        // delete 操作的节点ID数组
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '节点ID列表（delete 时使用）',
        },
        // resolve 操作参数
        resolveEdgeId: {
          type: 'string',
          description: '冲突边ID（resolve 时使用）',
        },
        resolution: {
          type: 'string',
          enum: ['keep_old', 'keep_new', 'merge', 'keep_both'],
          description: '冲突解决方式（resolve 时使用）',
        },
        mergedName: {
          type: 'string',
          description: '合并后的名称（resolution=merge 时使用）',
        },
        mergedSummary: {
          type: 'string',
          description: '合并后的摘要（resolution=merge 时使用）',
        },
        mergedDetail: {
          type: 'string',
          description: '合并后的详情（resolution=merge 时使用）',
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
    name: 'link_memory',
    description: `【记忆关联】建立或移除记忆节点之间的关系。

## 什么时候用
- 添加新设定后，把它和已有设定建立关联（如"火球术 依赖 灵力规则"）
- 发现两个规则矛盾时，标记"冲突"关系
- 用 traverse_memory 查看关联时，关系越丰富，遍历发现的知识越多

## 关系类型（有方向：from → to）
- **属于**: from 属于 to（如 from=火球术, to=火系魔法 → 火球术 属于 火系魔法）
- **细化**: from 细化 to（如 from=施法限制, to=魔法规则 → 施法限制 细化 魔法规则）
- **依赖**: from 依赖 to（如 from=火球术, to=灵力规则 → 火球术 依赖 灵力规则才能施放）
- **冲突**: from 与 to 矛盾（系统会自动追踪，可用 manage_memory resolve 解决）

## 返回
\`\`\`json
{ "success": true, "edge": { "from": "kg-xxx", "to": "kg-yyy", "type": "依赖" } }
\`\`\`

## 节点 ID 从哪来
先通过 query_memory 或 memory_status 获取节点 ID，再用此工具建立关系。
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
          description: '源节点ID（关系起点）',
        },
        to: {
          type: 'string',
          description: '目标节点ID（关系终点）',
        },
        type: {
          type: 'string',
          enum: ['属于', '细化', '依赖', '冲突'],
          description: '关系类型（注意方向：from → to）',
        },
        note: {
          type: 'string',
          description: '关系说明，解释为什么有这个关系（可选但推荐）',
        },
      },
      required: ['action', 'from', 'to', 'type'],
    },
  },
};

/**
 * 记忆宫殿全貌
 */
export const memoryStatusTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_status',
    description: `【记忆全貌】查看记忆宫殿的整体状态。可获取统计摘要或完整节点目录。

## 什么时候用
- 开始写作任务前，了解当前有哪些可用的设定和规则
- 不确定某个知识是否存在，先看全貌再决定是添加还是查询
- 检查是否有冲突需要处理、是否有衰减节点需要强化

## 返回内容（由 listMode 控制）

### listMode='summary'（默认）— 只返回统计
\`\`\`json
{
  "totalNodes": 15, "totalEdges": 8,
  "wings": { "writing_rules": { "叙事规则": 3, ... }, "world": { ... } },
  "conflicts": 1, "needsReview": 2, "cooling": 3, "topTags": ["魔法", ...]
}
\`\`\`

### listMode='ids' — 返回所有节点的目录（省 token）
\`\`\`json
{
  "totalNodes": 15,
  "nodes": [
    { "id": "kg-xxx", "name": "灵力规则", "wing": "world", "room": "力量体系" },
    ...
  ]
}
\`\`\`
非常适合先获取全部节点目录，再按需选 ID 调用 traverse_memory。

## 字段说明
- **wings**: 按 翼→房间 分组的节点数量
- **conflicts**: 冲突节点对数量
- **needsReview**: 衰减严重需强化的节点数
- **cooling**: 正在衰减的节点数
`,
    parameters: {
      type: 'object',
      properties: {
        listMode: {
          type: 'string',
          enum: ['summary', 'ids'],
          default: 'summary',
          description: 'summary=只返回统计（默认，最省token） | ids=返回全部节点id+name+wing+room（推荐）',
        },
      },
    },
  },
};

/**
 * 记忆遍历
 */
export const traverseMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'traverse_memory',
    description: `【记忆遍历】从指定节点出发，沿关系图走 N 步，发现关联知识。

## 什么时候用
- 写某个设定时，想看看和它相关的其他设定（如：写"火球术"→发现它依赖"灵力规则"→发现"灵力规则"关联"禁止灵力外挂"）
- 检查某个规则影响了哪些设定（反向追踪）
- 联想创作灵感，从一个概念出发发现隐藏关联

## 和 query_memory 的区别
- query_memory: 按关键词搜索，返回匹配结果（不知道关系链）
- traverse_memory: 沿关系边走，返回关联路径（知道 A→B→C 的链路）

## 关系类型
- **属于**: A 属于 B（如火球术 属于 火系魔法）
- **细化**: A 细化 B（如施法限制 细化 魔法规则）
- **依赖**: A 依赖 B（如设定A 依赖 设定B，或隧道自动发现的跨翼关联）
- **冲突**: A 与 B 矛盾（需要解决）

## 返回格式
\`\`\`json
{
  "start": { "id": "kg-xxx", "name": "火球术", "wing": "world", "room": "力量体系", "summary": "..." },
  "reachedCount": 3,
  "reached": [
    { "id": "kg-yyy", "name": "灵力规则", "wing": "world", "room": "力量体系",
      "summary": "施法消耗灵力...",
      "tags": ["魔法", "规则"],
      "distance": 1,
      "path": "火球术 →依赖→ 灵力规则" },
    { "id": "kg-zzz", "name": "禁止灵力外挂", "wing": "writing_rules", "room": "用语忌讳",
      "summary": "...",
      "tags": ["禁止"],
      "distance": 2,
      "path": "火球术 →依赖→ 灵力规则 →依赖→ 禁止灵力外挂" }
  ]
}
\`\`\`

## depth 说明
- depth=1: 只找直接关联的节点（邻居）
- depth=2: 找邻居的邻居（默认，适合大多数场景）
- depth=3: 三层关联（范围大但可能不相关）
`,
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '起始节点 ID（可从 query_memory 或 memory_status 获取）',
        },
        depth: {
          type: 'number',
          default: 2,
          description: '遍历深度：1=直接关联，2=两层（默认），3=三层。建议用 2',
        },
        edgeTypes: {
          type: 'array',
          items: { type: 'string' },
          description: '只沿特定关系类型走（可选）：属于/细化/依赖/冲突',
        },
      },
      required: ['nodeId'],
    },
  },
};

// ============================================
// 执行函数
// ============================================

export const executeQueryKnowledge = async (args: {
  query?: string;
  wing?: 'writing_rules' | 'world';
  room?: string;
  tags?: string[];
  sortBy?: 'relevance' | 'activation';
  limit?: number;
  offset?: number;
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { query, wing, room, tags, sortBy = 'relevance', limit = 10, offset = 0 } = args;

  // 收集诊断信息
  const diagnostics: string[] = [];

  let nodes = store.nodes;

  // 按翼过滤
  if (wing) {
    nodes = nodes.filter((n) => n.wing === wing);
  }

  // 按房间过滤
  if (room) {
    nodes = nodes.filter((n) => n.room === room);
  }

  // 按标签过滤
  if (tags && tags.length > 0) {
    nodes = nodes.filter((n) => tags.some((tag) => n.tags.includes(tag)));
  }

  // 按关键词搜索预过滤：优先语义搜索，fallback Fuse.js
  let fuseResults: { item: KnowledgeNode; score?: number }[] | null = null;
  if (query && query.trim()) {
    // 尝试语义搜索（如果 embedding 可用）
    const hasEmbeddings = nodes.some((n) => n.embedding && n.embedding.length > 0);
    if (hasEmbeddings) {
      try {
        const semanticResults = await semanticSearch(query, nodes, limit);
        if (semanticResults.length > 0) {
          // 补充搜索文件（子串+语义）
          let fileResults: Array<{ fileName: string; path: string; score: number; matchType: string }> = [];
          let fileSearchError: string | undefined;
          try {
            const files = useFileStore.getState().files;
            const { substring: subFiles, semantic: semFiles } = await semanticFileSearch(query, files, limit);
            const fileMap = new Map<string, { fileName: string; path: string; score: number; matchType: string }>();
            for (const r of subFiles) {
              const file = files.find(f => f.id === r.fileId);
              fileMap.set(r.fileId, { fileName: file ? file.name : r.fileId, path: file ? getNodePath(file, files) : r.fileId, score: Math.round(r.score * 100), matchType: r.matchType });
            }
            for (const r of semFiles) {
              const file = files.find(f => f.id === r.fileId);
              if (!fileMap.has(r.fileId)) {
                fileMap.set(r.fileId, { fileName: file ? file.name : r.fileId, path: file ? getNodePath(file, files) : r.fileId, score: Math.round(r.score * 100), matchType: r.matchType });
              }
            }
            fileResults = Array.from(fileMap.values()).slice(0, limit);
          } catch (e: any) {
            fileSearchError = e?.message || String(e);
            diagnostics.push(`文件搜索失败: ${fileSearchError}`);
          }

          return JSON.stringify({
            success: true,
            total: semanticResults.length,
            query,
            sortBy,
            results: semanticResults.slice(0, limit).map((r) => ({
              id: r.node.id,
              name: r.node.name,
              category: r.node.category,
              subCategory: r.node.subCategory,
              summary: r.node.summary,
              tags: r.node.tags,
              importance: r.node.importance,
              wing: r.node.wing,
              room: r.node.room,
              score: Math.round(r.score * 100),
              activation: r.node.metadata?.activation?.toFixed(2),
            })),
            ...(fileResults.length > 0 ? { fileResults, mode: 'semantic+file' } : { mode: 'semantic' }),
            ...(diagnostics.length > 0 ? { diagnostics } : {}),
          });
        }
      } catch (e: any) {
        // embedding 模型未就绪，fallback 到 Fuse.js
        diagnostics.push(`语义搜索失败: ${e?.message || String(e)}`);
        console.warn('[KnowledgeTools] 语义搜索失败，使用 Fuse.js:', e);
      }
    } else {
      diagnostics.push('知识节点尚无 embedding，已降级为 Fuse.js 模糊搜索');
    }

    // Fuse.js 模糊搜索 fallback
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
            const combined = fuseLexical + baseScore.importance + baseScore.activation + baseScore.strength;
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

  const results = nodes.slice(offset, offset + limit);
  const hasMore = nodes.length > offset + limit;

  // 补充搜索文件内容（子串+语义）
  let fileResults: Array<{ fileName: string; path: string; score: number; matchType: string }> = [];
  if (query) {
    try {
      const files = useFileStore.getState().files;
      const { substring: subFiles, semantic: semFiles } = await semanticFileSearch(query, files, limit);
      const fileMap = new Map<string, { fileName: string; path: string; score: number; matchType: string }>();
      for (const r of subFiles) {
        const file = files.find(f => f.id === r.fileId);
        fileMap.set(r.fileId, { fileName: file ? file.name : r.fileId, path: file ? getNodePath(file, files) : r.fileId, score: Math.round(r.score * 100), matchType: r.matchType });
      }
      for (const r of semFiles) {
        const file = files.find(f => f.id === r.fileId);
        if (!fileMap.has(r.fileId)) {
          fileMap.set(r.fileId, { fileName: file ? file.name : r.fileId, path: file ? getNodePath(file, files) : r.fileId, score: Math.round(r.score * 100), matchType: r.matchType });
        }
      }
      fileResults = Array.from(fileMap.values()).slice(0, limit);
    } catch (e: any) {
      diagnostics.push(`文件搜索失败: ${e?.message || String(e)}`);
    }
  }

  return JSON.stringify({
    success: true,
    count: results.length,
    total: nodes.length,
    offset,
    limit,
    hasMore,
    results: results.map((n) => ({
      id: n.id,
      name: n.name,
      summary: n.summary,
      tags: n.tags,
      importance: n.importance,
      wing: n.wing,
      room: n.room,
    })),
    ...(fileResults.length > 0 ? { fileResults, mode: 'memory+file' } : { mode: 'memory' }),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  });
};

export const executeManageKnowledge = async (args: {
  action: 'add' | 'update' | 'delete' | 'resolve';
  nodes?: Array<{
    wing: 'writing_rules' | 'world';
    room: string;
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
    room?: string;
    name?: string;
    summary?: string;
    detail?: string;
    subCategory?: string;
    topic?: string;
    tags?: string[];
    importance?: 'critical' | 'important' | 'normal';
  }>;
  nodeIds?: string[];
  // resolve 操作参数
  resolveEdgeId?: string;
  resolution?: 'keep_old' | 'keep_new' | 'merge' | 'keep_both';
  mergedName?: string;
  mergedSummary?: string;
  mergedDetail?: string;
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  // wing+room → category+subCategory 映射
  const wingRoomToCategory = (wing: string, room: string): { category: KnowledgeCategory; subCategory: string } => {
    if (wing === 'writing_rules') {
      // writing_rules → 映射到 规则/禁止/风格
      if (room.includes('忌讳') || room.includes('禁止')) return { category: '禁止', subCategory: room };
      if (room.includes('风格') || room.includes('文风') || room.includes('习惯')) return { category: '风格', subCategory: room };
      return { category: '规则', subCategory: room };
    }
    // world → 映射到 设定
    return { category: '设定', subCategory: room };
  };

  const { action, nodes, updates, nodeIds } = args;

  switch (action) {
    case 'add': {
      if (!nodes || nodes.length === 0) {
        return JSON.stringify({ success: false, error: '缺少节点列表' });
      }

      const addedNodes: Array<{ id: string; name: string; wing: string; room: string }> = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      const validWings = Object.keys(WING_ROOMS);
      const validRooms = WING_ROOMS;

      for (const n of nodes) {
        // 验证 wing
        if (!validWings.includes(n.wing)) {
          errors.push(`"${n.name}" wing "${n.wing}" 不合法，必须为: ${validWings.join('/')}`);
          continue;
        }
        // 验证 room
        const allowedRooms = validRooms[n.wing as keyof typeof WING_ROOMS] || [];
        if (allowedRooms.length > 0 && !allowedRooms.includes(n.room)) {
          errors.push(`"${n.name}" room "${n.room}" 不合法。${n.wing} 翼可选: ${allowedRooms.join('/')}`);
          continue;
        }
        if (n.name.length > 20) {
          errors.push(`"${n.name}" 名称过长（≤20字）`);
          continue;
        }
        if (n.summary.length > 50) {
          errors.push(`"${n.name}" 摘要过长（≤50字）`);
          continue;
        }

        const attachments = n.attachments?.map(a => ({
          filePath: a.filePath,
          fileName: a.filePath.split('/').pop() || a.filePath,
          attachedAt: Date.now(),
          reason: a.reason,
        }));

        const { category, subCategory } = wingRoomToCategory(n.wing, n.room);
        try {
          const newNode = await store.addNodeWithEmbedding({
            category,
            subCategory,
            name: n.name,
            summary: n.summary,
            detail: n.detail,
            tags: n.tags || [],
            importance: n.importance || 'normal',
            wing: n.wing,
            room: n.room,
            attachments,
          });
          addedNodes.push({
            id: newNode.id,
            name: newNode.name,
            wing: newNode.wing || n.wing,
            room: newNode.room || n.room,
          });
          if (!newNode.embedding) {
            warnings.push(`"${n.name}" 节点已创建，但 embedding 生成失败（可能无法被语义搜索召回）`);
          }
        } catch (e: any) {
          errors.push(`"${n.name}" 创建失败: ${e?.message || String(e)}`);
        }
      }

      return JSON.stringify({
        success: errors.length === 0,
        added: addedNodes.length,
        failed: errors.length,
        nodes: addedNodes,
        ...(errors.length > 0 ? { errors } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    }

    case 'update': {
      if (!updates || updates.length === 0) {
        return JSON.stringify({ success: false, error: '缺少更新列表' });
      }

      const updatedNodes: Array<{ id: string; name: string }> = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      for (const update of updates) {
        const existing = store.getNodeById(update.nodeId);
        if (!existing) {
          errors.push(`节点 ${update.nodeId} 不存在`);
          continue;
        }

        try {
          await store.updateNodeWithEmbedding(update.nodeId, {
            subCategory: update.subCategory,
            topic: update.topic,
            name: update.name,
            summary: update.summary,
            detail: update.detail,
            tags: update.tags,
            importance: update.importance,
          });
          updatedNodes.push({ id: update.nodeId, name: update.name || existing.name });
        } catch (e: any) {
          errors.push(`节点 ${update.nodeId} 更新失败: ${e?.message || String(e)}`);
        }
      }

      return JSON.stringify({
        success: errors.length === 0,
        updated: updatedNodes.length,
        failed: errors.length,
        nodes: updatedNodes,
        ...(errors.length > 0 ? { errors } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
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

    case 'resolve': {
      const { resolveEdgeId, resolution } = args;
      if (!resolveEdgeId || !resolution) {
        return JSON.stringify({ success: false, error: 'resolve 操作需要 resolveEdgeId 和 resolution 参数' });
      }

      const conflicts = store.getConflicts();
      const conflict = conflicts.find(c => c.edge.id === resolveEdgeId);
      if (!conflict) {
        return JSON.stringify({
          success: false,
          error: `未找到冲突边 ${resolveEdgeId}。当前冲突: ${conflicts.map(c => c.edge.id).join(', ') || '无'}`,
        });
      }

      const mergedContent: Partial<KnowledgeNode> = {};
      if (resolution === 'merge') {
        if (args.mergedName) mergedContent.name = args.mergedName;
        if (args.mergedSummary) mergedContent.summary = args.mergedSummary;
        if (args.mergedDetail) mergedContent.detail = args.mergedDetail;
      }

      const ok = store.resolveConflict(resolveEdgeId, resolution, resolution === 'merge' ? mergedContent : undefined);

      return JSON.stringify({
        success: ok,
        resolution,
        resolved: `${conflict.fromNode.name} vs ${conflict.toNode.name}`,
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

  if (!action) {
    return JSON.stringify({ success: false, error: '缺少 action 参数（必须为 add 或 remove）' });
  }
  if (!from) {
    return JSON.stringify({ success: false, error: '缺少 from 参数（源节点ID）' });
  }
  if (!to) {
    return JSON.stringify({ success: false, error: '缺少 to 参数（目标节点ID）' });
  }
  if (!type) {
    return JSON.stringify({ success: false, error: '缺少 type 参数（关系类型：属于/细化/依赖/冲突）' });
  }

  // 验证节点存在
  const fromNode = store.getNodeById(from);
  const toNode = store.getNodeById(to);

  if (!fromNode || !toNode) {
    const missing = [!fromNode ? `from=${from}` : null, !toNode ? `to=${to}` : null].filter(Boolean);
    return JSON.stringify({
      success: false,
      error: `节点不存在: ${missing.join(', ')}`,
    });
  }

  switch (action) {
    case 'add':
      store.addEdge(from, to, type, note);
      return JSON.stringify({
        success: true,
        edge: { from: fromNode.name, to: toNode.name, type },
      });

    case 'remove': {
      const edges = store.getEdgesForNode(from);
      const edge = edges.find((e) => e.to === to && e.type === type);
      if (edge) {
        store.removeEdge(edge.id);
        return JSON.stringify({ success: true, removed: { from: fromNode.name, to: toNode.name, type } });
      }
      return JSON.stringify({
        success: false,
        error: `未找到关系: ${fromNode.name} →${type}→ ${toNode.name}`,
        availableEdges: edges.map(e => ({ to: store.getNodeById(e.to)?.name || e.to, type: e.type })),
      });
    }

    default:
      return JSON.stringify({ success: false, error: `未知操作类型: ${action}（必须为 add 或 remove）` });
  }
};

// ============================================
// memory_status 执行函数
// ============================================

export const executeMemoryStatus = async (args: { listMode?: 'summary' | 'ids' | 'full' } = {}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const now = Date.now();
  const nodes = store.nodes.filter(n => n.category !== '用户偏好');
  const listMode = args.listMode || 'summary';

  // 按 wing → room 聚合
  const wings: Record<string, Record<string, number>> = {};
  for (const n of nodes) {
    const wing = n.wing || 'unassigned';
    const room = n.room || '未分类';
    if (!wings[wing]) wings[wing] = {};
    wings[wing][room] = (wings[wing][room] || 0) + 1;
  }

  // 冲突统计
  const conflicts = store.getConflicts();

  // 衰减统计
  // 激活度统计（展示平均 activation）
  const avgActivation = nodes.length > 0
    ? nodes.reduce((sum, n) => sum + (n.metadata?.activation || 0), 0) / nodes.length
    : 0;

  const baseResult: any = {
    success: true,
    totalNodes: nodes.length,
    totalEdges: store.edges.length,
    wings,
    conflicts: conflicts.length,
    conflictDetails: conflicts.length > 0
      ? conflicts.map(c => ({ edgeId: c.edge.id, from: c.fromNode.name, to: c.toNode.name }))
      : undefined,
    avgActivation: avgActivation.toFixed(2),
  };

  if (listMode === 'ids') {
    baseResult.nodes = nodes.map(n => ({
      id: n.id,
      name: n.name,
      wing: n.wing,
      room: n.room,
    }));
  }

  baseResult.topTags = store.availableTags.slice(0, 20);

  return JSON.stringify(baseResult);
};

// ============================================
// traverse_memory 执行函数
// ============================================

export const executeTraverseMemory = async (args: {
  nodeId: string;
  depth?: number;
  edgeTypes?: KnowledgeEdgeType[];
}) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  const { nodeId, depth: rawDepth = 2, edgeTypes } = args;

  if (!nodeId) {
    return JSON.stringify({
      success: false,
      error: '缺少 nodeId 参数。请先通过 query_memory 或 memory_status 获取节点ID，再调用 traverse_memory。',
    });
  }

  const maxDepth = Math.min(rawDepth, 3);
  const maxResults = 20; // 硬编码，不开放自定义

  const startNode = store.getNodeById(nodeId);
  if (!startNode) {
    return JSON.stringify({
      success: false,
      error: `节点 ${nodeId} 不存在。可用节点: ${store.nodes.slice(0, 10).map(n => `${n.id}=${n.name}`).join(', ')}`,
    });
  }

  // BFS 遍历（记录完整路径链）
  const visited = new Set<string>([nodeId]);
  const parentPath = new Map<string, string>();
  parentPath.set(nodeId, startNode.name);

  const reached: Array<{
    id: string;
    name: string;
    wing: string | undefined;
    room: string | undefined;
    summary: string;
    tags: string[];
    distance: number;
    path: string;
  }> = [];

  let frontier = new Set<string>([nodeId]);

  for (let d = 1; d <= maxDepth; d++) {
    const nextFrontier = new Set<string>();
    for (const curId of frontier) {
      const edges = store.getEdgesForNode(curId);
      for (const edge of edges) {
        // 过滤关系类型
        if (edgeTypes && edgeTypes.length > 0 && !edgeTypes.includes(edge.type)) continue;

        const neighborId = edge.from === curId ? edge.to : edge.from;
        if (visited.has(neighborId)) continue;

        visited.add(neighborId);
        nextFrontier.add(neighborId);

        const neighbor = store.getNodeById(neighborId);
        if (!neighbor) continue;

        const curPath = parentPath.get(curId) || startNode.name;
        const neighborPath = `${curPath} →${edge.type}→ ${neighbor.name}`;
        parentPath.set(neighborId, neighborPath);

        reached.push({
          id: neighbor.id,
          name: neighbor.name,
          wing: neighbor.wing,
          room: neighbor.room,
          summary: neighbor.summary,
          tags: neighbor.tags,
          distance: d,
          path: neighborPath,
        });
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  return JSON.stringify({
    success: true,
    start: {
      id: startNode.id,
      name: startNode.name,
      wing: startNode.wing,
      room: startNode.room,
      summary: startNode.summary,
    },
    reachedCount: reached.length,
    reached: reached.slice(0, maxResults),
    hasMore: reached.length > maxResults,
  });
};

// ============================================
// 导出
// ============================================

export const knowledgeGraphToolDefinitions = [
  queryKnowledgeTool,
  manageKnowledgeTool,
  linkKnowledgeTool,
  memoryStatusTool,
  traverseMemoryTool,
];
