/**
 * @file memoryDecisionAgent.ts
 * @description 记忆决策 Agent - 两阶段流程：
 *   1. 快速评估是否值得处理
 *   2. 如果值得，进行查询和决策
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
  ProjectMeta,
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
import { buildProjectOverviewPrompt } from '../../utils/projectContext';

// ==================== 输入输出类型 ====================

export interface MemoryDecisionInput {
  content: string;
  source: 'dialogue' | 'document';
  sourceRef?: string;
  existingMemories: LongTermMemory[];
  existingEdges: MemoryEdge[];
  project?: ProjectMeta;
}

export interface MemoryDecisionOutput {
  shouldExtract: boolean;
  summary: string;
  operations: GraphOperation[];
}

// ==================== 阶段一：快速评估 ====================

interface QuickEvalOutput {
  shouldProcess: boolean;
  reason: string;
  contentType: 'preference' | 'constraint' | 'setting' | 'experience' | 'world_rule' | 'none';
  keywords: string[];
}

const quickEvalTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quick_eval',
    description: '快速评估内容是否值得进入长期记忆。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        shouldProcess: {
          type: 'boolean',
          description: '是否值得进一步处理',
        },
        reason: {
          type: 'string',
          description: '判断原因',
        },
        contentType: {
          type: 'string',
          enum: ['preference', 'constraint', 'setting', 'experience', 'world_rule', 'none'],
          description: '内容类型',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '提取的关键字（如果值得处理）',
        },
      },
      required: ['shouldProcess', 'reason', 'contentType'],
    },
  },
};

const quickEvalConfig: SubAgentConfig<MemoryDecisionInput, QuickEvalOutput> = {
  name: 'QuickEvalAgent',
  maxLoops: 2,
  temperature: 0.1,
  tools: [quickEvalTool],
  terminalToolName: 'quick_eval',

  getSystemPrompt: (input) => {
    const projectOverview = buildProjectOverviewPrompt(input.project);
    return `${projectOverview}

你是【内容评估器】。快速判断以下内容是否值得进入长期记忆系统。

## ⚠️ 禁止提取的内容（直接返回 shouldProcess=false）
- 角色相关的任何信息（描述、性格、背景、关系、口吻等）→ 角色档案系统管理
- 一次性任务请求（"帮我写..."、"修改一下..."）
- 临时闲聊、寒暄
- 短期需求、临时决定
- 具体剧情、场景、对话内容

## ✅ 值得提取的内容
- **preference**: 稳定偏好（"以后都用第一人称"、"偏好短句"）
- **constraint**: 硬性约束（"不能改这个设定"、"必须遵守..."）
- **setting**: 项目级稳定设定（世界观基础规则）
- **experience**: 可复用的方法论、写作经验
- **world_rule**: 世界观或系统规则

## 评估原则
- 宁缺毋滥：不确定时返回 false
- 快速判断：不要过度分析
- 只看是否有**长期稳定**的价值

## 内容来源
来源: ${input.source}

## 待评估内容
\`\`\`
${input.content.slice(0, 4000)}
\`\`\`

快速评估并调用 quick_eval 工具。
`;
  },

  getInitialMessage: () => '快速评估内容是否值得进入长期记忆系统。',

  parseTerminalResult: (args) => ({
    shouldProcess: Boolean(args.shouldProcess),
    reason: args.reason || '',
    contentType: args.contentType || 'none',
    keywords: args.keywords || [],
  }),

  handleTextResponse: () => '请直接调用 quick_eval 工具提交评估结果。',
};

// ==================== 阶段二：查询决策 ====================

const listMemoryMetadataTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_memory_metadata',
    description: '列出知识图谱中已存在的元数据（关键字、标签、分类）。',
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
    description: '根据条件查询记忆节点。',
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
    description: '检查文本与现有记忆的关键字/标签重叠。',
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

// ==================== 阶段二 Agent 配置 ====================

interface DecisionInput extends MemoryDecisionInput {
  evalResult: QuickEvalOutput;
}

const buildDecisionPrompt = (input: DecisionInput): string => {
  const projectOverview = buildProjectOverviewPrompt(input.project);
  return `${projectOverview}

你是记忆管理器。根据评估结果，决定如何更新知识图谱。

## 评估结果
- 内容类型: ${input.evalResult.contentType}
- 评估原因: ${input.evalResult.reason}
- 提取关键字: ${input.evalResult.keywords.join(', ') || '(无)'}

## 禁止提取的内容
- 角色相关的任何信息（描述、性格、背景、关系等）
- 角色档案应通过 02_角色档案 目录管理

## 可用工具
- list_memory_metadata: 查看已有的关键字、标签、分类
- query_memory_graph: 按条件查询记忆
- check_text_overlap: 检查文本与现有记忆的重叠
- submit_memory_decision: 提交最终决策（必须调用此工具结束）

## 工作流程
1. 使用 query_memory_graph 或 check_text_overlap 查询相似记忆
2. 根据查询结果，决定操作类型：
   - **add**: 确实是新信息
   - **update**: 找到相似记忆，需要更新
   - **merge**: 发现多个重复记忆，需要合并
   - **link**: 与现有记忆相关，建立关联
   - **skip**: 最终决定不记录
3. 调用 submit_memory_decision 提交决策

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

## 来源
${input.source}${input.sourceRef ? ` - ${input.sourceRef}` : ''}

## 内容
\`\`\`
${input.content.slice(0, 6000)}
\`\`\`
`;
};

const decisionConfig: SubAgentConfig<DecisionInput, MemoryDecisionOutput> = {
  name: 'MemoryDecisionAgent',
  maxLoops: 6,
  temperature: 0.1,
  tools: [listMemoryMetadataTool, queryMemoryGraphTool, checkTextOverlapTool, submitMemoryDecisionTool],
  terminalToolName: 'submit_memory_decision',

  getSystemPrompt: buildDecisionPrompt,

  getInitialMessage: () => '请查询现有记忆并决定如何处理新内容。',

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
  // ========== 阶段一：快速评估 ==========
  if (onLog) onLog('🔍 [阶段一] 快速评估内容...');

  const quickEvalAgent = new BaseSubAgent(quickEvalConfig);
  const evalResult = await quickEvalAgent.run(aiService, input, undefined, onLog, signal);

  // 如果不值得处理，直接返回
  if (!evalResult.shouldProcess) {
    if (onLog) onLog(`⏭️ [阶段一] 跳过处理: ${evalResult.reason}`);
    return {
      shouldExtract: false,
      summary: evalResult.reason,
      operations: [{ action: 'skip', reason: evalResult.reason }],
    };
  }

  if (onLog) onLog(`✅ [阶段一] 值得处理: ${evalResult.contentType}`);

  // ========== 阶段二：查询决策 ==========
  if (onLog) onLog('🔍 [阶段二] 查询并决策...');

  const ctx: ToolContext = {
    memories: input.existingMemories,
    edges: input.existingEdges,
  };

  const decisionInput: DecisionInput = {
    ...input,
    evalResult,
  };

  const configWithExecutor: SubAgentConfig<DecisionInput, MemoryDecisionOutput> = {
    ...decisionConfig,
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

  const decisionAgent = new BaseSubAgent(configWithExecutor);
  return decisionAgent.run(aiService, decisionInput, undefined, onLog, signal);
}
