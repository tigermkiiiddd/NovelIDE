/**
 * 世界线时间线工具
 *
 * 事件优先架构：
 * - TimelineEvent 是原子单位
 * - ChapterGroup 是事件的容器
 * - VolumeGroup 是章节的容器
 */

import { AIService } from '../../geminiService';
import { ToolDefinition } from '../types';
import { runTimelineSubAgent, TimelineInput } from '../../subAgents/timelineAgent';
import { useAgentStore } from '../../../stores/agentStore';
import { useWorldTimelineStore } from '../../../stores/worldTimelineStore';
import { useProjectStore } from '../../../stores/projectStore';
import { TimelineEvent, ChapterGroup, VolumeGroup, StoryLine } from '../../../types';

// ============================================
// 读取工具 - 三级渐进式
// ============================================

/**
 * Level 1: 获取事件列表（支持按章节筛选和 index 范围）
 */
export const getEventsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getEvents',
    description: `获取时间线事件列表。支持按章节筛选或按事件序号范围查询。
- 按章节查询：传入 chapterIndex，返回该章节下的所有事件
- 按范围查询：传入 fromIndex 和 toIndex，返回序号范围内的事件
- 不传参数：返回全部事件`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        chapterIndex: { type: 'number', description: '章节序号（按章节筛选事件）' },
        fromIndex: { type: 'number', description: '起始事件序号（含）' },
        toIndex: { type: 'number', description: '结束事件序号（含）' }
      },
      required: ['thinking']
    }
  }
};

/**
 * Level 2: 获取指定事件详情
 */
export const getEventDetailTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getEvent',
    description: `获取单个事件的详细信息。`,
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

/**
 * Level 3: 获取章节列表（支持按卷筛选和 index 范围）
 */
export const getChaptersTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getChapters',
    description: `获取章节分组列表。支持按卷筛选或按章节序号范围查询。
- 按卷查询：传入 volumeId
- 按范围查询：传入 fromIndex 和 toIndex
- 不传参数：返回全部章节`,
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

/**
 * Level 4: 获取卷列表
 */
export const getVolumesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getVolumes',
    description: `获取所有卷分组列表。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' }
      },
      required: ['thinking']
    }
  }
};

/**
 * Level 5: 获取故事线列表
 */
export const getStoryLinesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getStoryLines',
    description: `获取所有故事线列表。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' }
      },
      required: ['thinking']
    }
  }
};

/**
 * Level 6: 获取总时间范围
 */
export const getTimeRangeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_getTimeRange',
    description: `获取整个时间线的时间范围。`,
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
// 批量写入工具
// ============================================

/**
 * 批量操作时间线
 */
