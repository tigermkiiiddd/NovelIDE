/**
 * 世界线时间线 Store
 *
 * 事件优先架构：
 * - TimelineEvent 是原子单位
 * - ChapterGroup 是事件的容器
 * - VolumeGroup 是章节的容器
 * - StoryLine 用于区分不同故事线
 */

import { create } from 'zustand';
import {
  WorldTimeline,
  TimelineEvent,
  ChapterGroup,
  VolumeGroup,
  StoryLine,
  QuantizedTime,
  TimeUnit,
  FileType
} from '../types';
import { createPersistingStore } from './createPersistingStore';
import { dbAPI } from '../services/persistence';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';

interface WorldTimelineState {
  timeline: WorldTimeline | null;
  isLoading: boolean;

  // === Lifecycle ===
  loadTimeline: (projectId: string) => Promise<void>;
  setTimeline: (timeline: WorldTimeline) => void;

  // === Event Operations ===
  addEvent: (event: Omit<TimelineEvent, 'id' | 'eventIndex'> & { insertAtIndex?: number }) => string;
  updateEvent: (eventId: string, updates: Partial<TimelineEvent>) => void;
  deleteEvent: (eventId: string) => void;
  moveEvent: (eventId: string, newIndex: number) => void;

  // === Chapter Operations ===
  addChapter: (chapter: Omit<ChapterGroup, 'id' | 'eventIds' | 'chapterIndex'>) => string;
  updateChapter: (chapterId: string, updates: Partial<ChapterGroup>) => void;
  deleteChapter: (chapterId: string) => void;
  addEventsToChapter: (chapterId: string, eventIds: string[]) => void;
  removeEventsFromChapter: (chapterId: string, eventIds: string[]) => void;

  // === Volume Operations ===
  addVolume: (volume: Omit<VolumeGroup, 'id' | 'chapterIds'>) => string;
  updateVolume: (volumeId: string, updates: Partial<VolumeGroup>) => void;
  deleteVolume: (volumeId: string) => void;
  addChaptersToVolume: (volumeId: string, chapterIds: string[]) => void;

  // === StoryLine Operations ===
  addStoryLine: (storyLine: Omit<StoryLine, 'id'>) => string;
  updateStoryLine: (storyLineId: string, updates: Partial<StoryLine>) => void;
  deleteStoryLine: (storyLineId: string) => void;

  // === Query Methods ===
  getEvents: (storyLineId?: string) => TimelineEvent[];
  getEvent: (eventId: string) => TimelineEvent | undefined;
  getChapters: (volumeId?: string) => ChapterGroup[];
  getChapter: (chapterId: string) => ChapterGroup | undefined;
  getVolumes: () => VolumeGroup[];
  getStoryLines: () => StoryLine[];
  getTimeRange: () => string;
}

