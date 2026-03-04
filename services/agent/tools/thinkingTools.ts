/**
 * @file thinkingTools.ts
 * @description 思维工具 - 用于结构化思考、意图推理、反思
 */

import { ToolDefinition } from '../types';

export const thinkingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'thinking',
    description: `[META TOOL] 结构化思考工具。
- intent: 用户输入后的意图推理
- reflect_creative: 文件操作后的创作反思，必须回答：
  1) 当前核心目标是什么？
  2) 内容是否有AI味？
  3) 是否符合项目文风规范？
  4) 是否与已有设定一致？
  5) 角色行为是否符合人设(角色OC检测)？
  6) 剧情是否符合大纲(大纲OC检测)？
  7) 是否达成核心目标？
- maxResponseWords: 控制后续回复字数，默认600字，设为0无限制

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
          enum: ['intent', 'analyze', 'reflect', 'plan', 'reflect_creative'],
          description: '思考模式: intent=意图推理; analyze=方案分析; reflect=自我反思; plan=行动规划; reflect_creative=创作反思，必须包含7项检测：核心目标、AI味(0-10)、文风符合度、设定一致性、角色OC、大纲OC、目标达成度。是审视内容质量，不是规划下一步。'
        },
        content: {
          type: 'string',
          description: '结构化的思考内容，使用 markdown 格式'
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
    analyze: '方案分析',
    reflect: '自我反思',
    plan: '行动规划',
    reflect_creative: '📝 创作反思（编辑视角）'
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

  // 创作反思模式使用特殊格式
  if (mode === 'reflect_creative') {
    return `🔍 **【创作反思】**

**核心目标**: ${thinking}

**质量评分**: ${confidenceEmoji} ${confidence}%

**判定**: ${actionLabels[nextAction] || nextAction}${wordLimitHint}

---

**反思内容**:
${content}

---
> ⚠️ 反思检查项：AI味程度、文风符合度、设定一致性、角色OC检测、大纲OC检测、目标达成度`;
  }

  return `🧠 **【${modeLabels[mode] || '思考'}】**

**背景**: ${thinking}

**置信度**: ${confidenceEmoji} ${confidence}%

**下一步**: ${actionLabels[nextAction] || nextAction}${wordLimitHint}

---

**思考内容**:
${content}`;
};
