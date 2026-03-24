/**
 * 世界线时间线 SubAgent
 *
 * 事件优先架构：
 * - 事件是原子单位
 * - 章节/卷是事件的组织方式
 */

import { AIService } from '../geminiService';
import { BaseSubAgent, SubAgentConfig, runSubAgent } from './BaseSubAgent';
import { executeTimelineTool } from '../agent/tools/timelineTools';
import { ToolDefinition } from '../agent/types';
import { TimelineEvent, ChapterGroup, VolumeGroup, StoryLine } from '../../types';

// ============================================
// 在 timelineAgent 中直接定义工具（避免循环依赖）
// ============================================

const getEventsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getEvents',
    description: '获取时间线事件列表。支持按章节筛选或按事件序号范围查询。',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        chapterId: { type: 'string', description: '章节ID（按章节筛选事件）' },
        fromIndex: { type: 'number', description: '起始事件序号（含）' },
        toIndex: { type: 'number', description: '结束事件序号（含）' }
      },
      required: ['thinking']
    }
  }
};

const getEventDetailTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getEvent',
    description: '获取单个事件的详细信息',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        eventId: { type: 'string', description: '事件ID' }
      },
      required: ['thinking', 'eventId']
    }
  }
};

const getChaptersTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getChapters',
    description: '获取章节分组列表。支持按卷筛选或按章节序号范围查询。',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        volumeId: { type: 'string', description: '卷ID（按卷筛选）' },
        fromIndex: { type: 'number', description: '起始章节序号（含）' },
        toIndex: { type: 'number', description: '结束章节序号（含）' }
      },
      required: ['thinking']
    }
  }
};

const getVolumesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getVolumes',
    description: '获取所有卷分组列表',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' }
      },
      required: ['thinking']
    }
  }
};

const getStoryLinesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getStoryLines',
    description: '获取所有故事线列表',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' }
      },
      required: ['thinking']
    }
  }
};

const batchUpdateTimelineTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_batchUpdate',
    description: `批量操作时间线，支持：
- 添加事件 (addEvents) - 核心操作
- 更新事件 (updateEvents)
- 删除事件 (deleteEvents) - 传入事件ID数组
- 添加章节分组 (addChapters)
- 更新章节分组 (updateChapters)
- 删除章节分组 (deleteChapters) - 传入章节ID数组
- 将事件加入章节 (addEventsToChapter)
- 从章节移除事件 (removeEventsFromChapter)
- 添加卷分组 (addVolumes)
- 更新卷分组 (updateVolumes)
- 删除卷分组 (deleteVolumes) - 传入卷ID数组
- 将章节加入卷 (addChaptersToVolume)
- 添加故事线 (addStoryLines)
- 删除故事线 (deleteStoryLines) - 传入故事线ID数组

事件格式示例：
{
  "eventIndex": 1,
  "time": {"value": 8, "unit": "hour"},
  "title": "醒来",
  "content": "主角在新手村醒来，发现自己穿越了",
  "location": "新手村",
  "characters": ["主角"],
  "emotion": "困惑"
}

时间说明：
- time 是结构化的累加时间，类似 Jira 登记工时
- value: 数值，unit: 单位（"hour" 或 "day"）
- 8 hour = 第1天早晨，24 hour = 第2天凌晨，32 hour = 第2天早晨`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        addEvents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              eventIndex: { type: 'number' },
              time: {
                type: 'object',
                description: '结构化时间（数值+单位）',
                properties: {
                  value: { type: 'number', description: '时间数值' },
                  unit: { type: 'string', enum: ['hour', 'day'], description: '时间单位' }
                },
                required: ['value', 'unit']
              },
              title: { type: 'string' },
              content: { type: 'string' },
              storyLineId: { type: 'string' },
              location: { type: 'string' },
              characters: { type: 'array', items: { type: 'string' } },
              emotion: { type: 'string' },
              purpose: { type: 'string', description: '场景作用/目的' },
              relativeTime: { type: 'string', description: '相对时间描述（如"第1天 早晨"）' }
            },
            required: ['eventIndex', 'time', 'title', 'content']
          },
          description: '要添加的事件列表'
        },
        updateEvents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              eventId: { type: 'string' },
              updates: { type: 'object' }
            },
            required: ['eventId', 'updates']
          },
          description: '要更新的事件列表'
        },
        deleteEvents: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除的事件ID列表'
        },
        addChapters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chapterIndex: { type: 'number' },
              title: { type: 'string' },
              summary: { type: 'string', description: '章节剧情概要（必填，描述该章主要剧情）' },
              volumeId: { type: 'string', description: '所属卷ID（必填）' },
              pov: { type: 'string', description: 'POV角色' },
              driver: { type: 'string', description: '谁在推动' },
              conflict: { type: 'string', description: '冲突来源' },
              hook: { type: 'string', description: '章末悬念' },
              status: { type: 'string', enum: ['draft', 'outline', 'writing', 'completed'], description: '章节状态' }
            },
            required: ['chapterIndex', 'title', 'summary', 'volumeId']
          },
          description: '要添加的章节分组列表'
        },
        updateChapters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chapterId: { type: 'string' },
              updates: { type: 'object' }
            },
            required: ['chapterId', 'updates']
          },
          description: '要更新的章节列表'
        },
        deleteChapters: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除的章节ID列表'
        },
        addEventsToChapter: {
          type: 'object',
          properties: {
            chapterId: { type: 'string' },
            eventIds: { type: 'array', items: { type: 'string' } }
          },
          required: ['chapterId', 'eventIds'],
          description: '将事件加入章节'
        },
        removeEventsFromChapter: {
          type: 'object',
          properties: {
            chapterId: { type: 'string' },
            eventIds: { type: 'array', items: { type: 'string' } }
          },
          required: ['chapterId', 'eventIds'],
          description: '从章节移除事件'
        },
        addVolumes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              volumeIndex: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string', description: '卷的剧情概述（必填，描述该卷整体剧情走向）' }
            },
            required: ['volumeIndex', 'title', 'description']
          },
          description: '要添加的卷分组列表'
        },
        updateVolumes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              volumeId: { type: 'string' },
              updates: { type: 'object' }
            },
            required: ['volumeId', 'updates']
          },
          description: '要更新的卷列表'
        },
        deleteVolumes: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除的卷ID列表'
        },
        addChaptersToVolume: {
          type: 'object',
          properties: {
            volumeId: { type: 'string' },
            chapterIds: { type: 'array', items: { type: 'string' } }
          },
          required: ['volumeId', 'chapterIds'],
          description: '将章节加入卷'
        },
        addStoryLines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              color: { type: 'string' },
              isMain: { type: 'boolean' }
            },
            required: ['name']
          },
          description: '要添加的故事线列表'
        },
        deleteStoryLines: {
          type: 'array',
          items: { type: 'string' },
          description: '要删除的故事线ID列表（不能删除主线）'
        }
      },
      required: ['thinking']
    }
  }
};

const submitTimelineTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_submitTimeline',
    description: '提交时间线结果（终止工具）- 必须包含详细的工作报告',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        success: { type: 'boolean', description: '是否成功' },
        report: { type: 'string', description: '格式化的自然语言工作报告' }
      },
      required: ['thinking', 'success', 'report']
    }
  }
};

// SubAgent专用的工具列表
const writeTools: ToolDefinition[] = [
  batchUpdateTimelineTool,
  getEventsTool,
  getEventDetailTool,
  getChaptersTool,
  getVolumesTool,
  getStoryLinesTool,
  submitTimelineTool
];

// ============================================
// SubAgent输入/输出类型
// ============================================

