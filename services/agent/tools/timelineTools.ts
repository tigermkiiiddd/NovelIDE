/**
 * Outline 工具执行
 */

import { AIService } from '../../geminiService';
import { runTimelineSubAgent, TimelineInput } from '../../subAgents/timelineAgent';
import { useAgentStore } from '../../../stores/agentStore';
import { useWorldTimelineStore, toHours } from '../../../stores/worldTimelineStore';
import { useProjectStore } from '../../../stores/projectStore';
import { TimelineEvent, ChapterGroup } from '../../../types';

// ============================================
// 导出工具定义
// ============================================

export {
  getEventsTool,
  getChaptersTool,
  getVolumesTool,
  getStoryLinesTool,
  manageVolumesTool,
  manageChaptersTool,
  manageEventsTool,
  manageStoryLinesTool,
  processOutlineInputTool,
  allOutlineTools
} from '../toolDefinitions/timeline';

// ============================================
// 辅助函数
// ============================================

const getStore = () => useWorldTimelineStore.getState();
const getProjectId = () => useProjectStore.getState().getCurrentProject()?.id;

const findChapterByIndex = (chapterIndex: number) => {
  const chapters = getStore().getChapters();
  return chapters.find(c => c.chapterIndex === chapterIndex) || null;
};

const findVolumeByIndex = (volumeIndex: number) => {
  const volumes = getStore().getVolumes();
  return volumes.find(v => v.volumeIndex === volumeIndex) || null;
};

const findEventByIndex = (eventIndex: number) => {
  const events = getStore().getEvents();
  return events.find(e => e.eventIndex === eventIndex) || null;
};

const findStoryLineByIndex = (storyLineIndex: number) => {
  const storyLines = getStore().getStoryLines();
  return storyLines[storyLineIndex] || null;
};

const ensureLoaded = async () => {
  const store = getStore();
  if (!store.timeline) {
    const projectId = getProjectId();
    if (projectId) await store.loadTimeline(projectId);
  }
  return store.timeline !== null;
};

// ============================================
// 工具执行
// ============================================

export const executeProcessOutlineInput = async (
  args: any,
  onUiLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  const agentStore = useAgentStore.getState();
  if (!agentStore.aiConfig.apiKey) {
    return JSON.stringify({ success: false, error: 'AI配置未设置' });
  }

  await ensureLoaded();
  const store = getStore();

  // 获取现有数量，传递给 SubAgent
  const existingVolumes = store.getVolumes();
  const existingChapters = store.getChapters();
  const existingEvents = store.getEvents();

  // 构建 volumeId -> volumeIndex 的映射
  const volumeIdToIndex = new Map(existingVolumes.map(v => [v.id, v.volumeIndex]));

  // 获取最新5个事件（按时间戳排序后的最后5个）
  const recentEvents = existingEvents.slice(-5).map(e => ({
    eventIndex: e.eventIndex,
    timestamp: e.timestamp,
    title: e.title,
    content: e.content || ''
  }));

  const context = {
    existingVolumeCount: existingVolumes.length,
    existingChapterCount: existingChapters.length,
    existingEventCount: existingEvents.length,
    volumeSummaries: existingVolumes.map(v => ({ volumeIndex: v.volumeIndex, title: v.title })),
    chapterSummaries: existingChapters.map(c => ({
      chapterIndex: c.chapterIndex,
      title: c.title,
      volumeIndex: c.volumeId ? (volumeIdToIndex.get(c.volumeId) ?? 0) : 0,
      eventCount: c.eventIds.length
    })),
    recentEvents
  };

  const aiService = new AIService(agentStore.aiConfig);
  const input: TimelineInput = {
    userInput: args.userInput,
    projectId: getProjectId() || '',
    mode: args.mode,
    instructions: args.instructions  // 传递主 agent 的指令
  };

  try {
    const result = await runTimelineSubAgent(aiService, input, context, onUiLog, signal);
    return result.report;
  } catch (error: any) {
    return `大纲处理失败：${error.message}`;
  }
};

