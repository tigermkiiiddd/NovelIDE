/**
 * Outline 工具定义
 */

import { ToolDefinition } from '../types';

// ============================================
// 读取工具
// ============================================

export const getEventsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_getEvents',
    description: `获取事件列表。
- chapterIndex: 按章节筛选
- fromIndex/toIndex: 按范围筛选
- fullContent: 返回完整内容（默认截断100字）`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        chapterIndex: { type: 'number' },
        fromIndex: { type: 'number' },
        toIndex: { type: 'number' },
        fullContent: { type: 'boolean' }
      },
      required: ['thinking']
    }
  }
};

export const getChaptersTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_getChapters',
    description: `获取章节分组列表（不含事件详情）。每次最多返回 40 条。

⚠️ 此工具只返回章节的标题、摘要、事件数量，不包含事件内容。
如需了解章节内的**细纲/事件详情**，请使用 outline_getEvents(chapterIndex)。

参数：
- volumeIndex: 按卷筛选
- fromIndex/toIndex: 按范围筛选（强烈建议使用）`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        volumeIndex: { type: 'number' },
        fromIndex: { type: 'number', description: '起始章节索引（包含）' },
        toIndex: { type: 'number', description: '结束章节索引（包含）' }
      },
      required: ['thinking']
    }
  }
};

export const getVolumesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_getVolumes',
    description: '获取所有卷列表。',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' }
      },
      required: ['thinking']
    }
  }
};

export const getStoryLinesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_getStoryLines',
    description: '获取所有故事线列表。',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' }
      },
      required: ['thinking']
    }
  }
};

// ============================================
// 写入工具（按类型分组）
// ============================================

export const manageVolumesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_manageVolumes',
    description: `管理卷。支持三种操作：
- add: 添加卷（index 自动分配）
- update: 更新卷（用 volumeIndex 定位）
- delete: 删除卷（用 volumeIndex 定位）

示例：
{ "add": [{ "title": "第一卷", "description": "..." }] }
{ "update": { "volumeIndex": 1, "title": "新标题" } }
{ "delete": [1, 2] }`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        add: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['title', 'description']
          }
        },
        update: {
          type: 'object',
          properties: {
            volumeIndex: { type: 'number' },
            title: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['volumeIndex']
        },
        delete: {
          type: 'array',
          items: { type: 'number' },
          description: '要删除的 volumeIndex 列表'
        }
      },
      required: ['thinking']
    }
  }
};

export const manageChaptersTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_manageChapters',
    description: `管理章节。支持三种操作：
- add: 添加章节（index 自动分配，需要 volumeIndex）
- update: 更新章节（用 chapterIndex 定位，可改 volumeIndex 移动）
- delete: 删除章节（用 chapterIndex 定位）

示例：
{ "add": [{ "title": "觉醒之夜", "summary": "...", "volumeIndex": 1 }] }
{ "update": { "chapterIndex": 1, "title": "新标题" } }
{ "delete": [1, 2, 3] }`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        add: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              volumeIndex: { type: 'number' },
              pov: { type: 'string' },
              driver: { type: 'string' },
              conflict: { type: 'string' },
              hook: { type: 'string' }
            },
            required: ['title', 'summary', 'volumeIndex']
          }
        },
        update: {
          type: 'object',
          properties: {
            chapterIndex: { type: 'number' },
            title: { type: 'string' },
            summary: { type: 'string' },
            volumeIndex: { type: 'number' },
            pov: { type: 'string' },
            driver: { type: 'string' },
            conflict: { type: 'string' },
            hook: { type: 'string' }
          },
          required: ['chapterIndex']
        },
        delete: {
          type: 'array',
          items: { type: 'number' },
          description: '要删除的 chapterIndex 列表'
        }
      },
      required: ['thinking']
    }
  }
};

