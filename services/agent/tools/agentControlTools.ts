
import { ToolDefinition } from '../types';

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
