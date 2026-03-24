/**
 * @file memoryDecisionAgent.ts
 * @description 记忆决策 Agent - 拥有查询工具，自主决定如何更新知识图谱
 */

import { AIService } from '../geminiService';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import {
  LongTermMemory,
  LongTermMemoryDraft,
  MemoryEdge,
  MemoryType,
  MemoryEdgeType,
  GraphOperation,
} from '../../types';
import {
  getMetadataStats,
  formatMetadataStats,
  queryMemories,
  formatQueryResult,
  checkTextOverlap,
  formatOverlapResult,
  MemoryQueryParams,
} from '../../utils/memoryGraph';

// ==================== 输入输出类型 ====================

export interface MemoryDecisionInput {
  content: string;
  source: 'dialogue' | 'document';
  sourceRef?: string;
  existingMemories: LongTermMemory[];
  existingEdges: MemoryEdge[];
}

export interface MemoryDecisionOutput {
  shouldExtract: boolean;
  summary: string;
  operations: GraphOperation[];
}

// ==================== 工具定义 ====================

const listMemoryMetadataTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_memory_metadata',
    description: '列出知识图谱中已存在的元数据（关键字、标签、分类），帮助你了解现有记忆结构。',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['keywords', 'tags', 'types', 'all'],
          description: '要列出的元数据类型',
        },
      },
      required: ['type'],
    },
  },
};

const queryMemoryGraphTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_memory_graph',
    description: '根据条件查询记忆节点。可以按关键字、标签、类型过滤。',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '关键字列表（OR 匹配）',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表（OR 匹配）',
        },
        types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['setting', 'style', 'restriction', 'experience', 'world_rule'],
          },
          description: '记忆类型列表',
        },
        limit: {
          type: 'number',
          description: '返回数量限制（默认 5）',
        },
      },
    },
  },
};

const checkTextOverlapTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'check_text_overlap',
    description: '检查文本与现有记忆的关键字/标签重叠，帮助你判断是新增还是更新。',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '要检查的文本',
        },
      },
      required: ['text'],
    },
  },
};

const submitMemoryDecisionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_memory_decision',
    description: '提交记忆决策结果。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '你的判断依据和分析过程',
        },
        shouldExtract: {
          type: 'boolean',
          description: '是否应该提取/更新记忆',
        },
        summary: {
          type: 'string',
          description: '这次操作的摘要',
        },
        operations: {
          type: 'array',
          description: '图谱操作列表',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['add', 'update', 'merge', 'link', 'skip'],
                description: '操作类型',
              },
              memoryId: {
                type: 'string',
                description: '目标记忆 ID（update/merge/link 时需要）',
              },
              memoryIds: {
                type: 'array',
                items: { type: 'string' },
                description: '要合并的记忆 ID 列表（merge 时需要）',
              },
              memory: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['setting', 'style', 'restriction', 'experience', 'world_rule'],
                  },
                  tags: { type: 'array', items: { type: 'string' } },
                  keywords: { type: 'array', items: { type: 'string' } },
                  summary: { type: 'string' },
                  content: { type: 'string' },
                  importance: {
                    type: 'string',
                    enum: ['critical', 'important', 'normal'],
                  },
                  isResident: { type: 'boolean' },
                },
              },
              linkTo: {
                type: 'string',
                description: '要关联到的记忆 ID（link 时需要）',
              },
              linkType: {
                type: 'string',
                enum: ['extends', 'refines', 'conflicts', 'relates_to'],
                description: '关联类型（link 时需要）',
              },
              reason: {
                type: 'string',
                description: '操作原因（skip 时需要）',
              },
            },
            required: ['action'],
          },
        },
      },
      required: ['thinking', 'shouldExtract', 'summary', 'operations'],
    },
  },
};

// ==================== Agent 配置 ====================

const buildSystemPrompt = (input: MemoryDecisionInput): string => `
你是记忆管理器。分析新内容，决定如何更新知识图谱。

## 禁止提取的内容
- 角色相关的任何信息（描述、性格、背景、关系等）
- 角色档案应通过 02_角色档案 目录管理，不属于长期记忆系统

## 可用工具
- list_memory_metadata: 查看已有的关键字、标签、分类
- query_memory_graph: 按条件查询记忆
- check_text_overlap: 检查文本与现有记忆的重叠
- submit_memory_decision: 提交最终决策（必须调用此工具结束）

## 工作流程
1. 先调用 list_memory_metadata 了解现有记忆结构
2. 从新内容中提取关键字，调用 query_memory_graph 或 check_text_overlap 查询相似记忆
3. 根据查询结果，决定操作类型：
   - **add**: 确实是新信息，没有相似的现有记忆
   - **update**: 找到相似记忆，需要更新其内容
   - **merge**: 发现多个重复记忆，需要合并
   - **link**: 新信息与现有记忆相关，建立关联
   - **skip**: 临时性内容或不需要记录
4. 调用 submit_memory_decision 提交决策

## 判断原则
- 宁缺毋滥，只保留长期有效的信息
- 稳定偏好、硬性约束、长期设定、可复用经验才值得记录
- 一次性任务、临时闲聊、短期需求不要记录

## 记忆类型
- setting: 项目稳定设定
- style: 文风与表达偏好
- restriction: 硬限制与禁令
- experience: 方法论与经验
- world_rule: 世界观或系统规则

## 重要度设置
- critical: 绝对不能违背的规则
- important: 重要但可以变通
- normal: 一般性信息

## 新内容来源
来源: ${input.source}
${input.sourceRef ? `引用: ${input.sourceRef}` : ''}

## 新内容
\`\`\`
${input.content.slice(0, 8000)}
\`\`\`

## 已有记忆数量
${input.existingMemories.length} 条记忆，${input.existingEdges.length} 条关联
`;