export const manageEventsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_manageEvents',
    description: `管理事件。支持四种操作：
- add: 添加事件（按时间戳排序）
- insert: 在指定位置插入事件，后续事件时间戳自动偏移
- update: 更新事件
- delete: 删除事件

时间戳格式：{ "day": 1, "hour": 8 } 表示第1天8点

**insert 操作说明：**
- 在 afterEventIndex 之后插入新事件
- 插入后，后续所有事件的时间戳会自动向后偏移
- 偏移量 = 新事件的总持续时间
- duration 格式：{ "value": 2, "unit": "hour" } 表示2小时

示例：
{ "insert": { "afterEventIndex": 5, "events": [{ "title": "新事件", "content": "...", "duration": { "value": 2, "unit": "hour" } }] } }`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        add: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: {
                type: 'object',
                description: '事件发生的时间戳',
                properties: {
                  day: { type: 'number', description: '第几天（从1开始）' },
                  hour: { type: 'number', description: '小时（0-23，支持小数如8.5）' }
                },
                required: ['day', 'hour']
              },
              title: { type: 'string' },
              content: { type: 'string' },
              chapterIndex: { type: 'number', description: '关联到章节' },
              duration: {
                type: 'object',
                description: '事件持续时间',
                properties: {
                  value: { type: 'number' },
                  unit: { type: 'string', enum: ['minute', 'hour', 'day'] }
                }
              },
              location: { type: 'string' },
              characters: { type: 'array', items: { type: 'string' } },
              emotion: { type: 'string' },
              purpose: { type: 'string' },
              foreshadowing: {
                type: 'array',
                description: '要创建的伏笔列表（自动创建并关联到此事件）',
                items: {
                  type: 'object',
                  properties: {
                    content: {
                      type: 'string',
                      description: '伏笔内容的详细描述（至少30字）'
                    },
                    type: {
                      type: 'string',
                      enum: ['planted', 'developed', 'resolved'],
                      description: 'planted=新埋下, developed=推进中, resolved=已回收'
                    },
                    tags: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '伏笔标签（如 ["身世"]、["物品/宝物"]）'
                    },
                    notes: {
                      type: 'string',
                      description: '补充说明（可选，如预计回收时间）'
                    }
                  },
                  required: ['content', 'type', 'tags']
                }
              }
            },
            required: ['timestamp', 'title', 'content']
          }
        },
        insert: {
          type: 'object',
          description: '在指定位置插入事件，后续事件时间自动偏移',
          properties: {
            afterEventIndex: {
              type: 'number',
              description: '在哪个事件之后插入（-1表示在最前面插入）'
            },
            events: {
              type: 'array',
              description: '要插入的事件列表',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  duration: {
                    type: 'object',
                    description: '事件持续时间（必填）',
                    properties: {
                      value: { type: 'number' },
                      unit: { type: 'string', enum: ['minute', 'hour', 'day'] }
                    },
                    required: ['value', 'unit']
                  },
                  chapterIndex: { type: 'number' },
                  location: { type: 'string' },
                  characters: { type: 'array', items: { type: 'string' } },
                  emotion: { type: 'string' },
                  purpose: { type: 'string' },
                  foreshadowing: {
                    type: 'array',
                    description: '要创建的伏笔列表（自动创建并关联到此事件）',
                    items: {
                      type: 'object',
                      properties: {
                        content: {
                          type: 'string',
                          description: '伏笔内容的详细描述（至少30字）'
                        },
                        type: {
                          type: 'string',
                          enum: ['planted', 'developed', 'resolved'],
                          description: 'planted=新埋下, developed=推进中, resolved=已回收'
                        },
                        tags: {
                          type: 'array',
                          items: { type: 'string' },
                          description: '伏笔标签（如 ["身世"]、["物品/宝物"]）'
                        },
                        notes: {
                          type: 'string',
                          description: '补充说明（可选，如预计回收时间）'
                        }
                      },
                      required: ['content', 'type', 'tags']
                    }
                  }
                },
                required: ['title', 'content', 'duration']
              }
            }
          },
          required: ['afterEventIndex', 'events']
        },
        update: {
          type: 'object',
          properties: {
            eventIndex: { type: 'number' },
            timestamp: {
              type: 'object',
              properties: {
                day: { type: 'number' },
                hour: { type: 'number' }
              }
            },
            title: { type: 'string' },
            content: { type: 'string' },
            chapterIndex: { type: 'number', description: '改章节关联' },
            location: { type: 'string' },
            characters: { type: 'array', items: { type: 'string' } },
            emotion: { type: 'string' },
            purpose: { type: 'string' }
          },
          required: ['eventIndex']
        },
        delete: {
          type: 'array',
          items: { type: 'number' },
          description: '要删除的 eventIndex 列表'
        }
      },
      required: ['thinking']
    }
  }
};

export const manageStoryLinesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'outline_manageStoryLines',
    description: `管理故事线。
- add: 添加故事线
- delete: 删除故事线（不能删除主线）`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        add: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            color: { type: 'string' },
            isMain: { type: 'boolean' }
          },
          required: ['name']
        },
        delete: {
          type: 'number',
          description: '要删除的 storyLineIndex'
        }
      },
      required: ['thinking']
    }
  }
};

