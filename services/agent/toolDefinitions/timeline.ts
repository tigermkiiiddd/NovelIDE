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
    description: `管理事件。支持三种操作：
- add: 添加事件（按时间戳排序，可指定 chapterIndex 关联）
- update: 更新事件（用 eventIndex 定位，改时间戳或章节）
- delete: 删除事件（用 eventIndex 定位）

时间戳格式：{ "day": 1, "hour": 8 } 表示第1天8点
事件按时间戳自动排序。

示例：
{ "add": [{ "timestamp": { "day": 1, "hour": 8 }, "title": "醒来", "content": "...", "chapterIndex": 1 }] }
{ "update": { "eventIndex": 0, "timestamp": { "day": 1, "hour": 10 } } }
{ "delete": [0, 1, 2] }`,
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
              location: { type: 'string' },
              characters: { type: 'array', items: { type: 'string' } },
              emotion: { type: 'string' },
              purpose: { type: 'string' }
            },
            required: ['timestamp', 'title', 'content']
          }
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
    description: `将大纲内容写入结构化大纲（SubAgent 处理）。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        userInput: { type: 'string', description: '大纲内容' },
        mode: { type: 'string', enum: ['add', 'update'] }
      },
      required: ['thinking', 'userInput', 'mode']
    }
  }
};

// ============================================
// 导出
// ============================================

export const readTools = [getEventsTool, getChaptersTool, getVolumesTool, getStoryLinesTool];
export const writeTools = [manageVolumesTool, manageChaptersTool, manageEventsTool, manageStoryLinesTool];
export const allOutlineTools = [...readTools, ...writeTools, processOutlineInputTool];