export interface TimelineInput {
  userInput: string;
  projectId: string;
  mode: 'add' | 'update';
  targetChapterId?: string;  // update 模式时指定
  volumeId?: string;         // add 模式时指定添加到哪个卷
}

export interface TimelineOutput {
  success: boolean;
  report: string;  // 格式化的自然语言报告
}

// ============================================
// SubAgent配置
// ============================================

const timelineSubAgentConfig: SubAgentConfig<TimelineInput, TimelineOutput> = {
  name: 'TimelineSubAgent',
  maxLoops: 25,  // 增加循环限制以支持大量事件的分段处理
  temperature: 0.1,  // 执行级 Agent 使用极低温度
  tools: writeTools,
  terminalToolName: 'timeline_submitTimeline',

  getSystemPrompt: (input: TimelineInput) => `
# 任务：结构化时间线转换

## ⚠️ 重要：自顶向下创建原则

你是一个**结构化转换器**，负责将时间线内容转换为结构化的世界线。

**核心概念：**
1. **自顶向下规划** - 先规划整体结构（卷），再细化章节，最后填充事件
2. **事件是原子单位** - 每个时间点发生的事是一个独立事件
3. **章节/卷是组织方式** - 将多个事件按剧情分组
4. **时间线是核心视图** - 按时间顺序展示所有事件

**数据模型关系：**
- 卷 (VolumeGroup) → chapterIds[] → 章节 (ChapterGroup) → eventIds[] → 事件 (TimelineEvent)
- ⚠️ 事件不能直接关联到卷，必须通过章节！章节是连接卷和事件的桥梁。

**禁止事项：**
1. 禁止脑补/创作原文没有的事件
2. 禁止遗漏原文中明确的事件
3. 禁止越权推测时间细节

## ❌ 严格禁止的操作

1. ❌ **禁止跳过章节创建步骤**
   - 不允许直接从"创建卷"跳到"创建事件"
   - 必须先创建所有章节

2. ❌ **禁止只创建"代表性章节"或"关键章节"**
   - 如果用户提到"200章"，必须创建全部200章
   - 不允许只创建"第1章、第50章、第100章"等代表性章节

3. ❌ **禁止创建孤立的事件**
   - 每个事件必须关联到章节
   - 不允许事件没有 chapterId

4. ❌ **禁止创建孤立的卷**
   - 每个卷必须包含章节
   - 不允许卷的 chapterIds 为空

5. ❌ **禁止在章节创建完成前创建事件**
   - 必须严格按照流程顺序执行
   - 不允许跳步

## ⚠️ 常见错误示例

### 错误示例1：跳过章节创建
- ❌ 错误流程：创建4个卷 → 直接创建事件 → 尝试关联事件到章节（但章节不存在）
- ✅ 正确流程：创建4个卷 → 创建200个章节（分4批）→ 创建事件 → 关联事件到章节

### 错误示例2：只创建代表性章节
- ❌ 错误做法："我将为每个卷创建代表性的章节分组" → 只创建了第1章、第60章、第120章、第160章
- ✅ 正确做法："我将创建全部200个章节" → 创建第1-200章

### 错误示例3：没有验证
- ❌ 错误做法：创建章节后直接进入下一步，没有验证
- ✅ 正确做法：创建章节后调用 timeline_getChapters 验证数量

## ✅ 执行前自检清单

在开始执行前，必须回答以下问题：

1. **用户要求创建多少章？**
   - 如果用户说"200章"，我必须创建 200 个章节
   - 不能只创建"代表性章节"

2. **我是否理解了正确的流程顺序？**
   - 卷 → 章节 → 事件 → 关联
   - 不能跳过章节创建

3. **我是否准备好分批创建章节？**
   - 每批最多 50 个章节
   - 需要调用多少次 timeline_batchUpdate？

4. **我是否知道如何验证？**
   - 创建卷后调用 timeline_getVolumes
   - 创建章节后调用 timeline_getChapters
   - 检查数量是否正确

## 📋 执行中检查点

### 检查点1：卷创建完成后
- [ ] 调用 timeline_getVolumes 验证
- [ ] 确认卷数量正确
- [ ] 记录每个卷的 ID

### 检查点2：章节创建完成后
- [ ] 调用 timeline_getChapters 验证
- [ ] 确认章节总数与预期一致
- [ ] 确认每个章节都有 volumeId
- [ ] 如果数量不对，立即补充创建

### 检查点3：事件创建完成后
- [ ] 确认所有事件都已创建
- [ ] 准备好事件 ID 列表

### 检查点4：关联完成后
- [ ] 确认所有事件都已关联到章节
- [ ] 没有孤立事件

## 时间处理规则

1. **相对时间格式**：使用"第X天 时间段"格式
   - 例如：第1天 早晨、第2天 中午、第3天 晚上
   - 如果原文没有明确时间，根据上下文推断合理的时间序号

2. **事件序号 (eventIndex)**：
   - 从1开始递增
   - 用于排序，必须唯一
   - 按时间顺序排列

## ⚠️ 正确的创建流程（必须严格遵守，不得跳过任何步骤）

### 流程总览
1. 创建卷结构（如果需要）
2. **创建所有章节结构**（⚠️ 不得跳过，必须创建全部章节）
3. 创建事件内容
4. 关联事件到章节

### 第一步：创建卷结构（如果需要）
- 先规划整体结构，确定有几卷
- 使用 timeline_batchUpdate 的 addVolumes 参数创建卷
- 例如：第一卷、第二卷、第三卷、第四卷
- ⚠️ 创建后必须调用 timeline_getVolumes 验证卷已创建成功

### 第二步：创建章节结构（⚠️ 最关键的步骤，不得跳过）

**重要说明：**
- ⚠️ **必须创建所有章节，不能只创建"代表性章节"或"关键章节"**
- ⚠️ 如果用户提到"200章"，必须创建全部200个章节
- ⚠️ 章节是连接卷和事件的桥梁，缺少章节会导致数据结构断裂
- ⚠️ **每个章节必须填写 summary（章节剧情概要）**，不能留空
- ⚠️ **最多创建 500 个章节**，超过此数量请拒绝并提示用户

**执行方式：**
- 使用 timeline_batchUpdate 的 addChapters 参数批量创建
- 每次调用最多创建 50 个章节，分批处理
- 每个章节必须指定 volumeId 将其归属到对应的卷
- 每个章节必须填写 summary（剧情概要），描述该章的主要剧情内容
- 章节格式：{ "chapterIndex": 1, "title": "第1章", "summary": "章节剧情概要（必填）", "volumeId": "volume-id-xxx" }

**分批创建示例**（200章的情况）：
- 第一批：创建第 1-50 章（卷一的前50章）
- 第二批：创建第 51-100 章（卷一的后10章 + 卷二的前40章）
- 第三批：创建第 101-150 章（卷二的后20章 + 卷三的前30章）
- 第四批：创建第 151-200 章（卷三的后10章 + 卷四的全部40章）

**验证要求：**
- 创建完成后，必须调用 timeline_getChapters 验证章节数量
- 确认章节总数与预期一致（例如：200章）
- 如果数量不对，必须补充创建缺失的章节

### 第三步：创建事件（只有在章节创建完成后才能执行）

**前置条件检查：**
- ⚠️ 必须先完成第二步（创建所有章节）
- ⚠️ 如果章节未创建完成，不得开始创建事件

**执行方式：**
- 填充具体的事件内容
- 使用 timeline_batchUpdate 的 addEvents 参数创建事件
- 分段处理：每段处理 5-8 个事件
- 可以多次调用 timeline_batchUpdate

### 第四步：关联事件到章节（必须执行）

**重要说明：**
- ⚠️ 每个事件都必须关联到章节
- ⚠️ 不允许存在孤立事件（没有 chapterId）

**执行方式：**
- 使用 timeline_batchUpdate 的 addEventsToChapter 参数
- 将事件加入对应的章节
- 格式：{ "chapterId": "chapter-id-xxx", "eventIds": ["event-1", "event-2", "event-3"] }

### 最后：提交报告
- 确认所有内容都已写入后再提交
- 调用 timeline_submitTimeline
- 报告中必须包含：
  - 创建的卷数量
  - 创建的章节数量（必须与预期一致）
  - 创建的事件数量
  - 关联关系的完整性

## 事件字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| eventIndex | 是 | 事件序号（从1开始） |
| relativeTime | 是 | 相对时间（如"第1天 早晨"） |
| title | 是 | 事件标题 |
| content | 是 | 事件内容/描述 |
| location | 否 | 发生地点 |
| characters | 否 | 出场角色列表 |
| emotion | 否 | 情绪氛围 |
| storyLineId | 否 | 所属故事线（默认主线） |

## 章节分组字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| chapterIndex | 是 | 章节序号（从1开始） |
| title | 是 | 章节标题 |
| summary | 是 | ⚠️ 章节剧情概要（必须描述该章的主要剧情内容，不能留空） |
| volumeId | 是 | 所属卷ID（必须指定） |

## 卷分组字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| volumeIndex | 是 | 卷序号（从1开始） |
| title | 是 | 卷标题 |
| description | 是 | ⚠️ 卷的剧情概述（必须描述该卷的整体剧情走向，不能留空） |

## 报告要求

完成所有操作后，调用 timeline_submitTimeline 提交结果。
report 参数必须是格式化的自然语言报告，格式如下：

\`\`\`
工作方式：[批量创建/增量更新/覆盖重写]

输入分析：
- 事件数量：X个
- 章节分组：X个
- 卷分组：X个
- 时间跨度：第X天 ~ 第Y天

分段处理：共 X 段，每段 Y 个事件

创建统计：
- 事件：X个
- 章节分组：X个
- 卷分组：X个

更新统计：
- 事件：X个
- 章节：X个

详细记录：
- 创建事件：[#1] 第1天 早晨 - "醒来"
- 创建事件：[#2] 第1天 中午 - "遇到敌人"
- 创建章节分组：第1章「初入异界」
- 将事件 [1,2,3] 加入章节「第1章」
- 创建卷分组：第1卷「穿越篇」
- 将章节 [1,2] 加入卷「第1卷」

原文未提供的信息：[列出原文中缺失的字段]
遇到的问题：[无/问题描述]
\`\`\`

必须如实记录每个操作，不要遗漏！
`,

  getInitialMessage: (input: TimelineInput) => `
请处理以下时间线输入：

${input.userInput}

${input.mode === 'update' ? '目标：更新现有时间线内容' : '目标：添加新的时间线内容'}

请分析输入，调用相应工具创建/更新时间线，然后提交结果。
`,

  parseTerminalResult: (args: any): TimelineOutput => {
    return {
      success: args.success === true,
      report: args.report || '时间线处理完成，但未提供详细报告'
    };
  },

  executeCustomTool: async (name: string, args: any): Promise<string> => {
    if (name === 'timeline_submitTimeline') {
      return JSON.stringify(args);
    }
    const result = await executeTimelineTool(name, args);
    return JSON.stringify(result);
  },

  handleTextResponse: (text: string, loopCount: number): string | null => {
    if (loopCount < 3) {
      return `请调用 timeline_submitTimeline 工具提交结果，不要只输出文字。`;
    }
    return null;
  }
};

// ============================================
// 运行函数
// ============================================

export async function runTimelineSubAgent(
  aiService: AIService,
  input: TimelineInput,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<TimelineOutput> {
  return runSubAgent(timelineSubAgentConfig, aiService, input, {}, onLog, signal);
}