// ============================================
// SubAgent 工具
// ============================================

export const processOutlineInputTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'processOutlineInput',
    description: `【SubAgent 入口】将剧情内容写入结构化大纲。

## ⚠️ 使用前必须先查询

调用此工具前，必须先用读取工具查看现有结构：
- outline_getVolumes() - 查看现有卷
- outline_getChapters() - 查看现有章节
- outline_getEvents(chapterIndex) - 查看章节内的事件

## 两种使用场景（根据查询结果选择）

### 场景A：章节已存在 → 只创建事件

如果 outline_getChapters 返回了目标章节，则章节已存在！

**userInput 格式（⚠️ 严格遵循）：**
\`\`\`
【目标章节】chapterIndex=X

【事件列表】
- 第1天 10:00「事件标题」：事件内容...
- 第1天 10:30「事件标题」：事件内容...
...
\`\`\`

**⚠️ 禁止在 userInput 中包含卷或章节的创建信息！**
**⚠️ 必须使用查询返回的真实 chapterIndex！**

### 场景B：章节不存在 → 创建完整大纲

如果目标章节不存在，才需要创建。

**userInput 格式：**
\`\`\`
【卷】第一卷「觉醒」
描述：主角觉醒能力

【章节】（属于第一卷）
- 第1章「觉醒之夜」：摘要...
- 第2章「初次战斗」：摘要...
...

【事件】（可选）
- 第1天 8:00「醒来」：内容... → 第1章
\`\`\`

## 调用示例

**正确（章节已存在，只创建事件）：**
\`\`\`
// 1. 先查询
outline_getChapters()  // 发现 chapterIndex=1 已存在，标题「商业街的失禁觉醒」

// 2. 调用 SubAgent（⚠️ 必须填写 instructions）
processOutlineInput({
  thinking: "第一章已存在，只需创建事件",
  userInput: "【目标章节】chapterIndex=1\\n\\n【事件列表】\\n- 第1天 14:00「事件」：内容...",
  mode: "add",
  instructions: "任务：为 chapterIndex=1「商业街的失禁觉醒」创建事件。章节已存在，禁止创建章节！只需创建事件。正文8600字，分解为10-15个事件，时间从第1天14:00开始。"
})
\`\`\`

**错误（章节已存在但重复创建）：**
\`\`\`
// ❌ 错误！章节已存在，不要再包含章节信息，也不要省略 instructions
processOutlineInput({
  userInput: "【章节】第1章「xxx」：摘要...",  // ❌ 禁止！
  mode: "add"
  // ❌ 缺少 instructions！
})
\`\`\`
`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        userInput: { type: 'string', description: '完整的剧情内容' },
        mode: { type: 'string', enum: ['add', 'update'], description: 'add=新增，update=更新' },
        instructions: {
          type: 'string',
          description: `⚠️ 必填！给 SubAgent 的完整上下文指令。

SubAgent 不知道主 agent 做了什么分析，必须通过此字段告诉它：

## 必须包含的信息：

1. **内容来源**：这些内容从哪来的？
   - "从正文文件「01_正文/第1章.md」提取的事件"
   - "用户直接提供的剧情描述"

2. **任务目标**：具体要做什么？
   - "将这12个事件写入 chapterIndex=1"
   - "创建第一卷及其60个章节"

3. **数据状态**：已存在什么？需要创建什么？
   - "章节已存在（chapterIndex=1），事件数量为0，只需创建事件"
   - "无任何数据，需要从零创建卷+章节+事件"

4. **禁止事项**：绝对不要做什么？
   - "禁止创建章节！章节已存在！"
   - "禁止调用 manageChapters"

## 示例：

"【来源】从正文「01_正文/第1章_商业街的失禁觉醒.md」提取
【目标】将事件写入 chapterIndex=1
【状态】章节已存在，事件数量为0
【任务】直接调用 manageEvents 创建事件
【禁止】禁止调用 manageVolumes 和 manageChapters！章节已存在！
【数量】共12个事件
【时间】从第1天14:00开始"`
        }
      },
      required: ['thinking', 'userInput', 'mode', 'instructions']
    }
  }
};

// ============================================
// 导出
// ============================================

export const readTools = [getEventsTool, getChaptersTool, getVolumesTool, getStoryLinesTool];
export const writeTools = [manageVolumesTool, manageChaptersTool, manageEventsTool, manageStoryLinesTool];
export const allOutlineTools = [...readTools, ...writeTools, processOutlineInputTool];
