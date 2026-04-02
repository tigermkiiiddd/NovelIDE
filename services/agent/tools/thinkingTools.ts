/**
 * @file thinkingTools.ts
 * @description 思维工具 - 用于结构化思考、意图推理、反思
 */

import { ToolDefinition } from '../types';

export const thinkingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'thinking',
    description: `[META TOOL] 结构化思考工具。**必须与操作工具并发调用，禁止单独使用。**

用途：
- intent: 用户输入后的意图推理，**必须输出结构化结果**：
  - intent: [casual|query|simple_edit|design|plan]
  - complexity: [low|medium|high]
  - requiresPlanning: [true|false]
  - keyDecisions: [需要用户确认的关键决策列表]
  - summary: [一句话总结理解的需求]
- reflect_creative: 文件操作后的创作反思，必须回答：
  1) 当前核心目标是什么？
  2) 内容是否有AI味？
  3) 是否符合项目文风规范？
  4) 是否与已有设定一致？
  5) 角色行为是否符合人设(角色OC检测)？
  6) 剧情是否符合大纲(大纲OC检测)？
  7) 是否达成核心目标？
- maxResponseWords: 控制后续回复字数，默认600字，设为0无限制

⚠️ 重要：thinking 只是思考过程记录，不是工作成果。必须同时调用其他工具（readFile, createFile 等）完成实际工作。
⚠️ 禁止：单独调用 thinking 后就结束一轮，这会导致效率低下。
⚠️ 字数限制：content 参数必须控制在 300 字以内，保持思考简洁高效。

正确示例：[thinking + listFiles + readFile] 并发调用
错误示例：只调用 thinking，下一轮再调用 listFiles

注意：反思是审视刚才写的内容质量，不是规划下一步行动。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '本次思考的背景和目的（请使用中文）'
        },
        mode: {
          type: 'string',
          enum: ['intent', 'reflect'],
          description: '思考模式: intent=意图推理（必须输出结构化结果，见上方说明）; reflect=自我反思'
        },
        content: {
          type: 'string',
          description: '结构化的思考内容，使用 markdown 格式。**必须控制在 300 字以内**，保持简洁高效。',
          maxLength: 300
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: '置信度分数(0-100)，由AI自己评估。>=80 表示思考充分可直接执行；60-79 需要再思考一轮；<60 必须向用户确认'
        },
        nextAction: {
          type: 'string',
          enum: ['proceed', 'think_again', 'ask_user'],
          description: '下一步行动，由AI自己决定: proceed=直接执行; think_again=需要再思考一轮; ask_user=需要向用户确认'
        },
        maxResponseWords: {
          type: 'number',
          description: '限制后续回复的最大字数。默认600字。用于控制输出长度，临时覆盖项目设定中的字数参数。设为0表示无限制。'
        }
      },
      required: ['thinking', 'mode', 'content', 'confidence', 'nextAction']
    }
  }
};

/**
 * 格式化 thinking 工具结果（用于前端显示）
 * 注意：不计算门阀，只是格式化 AI 给出的值
 */
export const formatThinkingResult = (
  mode: string,
  content: string,
  confidence: number,
  nextAction: string,
  thinking: string,
  maxResponseWords?: number
): string => {
  const modeLabels: Record<string, string> = {
    intent: '意图推理',
    reflect: '自我反思'
  };

  const actionLabels: Record<string, string> = {
    proceed: '✅ 继续执行',
    think_again: '🔄 需要再思考',
    ask_user: '❓ 需要用户确认'
  };

  const confidenceEmoji = confidence >= 80 ? '🟢' : confidence >= 60 ? '🟡' : '🔴';

  // 字数限制提示
  const wordLimitHint = maxResponseWords !== undefined && maxResponseWords > 0
    ? `\n**字数限制**: ${maxResponseWords}字以内`
    : '';

  return `🧠 **【${modeLabels[mode] || '思考'}】**

**背景**: ${thinking}

**置信度**: ${confidenceEmoji} ${confidence}%

**下一步**: ${actionLabels[nextAction] || nextAction}${wordLimitHint}

---

**思考内容**:
${content}`;
};
