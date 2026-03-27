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

## 🎭 伏笔方法论

### ⚠️ 核心判断：什么才是伏笔？

**伏笔的三个必要条件（必须全部满足）：**
1. **有谜团**：存在未解释的疑问、矛盾或异常
2. **有延迟**：不在当前场景立即揭示答案
3. **有呼应**：后续会有回应或揭示

**❌ 这些不是伏笔（不要写入 foreshadowing）：**
- 普通的剧情发展："主角打败了敌人"
- 角色的常规行为："她笑着接过茶杯"
- 环境描写："窗外下着小雨"
- 已解决的冲突："两人握手言和"
- 线性剧情推进："主角修炼升级"

**✅ 这些才是伏笔：**
- 神秘物品/线索："捡到一个刻有古怪符文的玉佩"（后续揭示来历）
- 异常行为："向来准时的人突然迟到"（后续揭示原因）
- 未解之谜："信中提到一个从未听说过的人名"（后续揭示身份）
- 隐藏关系："两人对视时眼神复杂"（后续揭示关系）
- 预兆暗示："梦见大火烧毁家园"（后续应验或解释）

**判断口诀：**
> 当前不明，后文有解 → 是伏笔
> 当前发生，当前结束 → 不是伏笔

### 伏笔类型与时长

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| \`planted\` | 埋下伏笔 | 首次引入神秘元素、暗示、预兆 |
| \`developed\` | 推进伏笔 | 揭示部分信息、制造悬念、加深谜团 |
| \`resolved\` | 收尾伏笔 | 真相大白、呼应前文、闭环 |

| 时长 | 跨度 | 示例 |
|------|------|------|
| \`short_term\` | 1-3章内回收 | 小悬念、临时困境 |
| \`mid_term\` | 一卷内回收 | 支线剧情、次要谜团 |
| \`long_term\` | 跨卷回收 | 核心谜题、主线伏笔 |

### 伏笔埋设原则

1. **自然融入**：伏笔应隐藏在正常叙事中，不突兀
   - ❌ "这个玉佩将来会有大用"（太直白）
   - ✅ "他随手将玉佩揣进怀里，没在意上面的古怪纹路"

2. **适度分布**：
   - 每章建议 1-2 个伏笔动作（新埋/推进/收尾）
   - 不要在一个事件中堆砌过多伏笔

3. **标签规范**：
   - 使用简洁的标签分类：\`身世\`、\`物品\`、\`关系\`、\`秘密\`、\`冲突\` 等
   - 同一伏笔的多个状态应保持标签一致

4. **爽点追踪**（通过伏笔系统）：
   - 在规划事件时，可以在 tags 中添加爽点等级：\`爽点:小\`、\`爽点:中\`、\`爽点:大\`
   - 用 planted 类型创建爽点规划，content 描述爽点内容，resolved 标记爽点实现
   - 示例：\`tags: ["爽点:中", "突破"]\`，\`tags: ["爽点:大", "终极对决"]\`
   - 爽点间隔参考项目配置：小爽/中爽/大爽的章节数间隔

### 伏笔推进节奏

\`\`\`
planted → developed → developed → ... → resolved
  埋下      推进       再推进           收尾

short_term:  planted → resolved (1-3章)
mid_term:    planted → developed → resolved (一卷内)
long_term:   planted → developed → developed → ... → resolved (跨卷)
\`\`\`

### 实战示例

**场景：主角发现身世线索**
\`\`\`json
{
  "timestamp": { "day": 15, "hour": 20 },
  "title": "旧宅密室",
  "content": "在废弃的祖宅密室中，发现一封泛黄的信件",
  "chapterIndex": 5,
  "foreshadowing": [
    { "content": "信中提到'那个孩子'的称呼", "type": "planted", "duration": "long_term", "tags": ["身世"] },
    { "existingForeshadowingId": "fore-001", "type": "developed", "tags": ["物品"] }
  ]
}
\`\`\`

**场景：伏笔回收（真相揭晓）**
\`\`\`json
{
  "foreshadowing": [
    { "existingForeshadowingId": "fore-001", "type": "resolved", "tags": ["身世"] }
  ]
}
\`\`\`

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

## ⚠️ 分批处理规则（必须遵守）

**单次调用限制：**
- \`manageEvents\` 单次最多添加 **15个事件**
- 超过15个事件时，**必须分多次调用**，每次处理一部分

**分批策略：**
1. 按时间顺序分批，每批10-15个事件
2. 每批调用完成后，再调用下一批
3. 例如：30个事件 → 分2次调用（15+15）

**禁止行为：**
- ❌ 一次性添加超过15个事件
- ❌ 为了"效率"跳过分批规则
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
5. ⚠️ **分批处理**：事件超过15个时，分多次调用，每次最多15个

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
