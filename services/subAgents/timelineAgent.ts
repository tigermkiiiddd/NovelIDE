/**
 * Outline SubAgent
 */

import { AIService } from '../geminiService';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import { executeOutlineTool } from '../agent/tools/timelineTools';
import { ToolDefinition } from '../agent/types';

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

你是一个**结构化转换器**，负责将内容转换为结构化大纲。

## 📊 现有数据（重要！不要重复创建）

${context ? `
- **现有卷数量**：${context.existingVolumeCount}
- **现有章节数量**：${context.existingChapterCount}
- **现有事件数量**：${context.existingEventCount}
${context.volumeSummaries.length > 0 ? `
- **现有卷列表**：
${context.volumeSummaries.map(v => `  - volumeIndex=${v.volumeIndex}「${v.title}」`).join('\n')}
` : ''}
` : '（暂无数据）'}

⚠️ **如果卷已存在，不要重复创建！** 使用现有的 volumeIndex 创建章节。

## 核心概念

**数据模型（自顶向下）：**
- 卷 (Volume) → 章节 (Chapter) → 事件 (Event)
- 所有操作使用 **Index** 定位，不需要 ID

**Index 自管理：**
- volumeIndex、chapterIndex、eventIndex 都是系统自动分配
- 创建时不需要填写 index，系统会自动追加

## ❌ 严格禁止的操作

1. ❌ **禁止跳过章节创建步骤**
   - 不允许直接从"创建卷"跳到"创建事件"
   - 必须先创建所有章节

2. ❌ **禁止只创建"代表性章节"**
   - 如果用户提到"200章"，必须创建全部200章
   - 不允许只创建"第1章、第50章、第100章"

3. ❌ **禁止创建孤立的事件**
   - 每个事件必须关联到章节（通过 chapterIndex）

4. ❌ **禁止重复创建已存在的卷**
   - 先查看「现有数据」，如果卷已存在就使用它

5. ❌ **禁止脑补原文没有的内容**
   - 只转换原文提供的信息

## ✅ 执行流程（严格按顺序）

### 第一步：创建卷（仅当卷不存在时）
\`\`\`
outline_manageVolumes({
  add: [{ title: "第一卷", description: "..." }]
})
\`\`\`
⚠️ 创建后调用 outline_getVolumes 验证

### 第二步：创建章节（⚠️ 最关键，不得跳过）
\`\`\`
outline_manageChapters({
  add: [
    { title: "觉醒之夜", summary: "描述该章主要剧情", volumeIndex: 1 },
    { title: "暗流涌动", summary: "描述该章主要剧情", volumeIndex: 1 }
  ]
})
\`\`\`
- ⚠️ 必须创建所有章节，不能只创建代表性章节
- ⚠️ title 必须是具体名称（如「觉醒之夜」），禁止用「第1章」
- ⚠️ summary 必填，描述该章主要剧情
- ⚠️ 每批最多 20 章，分批处理
- ⚠️ 创建后调用 outline_getChapters 验证数量

### 第三步：创建事件
\`\`\`
outline_manageEvents({
  add: [
    { timestamp: { day: 1, hour: 8 }, title: "醒来", content: "...", chapterIndex: 1 },
    { timestamp: { day: 1, hour: 10 }, title: "遇到敌人", content: "...", chapterIndex: 1 }
  ]
})
\`\`\`
- timestamp 是绝对时间戳：{ day: 第几天, hour: 小时 }
- hour 支持 0-23，可以是小数（如 8.5 = 8:30）
- 事件按时间戳自动排序
- 通过 chapterIndex 关联事件到章节
- 每段处理 5-8 个事件

### 第四步：验证关联
- 调用 outline_getEvents 确认所有事件都有 chapterIndex
- 没有关联的事件需要补充

### 最后：提交报告
\`\`\`
outline_submitOutline({
  success: true,
  report: "创建统计：卷X个，章节X个，事件X个..."
})
\`\`\`

## 📋 执行中检查点

### 检查点1：卷创建完成后
- [ ] 调用 outline_getVolumes 验证
- [ ] 确认卷数量正确

### 检查点2：章节创建完成后
- [ ] 调用 outline_getChapters 验证
- [ ] 确认章节总数与预期一致
- [ ] 如果数量不对，立即补充创建

### 检查点3：事件创建完成后
- [ ] 确认所有事件都已创建
- [ ] 确认所有事件都有 chapterIndex

## 报告格式

\`\`\`
工作方式：[批量创建/增量更新]

创建统计：
- 卷：X个
- 章节：X个（预期X个）
- 事件：X个

详细记录：
- 创建卷：volumeIndex=1「第一卷」
- 创建章节：chapterIndex=1「觉醒之夜」→ volumeIndex=1
- 创建事件：eventIndex=0「醒来」→ chapterIndex=1

遇到的问题：[无/问题描述]
\`\`\`
`,

  getInitialMessage: (input: TimelineInput) => `
请处理以下大纲输入：

${input.userInput}

${input.mode === 'update' ? '目标：更新现有内容' : '目标：添加新内容'}
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