export const batchUpdateTimelineTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'timeline_batchUpdate',
    description: `批量操作时间线，支持：
- 添加事件 (addEvents) - 核心操作
- 更新事件 (updateEvents)
- 删除事件 (deleteEvents) - 传入事件ID数组
- 添加章节分组 (addChapters)
- 更新章节分组 (updateChapters)
- 删除章节分组 (deleteChapters) - 传入章节序号数组
- 将事件加入章节 (addEventsToChapter)
- 从章节移除事件 (removeEventsFromChapter)
- 添加卷分组 (addVolumes)
- 更新卷分组 (updateVolumes)
- 删除卷分组 (deleteVolumes) - 传入卷ID数组
- 将章节加入卷 (addChaptersToVolume)
- 添加故事线 (addStoryLines)
- 删除故事线 (deleteStoryLines) - 传入故事线ID数组

混合操作示例：
{
  "addEvents": [
    {"duration": {"value": 1, "unit": "hour"}, "title": "醒来", "content": "..."},
    {"duration": {"value": 2, "unit": "hour"}, "title": "遇到敌人", "content": "..."}
  ],
  "addChapters": [
    {"title": "第一章", "summary": "..."}
  ],
  "addEventsToChapter": {
    "chapterIndex": 1,
    "eventIds": ["event-id-1", "event-id-2"]
  }
}

注意：eventIndex 由系统自动管理。新事件默认追加到最后，可通过 insertAtIndex 参数指定插入位置。

时间说明（累加模式）：
- duration 是该事件的持续时间，类似 Jira 工时
- value: 数值，unit: 单位（"hour" 或 "day"）
- 累计时间自动计算：前面所有事件的 duration 之和
- UI 会自动计算显示文本（如 "第1天 早晨"）
- 示例：事件A 3分钟 + 事件B 10分钟 + 事件C 1小时 = 事件C结束时累计1小时13分钟`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        addEvents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              duration: {
                type: 'object',
                description: '持续时间（数值+单位）',
                properties: {
                  value: { type: 'number', description: '时间数值' },
                  unit: { type: 'string', enum: ['hour', 'day'], description: '时间单位' }
                },
                required: ['value', 'unit']
              },
              title: { type: 'string', description: '事件标题' },
              content: { type: 'string', description: '事件内容' },
              insertAtIndex: { type: 'number', description: '插入位置（可选，不指定则追加到最后）' },
              storyLineId: { type: 'string', description: '故事线ID（可选）' },
              location: { type: 'string', description: '地点（可选）' },
              characters: { type: 'array', items: { type: 'string' }, description: '出场角色（可选）' },
              emotion: { type: 'string', description: '情绪氛围（可选）' },
              chapterIndex: { type: 'number', description: '所属章节序号（可选）' },
              purpose: { type: 'string', description: '场景作用/目的（可选）' }
            },
            required: ['duration', 'title', 'content']
          },
          description: '要添加的事件列表。默认追加到最后，可通过 insertAtIndex 指定插入位置'
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
              chapterIndex: { type: 'number', description: '章节序号' },
              title: { type: 'string', description: '章节标题' },
              summary: { type: 'string', description: '章节概要（可选）' },
              volumeId: { type: 'string', description: '所属卷ID（可选）' },
              pov: { type: 'string', description: 'POV角色（可选）' },
              driver: { type: 'string', description: '谁在推动（可选）' },
              conflict: { type: 'string', description: '冲突来源（可选）' },
              hook: { type: 'string', description: '章末悬念（可选）' },
              status: { type: 'string', enum: ['draft', 'outline', 'writing', 'completed'], description: '章节状态（可选）' }
            },
            required: ['title']
          },
          description: '要添加的章节分组列表'
        },
        updateChapters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chapterIndex: { type: 'number', description: '章节序号' },
              updates: { type: 'object' }
            },
            required: ['chapterIndex', 'updates']
          },
          description: '要更新的章节列表'
        },
        deleteChapters: {
          type: 'array',
          items: { type: 'number' },
          description: '要删除的章节序号列表'
        },
        addEventsToChapter: {
          type: 'object',
          properties: {
            chapterIndex: { type: 'number', description: '章节序号' },
            eventIds: { type: 'array', items: { type: 'string' } }
          },
          required: ['chapterIndex', 'eventIds'],
          description: '将事件加入章节'
        },
        removeEventsFromChapter: {
          type: 'object',
          properties: {
            chapterIndex: { type: 'number', description: '章节序号' },
            eventIds: { type: 'array', items: { type: 'string' } }
          },
          required: ['chapterIndex', 'eventIds'],
          description: '从章节移除事件'
        },
        addVolumes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              volumeIndex: { type: 'number', description: '卷序号' },
              title: { type: 'string', description: '卷标题' },
              description: { type: 'string', description: '卷描述（可选）' }
            },
            required: ['volumeIndex', 'title']
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
            chapterIndexes: { type: 'array', items: { type: 'number' }, description: '章节序号列表' }
          },
          required: ['volumeId', 'chapterIndexes'],
          description: '将章节加入卷'
        },
        addStoryLines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '故事线名称' },
              color: { type: 'string', description: '颜色（可选，默认蓝色）' },
              isMain: { type: 'boolean', description: '是否主线（可选，默认false）' }
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

// ============================================
// 主Agent调用工具
// ============================================

