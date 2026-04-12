/**
 * @file knowledgeExtractionAgent.ts
 * @description 记忆提取 Agent - 从文档/对话中提取记忆节点
 */

import { AIService } from '../geminiService';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import {
  KnowledgeCategory,
  KnowledgeNode,
  KnowledgeNodeDraft,
  KnowledgeEdge,
  KnowledgeEdgeType,
  DEFAULT_SUB_CATEGORIES,
} from '../../types';
import { buildProjectOverviewPrompt } from '../../utils/projectContext';

// ==================== 输入输出类型 ====================

export interface KnowledgeExtractionInput {
  content: string;
  source: 'dialogue' | 'document';
  sourceRef?: string;
  existingNodes: KnowledgeNode[];
  existingEdges: KnowledgeEdge[];
}

export interface KnowledgeExtractionOutput {
  shouldExtract: boolean;
  summary: string;
  operations: KnowledgeOperation[];
}

export interface KnowledgeOperation {
  action: 'add' | 'update' | 'link' | 'contradict' | 'skip';
  node?: KnowledgeNodeDraft;
  nodeId?: string;
  from?: string;
  to?: string;
  edgeType?: KnowledgeEdgeType;
  reason?: string;
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
    description: '快速评估内容是否值得进入记忆宫殿。[TERMINAL TOOL]',
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
          description: '适合的知识分类',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '提取的关键字（如果值得处理）',
        },
      },
      required: ['shouldProcess', 'reason', 'category'],
    },
  },
};

const quickEvalConfig: SubAgentConfig<KnowledgeExtractionInput, QuickEvalOutput> = {
  name: 'QuickEvalAgent',
  maxLoops: 2,
  temperature: 0.1,
  tools: [quickEvalTool],
  terminalToolName: 'quick_eval',

  getSystemPrompt: (input) => {
    const projectOverview = buildProjectOverviewPrompt(undefined);
    return `${projectOverview}

你是【记忆评估器】。快速判断以下内容是否值得进入记忆宫殿。

## ⚠️ 禁止提取的内容（直接返回 shouldProcess=false）
- 角色相关的任何信息（描述、性格、背景、关系、口吻等）→ 角色档案系统管理
- 一次性任务请求（"帮我写..."、"修改一下..."）
- 临时闲聊、寒暄
- 短期需求、临时决定
- 具体剧情、场景、对话内容

## ✅ 值得提取的内容
- **设定**: 世界观基础规则、项目级稳定设定
- **规则**: 创作规则、叙事规则、写作约束
- **禁止**: 禁止词汇、禁止情节、禁止写法
- **风格**: 叙事风格、对话风格、描写风格

## 分类体系
- **设定（是什么）**: 世界设定、物品设定、场景设定
- **规则（必须遵守）**: 创作规则、叙事规则、逻辑规则
- **禁止（绝对不能）**: 禁止词汇、禁止情节、禁止写法
- **风格（建议偏好）**: 叙事风格、对话风格、描写风格

## 评估原则
- 宁缺毋滥：不确定时返回 false
- 快速判断：不要过度分析
- 只看是否有**长期稳定**的价值
- 角色相关信息（设定、性格、背景、关系）由角色档案系统管理，不属于记忆宫殿

## 内容来源
来源: ${input.source}

## 待评估内容
\`\`\`
${input.content.slice(0, 4000)}
\`\`\`

快速评估并调用 quick_eval 工具。
`;
  },

  getInitialMessage: () => '快速评估内容是否值得进入记忆宫殿。',

  parseTerminalResult: (args) => ({
    shouldProcess: Boolean(args.shouldProcess),
    reason: args.reason || '',
    category: args.category as KnowledgeCategory | 'none',
    keywords: args.keywords || [],
  }),
};

// ==================== 阶段二：记忆决策 ====================

interface DecisionInput extends KnowledgeExtractionInput {
  evalResult: QuickEvalOutput;
}

const listNodesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_nodes',
    description: '列出已有的记忆节点',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['设定', '规则', '禁止', '风格', 'all'],
          description: '按分类筛选',
        },
      },
    },
  },
};

const submitDecisionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_decision',
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
          description: '是否应该提取/更新知识',
        },
        summary: {
          type: 'string',
          description: '这次操作的摘要',
        },
        operations: {
          type: 'array',
          description: '记忆操作列表',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['add', 'update', 'link', 'contradict', 'skip'],
              },
              // add/update 时的节点数据
              category: { type: 'string', enum: ['设定', '规则', '禁止', '风格'] },
              subCategory: { type: 'string' },
              topic: { type: 'string' },
              name: { type: 'string' },
              summary: { type: 'string' },
              detail: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              importance: { type: 'string', enum: ['critical', 'important', 'normal'] },
              // Wing/Room 自动分类
              wing: { type: 'string', enum: ['world', 'writing_rules', 'characters', 'plot', 'project'] },
              room: { type: 'string' },
              // update/link 时的节点 ID
              nodeId: { type: 'string' },
              // link 时的边信息
              from: { type: 'string' },
              to: { type: 'string' },
              edgeType: { type: 'string', enum: ['属于', '细化', '依赖', '冲突'] },
              reason: { type: 'string' },
            },
            required: ['action'],
          },
        },
      },
      required: ['thinking', 'shouldExtract', 'summary', 'operations'],
    },
  },
};

const buildDecisionPrompt = (input: DecisionInput): string => {
  const projectOverview = buildProjectOverviewPrompt(undefined);
  const existingNodesSummary = input.existingNodes
    .slice(0, 20)
    .map((n) => `- [${n.category}/${n.subCategory}] ${n.name}: ${n.summary}`)
    .join('\n');

  const suggestedSubCategory = input.evalResult.category !== 'none'
    ? DEFAULT_SUB_CATEGORIES[input.evalResult.category]?.[0] || '其他设定'
    : '';

  return `${projectOverview}

你是【记忆决策器】。根据评估结果，决定如何处理新内容。

## 评估结果
- 分类建议: ${input.evalResult.category}
- 关键词: ${input.evalResult.keywords.join(', ')}

## 已有记忆节点 (共${input.existingNodes.length}条)
${existingNodesSummary || '(暂无)'}

## 二级分类参考
- 设定: 世界设定、物品设定、场景设定
- 规则: 创作规则、叙事规则、逻辑规则
- 禁止: 禁止词汇、禁止情节、禁止写法
- 风格: 叙事风格、对话风格、描写风格

## Wing/Room 宫殿结构（自动分类）
- world (世界设定): 力量体系, 地理环境, 势力分布, 物品道具
- writing_rules (创作规范): 叙事规则, 文风习惯, 用语忌讳, 格式规范, 写作技巧积累
- characters (角色): 角色设定, 角色状态, 关系网络
- plot (剧情): 主线剧情, 支线剧情, 伏笔管理, Timeline
- project (项目): 大纲, 项目设置, 模板

分类自动映射: 设定→world, 规则→writing_rules/叙事规则, 禁止→writing_rules/用语忌讳, 风格→writing_rules/文风习惯

## 操作类型
1. **add**: 添加新记忆节点
   - 必须提供: category, subCategory, name, summary
   - 可选: wing, room（不提供时自动映射）
   - 建议: ${input.evalResult.category !== 'none' ? `category="${input.evalResult.category}", subCategory="${suggestedSubCategory}"` : '根据内容判断'}

2. **update**: 更新现有节点
   - 必须提供: nodeId 和要更新的字段

3. **link**: 建立节点关系
   - 必须提供: from, to, edgeType

4. **contradict**: 标记记忆冲突
   - 必须提供: from (旧节点ID), to (新节点ID), reason
   - 会创建一条"冲突"类型的边，标记两个节点间的矛盾

5. **skip**: 跳过处理

## 待处理内容
来源: ${input.source} ${input.sourceRef ? `(${input.sourceRef})` : ''}
\`\`\`
${input.content.slice(0, 3000)}
\`\`\`

请先查询已有节点，然后调用 submit_decision 提交决策。
`;
};

