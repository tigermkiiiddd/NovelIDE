
import { ToolDefinition } from '../types';

export const thinkingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'thinking',
    description: `内部推理工具。收到用户消息后第一时间调用，用于分析意图和制定行动计划。调用后将结果静默记录，不生成UI消息。`,
    parameters: {
      type: 'object',
      properties: {
        surface: {
          type: 'string',
          description: '表面信息：从用户原话中提取的关键客观事实。≤50字。',
        },
        intent: {
          type: 'string',
          description: '意图推理：用户真正想要什么？和表面意思是否有差异？需要深挖用户没说出来的需求。≤150字。',
        },
        plan: {
          type: 'string',
          description: '下一步计划：用什么工具做什么。必须明确写出"不做什么"的边界（如：不创建文件、不修改角色名）。≤80字。',
        },
        reflection: {
          type: 'string',
          description: '总结反思（选填）：仅在以下情况填写——用户近几轮有纠正/情绪表达、正在重复之前的做法、不确定操作是否越权。正常流程留空即可。≤100字。',
        },
      },
      required: ['surface', 'intent', 'plan'],
    },
  },
};

export const finalAnswerTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'final_answer',
    description: `[终态工具] 任务完成或需要用户确认时调用。调用后本轮对话结束。
如果你已经完成了用户的请求，或者需要等用户回复才能继续，就必须调用此工具。
这是唯一能结束对话的方式——不要试图通过不调工具来结束。`,
    parameters: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description: '给用户的回复。总结你做了什么、结果是什么、或需要用户确认什么。',
        },
        status: {
          type: 'string',
          enum: ['completed', 'needs_input', 'partial'],
          description: 'completed=任务完成 | needs_input=需要用户回复 | partial=部分完成，遇到阻塞',
        },
      },
      required: ['answer', 'status'],
    },
  },
};
