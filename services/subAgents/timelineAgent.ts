/**
 * Outline SubAgent
 */

import { AIService } from '../geminiService';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import { executeOutlineTool } from '../agent/tools/timelineTools';
import { ToolDefinition } from '../agent/types';
import { SKILL_CONSTRAINT_LAYERED_DESIGN } from '../resources/agentSkill';
import { ProjectMeta } from '../../types';
import { buildProjectOverviewPrompt } from '../../utils/projectContext';

import {
  getEventsTool,
  getChaptersTool,
  getVolumesTool,
  getUnresolvedForeshadowingTool,
  manageVolumesTool,
  manageChaptersTool,
  manageEventsTool
} from '../agent/toolDefinitions/timeline';

const submitOutlineTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_submitOutline',
    description: '提交大纲结果（终止工具）',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string' },
        success: { type: 'boolean' },
        report: { type: 'string' }
      },
      required: ['thinking', 'success', 'report']
    }
  }
};

const subAgentTools: ToolDefinition[] = [
  getVolumesTool,
  getChaptersTool,
  getEventsTool,
  getUnresolvedForeshadowingTool,
  manageVolumesTool,
  manageChaptersTool,
  manageEventsTool,
  submitOutlineTool
];

export interface TimelineInput {
  userInput: string;
  projectId: string;
  mode: 'add' | 'update';
  instructions?: string;  // 主 agent 传递的任务指令
}

export interface TimelineContext {
  existingVolumeCount: number;
  existingChapterCount: number;
  existingEventCount: number;
  volumeSummaries: Array<{ volumeIndex: number; title: string }>;
  chapterSummaries: Array<{ chapterIndex: number; title: string; volumeIndex: number; eventCount: number }>;
  recentEvents: Array<{
    eventIndex: number;
    timestamp: { day: number; hour: number };
    title: string;
    content: string;
  }>;
  // 未完结伏笔上下文（用于继续/收尾已有伏笔）
  unresolvedForeshadowing?: Array<{
    id: string;
    content: string;
    type: 'planted' | 'developed';
    duration: 'short_term' | 'mid_term' | 'long_term';
    tags: string[];
    source: 'timeline' | 'chapter_analysis';
    sourceRef: string;
    notes?: string;
  }>;
  project?: ProjectMeta;
}

export interface TimelineOutput {
  success: boolean;
  report: string;
}

