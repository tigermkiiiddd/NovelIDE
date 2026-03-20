import { ChatMessage, LongTermMemory, LongTermMemoryDraft, MemoryType } from '../../types';
import { AIService } from '../geminiService';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';

export interface MemoryCandidateAction {
  action: 'add' | 'update' | 'skip';
  memoryId?: string;
  confidence: number;
  reason: string;
  memory?: LongTermMemoryDraft;
}

export interface ConversationMemoryInput {
  userMessage: ChatMessage;
  recentMessages: ChatMessage[];
  existingMemories: Pick<LongTermMemory, 'id' | 'name' | 'type' | 'tags' | 'keywords' | 'summary' | 'importance' | 'isResident'>[];
}

export interface ConversationMemoryOutput {
  shouldExtract: boolean;
  summary: string;
  actions: MemoryCandidateAction[];
}

const submitConversationMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_conversation_memory',
    description: '提交这轮对话的长期记忆提案。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '简要说明你的判断依据。' },
        shouldExtract: { type: 'boolean', description: '这轮对话是否包含应该沉淀为长期记忆的信息。' },
        summary: { type: 'string', description: '对这次抽取的简要总结。' },
        actions: {
          type: 'array',
          description: '记忆操作列表。没有可沉淀信息时返回空数组。',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'update', 'skip'], description: '操作类型。' },
              memoryId: { type: 'string', description: '若更新已有记忆，提供已有记忆 ID。' },
              confidence: { type: 'number', description: '0-1 之间的置信度。' },
              reason: { type: 'string', description: '为什么要新增、更新或跳过。' },
              memory: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['setting', 'style', 'restriction', 'experience', 'character_rule', 'world_rule'],
                  },
                  tags: { type: 'array', items: { type: 'string' } },
                  keywords: { type: 'array', items: { type: 'string' } },
                  summary: { type: 'string' },
                  content: { type: 'string' },
                  importance: { type: 'string', enum: ['critical', 'important', 'normal'] },
                  isResident: { type: 'boolean' },
                  relatedMemories: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            required: ['action', 'confidence', 'reason'],
          },
        },
      },
      required: ['thinking', 'shouldExtract', 'summary', 'actions'],
    },
  },
};

const conversationMemoryConfig: SubAgentConfig<ConversationMemoryInput, ConversationMemoryOutput> = {
  name: 'ConversationMemoryAgent',
  maxLoops: 4,
  temperature: 0.1,
  tools: [submitConversationMemoryTool],
  terminalToolName: 'submit_conversation_memory',

  getSystemPrompt: (input) => `
你是一个【对话长期记忆抽取器】。你的职责不是回答用户，而是判断这轮用户输入里有没有应该沉淀为长期记忆的信息。

## 只提取这些内容
1. 稳定偏好：例如“以后都用第一人称”“不要紫色 UI”“偏好短句”
2. 硬性约束：例如“不能改这个设定”“必须遵守某个规则”
3. 长期设定：人物规则、世界规则、项目规则、文风规则
4. 可复用经验：用户明确确认的方法论、写作经验、工作偏好

## 不要提取这些内容
1. 一次性任务：例如“现在帮我写这一段”
2. 临时闲聊
3. 没有稳定性的短期需求
4. 已经被现有记忆完整覆盖、且本轮没有新增信息的内容

## 判断原则
- 宁缺毋滥，只保留长期有效的信息
- 如果与现有记忆高度重合，优先 update，不要 add 重复项
- 只有特别关键、必须始终注入系统上下文的信息，才设置 isResident=true
- 只有绝对不能违背的信息，才设置 importance=critical
- 如果 type=character_rule，tags 里必须包含 "角色:角色名"
- 如果 type=character_rule，尽量补充结构化标签：
  - "特质:..."
  - "目标:..."
  - "关系:对方角色:关系状态"
  - "动机:..."

## 记忆类型定义
- setting: 项目稳定设定
- style: 文风与表达偏好
- restriction: 硬限制与禁令
- experience: 方法论与经验
- character_rule: 角色行为/口吻/底线规则
- world_rule: 世界观或系统规则

## 当前用户消息
${input.userMessage.text}

## 最近对话上下文
${input.recentMessages.slice(-8).map((message, index) => `${index + 1}. [${message.role}] ${message.text}`).join('\n')}

## 已有长期记忆
${input.existingMemories.length > 0
    ? input.existingMemories
        .map(
          (memory) =>
            `- (${memory.id}) ${memory.name} [${memory.type}] [${memory.importance}] resident=${memory.isResident} | 关键词: ${memory.keywords.join(', ')} | 摘要: ${memory.summary}`
        )
        .join('\n')
    : '(暂无已有长期记忆)'}

输出要求：
- 最多返回 3 个 action
- 如果没有值得记录的内容，shouldExtract=false 且 actions=[]
- memory.summary 要短，memory.content 要完整
- 只能调用 submit_conversation_memory 工具，不要输出普通文本
`,

  getInitialMessage: () => '请分析这轮用户输入是否应沉淀为长期记忆，并提交结构化结果。',

  parseTerminalResult: (args) => {
    const actions: MemoryCandidateAction[] = (args.actions || []).map((action: any) => ({
      action: action.action || 'skip',
      memoryId: action.memoryId,
      confidence: typeof action.confidence === 'number' ? action.confidence : 0,
      reason: action.reason || '',
      memory: action.memory
        ? {
            name: action.memory.name || '',
            type: (action.memory.type || 'experience') as MemoryType,
            tags: action.memory.tags || [],
            keywords: action.memory.keywords || [],
            summary: action.memory.summary || '',
            content: action.memory.content || '',
            importance: action.memory.importance || 'normal',
            isResident: action.memory.isResident ?? false,
            relatedMemories: action.memory.relatedMemories || [],
          }
        : undefined,
    }));

    return {
      shouldExtract: Boolean(args.shouldExtract),
      summary: args.summary || '',
      actions,
    };
  },

  handleTextResponse: () => '请直接调用 submit_conversation_memory 提交结构化结果，不要输出普通文本。',
};

export async function runConversationMemoryAgent(
  aiService: AIService,
  input: ConversationMemoryInput,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<ConversationMemoryOutput> {
  const agent = new BaseSubAgent(conversationMemoryConfig);
  return agent.run(aiService, input, undefined, onLog, signal);
}
