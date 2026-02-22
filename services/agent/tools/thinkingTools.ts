/**
 * @file thinkingTools.ts
 * @description 思维工具 - 用于结构化思考、意图推理、反思
 */

import { ToolDefinition } from '../types';

export const thinkingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'thinking',
    description: `[META TOOL] 结构化思考工具。用于意图推理、方案分析、自我反思。在执行关键操作前使用此工具整理思路。【重要】createFile/updateFile/patchFile 完成后必须调用 mode='reflect_creative' 进行创作反思。`,
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
          description: '思考模式: intent=意图推理; analyze=方案分析; reflect=自我反思; plan=行动规划; reflect_creative=创作反思(文件操作后强制调用)'
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
  thinking: string
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

  // 创作反思模式使用特殊格式
  if (mode === 'reflect_creative') {
    return `🔍 **【创作反思】**

**反思对象**: ${thinking}

**质量评分**: ${confidenceEmoji} ${confidence}%

**下一步**: ${actionLabels[nextAction] || nextAction}

---

**反思内容**:
${content}`;
  }

  return `🧠 **【${modeLabels[mode] || '思考'}】**

**背景**: ${thinking}

**置信度**: ${confidenceEmoji} ${confidence}%

**下一步**: ${actionLabels[nextAction] || nextAction}

---

**思考内容**:
${content}`;
};
