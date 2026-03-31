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
  getForeshadowingDetailTool,
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
  getForeshadowingDetailTool,
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
    duration?: { value: number; unit: 'minute' | 'hour' | 'day' };
  }>;
  // 时间线最新位置
  lastEventTimestamp?: {
    day: number;
    hour: number;
    endHour?: number;  // 加上 duration 后的结束时间
  } | null;
  // 未完结伏笔上下文（用于继续/收尾已有伏笔）
  unresolvedForeshadowing?: Array<{
    id: string;
    content: string;
    type: 'planted' | 'developed';
    plantedChapter: number;
    plannedChapter?: number;
    tags: string[];
    source: 'timeline' | 'chapter_analysis';
    sourceRef: string;
    notes?: string;
    // 钩子扩展
    hookType?: 'crisis' | 'mystery' | 'emotion' | 'choice' | 'desire';
    strength?: 'strong' | 'medium' | 'weak';
    rewardScore?: number;
    children?: Array<{
      id: string;
      content: string;
      type: 'developed' | 'resolved';
      sourceRef: string;
      createdAt: number;
    }>;
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

## ⚠️⚠️⚠️ 时间戳规则（最高优先级！违反将导致时间线混乱！）

📍 **时间线当前位置：** 最后一个事件 [${context.recentEvents[context.recentEvents.length - 1].eventIndex}] 在 **第${context.recentEvents[context.recentEvents.length - 1].timestamp.day}天${context.recentEvents[context.recentEvents.length - 1].timestamp.hour}时**。

**规则：新事件的 timestamp 必须 >= 这个位置！**

❌ 错误示例：前面已到第3天，新事件却从第1天开始
✅ 正确示例：前面到第3天18时，新事件从第3天19时或第4天开始

**具体做法：**
1. 先看【时间线当前位置】的 day 和 hour
2. 新事件的 day 必须 >= 当前位置的天数
3. 如果是同一天，hour 必须大于当前位置的 hour
4. 建议新章节从次日（day+1）开始，给前一章留出时间缓冲
` : ''}

${context?.unresolvedForeshadowing && context.unresolvedForeshadowing.length > 0 ? `
## ⚠️ 待回收/推进的伏笔（重要参考）

以下是项目中尚未完结的伏笔。在创建事件时，可以：
1. **埋下新伏笔**：基于剧情发展和故事风格，在合适的事件中埋下新的伏笔
   - 使用 \`content\` + \`type: "planted"\` + \`plantedChapter\` + \`plannedChapter\` + \`hookType\` + \`strength\` + \`tags\` 字段
2. **继续已有伏笔**：将伏笔状态推进为 \`developed\`
   - 使用 \`existingForeshadowingId\` + \`type: "developed"\` + \`tags\` 字段
3. **收尾已有伏笔**：将伏笔状态标记为 \`resolved\`
   - 使用 \`existingForeshadowingId\` + \`type: "resolved"\` + \`tags\` 字段

**未完结伏笔列表：**
\`\`\`
${context.unresolvedForeshadowing.map(f => {
  const span = f.plannedChapter ? `第${f.plantedChapter}章埋→第${f.plannedChapter}章收(跨${f.plannedChapter - f.plantedChapter}章)` : `第${f.plantedChapter}章埋`;
  const childCount = f.children?.length ? ` | 已推进${f.children.length}次` : '';
  return `- [${f.id}] [${f.type}] ${f.content}
   ${span}${childCount}
   来源: ${f.source === 'timeline' ? '时间线' : '章节分析'} - ${f.sourceRef}
   ${f.hookType ? `钩子: ${f.hookType}${f.strength ? `(${f.strength})` : ''} | ` : ''}${f.rewardScore ? `奖励分: +${f.rewardScore} | ` : ''}标签: ${f.tags.join(', ')}
   ${f.notes ? `备注: ${f.notes}` : ''}`;
}).join('\n\n')}\n\n')}
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

### 钩子类型与章节跨度

| 钩子类型 | 建议跨度 | emoji |
|----------|----------|-------|
| crisis | 3章 | ⚡ |
| emotion | 5章 | 💗 |
| choice | 3章 | ⚖ |
| desire | 8章 | 🔥 |
| mystery | 10章 | ❓ |

| 强度 | 奖励分 | 适用场景 |
|------|--------|----------|
| strong | 30分 | 核心谜题、重要转折 |
| medium | 20分 | 支线伏笔、情感铺垫 |
| weak | 10分 | 小悬念、临时困境 |

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

5. **读者情绪标注**（emotions 字段）：
   - 使用 \`emotions\` 标注**读者阅读此事件时的内心体验**（不是角色情绪），支持多个情绪叠加
   - 情绪分4大类共21种（请严格使用以下值）：
     - **追读钩子**（驱动翻页）：好奇/悬念/期待/担忧/渴望/反转
     - **爽感兑现**（阅读奖励）：痛快/热血/甜蜜/得意/舒坦
     - **情绪施压**（制造压力）：紧张/虐心/憋屈/窒息/恐惧
     - **情感共鸣**（打动内心）：感动/震撼/恍然/心酸/共鸣
   - 分数范围：-5 到 +5，表示该情绪在读者心中的强度
   - 示例：\`{ type: "悬念", score: 4 }\` = 读者悬念感很强，必须翻下一页

### 伏笔推进节奏

\`\`\`
planted → developed → developed → ... → resolved
  埋下      推进       再推进           收尾
埋下时记录 plantedChapter，收尾时标记 resolvedChapter
跨度 = plannedChapter - plantedChapter
\`\`\`

## 工具调用

伏笔示例见 tool definition（不再在 prompt 中重复）：
- **埋新伏笔**：type="planted" + plantedChapter + plannedChapter
- **推进伏笔**：existingForeshadowingId + type="developed"
- **收尾伏笔**：existingForeshadowingId + type="resolved"

**创建事件（⚠️ 优先用 add！）：**
- **追加 add（默认）**：\`{ add: [{ timestamp: { day, hour }, title, content, chapterIndex, foreshadowing: [...] }] }\`
  - ✅ 续写剧情、推进时间线 → **用 add**
  - ✅ 为新章节创建事件 → **用 add**
  - ⚠️ **timestamp 必须接续时间线当前位置！** 不能从第1天重新开始！
    - 查看【时间线当前位置】，新事件 day 必须大于等于那个天数
    - 新章节建议从上一章结束的次日（day+1）开始
- **插入 insert（特殊）**：\`{ insert: { afterEventIndex: N, events: [...] } }\` — 后续事件时间戳自动顺移
  - ⚠️ 仅在以下场景使用 insert：
    - 插入回忆/闪回
    - 在已有事件之间补充遗漏的细节
    - 插入平行线/支线事件
  - ❌ 续写新剧情时 **不要用 insert**，用 add

**创建章节（仅当 instructions 要求时）：**
\`\`\`
outline_manageChapters({ add: [{ title, summary, volumeIndex }] })
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