interface ToolContext {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

const executeListNodes = (args: { category?: string }, ctx: ToolContext): string => {
  let nodes = ctx.nodes;
  if (args.category && args.category !== 'all') {
    nodes = nodes.filter((n) => n.category === args.category);
  }

  if (nodes.length === 0) {
    return '(暂无记忆节点)';
  }

  return nodes
    .slice(0, 30)
    .map((n) => `- [${n.id}] ${n.category}/${n.subCategory}: ${n.name} - ${n.summary}`)
    .join('\n');
};

const decisionConfig: SubAgentConfig<DecisionInput, KnowledgeExtractionOutput> = {
  name: 'KnowledgeDecisionAgent',
  maxLoops: 6,
  temperature: 0.1,
  tools: [listNodesTool, submitDecisionTool],
  terminalToolName: 'submit_decision',

  getSystemPrompt: buildDecisionPrompt,

  getInitialMessage: () => '请查询已有记忆节点，然后决定如何处理新内容。',

  parseTerminalResult: (args) => {
    const operations: KnowledgeOperation[] = (args.operations || []).map((op: any) => {
      const action = op.action as KnowledgeOperation['action'];

      switch (action) {
        case 'add':
          return {
            action: 'add',
            node: {
              category: op.category as KnowledgeCategory,
              subCategory: op.subCategory || '其他设定',
              topic: op.topic,
              name: op.name,
              summary: op.summary,
              detail: op.detail,
              tags: Array.isArray(op.tags) ? op.tags : [],
              importance: op.importance || 'normal',
              wing: op.wing,
              room: op.room,
            } as KnowledgeNodeDraft,
          };
        case 'update':
          return {
            action: 'update',
            nodeId: op.nodeId,
            node: {
              subCategory: op.subCategory,
              topic: op.topic,
              name: op.name,
              summary: op.summary,
              detail: op.detail,
              tags: op.tags != null ? (Array.isArray(op.tags) ? op.tags : []) : undefined,
              importance: op.importance,
              wing: op.wing,
              room: op.room,
            } as Partial<KnowledgeNodeDraft>,
          };
        case 'link':
          return {
            action: 'link',
            from: op.from || op.nodeId,
            to: op.to,
            edgeType: op.edgeType as KnowledgeEdgeType,
          };
        case 'contradict':
          return {
            action: 'contradict',
            from: op.from || op.nodeId,
            to: op.to,
            reason: op.reason || '知识冲突',
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

  handleTextResponse: () => '请使用工具查询已有记忆节点，然后调用 submit_decision 提交决策。',
};

// ==================== 导出函数 ====================

export async function runKnowledgeExtractionAgent(
  aiService: AIService,
  input: KnowledgeExtractionInput,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<KnowledgeExtractionOutput> {
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

  if (onLog) onLog(`✅ [阶段一] 值得处理: ${evalResult.category}`);

  // ========== 阶段二：记忆决策 ==========
  if (onLog) onLog('🔍 [阶段二] 查询并决策...');

  const ctx: ToolContext = {
    nodes: input.existingNodes,
    edges: input.existingEdges,
  };

  const decisionInput: DecisionInput = {
    ...input,
    evalResult,
  };

  const configWithExecutor: SubAgentConfig<DecisionInput, KnowledgeExtractionOutput> = {
    ...decisionConfig,
    executeCustomTool: async (name: string, args: any, _context: any) => {
      switch (name) {
        case 'list_nodes':
          return executeListNodes(args as { category?: string }, ctx);
        default:
          return `错误：未知工具 ${name}`;
      }
    },
  };

  const decisionAgent = new BaseSubAgent(configWithExecutor);
  return decisionAgent.run(aiService, decisionInput, undefined, onLog, signal);
}

// ==================== 便捷函数 ====================

/**
 * 从文档提取知识
 */
export async function extractKnowledgeFromDocument(
  aiService: AIService,
  filePath: string,
  content: string,
  existingNodes: KnowledgeNode[],
  existingEdges: KnowledgeEdge[],
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<KnowledgeExtractionOutput> {
  // 推断文档类型
  const inferDocumentKind = (path: string): string => {
    if (path.startsWith('02_角色档案/')) return '角色设定文档';
    if (path.startsWith('01_世界观/')) return '世界观文档';
    if (path.startsWith('00_基础信息/')) return '基础设定文档';
    if (path.startsWith('03_剧情大纲/')) return '剧情纲要文档';
    return '项目文档';
  };

  const documentKind = inferDocumentKind(filePath);
  const fullContent = `## 文档类型\n${documentKind}\n\n## 文件路径\n${filePath}\n\n## 文档内容\n${content}`;

  return runKnowledgeExtractionAgent(
    aiService,
    {
      content: fullContent,
      source: 'document',
      sourceRef: filePath,
      existingNodes,
      existingEdges,
    },
    onLog,
    signal
  );
}

/**
 * 从对话提取知识
 */
export async function extractKnowledgeFromDialogue(
  aiService: AIService,
  userMessage: string,
  recentMessages: Array<{ role: string; text: string }>,
  existingNodes: KnowledgeNode[],
  existingEdges: KnowledgeEdge[],
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<KnowledgeExtractionOutput> {
  const parts: string[] = [];

  if (recentMessages.length > 0) {
    parts.push('## 最近对话上下文');
    parts.push(recentMessages.slice(-8).map((msg, i) =>
      `${i + 1}. [${msg.role}] ${msg.text}`
    ).join('\n'));
    parts.push('');
  }

  parts.push('## 当前用户消息');
  parts.push(userMessage);

  return runKnowledgeExtractionAgent(
    aiService,
    {
      content: parts.join('\n'),
      source: 'dialogue',
      sourceRef: `对话-${new Date().toLocaleString()}`,
      existingNodes,
      existingEdges,
    },
    onLog,
    signal
  );
}