export const processTimelineInputTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'processTimelineInput',
    description: `将时间线内容写入结构化世界线。

## ⚠️ 重要说明
1. **可以传入大量内容**：支持一次性传入整卷甚至多卷的时间线
2. **Subagent 会自动分段处理**：内容量大时会分批次写入
3. **事件优先原则**：Subagent 会识别事件、时间、章节关系

## 参数说明
- userInput: 时间线内容（包含事件、时间、章节分组信息）
- mode: add（添加新内容）或 update（更新现有内容）

## 使用示例
- 添加整卷时间线：userInput 包含完整事件列表和章节分组
- 添加单章节事件：userInput 包含单章的事件
- 更新事件：mode=update + 指定事件信息
`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        userInput: { type: 'string', description: '时间线内容' },
        mode: { type: 'string', enum: ['add', 'update'], description: 'add=添加, update=更新' }
      },
      required: ['thinking', 'userInput', 'mode']
    }
  }
};

// ============================================
// 工具执行函数
// ============================================

export const executeProcessTimelineInput = async (
  args: any,
  onUiLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  const agentStore = useAgentStore.getState();
  const aiConfig = agentStore.aiConfig;

  if (!aiConfig.apiKey) {
    return JSON.stringify({ success: false, error: 'AI配置未设置' });
  }

  // 创建AI服务实例
  const aiService = new AIService(aiConfig);

  // 确保时间线已加载
  const store = useWorldTimelineStore.getState();
  const projectStore = useProjectStore.getState();
  const currentProject = projectStore.getCurrentProject();
  if (!store.timeline && currentProject?.id) {
    await store.loadTimeline(currentProject.id);
  }

  // 自动注入上下文
  let contextInfo = '';

  if (args.mode === 'update') {
    // 获取现有事件作为上下文
    const events = store.getEvents();
    if (events.length > 0) {
      contextInfo = `\n\n【现有事件列表（前20个）】\n${JSON.stringify(
        events.slice(0, 20).map(e => ({
          id: e.id,
          eventIndex: e.eventIndex,
          relativeTime: e.relativeTime,
          title: e.title
        })),
        null,
        2
      )}`;
    }
  }

  const input: TimelineInput = {
    userInput: args.userInput + contextInfo,
    projectId: currentProject?.id || '',
    mode: args.mode
  };

  try {
    const result = await runTimelineSubAgent(aiService, input, (msg) => {
      if (onUiLog) {
        onUiLog(msg);  // 传递给 UI
      }
      console.log('[TimelineSubAgent]', msg);
    }, signal);

    // 直接返回格式化的自然语言报告
    return result.report;
  } catch (error: any) {
    console.error('[processTimelineInput] 错误:', error);
    return `时间线处理失败：${error.message}`;
  }
};

// 通过 chapterIndex 查找章节
const findChapterByIndex = (store: ReturnType<typeof useWorldTimelineStore.getState>, chapterIndex: number): { id: string } | null => {
  const chapters = store.getChapters();
  const chapter = chapters.find(c => c.chapterIndex === chapterIndex);
  return chapter || null;
};

