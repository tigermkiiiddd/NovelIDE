
import { ToolDefinition } from '../types';

export const askQuestionsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ask_questions',
    description: `[交互工具] 向用户批量提交澄清问题，以单选或多选形式收集答案。

**核心原则：能不问就不问，必须问的时候才问。**

调用前必须执行的思考流程（强制）：
1. **回顾已有信息**：仔细阅读用户历史消息，确认用户是否已经回答过这个问题或相关变体。如果用户已经给过答案，禁止重复提问。
2. **判断必要性**：这个问题缺失会直接导致后续工作无法推进吗？如果只是"想确认一下"或"多问一嘴更保险"，不要调用。
3. **避免过度拆分**：不要把一个简单问题拆成多个问题来问。尽量在一次调用中解决所有必要的澄清。
4. **提供选项而非开放提问**：每个问题必须给出你经过专业分析后的选项建议，不要只抛问题让用户从零思考。选项的 description 要解释为什么这个方向可行。

**禁止行为：**
- 禁止重复询问用户已经明确回答过的问题
- 禁止在用户给出丰富信息后仍机械性地"再确认一下"
- 禁止把用户的回答重新包装成问题再问一遍
- 禁止为了显得专业而制造不必要的澄清环节

**正确场景：**
- 用户意图存在真正的歧义，且不同选择会导致完全不同的执行方向
- 缺少某个关键参数，会导致后续工作产生严重偏差
- 用户的输入前后矛盾，需要明确优先级

调用后本轮对话会暂停，等待用户在弹出的问卷面板中逐个作答。`,
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: '问题列表（1-5个问题，用户逐个作答）。每个问题独立设置单选/多选。严格控制数量，能合并的合并。',
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: '问题描述，简洁明确。不要重复用户已经回答过的内容。'
              },
              type: {
                type: 'string',
                enum: ['single', 'multiple'],
                description: 'single=单选, multiple=多选'
              },
              options: {
                type: 'array',
                description: '选项列表（至少2个，建议2-6个）。每个选项必须是经过你专业分析后的具体建议，不是泛泛的列举。',
                items: {
                  type: 'object',
                  properties: {
                    label: {
                      type: 'string',
                      description: '选项简短标签（1-10字）'
                    },
                    description: {
                      type: 'string',
                      description: '该选项的详细说明：选这个会怎样、适用场景、优缺点。要体现你的专业分析，不是复制粘贴用户原话。≤150字'
                    },
                    isRecommended: {
                      type: 'boolean',
                      description: '是否为推荐选项。必须且只能给一个选项标记 true（唯一推荐）。推荐项的 label 中要打括号标注"（推荐）"，例如："架空现代社会（推荐）"。'
                    }
                  },
                  required: ['label', 'description']
                }
              }
            },
            required: ['text', 'type', 'options']
          }
        }
      },
      required: ['questions']
    }
  }
};
