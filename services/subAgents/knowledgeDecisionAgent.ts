/**
 * @file knowledgeDecisionAgent.ts
 * @description 知识决策 Agent - 处理新知识图谱的提取和分类
 */

import { AIService } from '../geminiService';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import {
  KnowledgeCategory,
  KnowledgeNodeDraft,
  KnowledgeEdgeType,
  DEFAULT_SUB_CATEGORIES,
  ProjectMeta,
} from '../../types';
import { useKnowledgeGraphStore } from '../../stores/knowledgeGraphStore';
import { buildProjectOverviewPrompt } from '../../utils/projectContext';

// ==================== 输入输出类型 ====================

export interface KnowledgeDecisionInput {
  content: string;
  source: 'dialogue' | 'document';
  sourceRef?: string;
  project?: ProjectMeta;
}

export interface KnowledgeDecisionOutput {
  shouldExtract: boolean;
  summary: string;
  nodes: Array<{
    action: 'add' | 'update' | 'skip';
    category: KnowledgeCategory;
    subCategory: string;
    topic?: string;
    name: string;
    summary: string;
    detail?: string;
    tags: string[];
    importance: 'critical' | 'important' | 'normal';
    existingId?: string;
    reason?: string;
  }>;
  links: Array<{
    from: string;
    to: string;
    type: KnowledgeEdgeType;
  }>;
}

// ==================== 阶段一：快速评估 ====================

interface QuickEvalOutput {
  shouldProcess: boolean;
  reason: string;
  category: KnowledgeCategory | 'none';
  keywords: string[];
}

const quickEvalTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quick_eval',
    description: '快速评估内容是否值得进入知识图谱。[TERMINAL TOOL]',
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
        category: {
          type: 'string',
          enum: ['设定', '规则', '禁止', '风格', 'none'],
          description: '主要分类',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '提取的关键字',
        },
      },
      required: ['shouldProcess', 'reason', 'category'],
    },
  },
};

const quickEvalConfig: SubAgentConfig<KnowledgeDecisionInput, QuickEvalOutput> = {
  name: 'QuickKnowledgeEval',
  maxLoops: 2,
  temperature: 0.1,
  tools: [quickEvalTool],
  terminalToolName: 'quick_eval',

  getSystemPrompt: (input) => {
    const projectOverview = buildProjectOverviewPrompt(input.project);
    return `${projectOverview}

你是【知识评估器】。快速判断内容是否值得进入知识图谱。

## ⚠️ 禁止提取的内容（直接返回 shouldProcess=false）
- 角色相关的任何信息（角色档案系统管理）
- 一次性任务请求（"帮我写..."、"修改一下..."）
- 临时闲聊、寒暄
- 短期需求、临时决定
- 具体剧情、场景、对话内容

## ✅ 值得提取的内容

**设定**: 世界观、背景、体系、规则体系
- 示例：魔法体系、社会结构、地理设定

**规则**: 必须遵守的创作规则
- 示例：章节字数限制、POV 规则、时态要求

**禁止**: 不能做的事情
- 示例：禁止使用的词汇、禁止的情节走向

**风格**: 写作风格指南
- 示例：叙事风格、对话风格、描写偏好

## 内容长度约束
- 名称: ≤20字
- 摘要: ≤50字
- 详情: ≤200字
- 如果内容过长，应该拆分为多个节点

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

  getInitialMessage: () => '快速评估内容是否值得进入知识图谱。',

  parseTerminalResult: (args) => ({
    shouldProcess: Boolean(args.shouldProcess),
    reason: args.reason || '',
    category: args.category || 'none',
    keywords: args.keywords || [],
  }),

  handleTextResponse: () => '请直接调用 quick_eval 工具提交评估结果。',
};

// ==================== 阶段二：知识决策 ====================

const listMetadataTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_knowledge_metadata',
    description: '列出知识图谱中已存在的元数据。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const queryKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_knowledge',
    description: '查询知识图谱中的节点。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        category: {
          type: 'string',
          enum: ['设定', '规则', '禁止', '风格'],
          description: '按分类过滤',
        },
        limit: {
          type: 'number',
          description: '返回数量限制（默认 10）',
        },
      },
    },
  },
};

const submitDecisionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_decision',
    description: '提交知识决策结果。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '你的判断依据和分析过程',
        },
        shouldExtract: {
          type: 'boolean',
          description: '是否应该提取知识',
        },
        summary: {
          type: 'string',
          description: '这次操作的摘要',
        },
        nodes: {
          type: 'array',
          description: '知识节点列表',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['add', 'update', 'skip'],
                description: '操作类型',
              },
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
                description: '重要程度',
              },
              existingId: {
                type: 'string',
                description: '现有节点ID（update时需要）',
              },
              reason: {
                type: 'string',
                description: 'skip 的原因',
              },
            },
          },
        },
        links: {
          type: 'array',
          description: '节点关系列表',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: '源节点名称' },
              to: { type: 'string', description: '目标节点名称' },
              type: {
                type: 'string',
                enum: ['属于', '细化', '依赖', '冲突'],
                description: '关系类型',
              },
            },
          },
        },
      },
      required: ['thinking', 'shouldExtract', 'summary'],
    },
  },
};

// 工具执行函数
const executeListMetadata = async () => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  return JSON.stringify({
    availableSubCategories: store.availableSubCategories,
    availableTags: store.availableTags,
    stats: store.getStats(),
  });
};

const executeQueryKnowledge = async (args: { query?: string; category?: KnowledgeCategory; limit?: number }) => {
  const store = useKnowledgeGraphStore.getState();
  await store.ensureInitialized();

  let nodes = store.nodes;

  if (args.category) {
    nodes = nodes.filter((n) => n.category === args.category);
  }

  if (args.query) {
    const q = args.query.toLowerCase();
    nodes = nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  const results = nodes.slice(0, args.limit || 10);

  return JSON.stringify({
    count: results.length,
    nodes: results.map((n) => ({
      id: n.id,
      category: n.category,
      subCategory: n.subCategory,
      topic: n.topic,
      name: n.name,
      summary: n.summary,
      tags: n.tags,
    })),
  });
};

const decisionConfig: SubAgentConfig<
  KnowledgeDecisionInput & { quickEvalResult: QuickEvalOutput },
  KnowledgeDecisionOutput
> = {
  name: 'KnowledgeDecisionAgent',
  maxLoops: 8,
  temperature: 0.2,
  tools: [listMetadataTool, queryKnowledgeTool, submitDecisionTool],
  terminalToolName: 'submit_decision',

  getSystemPrompt: (input) => {
    const projectOverview = buildProjectOverviewPrompt(input.project);
    return `${projectOverview}

你是【知识决策器】。分析内容并决定如何更新知识图谱。

## 分类体系

### 一级分类（固定）
- **设定**: 世界观、背景、体系
- **规则**: 必须遵守的创作规则
- **禁止**: 不能做的事情
- **风格**: 文风、写作风格

### 二级分类（可扩展）
默认分类：
- 设定: 世界设定、剧情设定、物品设定、场景设定、其他设定
- 规则: 创作规则、叙事规则、角色规则、其他规则
- 禁止: 禁止词汇、禁止情节、禁止写法、其他禁止
- 风格: 叙事风格、对话风格、描写风格、其他风格

命名规则：
- 2-10个汉字
- 格式如「魔法设定」「战斗规则」等

## 内容长度约束
- **名称**: ≤20字，简短明确
- **摘要**: ≤50字，一句话说清楚
- **详情**: ≤200字，如果更长应该拆分节点

## 操作原则
1. **简洁优先**: 每个节点应该是一个精确的事实或规则
2. **避免重复**: 查询现有节点，避免重复创建
3. **合理分类**: 选择最合适的分类
4. **使用标签**: 用标签建立跨分类的关联

## 快速评估结果
已经过初步评估，主要分类: ${input.quickEvalResult.category}
关键字: ${input.quickEvalResult.keywords.join(', ')}

## 内容来源
来源: ${input.source}${input.sourceRef ? ` (${input.sourceRef})` : ''}

## 待处理内容
\`\`\`
${input.content.slice(0, 6000)}
\`\`\`

先查询现有知识，然后做出决策。
`;
  },

  getInitialMessage: (input) =>
    `内容已通过初步评估。请先查询现有知识，然后提交决策。关键分类: ${input.quickEvalResult.category}`,

  parseTerminalResult: (args) => ({
    shouldExtract: Boolean(args.shouldExtract),
    summary: args.summary || '',
    nodes: args.nodes || [],
    links: (args.links || []).map((l: any) => ({
      from: l.from,
      to: l.to,
      type: l.type as KnowledgeEdgeType,
    })),
  }),

  handleTextResponse: () => '请使用工具查询现有知识，然后调用 submit_decision 提交决策。',
};