// ==================== 工具执行 ====================

interface ToolContext {
  memories: LongTermMemory[];
  edges: MemoryEdge[];
}

const executeListMetadata = (args: { type: string }, ctx: ToolContext): string => {
  const stats = getMetadataStats(ctx.memories);

  if (args.type === 'all') {
    return formatMetadataStats(stats);
  }

  switch (args.type) {
    case 'keywords':
      return `## 已有关键字 (keywords)\n${stats.keywords.map((k) => `- ${k.keyword} (${k.count}条)`).join('\n') || '(暂无)'}`;
    case 'tags':
      return `## 已有标签 (tags)\n${stats.tags.map((t) => `- ${t.tag} (${t.count}条)`).join('\n') || '(暂无)'}`;
    case 'types':
      return `## 记忆类型 (types)\n${stats.types.map((t) => `- ${t.type} (${t.count}条)`).join('\n') || '(暂无)'}`;
    default:
      return formatMetadataStats(stats);
  }
};

const executeQueryGraph = (args: MemoryQueryParams, ctx: ToolContext): string => {
  const results = queryMemories(ctx.memories, {
    ...args,
    limit: args.limit ?? 5,
  });
  return formatQueryResult(results, ctx.edges);
};

const executeCheckOverlap = (args: { text: string }, ctx: ToolContext): string => {
  const result = checkTextOverlap(args.text, ctx.memories);
  return formatOverlapResult(result);
};

// ==================== Agent 配置对象 ====================

const memoryDecisionConfig: SubAgentConfig<MemoryDecisionInput, MemoryDecisionOutput> = {
  name: 'MemoryDecisionAgent',
  maxLoops: 8,
  temperature: 0.1,
  tools: [listMemoryMetadataTool, queryMemoryGraphTool, checkTextOverlapTool, submitMemoryDecisionTool],
  terminalToolName: 'submit_memory_decision',

  getSystemPrompt: buildSystemPrompt,

  getInitialMessage: () => '请分析新内容，使用工具查询现有记忆，然后决定如何更新知识图谱。',

  parseTerminalResult: (args) => {
    const operations: GraphOperation[] = (args.operations || []).map((op: any) => {
      const action = op.action as GraphOperation['action'];

      switch (action) {
        case 'add':
          return {
            action: 'add',
            memory: op.memory as LongTermMemoryDraft,
            links: op.linkTo
              ? [{ to: op.linkTo, type: (op.linkType || 'relates_to') as MemoryEdgeType }]
              : [],
          };
        case 'update':
          return {
            action: 'update',
            memoryId: op.memoryId,
            changes: op.memory as Partial<LongTermMemoryDraft>,
          };
        case 'merge':
          return {
            action: 'merge',
            memoryIds: op.memoryIds,
            mergedMemory: op.memory as LongTermMemoryDraft,
          };
        case 'link':
          return {
            action: 'link',
            from: op.memoryId,
            to: op.linkTo,
            type: (op.linkType || 'relates_to') as MemoryEdgeType,
          };
        case 'skip':
        default:
          return {
            action: 'skip',
            reason: op.reason || '未指定原因',
          };
      }
    });

    return {
      shouldExtract: Boolean(args.shouldExtract),
      summary: args.summary || '',
      operations,
    };
  },

  handleTextResponse: () => '请使用工具查询现有记忆，然后调用 submit_memory_decision 提交决策。',
};

// ==================== 导出函数 ====================

export async function runMemoryDecisionAgent(
  aiService: AIService,
  input: MemoryDecisionInput,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<MemoryDecisionOutput> {
  const ctx: ToolContext = {
    memories: input.existingMemories,
    edges: input.existingEdges,
  };

  // 创建带有自定义工具执行器的配置
  const configWithExecutor: SubAgentConfig<MemoryDecisionInput, MemoryDecisionOutput> = {
    ...memoryDecisionConfig,
    executeCustomTool: async (name: string, args: any, _context: any) => {
      switch (name) {
        case 'list_memory_metadata':
          return executeListMetadata(args as { type: string }, ctx);
        case 'query_memory_graph':
          return executeQueryGraph(args as MemoryQueryParams, ctx);
        case 'check_text_overlap':
          return executeCheckOverlap(args as { text: string }, ctx);
        default:
          return `错误：未知工具 ${name}`;
      }
    },
  };

  const agent = new BaseSubAgent(configWithExecutor);
  return agent.run(aiService, input, undefined, onLog, signal);
}
