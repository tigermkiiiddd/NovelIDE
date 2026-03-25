/**
 * Outline SubAgent
 */

import { AIService } from '../geminiService';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import { executeOutlineTool } from '../agent/tools/timelineTools';
import { ToolDefinition } from '../agent/types';
import { SKILL_CONSTRAINT_LAYERED_DESIGN } from '../resources/agentSkill';

import {
  getEventsTool,
  getChaptersTool,
  getVolumesTool,
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
  manageVolumesTool,
  manageChaptersTool,
  manageEventsTool,
  submitOutlineTool
];

export interface TimelineInput {
  userInput: string;
  projectId: string;
  mode: 'add' | 'update';
}

export interface TimelineContext {
  existingVolumeCount: number;
  existingChapterCount: number;
  existingEventCount: number;
  volumeSummaries: Array<{ volumeIndex: number; title: string }>;
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

  getSystemPrompt: (_input, context) => `
# 任务：结构化大纲转换

你是一个**结构化转换器**，将剧情描述转换为结构化大纲数据。

⚠️ 你只做【解析和写入】，不具备创造能力。只转换原文提供的信息，不要脑补。

## 输入（主 Agent 提供）
userInput 包含完整的剧情内容，你只需要：
1. 解析文本
2. 调用工具写入
3. 提交报告

## 现有数据（不要重复创建）

${context ? `
- 现有卷：${context.existingVolumeCount} 个
- 现有章节：${context.existingChapterCount} 个
- 现有事件：${context.existingEventCount} 个
${context.volumeSummaries.length > 0 ? `
现有卷：${context.volumeSummaries.map(v => `volumeIndex=${v.volumeIndex}「${v.title}」`).join('、')}

⚠️ 如果卷已存在，使用现有 volumeIndex 创建章节，不要重复创建卷！
` : ''}
` : '（暂无数据）'}

## 操作流程

**第一步：创建卷**（仅当卷不存在时）
\`\`\`
outline_manageVolumes({ add: [{ title: "卷名", description: "描述" }] })
\`\`\`

**第二步：创建章节**（必须全部创建，不能只创建代表性章节）
\`\`\`
outline_manageChapters({
  add: [
    { title: "章节名", summary: "摘要", volumeIndex: 1 },
    ...
  ]
})
\`\`\`
- 每批最多 20 章，分批处理
- title 必须是具体名称，禁止用「第1章」这种占位符
- summary 必填

**第三步：创建事件**（如果有）
\`\`\`
outline_manageEvents({
  add: [
    { timestamp: { day: 1, hour: 8 }, title: "事件名", content: "内容" },
    ...
  ]
})
\`\`\`
- timestamp 格式：{ day: 第几天, hour: 小时 }
- chapterIndex 可选

**最后：提交报告**
\`\`\`
outline_submitOutline({ success: true, report: "创建统计：卷X个，章节X个，事件X个" })
\`\`\`

## 重要约束

1. ✅ 只看返回值 success 判断成功，不需要调用 read 工具验证
2. ✅ index 由系统自动分配，不需要记录
3. ❌ 禁止脑补原文没有的内容
4. ❌ 禁止只创建"代表性章节"，必须全部创建
`,

  getInitialMessage: (input: TimelineInput) => `
请解析以下内容并写入结构化大纲：

${input.userInput}

${input.mode === 'update' ? '模式：更新' : '模式：新增'}
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