const generateId = () => `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// === Time Utilities ===

/**
 * 将结构化时间转换为小时数（用于累加计算）
 */
export function toHours(time: QuantizedTime | undefined): number {
  if (!time) return 0;
  switch (time.unit) {
    case 'minute': return time.value / 60;
    case 'hour': return time.value;
    case 'day': return time.value * 24;
    default: return time.value;
  }
}

/**
 * 小时数转结构化时间
 */
export function fromHours(totalHours: number): QuantizedTime {
  // 优先用天
  if (totalHours >= 24 && totalHours % 24 === 0) {
    return { value: totalHours / 24, unit: 'day' };
  }
  // 小于1小时用分钟
  if (totalHours < 1 && totalHours > 0) {
    const minutes = Math.round(totalHours * 60);
    if (minutes > 0) {
      return { value: minutes, unit: 'minute' };
    }
  }
  return { value: Math.round(totalHours * 10) / 10, unit: 'hour' };
}

/**
 * 计算事件的累计时间（从开始到该事件结束）
 * 累计时间 = 前面所有事件的 duration 之和 + 自己的 duration
 */
export function calculateCumulativeTime(events: TimelineEvent[], eventIndex: number): QuantizedTime {
  let totalHours = 0;
  for (let i = 0; i <= eventIndex && i < events.length; i++) {
    totalHours += toHours(events[i].duration);
  }
  return fromHours(totalHours);
}

/**
 * 为所有事件计算并填充累计时间
 */
export function enrichEventsWithCumulativeTime(events: TimelineEvent[]): TimelineEvent[] {
  let cumulativeHours = 0;
  return events.map(e => {
    cumulativeHours += toHours(e.duration);
    return { ...e, cumulativeTime: fromHours(cumulativeHours) };
  });
}

/**
 * 格式化时间显示（UI计算）
 * 例如: { value: 8, unit: 'hour' } -> "第1天 早晨"
 */
export function formatTimeDisplay(time: QuantizedTime | undefined): string {
  if (!time) return '';

  const totalHours = toHours(time);
  const day = Math.floor(totalHours / 24) + 1;
  const hour = totalHours % 24;

  // 根据小时判断时间段
  let timeOfDay = '';
  if (hour >= 0 && hour < 6) timeOfDay = '凌晨';
  else if (hour >= 6 && hour < 9) timeOfDay = '早晨';
  else if (hour >= 9 && hour < 12) timeOfDay = '上午';
  else if (hour >= 12 && hour < 14) timeOfDay = '中午';
  else if (hour >= 14 && hour < 18) timeOfDay = '下午';
  else if (hour >= 18 && hour < 20) timeOfDay = '傍晚';
  else if (hour >= 20 && hour < 24) timeOfDay = '晚上';

  return `第${day}天 ${timeOfDay}`;
}

/**
 * 计算时间范围显示（基于累加时间）
 */
export function calculateTimeRangeDisplay(events: TimelineEvent[]): string {
  if (events.length === 0) return '';

  // 计算所有 duration 的累加值
  const totalHours = events.reduce((sum, e) => sum + toHours(e.duration), 0);
  if (totalHours === 0) return '';

  return formatTimeDisplay({ value: totalHours, unit: 'hour' });
}

// === Time Range Calculation Utilities (Legacy) ===

/**
 * 从时间字符串中提取数值（如 "第1天" -> 1, "第2天 早晨" -> 2）
 */
function parseTimeValue(timeStr: string): number {
  const match = timeStr.match(/第(\d+)天/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 计算时间范围
 */
function calculateTimeRange(times: string[]): string {
  if (times.length === 0) return '';

  const values = times.map(parseTimeValue).filter(v => v > 0);
  if (values.length === 0) return times[0];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return `第${min}天`;
  }
  return `第${min}天 ~ 第${max}天`;
}

/**
 * 计算章节时间范围
 */
function calculateChapterTimeRange(
  chapter: ChapterGroup,
  events: TimelineEvent[]
): string {
  const chapterEvents = events.filter(e => chapter.eventIds.includes(e.id));
  if (chapterEvents.length === 0) return '';
  return calculateTimeRangeDisplay(chapterEvents);
}

/**
 * 计算卷时间范围
 */
function calculateVolumeTimeRange(
  volume: VolumeGroup,
  chapters: ChapterGroup[],
  events: TimelineEvent[]
): string {
  const volumeChapters = chapters.filter(c => volume.chapterIds.includes(c.id));
  const allEventIds = volumeChapters.flatMap(c => c.eventIds);
  const volumeEvents = events.filter(e => allEventIds.includes(e.id));
  if (volumeEvents.length === 0) return '';
  return calculateTimeRangeDisplay(volumeEvents);
}

// === Default Main StoryLine ===
const DEFAULT_STORYLINE: StoryLine = {
  id: 'main-storyline',
  name: '主线',
  color: '#4A90D9',
  isMain: true
};

export const useWorldTimelineStore = createPersistingStore<WorldTimelineState>(
  'worldTimelineStore',
  {
    timeline: null,
    isLoading: false,

    // === Lifecycle ===
    loadTimeline: async (projectId: string) => {
      console.log('[WorldTimelineStore] 开始加载时间线, projectId:', projectId);
      useWorldTimelineStore.setState({ isLoading: true });

      try {
        const fileStore = useFileStore.getState();
        const projectStore = useProjectStore.getState();

        // 查找 03_剧情大纲 目录，不存在则创建
        let timelineFolder = fileStore.files.find(f => f.name === '03_剧情大纲' && f.parentId === 'root');

        if (!timelineFolder) {
          console.log('[WorldTimelineStore] 创建 03_剧情大纲 目录');
          timelineFolder = {
            id: `folder-outline-${Date.now()}`,
            parentId: 'root',
            name: '03_剧情大纲',
            type: FileType.FOLDER,
            lastModified: Date.now()
          };
          fileStore.files.push(timelineFolder);
        }

        // 查找 outline.json 文件
        const timelineFile = fileStore.files.find(f => f.name === 'outline.json' && f.parentId === timelineFolder.id);

        if (timelineFile && timelineFile.content) {
          try {
            const timeline = JSON.parse(timelineFile.content) as WorldTimeline;

            // 修复不连续的 eventIndex 和 chapterIndex（按 eventIndex 排序）
            timeline.events = timeline.events
              .sort((a, b) => a.eventIndex - b.eventIndex)
              .map((e, i) => ({ ...e, eventIndex: i }));

            timeline.chapters = timeline.chapters
              .sort((a, b) => a.chapterIndex - b.chapterIndex)
              .map((c, i) => ({ ...c, chapterIndex: i + 1 }));

            useWorldTimelineStore.setState({ timeline, isLoading: false });
            console.log('[WorldTimelineStore] 加载完成，已修复索引连续性');
            return;
          } catch (parseError) {
            console.error('[WorldTimelineStore] JSON解析失败:', parseError);
          }
        }

        // 没有时间线数据，创建空的并保存到文件
        const emptyTimeline: WorldTimeline = {
          id: generateId(),
          projectId,
          timeStart: '第0天',
          events: [],
          chapters: [],
          volumes: [],
          storyLines: [{ ...DEFAULT_STORYLINE }],
          lastModified: Date.now()
        };

        // 保存到文件
        const jsonContent = JSON.stringify(emptyTimeline, null, 2);
        if (timelineFile) {
          timelineFile.content = jsonContent;
          timelineFile.lastModified = Date.now();
        } else {
          const newFile = {
            id: `outline-${Date.now()}`,
            parentId: timelineFolder.id,
            name: 'outline.json',
            type: FileType.FILE,
            content: jsonContent,
            lastModified: Date.now()
          };
          fileStore.files.push(newFile);
        }

        // 保存到数据库
        const currentProject = projectStore.getCurrentProject();
        if (currentProject?.id) {
          await dbAPI.saveFiles(currentProject.id, [...fileStore.files]);
        }

        useWorldTimelineStore.setState({ timeline: emptyTimeline, isLoading: false });
        console.log('[WorldTimelineStore] 创建空时间线并保存');
      } catch (error) {
        console.error('[WorldTimelineStore] 加载失败:', error);
        useWorldTimelineStore.setState({ isLoading: false });
      }
    },

    setTimeline: (timeline: WorldTimeline) => {
      useWorldTimelineStore.setState({ timeline });
    },

    // === Event Operations ===
    addEvent: (eventData) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return JSON.stringify({ id: '', error: '时间线未初始化' });

      const newEvent: TimelineEvent = {
        id: generateId(),
        eventIndex: 0, // 占位，后面重新编号
        duration: eventData.duration || { value: 1, unit: 'hour' },
        title: eventData.title,
        content: eventData.content || '',
        storyLineId: eventData.storyLineId || DEFAULT_STORYLINE.id,
        location: eventData.location,
        characters: eventData.characters,
        emotion: eventData.emotion,
        chapterId: eventData.chapterId,
        purpose: eventData.purpose
      };

      // 如果没有指定 storyLineId，使用主线
      if (!newEvent.storyLineId) {
        const mainStoryLine = state.timeline.storyLines.find(s => s.isMain);
        newEvent.storyLineId = mainStoryLine?.id || DEFAULT_STORYLINE.id;
      }

      let newEvents: TimelineEvent[];

      // 支持插入到指定位置
      if (eventData.insertAtIndex !== undefined && eventData.insertAtIndex >= 0) {
        const insertIndex = Math.min(eventData.insertAtIndex, state.timeline.events.length);
        newEvents = [
          ...state.timeline.events.slice(0, insertIndex),
          newEvent,
          ...state.timeline.events.slice(insertIndex)
        ];
      } else {
        // 默认追加到最后
        newEvents = [...state.timeline.events, newEvent];
      }

      // 重新编号所有事件
      newEvents = newEvents.map((e, i) => ({ ...e, eventIndex: i }));

      let newChapters = state.timeline.chapters;

      // ⚠️ 关键：如果指定了 chapterId，自动把事件加入章节的 eventIds
      if (eventData.chapterId) {
        newChapters = state.timeline.chapters.map(c => {
          if (c.id === eventData.chapterId) {
            return {
              ...c,
              eventIds: [...c.eventIds, newEvent.id],
              timeRange: calculateChapterTimeRange({ ...c, eventIds: [...c.eventIds, newEvent.id] }, newEvents)
            };
          }
          return c;
        });
      }

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        events: newEvents,
        chapters: newChapters,
        lastModified: Date.now()
      };

      // 更新总时间范围
      newTimeline.totalTimeRange = calculateTimeRangeDisplay(newTimeline.events);

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 添加事件:', newEvent.title, 'index:', newEvent.eventIndex, 'chapterId:', eventData.chapterId);
      return JSON.stringify({ id: newEvent.id, eventIndex: newEvent.eventIndex });
    },

    updateEvent: (eventId: string, updates: Partial<TimelineEvent>) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const oldEvent = state.timeline.events.find(e => e.id === eventId);
      const newEvents = state.timeline.events.map(e =>
        e.id === eventId ? { ...e, ...updates } : e
      );

      let newChapters = state.timeline.chapters;

      // ⚠️ 如果更新了 chapterId，需要同步更新章节的 eventIds
      if (updates.chapterId !== undefined && oldEvent) {
        const oldChapterId = oldEvent.chapterId;
        const newChapterId = updates.chapterId;

        newChapters = state.timeline.chapters.map(c => {
          // 从旧章节移除
          if (c.id === oldChapterId) {
            return {
              ...c,
              eventIds: c.eventIds.filter(id => id !== eventId)
            };
          }
          // 加入新章节
          if (c.id === newChapterId) {
            return {
              ...c,
              eventIds: [...c.eventIds, eventId]
            };
          }
          return c;
        });
      }

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        events: newEvents,
        chapters: newChapters,
        totalTimeRange: calculateTimeRangeDisplay(newEvents),
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 更新事件:', eventId, 'updates:', updates);
    },

    deleteEvent: (eventId: string) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      // 从所有章节中移除该事件
      const newChapters = state.timeline.chapters.map(c => ({
        ...c,
        eventIds: c.eventIds.filter(id => id !== eventId)
      }));

      const newEvents = state.timeline.events
        .filter(e => e.id !== eventId)
        .map((e, i) => ({ ...e, eventIndex: i }));  // 重新编号

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        events: newEvents,
        chapters: newChapters,
        totalTimeRange: calculateTimeRangeDisplay(newEvents),
        lastModified: Date.now()
      };

      // 更新章节时间范围
      newTimeline.chapters = newTimeline.chapters.map(c => ({
        ...c,
        timeRange: calculateChapterTimeRange(c, newEvents)
      }));

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 删除事件:', eventId);
    },

    moveEvent: (eventId: string, newIndex: number) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const events = [...state.timeline.events];
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex === -1) return;

      const [event] = events.splice(eventIndex, 1);
      events.splice(newIndex, 0, event);

      // 重新分配 eventIndex
      const reorderedEvents = events.map((e, i) => ({ ...e, eventIndex: i }));

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        events: reorderedEvents,
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 移动事件:', eventId, '到位置', newIndex);
    },

    // === Chapter Operations ===
    addChapter: (chapterData) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return JSON.stringify({ id: '', chapterIndex: 0, error: '时间线未初始化' });

      // 自动分配 chapterIndex：当前最大值 + 1
      const maxIndex = state.timeline.chapters.length > 0
        ? Math.max(...state.timeline.chapters.map(c => c.chapterIndex))
        : 0;

      const newChapter: ChapterGroup = {
        id: generateId(),
        eventIds: [],
        ...chapterData,
        chapterIndex: maxIndex + 1  // 始终自动分配，忽略传入值
      };

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        chapters: [...state.timeline.chapters, newChapter],
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 添加章节:', newChapter.title, 'chapterIndex:', newChapter.chapterIndex);
      return JSON.stringify({ id: newChapter.id, chapterIndex: newChapter.chapterIndex });
    },

    updateChapter: (chapterId: string, updates: Partial<ChapterGroup>) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      // 更新后重新排序并编号（1-based）
      const newChapters = state.timeline.chapters.map(c =>
        c.id === chapterId ? { ...c, ...updates } : c
      ).sort((a, b) => a.chapterIndex - b.chapterIndex)
       .map((c, i) => ({ ...c, chapterIndex: i + 1 }));

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        chapters: newChapters,
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 更新章节:', chapterId);
    },

    deleteChapter: (chapterId: string) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      // 从卷中移除该章节
      const newVolumes = state.timeline.volumes.map(v => ({
        ...v,
        chapterIds: v.chapterIds.filter(id => id !== chapterId)
      }));

      const newChapters = state.timeline.chapters
        .filter(c => c.id !== chapterId)
        .map((c, i) => ({ ...c, chapterIndex: i + 1 }));  // 删除后重新编号（1-based）

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        chapters: newChapters,
        volumes: newVolumes,
        lastModified: Date.now()
      };

      // 更新卷时间范围
      newTimeline.volumes = newTimeline.volumes.map(v => ({
        ...v,
        timeRange: calculateVolumeTimeRange(v, newChapters, newTimeline.events)
      }));

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 删除章节:', chapterId);
    },

    addEventsToChapter: (chapterId: string, eventIds: string[]) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const newChapters = state.timeline.chapters.map(c => {
        if (c.id === chapterId) {
          const mergedEventIds = Array.from(new Set([...c.eventIds, ...eventIds]));
          return {
            ...c,
            eventIds: mergedEventIds,
            timeRange: calculateChapterTimeRange({ ...c, eventIds: mergedEventIds }, state.timeline!.events)
          };
        }
        return c;
      });

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        chapters: newChapters,
        lastModified: Date.now()
      };

      // 更新卷时间范围
      newTimeline.volumes = newTimeline.volumes.map(v => ({
        ...v,
        timeRange: calculateVolumeTimeRange(v, newChapters, newTimeline.events)
      }));

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 添加事件到章节:', chapterId, eventIds);
    },

    removeEventsFromChapter: (chapterId: string, eventIds: string[]) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const newChapters = state.timeline.chapters.map(c => {
        if (c.id === chapterId) {
          const filteredEventIds = c.eventIds.filter(id => !eventIds.includes(id));
          return {
            ...c,
            eventIds: filteredEventIds,
            timeRange: calculateChapterTimeRange({ ...c, eventIds: filteredEventIds }, state.timeline!.events)
          };
        }
        return c;
      });

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        chapters: newChapters,
        lastModified: Date.now()
      };

      // 更新卷时间范围
      newTimeline.volumes = newTimeline.volumes.map(v => ({
        ...v,
        timeRange: calculateVolumeTimeRange(v, newChapters, newTimeline.events)
      }));

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 从章节移除事件:', chapterId, eventIds);
    },

    // === Volume Operations ===
    addVolume: (volumeData) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return JSON.stringify({ id: '', error: '时间线未初始化' });

      // 自动分配 volumeIndex：当前最大值 + 1
      const maxIndex = state.timeline.volumes.length > 0
        ? Math.max(...state.timeline.volumes.map(v => v.volumeIndex))
        : 0;

      const newVolume: VolumeGroup = {
        id: generateId(),
        chapterIds: [],
        ...volumeData,
        volumeIndex: maxIndex + 1  // 始终自动分配
      };

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        volumes: [...state.timeline.volumes, newVolume].sort((a, b) => a.volumeIndex - b.volumeIndex),
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 添加卷:', newVolume.title, 'volumeIndex:', newVolume.volumeIndex);
      return JSON.stringify({ id: newVolume.id, volumeIndex: newVolume.volumeIndex });
    },

    updateVolume: (volumeId: string, updates: Partial<VolumeGroup>) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const newVolumes = state.timeline.volumes.map(v =>
        v.id === volumeId ? { ...v, ...updates } : v
      );

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        volumes: newVolumes,
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 更新卷:', volumeId);
    },

    deleteVolume: (volumeId: string) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const newVolumes = state.timeline.volumes.filter(v => v.id !== volumeId);

      // 更新章节的 volumeId
      const newChapters = state.timeline.chapters.map(c =>
        c.volumeId === volumeId ? { ...c, volumeId: undefined } : c
      );

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        volumes: newVolumes,
        chapters: newChapters,
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 删除卷:', volumeId);
    },

    addChaptersToVolume: (volumeId: string, chapterIds: string[]) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const newVolumes = state.timeline.volumes.map(v => {
        if (v.id === volumeId) {
          const mergedChapterIds = Array.from(new Set([...v.chapterIds, ...chapterIds]));
          return {
            ...v,
            chapterIds: mergedChapterIds,
            timeRange: calculateVolumeTimeRange({ ...v, chapterIds: mergedChapterIds }, state.timeline!.chapters, state.timeline!.events)
          };
        }
        return v;
      });

      // 更新章节的 volumeId
      const newChapters = state.timeline.chapters.map(c =>
        chapterIds.includes(c.id) ? { ...c, volumeId } : c
      );

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        volumes: newVolumes,
        chapters: newChapters,
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 添加章节到卷:', volumeId, chapterIds);
    },

    // === StoryLine Operations ===
    addStoryLine: (storyLineData) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return JSON.stringify({ id: '', error: '时间线未初始化' });

      const newStoryLine: StoryLine = {
        id: generateId(),
        ...storyLineData
      };

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        storyLines: [...state.timeline.storyLines, newStoryLine],
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 添加故事线:', newStoryLine.name);
      return JSON.stringify({ id: newStoryLine.id });
    },

    updateStoryLine: (storyLineId: string, updates: Partial<StoryLine>) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const newStoryLines = state.timeline.storyLines.map(s =>
        s.id === storyLineId ? { ...s, ...updates } : s
      );

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        storyLines: newStoryLines,
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 更新故事线:', storyLineId);
    },

    deleteStoryLine: (storyLineId: string) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      // 不能删除主线
      const storyLine = state.timeline.storyLines.find(s => s.id === storyLineId);
      if (storyLine?.isMain) {
        console.warn('[WorldTimelineStore] 不能删除主线');
        return;
      }

      const newStoryLines = state.timeline.storyLines.filter(s => s.id !== storyLineId);

      // 将使用该故事线的事件移到主线
      const mainStoryLine = state.timeline.storyLines.find(s => s.isMain);
      const newEvents = state.timeline.events.map(e =>
        e.storyLineId === storyLineId
          ? { ...e, storyLineId: mainStoryLine?.id || DEFAULT_STORYLINE.id }
          : e
      );

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        storyLines: newStoryLines,
        events: newEvents,
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 删除故事线:', storyLineId);
    },

    // === Query Methods ===
    getEvents: (storyLineId?: string) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return [];

      let events = storyLineId
        ? state.timeline.events.filter(e => e.storyLineId === storyLineId)
        : state.timeline.events;

      // 按 eventIndex 排序并计算累计时间
      return enrichEventsWithCumulativeTime(
        events.sort((a, b) => a.eventIndex - b.eventIndex)
      );
    },

    getEvent: (eventId: string) => {
      const state = useWorldTimelineStore.getState();
      return state.timeline?.events.find(e => e.id === eventId);
    },

    getChapters: (volumeId?: string) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return [];

      if (volumeId) {
        return state.timeline.chapters.filter(c => c.volumeId === volumeId);
      }
      return state.timeline.chapters;
    },

    getChapter: (chapterId: string) => {
      const state = useWorldTimelineStore.getState();
      return state.timeline?.chapters.find(c => c.id === chapterId);
    },

    getVolumes: () => {
      const state = useWorldTimelineStore.getState();
      return state.timeline?.volumes || [];
    },

    getStoryLines: () => {
      const state = useWorldTimelineStore.getState();
      return state.timeline?.storyLines || [];
    },

    getTimeRange: () => {
      const state = useWorldTimelineStore.getState();
      return state.timeline?.totalTimeRange || '';
    }
  },
  async (state) => {
    // 保存到 03_剧情大纲/outline.json
    console.log('[WorldTimelineStore] 开始保存, events:', state.timeline?.events?.length);
    const fileStore = useFileStore.getState();
    const projectStore = useProjectStore.getState();
    const currentProject = projectStore.getCurrentProject();
    const projectId = currentProject?.id;

    if (!projectId || !state.timeline) {
      console.log('[WorldTimelineStore] 保存跳过: projectId or timeline missing');
      return;
    }

    // 查找 03_剧情大纲 目录
    const timelineFolder = fileStore.files.find(f => f.name === '03_剧情大纲' && f.parentId === 'root');

    if (!timelineFolder) {
      console.warn('[WorldTimelineStore] 未找到 03_剧情大纲 目录');
      return;
    }

    // 查找或创建 outline.json 文件
    let timelineFile = fileStore.files.find(f => f.name === 'outline.json' && f.parentId === timelineFolder.id);

    const jsonContent = JSON.stringify(state.timeline, null, 2);

    if (timelineFile) {
      timelineFile.content = jsonContent;
      timelineFile.lastModified = Date.now();
      console.log('[WorldTimelineStore] 更新 outline.json');
    } else {
      const { FileType } = await import('../types');
      timelineFile = {
        id: `outline-${Date.now()}`,
        parentId: timelineFolder.id,
        name: 'outline.json',
        type: FileType.FILE,
        content: jsonContent,
        lastModified: Date.now()
      };
      fileStore.files.push(timelineFile);
      console.log('[WorldTimelineStore] 创建 outline.json 文件');
    }

    // 保存到数据库
    await dbAPI.saveFiles(projectId, [...fileStore.files]);
    console.log('[WorldTimelineStore] 已保存时间线数据');
  },
  1000  // 1秒防抖保存
);