export const executeOutlineTool = async (toolName: string, args: any): Promise<string> => {
  if (!await ensureLoaded()) {
    return JSON.stringify({ success: false, error: '大纲未初始化' });
  }

  const store = getStore();

  switch (toolName) {
    // === 读取 ===
    case 'outline_getEvents': {
      const { chapterIndex, fromIndex, toIndex, fullContent } = args;
      let events = store.getEvents();

      if (chapterIndex !== undefined) {
        const chapter = findChapterByIndex(chapterIndex);
        if (!chapter) return JSON.stringify({ error: `章节 ${chapterIndex} 不存在` });
        const eventIdSet = new Set(chapter.eventIds);
        events = events.filter(e => eventIdSet.has(e.id));
      }

      if (fromIndex !== undefined || toIndex !== undefined) {
        const from = fromIndex ?? 0;
        const to = toIndex ?? Infinity;
        events = events.filter(e => e.eventIndex >= from && e.eventIndex <= to);
      }

      const chapters = store.getChapters();
      const chapterIdToIndex = new Map(chapters.map(c => [c.id, c.chapterIndex]));

      return JSON.stringify({
        total: events.length,
        events: events.map((e: TimelineEvent) => ({
          eventIndex: e.eventIndex,
          timestamp: e.timestamp,
          duration: e.duration,
          cumulativeTime: e.cumulativeTime,
          title: e.title,
          content: fullContent ? e.content : (e.content.substring(0, 100) + (e.content.length > 100 ? '...' : '')),
          chapterIndex: e.chapterId ? chapterIdToIndex.get(e.chapterId) : undefined,
          location: e.location,
          characters: e.characters,
          emotion: e.emotion
        }))
      });
    }

    case 'outline_getChapters': {
      const { volumeIndex, fromIndex, toIndex } = args;
      let chapters = store.getChapters();
      const totalBeforeFilter = chapters.length;

      if (volumeIndex !== undefined) {
        const volume = findVolumeByIndex(volumeIndex);
        if (volume) chapters = chapters.filter(c => c.volumeId === volume.id);
      }

      // 最多返回 40 条
      const MAX_CHAPTERS = 40;
      let truncated = false;
      let remaining = 0;

      if (fromIndex !== undefined || toIndex !== undefined) {
        const from = fromIndex ?? 0;
        const to = toIndex ?? Infinity;
        chapters = chapters.filter(c => c.chapterIndex >= from && c.chapterIndex <= to);
      }

      if (chapters.length > MAX_CHAPTERS) {
        remaining = chapters.length - MAX_CHAPTERS;
        chapters = chapters.slice(0, MAX_CHAPTERS);
        truncated = true;
      }

      const volumes = store.getVolumes();
      const volumeIdToIndex = new Map(volumes.map(v => [v.id, v.volumeIndex]));

      const result: any = {
        total: chapters.length,
        chapters: chapters.map((c: ChapterGroup) => ({
          chapterIndex: c.chapterIndex,
          title: c.title,
          summary: c.summary,
          volumeIndex: c.volumeId ? volumeIdToIndex.get(c.volumeId) : undefined,
          eventCount: c.eventIds.length
        }))
      };

      if (truncated) {
        result.truncated = true;
        result.remaining = remaining;
        result.hint = `还有 ${remaining} 条章节未返回，请使用 fromIndex/toIndex 获取后续章节`;
      }

      return JSON.stringify(result);
    }

    case 'outline_getVolumes': {
      const volumes = store.getVolumes();
      return JSON.stringify({
        volumes: volumes.map(v => ({
          volumeIndex: v.volumeIndex,
          title: v.title,
          description: v.description,
          chapterCount: v.chapterIds.length
        }))
      });
    }

    case 'outline_getStoryLines': {
      const storyLines = store.getStoryLines();
      return JSON.stringify({
        storyLines: storyLines.map((s, i) => ({
          storyLineIndex: i,
          name: s.name,
          color: s.color,
          isMain: s.isMain
        }))
      });
    }

    // === 管理 ===
    case 'outline_manageVolumes': {
      const result: any = { added: [], updated: false, deleted: [] };

      // add
      if (args.add) {
        for (const v of args.add) {
          if (!v.description?.trim()) {
            return JSON.stringify({ success: false, error: `卷「${v.title}」缺少 description` });
          }
          const r = JSON.parse(store.addVolume(v));
          result.added.push({ title: v.title, volumeIndex: r.volumeIndex });
        }
      }

      // update
      if (args.update) {
        const volume = findVolumeByIndex(args.update.volumeIndex);
        if (!volume) return JSON.stringify({ success: false, error: `卷 ${args.update.volumeIndex} 不存在` });
        const { volumeIndex, ...updates } = args.update;
        store.updateVolume(volume.id, updates);
        result.updated = true;
      }

      // delete
      if (args.delete) {
        for (const idx of args.delete) {
          const volume = findVolumeByIndex(idx);
          if (volume) {
            store.deleteVolume(volume.id);
            result.deleted.push(idx);
          }
        }
      }

      return JSON.stringify({ success: true, ...result });
    }

    case 'outline_manageChapters': {
      const result: any = { added: [], updated: false, deleted: [] };

      // add
      if (args.add) {
        for (const c of args.add) {
          if (!c.summary?.trim()) {
            return JSON.stringify({ success: false, error: `章节「${c.title}」缺少 summary` });
          }
          const volume = findVolumeByIndex(c.volumeIndex);
          if (!volume) {
            return JSON.stringify({ success: false, error: `卷 ${c.volumeIndex} 不存在` });
          }
          const { volumeIndex, ...chapterData } = c;
          const r = JSON.parse(store.addChapter({ ...chapterData, volumeId: volume.id }));
          result.added.push({ title: c.title, chapterIndex: r.chapterIndex });
        }
      }

      // update
      if (args.update) {
        const chapter = findChapterByIndex(args.update.chapterIndex);
        if (!chapter) return JSON.stringify({ success: false, error: `章节 ${args.update.chapterIndex} 不存在` });
        const { chapterIndex, ...updates } = args.update;

        // 如果要改 volumeIndex，转换为 volumeId
        if (updates.volumeIndex !== undefined) {
          const volume = findVolumeByIndex(updates.volumeIndex);
          if (!volume) return JSON.stringify({ success: false, error: `卷 ${updates.volumeIndex} 不存在` });
          updates.volumeId = volume.id;
          delete updates.volumeIndex;
        }

        store.updateChapter(chapter.id, updates);
        result.updated = true;
      }

      // delete（从大到小删除，避免 index 变化问题）
      if (args.delete) {
        const sortedIndexes = [...args.delete].sort((a: number, b: number) => b - a);
        for (const idx of sortedIndexes) {
          const chapter = findChapterByIndex(idx);
          if (chapter) {
            store.deleteChapter(chapter.id);
            result.deleted.push(idx);
          }
        }
      }

      return JSON.stringify({ success: true, ...result });
    }

    case 'outline_manageEvents': {
      const result: any = { added: [], inserted: [], updated: false, deleted: [], moved: false };

      // add
      if (args.add) {
        for (const e of args.add) {
          const eventData: any = { ...e };
          if (e.chapterIndex !== undefined) {
            const chapter = findChapterByIndex(e.chapterIndex);
            if (chapter) eventData.chapterId = chapter.id;
            delete eventData.chapterIndex;
          }
          const r = JSON.parse(store.addEvent(eventData));
          result.added.push({ title: e.title, eventIndex: r.eventIndex });
        }
      }

      // insert（在指定位置插入，后续事件时间戳偏移）
      if (args.insert) {
        const { afterEventIndex, events } = args.insert;

        // 计算插入事件的总持续时间（小时）
        let totalDurationHours = 0;
        for (const e of events) {
          if (e.duration) {
            const { value, unit } = e.duration;
            if (unit === 'minute') totalDurationHours += value / 60;
            else if (unit === 'hour') totalDurationHours += value;
            else if (unit === 'day') totalDurationHours += value * 24;
          }
        }

        if (totalDurationHours === 0) {
          return JSON.stringify({ success: false, error: '插入事件必须指定 duration' });
        }

        // 获取所有事件
        const allEvents = store.getEvents();

        // 找到插入点的事件
        const afterEvent = afterEventIndex === -1 ? null : findEventByIndex(afterEventIndex);
        if (afterEventIndex !== -1 && !afterEvent) {
          return JSON.stringify({ success: false, error: `事件 ${afterEventIndex} 不存在` });
        }

        // 计算插入点的时间戳
        let insertAfterHours: number;
        if (afterEvent) {
          insertAfterHours = (afterEvent.timestamp.day - 1) * 24 + afterEvent.timestamp.hour;
          // 加上 afterEvent 自己的持续时间
          if (afterEvent.duration) {
            insertAfterHours += toHours(afterEvent.duration);
          }
        } else {
          // 在最前面插入，从第一个事件之前开始
          if (allEvents.length > 0) {
            insertAfterHours = (allEvents[0].timestamp.day - 1) * 24 + allEvents[0].timestamp.hour;
          } else {
            insertAfterHours = 8; // 默认第1天8点
          }
        }

        // 偏移后续事件的时间戳
        const afterEventId = afterEvent?.id;
        const shouldShift = (e: TimelineEvent) => {
          if (!afterEvent) return true; // 在最前面插入，所有事件都偏移
          // 在 afterEvent 之后的事件才偏移
          const eHours = (e.timestamp.day - 1) * 24 + e.timestamp.hour;
          const afterHours = (afterEvent.timestamp.day - 1) * 24 + afterEvent.timestamp.hour;
          return eHours > afterHours || (eHours === afterHours && e.eventIndex > afterEvent.eventIndex);
        };

        for (const e of allEvents) {
          if (shouldShift(e)) {
            const oldHours = (e.timestamp.day - 1) * 24 + e.timestamp.hour;
            const newHours = oldHours + totalDurationHours;
            const newTimestamp = {
              day: Math.floor(newHours / 24) + 1,
              hour: newHours % 24
            };
            store.updateEvent(e.id, { timestamp: newTimestamp });
          }
        }

        // 插入新事件
        let currentHours = insertAfterHours;
        for (const e of events) {
          const durationHours = e.duration
            ? (e.duration.unit === 'minute' ? e.duration.value / 60 :
               e.duration.unit === 'hour' ? e.duration.value :
               e.duration.value * 24)
            : 1;

          const timestamp = {
            day: Math.floor(currentHours / 24) + 1,
            hour: currentHours % 24
          };

          const eventData: any = {
            title: e.title,
            content: e.content,
            timestamp,
            duration: e.duration
          };

          if (e.chapterIndex !== undefined) {
            const chapter = findChapterByIndex(e.chapterIndex);
            if (chapter) eventData.chapterId = chapter.id;
          }
          if (e.location) eventData.location = e.location;
          if (e.characters) eventData.characters = e.characters;
          if (e.emotion) eventData.emotion = e.emotion;
          if (e.purpose) eventData.purpose = e.purpose;

          const r = JSON.parse(store.addEvent(eventData));
          result.inserted.push({ title: e.title, eventIndex: r.eventIndex });

          currentHours += durationHours;
        }

        result.insertOffset = { hours: totalDurationHours, afterEventIndex };
      }

      // update
      if (args.update) {
        const event = findEventByIndex(args.update.eventIndex);
        if (!event) return JSON.stringify({ success: false, error: `事件 ${args.update.eventIndex} 不存在` });
        const { eventIndex, ...updates } = args.update;

        // 如果要改 chapterIndex，转换为 chapterId
        if (updates.chapterIndex !== undefined) {
          const chapter = findChapterByIndex(updates.chapterIndex);
          if (chapter) updates.chapterId = chapter.id;
          delete updates.chapterIndex;
        }

        store.updateEvent(event.id, updates);
        result.updated = true;
      }

      // delete（从大到小删除，避免 index 变化问题）
      if (args.delete) {
        const sortedIndexes = [...args.delete].sort((a: number, b: number) => b - a);
        for (const idx of sortedIndexes) {
          const event = findEventByIndex(idx);
          if (event) {
            store.deleteEvent(event.id);
            result.deleted.push(idx);
          }
        }
      }

      // move
      if (args.move) {
        const event = findEventByIndex(args.move.eventIndex);
        if (!event) return JSON.stringify({ success: false, error: `事件 ${args.move.eventIndex} 不存在` });
        store.moveEvent(event.id, args.move.newIndex);
        result.moved = true;
      }

      return JSON.stringify({ success: true, ...result });
    }

    case 'outline_manageStoryLines': {
      const result: any = { added: false, deleted: false };

      if (args.add) {
        const r = JSON.parse(store.addStoryLine(args.add));
        result.added = { id: r.id };
      }

      if (args.delete !== undefined) {
        const sl = findStoryLineByIndex(args.delete);
        if (!sl) return JSON.stringify({ success: false, error: `故事线 ${args.delete} 不存在` });
        if (sl.isMain) return JSON.stringify({ success: false, error: '不能删除主线' });
        store.deleteStoryLine(sl.id);
        result.deleted = true;
      }

      return JSON.stringify({ success: true, ...result });
    }

    default:
      return JSON.stringify({ error: `未知工具: ${toolName}` });
  }
};