// 执行时间线工具（读取/写入）
export const executeTimelineTool = async (
  toolName: string,
  args: any
): Promise<string> => {
  const store = useWorldTimelineStore.getState();
  const projectStore = useProjectStore.getState();
  const currentProject = projectStore.getCurrentProject();

  // 确保时间线已加载
  if (!store.timeline && currentProject?.id) {
    await store.loadTimeline(currentProject.id);
  }

  if (!store.timeline) {
    return JSON.stringify({ success: false, error: '时间线未初始化' });
  }

  switch (toolName) {
    case 'timeline_getEvents': {
      const { chapterIndex, fromIndex, toIndex } = args;
      let events = store.getEvents();

      // 按章节筛选
      if (chapterIndex !== undefined) {
        const chapter = findChapterByIndex(store, chapterIndex);
        if (!chapter) {
          return JSON.stringify({ error: `章节序号 ${chapterIndex} 不存在` });
        }
        const fullChapter = store.getChapter(chapter.id);
        if (!fullChapter) {
          return JSON.stringify({ error: `章节序号 ${chapterIndex} 不存在` });
        }
        const eventIdSet = new Set(fullChapter.eventIds);
        events = events.filter(e => eventIdSet.has(e.id));
      }

      // 按 eventIndex 范围筛选
      if (fromIndex !== undefined || toIndex !== undefined) {
        const from = fromIndex ?? 0;
        const to = toIndex ?? Infinity;
        events = events.filter(e => e.eventIndex >= from && e.eventIndex <= to);
      }

      // 构建 chapterId → chapterIndex 映射
      const allChapters = store.getChapters();
      const chapterIdToIndex = new Map(allChapters.map(c => [c.id, c.chapterIndex]));

      return JSON.stringify({
        total: events.length,
        events: events.map((e: TimelineEvent) => ({
          id: e.id,
          eventIndex: e.eventIndex,
          duration: e.duration,
          cumulativeTime: e.cumulativeTime,
          title: e.title,
          content: e.content.substring(0, 100) + (e.content.length > 100 ? '...' : ''),
          chapterIndex: e.chapterId ? chapterIdToIndex.get(e.chapterId) : undefined,
          location: e.location,
          characters: e.characters,
          emotion: e.emotion
        }))
      });
    }

    case 'timeline_getEvent': {
      const { eventId } = args;
      const event = store.getEvent(eventId);
      return JSON.stringify(event || { error: '事件不存在' });
    }

    case 'timeline_getChapters': {
      const { volumeId, fromIndex, toIndex } = args;
      let chapters = store.getChapters(volumeId);

      // 按 chapterIndex 范围筛选
      if (fromIndex !== undefined || toIndex !== undefined) {
        const from = fromIndex ?? 0;
        const to = toIndex ?? Infinity;
        chapters = chapters.filter(c => c.chapterIndex >= from && c.chapterIndex <= to);
      }

      return JSON.stringify({
        total: chapters.length,
        chapters: chapters.map((c: ChapterGroup) => ({
          id: c.id,
          chapterIndex: c.chapterIndex,
          title: c.title,
          summary: c.summary,
          timeRange: c.timeRange,
          volumeId: c.volumeId,
          eventIds: c.eventIds,
          eventCount: c.eventIds.length
        }))
      });
    }

    case 'timeline_getVolumes': {
      const volumes = store.getVolumes();
      return JSON.stringify({
        volumes: volumes.map((v: VolumeGroup) => ({
          id: v.id,
          volumeIndex: v.volumeIndex,
          title: v.title,
          description: v.description,
          timeRange: v.timeRange,
          chapterCount: v.chapterIds.length
        }))
      });
    }

    case 'timeline_getStoryLines': {
      const storyLines = store.getStoryLines();
      return JSON.stringify({
        storyLines: storyLines.map((s: StoryLine) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          isMain: s.isMain
        }))
      });
    }

    case 'timeline_getTimeRange': {
      const timeRange = store.getTimeRange();
      return JSON.stringify({ timeRange });
    }

    case 'timeline_batchUpdate': {
      const results: any = {
        addedEvents: [],
        updatedEvents: [],
        deletedEvents: [],
        addedChapters: [],
        updatedChapters: [],
        deletedChapters: [],
        addedVolumes: [],
        updatedVolumes: [],
        deletedVolumes: [],
        addedStoryLines: [],
        deletedStoryLines: [],
        errors: []
      };

      // 1. 添加事件
      if (args.addEvents && Array.isArray(args.addEvents)) {
        for (const e of args.addEvents) {
          try {
            // 如果传了 chapterIndex，转换为 chapterId
            const eventData = { ...e };
            if (eventData.chapterIndex !== undefined) {
              const chapter = findChapterByIndex(store, eventData.chapterIndex);
              if (chapter) {
                eventData.chapterId = chapter.id;
              }
              delete eventData.chapterIndex;
            }
            delete eventData.eventIndex;  // eventIndex 由 store 自动管理
            const id = store.addEvent(eventData);
            results.addedEvents.push({ ...e, id });
          } catch (err: any) {
            results.errors.push({ type: 'addEvent', data: e, error: err.message });
          }
        }
      }

      // 2. 更新事件
      if (args.updateEvents && Array.isArray(args.updateEvents)) {
        for (const u of args.updateEvents) {
          try {
            store.updateEvent(u.eventId, u.updates);
            results.updatedEvents.push(u);
          } catch (err: any) {
            results.errors.push({ type: 'updateEvent', data: u, error: err.message });
          }
        }
      }

      // 3. 删除事件
      if (args.deleteEvents && Array.isArray(args.deleteEvents)) {
        for (const eventId of args.deleteEvents) {
          try {
            store.deleteEvent(eventId);
            results.deletedEvents.push(eventId);
          } catch (err: any) {
            results.errors.push({ type: 'deleteEvent', data: eventId, error: err.message });
          }
        }
      }

      // 4. 添加章节
      if (args.addChapters && Array.isArray(args.addChapters)) {
        // ⚠️ 校验0：章节数量上限
        if (args.addChapters.length > 20) {
          results.errors.push({
            type: 'addChapter',
            data: null,
            error: `❌ 单次最多创建 20 个章节，当前传入 ${args.addChapters.length} 个。请分批调用。`
          });
        } else {
          for (const c of args.addChapters) {
            try {
              // ⚠️ 校验1：summary 必填
              if (!c.summary || c.summary.trim() === '') {
                results.errors.push({
                  type: 'addChapter',
                  data: c,
                  error: `❌ 章节「${c.title}」缺少 summary（剧情概要）。每个章节必须填写剧情概要，不能留空。`
                });
                continue;
              }

              // ⚠️ 校验2：volumeId 必填且卷必须存在
              if (!c.volumeId) {
                results.errors.push({
                  type: 'addChapter',
                  data: c,
                  error: `❌ 章节「${c.title}」缺少 volumeId。每个章节必须指定所属卷。`
                });
                continue;
              }

              const volume = store.getVolume(c.volumeId);
              if (!volume) {
                results.errors.push({
                  type: 'addChapter',
                  data: c,
                  error: `❌ 卷 ${c.volumeId} 不存在。请先使用 addVolumes 创建卷，然后再创建章节。`
                });
                continue;
              }

              const chapterData = { ...c };
              delete chapterData.chapterIndex;  // chapterIndex 由 store 自动管理
              const id = store.addChapter(chapterData);
              results.addedChapters.push({ ...c, id });
            } catch (err: any) {
              results.errors.push({ type: 'addChapter', data: c, error: err.message });
            }
          }
        }
      }

      // 5. 更新章节
      if (args.updateChapters && Array.isArray(args.updateChapters)) {
        for (const u of args.updateChapters) {
          try {
            const chapter = findChapterByIndex(store, u.chapterIndex);
            if (!chapter) {
              results.errors.push({ type: 'updateChapter', data: u, error: `❌ 章节序号 ${u.chapterIndex} 不存在` });
              continue;
            }
            store.updateChapter(chapter.id, u.updates);
            results.updatedChapters.push(u);
          } catch (err: any) {
            results.errors.push({ type: 'updateChapter', data: u, error: err.message });
          }
        }
      }

      // 6. 删除章节
      if (args.deleteChapters && Array.isArray(args.deleteChapters)) {
        for (const chapterIdx of args.deleteChapters) {
          try {
            const chapter = findChapterByIndex(store, chapterIdx);
            if (!chapter) {
              results.errors.push({ type: 'deleteChapter', data: chapterIdx, error: `❌ 章节序号 ${chapterIdx} 不存在` });
              continue;
            }
            store.deleteChapter(chapter.id);
            results.deletedChapters.push(chapterIdx);
          } catch (err: any) {
            results.errors.push({ type: 'deleteChapter', data: chapterIdx, error: err.message });
          }
        }
      }

      // 7. 将事件加入章节
      if (args.addEventsToChapter) {
        try {
          const { chapterIndex: cIdx, eventIds } = args.addEventsToChapter;

          // ⚠️ 校验1：章节必须存在
          const chapter = findChapterByIndex(store, cIdx);
          if (!chapter) {
            results.errors.push({
              type: 'addEventsToChapter',
              data: args.addEventsToChapter,
              error: `❌ 章节序号 ${cIdx} 不存在。请先使用 addChapters 创建章节，然后再关联事件。正确流程：1.创建卷 → 2.创建章节 → 3.创建事件 → 4.关联事件到章节`
            });
          } else {
            // ⚠️ 校验2：所有事件必须存在
            const missingEvents = eventIds.filter(id => !store.getEvent(id));
            if (missingEvents.length > 0) {
              results.errors.push({
                type: 'addEventsToChapter',
                data: args.addEventsToChapter,
                error: `❌ 事件 ${missingEvents.join(', ')} 不存在。请先使用 addEvents 创建这些事件。`
              });
            } else {
              store.addEventsToChapter(chapter.id, eventIds);
              results.addedEventsToChapter = args.addEventsToChapter;
            }
          }
        } catch (err: any) {
          results.errors.push({ type: 'addEventsToChapter', data: args.addEventsToChapter, error: err.message });
        }
      }

      // 8. 从章节移除事件
      if (args.removeEventsFromChapter) {
        try {
          const chapter = findChapterByIndex(store, args.removeEventsFromChapter.chapterIndex);
          if (!chapter) {
            results.errors.push({ type: 'removeEventsFromChapter', data: args.removeEventsFromChapter, error: `❌ 章节序号 ${args.removeEventsFromChapter.chapterIndex} 不存在` });
          } else {
            store.removeEventsFromChapter(chapter.id, args.removeEventsFromChapter.eventIds);
            results.removedEventsFromChapter = args.removeEventsFromChapter;
          }
        } catch (err: any) {
          results.errors.push({ type: 'removeEventsFromChapter', data: args.removeEventsFromChapter, error: err.message });
        }
      }

      // 9. 添加卷
      if (args.addVolumes && Array.isArray(args.addVolumes)) {
        for (const v of args.addVolumes) {
          try {
            // ⚠️ 校验：description 必填
            if (!v.description || v.description.trim() === '') {
              results.errors.push({
                type: 'addVolume',
                data: v,
                error: `❌ 卷「${v.title}」缺少 description（剧情概述）。每个卷必须填写剧情概述，不能留空。`
              });
              continue;
            }

            const id = store.addVolume(v);
            results.addedVolumes.push({ ...v, id });
          } catch (err: any) {
            results.errors.push({ type: 'addVolume', data: v, error: err.message });
          }
        }
      }

      // 10. 更新卷
      if (args.updateVolumes && Array.isArray(args.updateVolumes)) {
        for (const u of args.updateVolumes) {
          try {
            store.updateVolume(u.volumeId, u.updates);
            results.updatedVolumes.push(u);
          } catch (err: any) {
            results.errors.push({ type: 'updateVolume', data: u, error: err.message });
          }
        }
      }

      // 11. 删除卷
      if (args.deleteVolumes && Array.isArray(args.deleteVolumes)) {
        for (const volumeId of args.deleteVolumes) {
          try {
            store.deleteVolume(volumeId);
            results.deletedVolumes.push(volumeId);
          } catch (err: any) {
            results.errors.push({ type: 'deleteVolume', data: volumeId, error: err.message });
          }
        }
      }

      // 12. 将章节加入卷
      if (args.addChaptersToVolume) {
        try {
          const { volumeId, chapterIndexes } = args.addChaptersToVolume;

          // ⚠️ 校验1：卷必须存在
          const volume = store.getVolume(volumeId);
          if (!volume) {
            results.errors.push({
              type: 'addChaptersToVolume',
              data: args.addChaptersToVolume,
              error: `❌ 卷 ${volumeId} 不存在。请先使用 addVolumes 创建卷。`
            });
          } else {
            // 将 chapterIndexes 转换为 chapterIds
            const chapterIds: string[] = [];
            const missingIndexes: number[] = [];
            for (const idx of chapterIndexes) {
              const chapter = findChapterByIndex(store, idx);
              if (chapter) {
                chapterIds.push(chapter.id);
              } else {
                missingIndexes.push(idx);
              }
            }
            if (missingIndexes.length > 0) {
              results.errors.push({
                type: 'addChaptersToVolume',
                data: args.addChaptersToVolume,
                error: `❌ 章节序号 ${missingIndexes.join(', ')} 不存在。请先使用 addChapters 创建这些章节。`
              });
            } else {
              store.addChaptersToVolume(volumeId, chapterIds);
              results.addedChaptersToVolume = args.addChaptersToVolume;
            }
          }
        } catch (err: any) {
          results.errors.push({ type: 'addChaptersToVolume', data: args.addChaptersToVolume, error: err.message });
        }
      }

      // 13. 添加故事线
      if (args.addStoryLines && Array.isArray(args.addStoryLines)) {
        for (const s of args.addStoryLines) {
          try {
            const id = store.addStoryLine(s);
            results.addedStoryLines.push({ ...s, id });
          } catch (err: any) {
            results.errors.push({ type: 'addStoryLine', data: s, error: err.message });
          }
        }
      }

      // 14. 删除故事线
      if (args.deleteStoryLines && Array.isArray(args.deleteStoryLines)) {
        for (const storyLineId of args.deleteStoryLines) {
          try {
            store.deleteStoryLine(storyLineId);
            results.deletedStoryLines.push(storyLineId);
          } catch (err: any) {
            results.errors.push({ type: 'deleteStoryLine', data: storyLineId, error: err.message });
          }
        }
      }

      // ⚠️ 数据完整性警告
      const warnings: string[] = [];

      // 警告1：孤立事件
      if (results.addedEvents.length > 0) {
        const orphanEvents = results.addedEvents.filter((e: any) => e.chapterIndex === undefined);
        if (orphanEvents.length > 0) {
          warnings.push(`⚠️ 发现 ${orphanEvents.length} 个孤立事件（未关联到章节）`);
          warnings.push(`   → 这些事件无法正确归属到卷，请使用 addEventsToChapter 关联它们`);
        }
      }

      // 警告2：创建了卷但没有创建章节
      if (results.addedVolumes.length > 0 && results.addedChapters.length === 0) {
        warnings.push(`⚠️ 创建了 ${results.addedVolumes.length} 个卷但没有创建章节`);
        warnings.push(`   → 章节是连接卷和事件的桥梁，请立即创建章节`);
        warnings.push(`   → 正确流程：1.创建卷 → 2.创建章节 → 3.创建事件 → 4.关联事件到章节`);
      }

      // 警告3：创建了事件但没有创建章节
      if (results.addedEvents.length > 0 && results.addedChapters.length === 0) {
        // 检查是否已有章节存在
        const existingChapters = store.getChapters();
        if (existingChapters.length === 0) {
          warnings.push(`⚠️ 创建了 ${results.addedEvents.length} 个事件但没有章节`);
          warnings.push(`   → 事件必须关联到章节才能归属到卷`);
          warnings.push(`   → 你跳过了"创建章节"这一步，请立即补充创建章节`);
        }
      }

      // 警告4：章节没有指定 volumeId
      if (results.addedChapters.length > 0) {
        const orphanChapters = results.addedChapters.filter((c: any) => !c.volumeId);
        if (orphanChapters.length > 0) {
          warnings.push(`⚠️ 发现 ${orphanChapters.length} 个章节没有指定 volumeId`);
          warnings.push(`   → 这些章节无法归属到卷，请在创建章节时指定 volumeId`);
        }
      }

      return JSON.stringify({
        success: results.errors.length === 0,
        warnings: warnings.length > 0 ? warnings : undefined,
        ...results
      });
    }

    default:
      return JSON.stringify({ error: `未知工具: ${toolName}` });
  }
};