// ==================== 主 Agent ====================

export class KnowledgeDecisionAgent extends BaseSubAgent<
  KnowledgeDecisionInput,
  KnowledgeDecisionOutput
> {
  constructor() {
    const config: SubAgentConfig<KnowledgeDecisionInput, KnowledgeDecisionOutput> = {
      name: 'KnowledgeDecisionAgent',
      maxLoops: 1,
      temperature: 0.2,
      tools: [],
      terminalToolName: '',
      getSystemPrompt: () => '',
      getInitialMessage: () => '',
      parseTerminalResult: () => ({
        shouldExtract: false,
        summary: '',
        nodes: [],
        links: [],
      }),
    };

    super(config);
  }

  async run(
    input: KnowledgeDecisionInput,
    options?: { signal?: AbortSignal; onLog?: (msg: string) => void }
  ): Promise<KnowledgeDecisionOutput> {
    const onLog = options?.onLog;

    // 阶段一：快速评估
    onLog?.('[阶段一] 快速评估内容...');
    const quickEvalAgent = new BaseSubAgent(quickEvalConfig);
    const quickResult = await quickEvalAgent.run(input, options);

    if (!quickResult.shouldProcess) {
      onLog?.(`[跳过] ${quickResult.reason}`);
      return {
        shouldExtract: false,
        summary: quickResult.reason,
        nodes: [],
        links: [],
      };
    }

    // 阶段二：知识决策
    onLog?.('[阶段二] 分析并决策...');
    const decisionAgent = new BaseSubAgent(decisionConfig);
    const decisionInput = {
      ...input,
      quickEvalResult: quickResult,
    };

    const decisionResult = await decisionAgent.run(decisionInput, {
      ...options,
      toolsExecutor: async (toolName, args) => {
        switch (toolName) {
          case 'list_knowledge_metadata':
            return executeListMetadata();
          case 'query_knowledge':
            return executeQueryKnowledge(args as any);
          default:
            return null;
        }
      },
    });

    return decisionResult;
  }
}

// 便捷函数
export const runKnowledgeDecisionAgent = (
  input: KnowledgeDecisionInput,
  options?: { signal?: AbortSignal; onLog?: (msg: string) => void }
): Promise<KnowledgeDecisionOutput> => {
  const agent = new KnowledgeDecisionAgent();
  return agent.run(input, options);
};

export default KnowledgeDecisionAgent;
