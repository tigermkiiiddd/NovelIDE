import { LongTermMemory, LongTermMemoryDraft, MemoryType } from '../../types';
import { AIService } from '../geminiService';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import { MemoryCandidateAction } from './conversationMemoryAgent';

export interface DocumentMemoryInput {
  filePath: string;
  content: string;
  existingMemories: Pick<LongTermMemory, 'id' | 'name' | 'type' | 'tags' | 'keywords' | 'summary' | 'importance' | 'isResident'>[];
}

export interface DocumentMemoryOutput {
  shouldExtract: boolean;
  summary: string;
  actions: MemoryCandidateAction[];
}

const submitDocumentMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_document_memory',
    description: '提交文档抽取出的长期记忆提案。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '简要说明判断依据。' },
        shouldExtract: { type: 'boolean', description: '该文档是否包含应沉淀为长期记忆的内容。' },
        summary: { type: 'string', description: '这次抽取的概要。' },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'update', 'skip'] },
              memoryId: { type: 'string' },
              confidence: { type: 'number' },
              reason: { type: 'string' },
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

const inferDocumentKind = (filePath: string) => {
  if (filePath.startsWith('02_角色档案/')) return '角色设定文档';
  if (filePath.startsWith('01_世界观/')) return '世界观文档';
  if (filePath.startsWith('00_基础信息/')) return '基础设定文档';
  if (filePath.startsWith('03_剧情大纲/')) return '剧情纲要文档';
  return '项目文档';
};

const documentMemoryConfig: SubAgentConfig<DocumentMemoryInput, DocumentMemoryOutput> = {
  name: 'DocumentMemoryAgent',
  maxLoops: 4,
  temperature: 0.1,
  tools: [submitDocumentMemoryTool],
  terminalToolName: 'submit_document_memory',

  getSystemPrompt: (input) => `
你是一个【设定文档长期记忆抽取器】。你的职责是从项目文档中提取应该进入长期记忆系统的稳定知识。

## 文档类型
${inferDocumentKind(input.filePath)}
文件路径：${input.filePath}

## 只提取这些内容
1. 世界规则、系统规则、修炼规则、魔法规则
2. 项目级硬约束、写作规则、风格规则
3. 重要设定事实与不可违背信息

## ⚠️ 禁止提取角色相关内容
- **严禁**将角色描述、性格、背景、关系、口吻、底线、目标等角色信息存入长期记忆
- 角色档案（02_角色档案/）的内容应通过文件系统管理，不属于长期记忆系统
- 即使文档中包含角色相关内容，也**不要**创建任何角色规则的记忆

## 不要提取这些内容
1. 模板空白部分
2. 重复的章节摘要
3. 一次性创作草稿
4. 还不稳定的猜测、待定项、占位文本
5. 任何角色相关的设定、描述、性格、关系

## 操作规则
- 高度重复已有记忆时优先 update
- 只有系统必须常驻参考的信息才设置 isResident=true
- 只有绝对不能违背的规则才设置 importance=critical
- 最多返回 6 个 action

## 已有长期记忆
${input.existingMemories.length > 0
    ? input.existingMemories
        .map(
          (memory) =>
            `- (${memory.id}) ${memory.name} [${memory.type}] [${memory.importance}] resident=${memory.isResident} | ${memory.summary}`
        )
        .join('\n')
    : '(暂无已有长期记忆)'}

## 文档内容
\`\`\`
${input.content.slice(0, 12000)}
\`\`\`

输出要求：
- 如果没有值得沉淀的长期知识，shouldExtract=false
- memory.summary 简洁，memory.content 尽量完整但不要照抄整篇
- 只能调用 submit_document_memory，不要输出普通文本
`,

  getInitialMessage: () => '请从该文档中提取应该沉淀为长期记忆的稳定知识，并提交结构化结果。',

  parseTerminalResult: (args) => {
    const actions: MemoryCandidateAction[] = (args.actions || []).map((action: any) => ({
      action: action.action || 'skip',
      memoryId: action.memoryId,
      confidence: typeof action.confidence === 'number' ? action.confidence : 0,
      reason: action.reason || '',
      memory: action.memory
        ? ({
            name: action.memory.name || '',
            type: (action.memory.type || 'setting') as MemoryType,
            tags: action.memory.tags || [],
            keywords: action.memory.keywords || [],
            summary: action.memory.summary || '',
            content: action.memory.content || '',
            importance: action.memory.importance || 'normal',
            isResident: action.memory.isResident ?? false,
            relatedMemories: action.memory.relatedMemories || [],
          } satisfies LongTermMemoryDraft)
        : undefined,
    }));

    return {
      shouldExtract: Boolean(args.shouldExtract),
      summary: args.summary || '',
      actions,
    };
  },

  handleTextResponse: () => '请直接调用 submit_document_memory 提交结构化结果，不要输出普通文本。',
};

export async function runDocumentMemoryAgent(
  aiService: AIService,
  input: DocumentMemoryInput,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<DocumentMemoryOutput> {
  const agent = new BaseSubAgent(documentMemoryConfig);
  return agent.run(aiService, input, undefined, onLog, signal);
}