const outlineSubAgentConfig: SubAgentConfig<TimelineInput, TimelineOutput, TimelineContext> = {
  name: 'OutlineSubAgent',
  maxLoops: 25,
  maxHistoryPairs: 15,
  tools: subAgentTools,
  terminalToolName: 'outline_submitOutline',
  temperature: 0.1,

  getSystemPrompt: (_input, context) => {
    const projectOverview = buildProjectOverviewPrompt(context?.project);
    return `${projectOverview}

# 任务：结构化大纲转换

你是大纲结构化转换器，将剧情描述转换为结构化数据。

## ⚠️ 核心原则：听从主 Agent 指令

**主 Agent 的 instructions 是最高优先级！**
- 如果 instructions 说"禁止创建章节" → 直接调用 manageEvents
- 如果 instructions 说"从零创建" → 走完整流程
- 不要自己猜测，按指令执行

## 现有数据（供参考）

${context ? `
- 现有卷：${context.existingVolumeCount} 个
- 现有章节：${context.existingChapterCount} 个
- 现有事件：${context.existingEventCount} 个

${context.chapterSummaries && context.chapterSummaries.length > 0 ? `
**现有章节：**
${context.chapterSummaries.map(c => `- chapterIndex=${c.chapterIndex}「${c.title}」（${c.eventCount}个事件）`).join('\n')}
` : ''}

${context.recentEvents && context.recentEvents.length > 0 ? `
**最近事件（剧情时间线参考）：**
${context.recentEvents.map(e => `- [${e.eventIndex}] 第${e.timestamp.day}天${e.timestamp.hour}时「${e.title}」：${e.content.substring(0, 80)}${e.content.length > 80 ? '...' : ''}`).join('\n')}
` : ''}

${context?.unresolvedForeshadowing && context.unresolvedForeshadowing.length > 0 ? `
## ⚠️ 待回收/推进的伏笔（重要参考）

以下是项目中尚未完结的伏笔。在创建事件时，可以：
1. **埋下新伏笔**：基于剧情发展和故事风格，在合适的事件中埋下新的伏笔
   - 使用 \`content\` + \`type: "planted"\` + \`duration\` + \`tags\` 字段
2. **继续已有伏笔**：将伏笔状态推进为 \`developed\`
   - 使用 \`existingForeshadowingId\` + \`type: "developed"\` + \`tags\` 字段
3. **收尾已有伏笔**：将伏笔状态标记为 \`resolved\`
   - 使用 \`existingForeshadowingId\` + \`type: "resolved"\` + \`tags\` 字段

**未完结伏笔列表：**
\`\`\`
${context.unresolvedForeshadowing.map(f =>
  `- [${f.id}] [${f.type}] [${f.duration}] ${f.content}
   来源: ${f.source === 'timeline' ? '时间线' : '章节分析'} - ${f.sourceRef}
   标签: ${f.tags.join(', ')}${f.notes ? `\n   备注: ${f.notes}` : ''}`
).join('\n\n')}
\`\`\`
` : ''}
` : '（暂无数据）'}

## 工具调用

**创建事件（含伏笔）：**
\`\`\`
outline_manageEvents({
  add: [
    {
      timestamp: { day: 1, hour: 14 },
      title: "事件",
      content: "内容",
      chapterIndex: 1,
      foreshadowing: [
        // 场景A：继续已有伏笔（推进）
        { existingForeshadowingId: "fore-xxx", type: "developed", tags: ["身世"] },
        // 场景B：收尾已有伏笔
        { existingForeshadowingId: "fore-yyy", type: "resolved", tags: ["物品"] },
        // 场景C：埋下新伏笔
        { content: "捡到神秘玉佩", type: "planted", duration: "long_term", tags: ["物品"] }
      ]
    }
  ]
})
\`\`\`

**创建章节（仅当 instructions 要求时）：**
\`\`\`
outline_manageChapters({ add: [{ title: "章节名", summary: "摘要", volumeIndex: 1 }] })
\`\`\`

**提交：**
\`\`\`
outline_submitOutline({ success: true, report: "..." })
\`\`\`

## 约束

1. ✅ 优先遵守 instructions 中的指令
2. ✅ 只看返回值 success 判断成功
3. ❌ 禁止脑补原文没有的内容
4. ❌ 如果 instructions 禁止调用某个工具，绝对不要调用
`;
  },

  getInitialMessage: (input: TimelineInput) => `
${input.instructions ? `
⚠️⚠️⚠️ 主 Agent 指令（必须优先遵守）：

${input.instructions}

---
` : '⚠️ 警告：主 Agent 未提供 instructions，请根据现有数据判断任务类型。\n\n---'}

## 待处理内容

${input.userInput}

---

**处理原则：**
1. 先看上面的【主 Agent 指令】，明确任务类型和禁止事项
2. 再看【现有数据】，确认哪些已存在
3. 根据指令决定：直接创建事件？还是走完整流程？
4. 如果指令明确说"禁止创建章节"，直接调用 manageEvents，不要调用 manageChapters

模式：${input.mode === 'update' ? '更新' : '新增'}
`,

  parseTerminalResult: (args: any): TimelineOutput => ({
    success: args.success === true,
    report: args.report || '大纲处理完成，但未提供详细报告'
  }),

  executeCustomTool: async (name: string, args: any) => {
    if (name === 'outline_submitOutline') return JSON.stringify(args);
    return executeOutlineTool(name, args);
  },

  handleTextResponse: (_: string, loopCount: number): string | null => {
    if (loopCount < 3) return '请调用 outline_submitOutline 工具提交结果。';
    return null;
  }
};

export async function runTimelineSubAgent(
  aiService: AIService,
  input: TimelineInput,
  context?: TimelineContext,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<TimelineOutput> {
  const agent = new BaseSubAgent(outlineSubAgentConfig);
  return agent.run(aiService, input, context, onLog, signal);
}
