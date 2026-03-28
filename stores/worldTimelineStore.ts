/**
 * 世界线时间线 Store
 *
 * 事件优先架构（时间戳模式）：
 * - TimelineEvent 使用绝对时间戳（day + hour）
 * - 事件按时间戳排序
 * - ChapterGroup 是事件的容器
 * - VolumeGroup 是章节的容器
 */

import { create, UseBoundStore, StoreApi } from 'zustand';
import {
  WorldTimeline,
  TimelineEvent,
  ChapterGroup,
  VolumeGroup,
  StoryLine,
  StoryTimeStamp,
  QuantizedTime,
  FileType,
  ForeshadowingItem,
  HookType,
  HookStrength,
  EmotionItem,
  EmotionScore,
  NodeEmotionCurvePoint,
  HookEmotionCurvePoint,
  ForeshadowingStats,
  HookEmotionReward,
  STRENGTH_SCORES,
  DURATION_WINDOW_MAP,
  DEFAULT_EMOTION_REWARD,
} from '../types';
import { createPersistingStore } from './createPersistingStore';
import { dbAPI } from '../services/persistence';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';
import { useChapterAnalysisStore } from './chapterAnalysisStore';

export interface WorldTimelineState {
  timeline: WorldTimeline | null;
  isLoading: boolean;

  // === Lifecycle ===
  loadTimeline: (projectId: string) => Promise<void>;
  setTimeline: (timeline: WorldTimeline) => void;

  // === Event Operations ===
  addEvent: (event: Omit<TimelineEvent, 'id' | 'eventIndex'>) => string;
  updateEvent: (eventId: string, updates: Partial<TimelineEvent>) => void;
  deleteEvent: (eventId: string) => void;
  moveEvent: (eventId: string, newTimestamp: StoryTimeStamp) => void;

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

  // === Hook/Foreshadowing Extension Methods ===
  // duration → 窗口/强度映射
  mapDurationToWindow: (duration: string) => number;
  mapDurationToStrength: (duration: string) => HookStrength;

  // 伏笔统计查询（需要传入 chapterAnalysisStore 的伏笔数据）
  getForeshadowingStats: (foreshadowings: ForeshadowingItem[], currentChapter?: number) => ForeshadowingStats;
  getOverdueForeshadowings: (foreshadowings: ForeshadowingItem[], currentChapter: number) => ForeshadowingItem[];
  getExpiringForeshadowings: (foreshadowings: ForeshadowingItem[], currentChapter: number, withinChapters: number) => ForeshadowingItem[];

  // 情绪曲线（两条独立曲线）
  getNodeEmotionCurve: () => NodeEmotionCurvePoint[];
  getHookEmotionCurve: () => HookEmotionCurvePoint[];
}

const generateId = () => `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// === Time Utilities ===

/**
 * 将时间戳转换为总小时数（用于比较）
 * day 从1开始，所以需要减1
 */
export function timestampToHours(ts: StoryTimeStamp): number {
  return (ts.day - 1) * 24 + ts.hour;
}

/**
 * 比较两个时间戳
 * 返回: 负数表示 a < b, 0 表示相等, 正数表示 a > b
 */
export function compareTimestamps(a: StoryTimeStamp, b: StoryTimeStamp): number {
  return timestampToHours(a) - timestampToHours(b);
}

/**
 * 将结构化时间转换为小时数（用于持续时间）
 */
export function toHours(time: QuantizedTime | undefined): number {
  if (!time) return 0;
  const unit = time.unit as string;
  switch (unit) {
    case 'minute': return time.value / 60; // 向后兼容旧数据
    case 'hour': return time.value;
    case 'day': return time.value * 24;
    default: return time.value;
  }
}

/**
 * 格式化时间戳显示
 * 例如: { day: 1, hour: 8.5 } -> "第1天 08:30"
 */
export function formatTimestampDisplay(ts: StoryTimeStamp | undefined): string {
  if (!ts) return '';

  const hour = ts.hour;
  const hourInt = Math.floor(hour);
  const minutes = Math.round((hour - hourInt) * 60);

  // 根据小时判断时间段
  let timeOfDay = '';
  if (hour >= 0 && hour < 6) timeOfDay = '凌晨';
  else if (hour >= 6 && hour < 9) timeOfDay = '早晨';
  else if (hour >= 9 && hour < 12) timeOfDay = '上午';
  else if (hour >= 12 && hour < 14) timeOfDay = '中午';
  else if (hour >= 14 && hour < 18) timeOfDay = '下午';
  else if (hour >= 18 && hour < 20) timeOfDay = '傍晚';
  else if (hour >= 20 && hour < 24) timeOfDay = '晚上';

  // 格式化时间
  const timeStr = minutes > 0
    ? `${hourInt.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    : `${hourInt.toString().padStart(2, '0')}:00`;

  return `第${ts.day}天 ${timeStr} ${timeOfDay}`;
}

/**
 * 格式化时间显示（兼容旧接口）
 */
export function formatTimeDisplay(ts: StoryTimeStamp | undefined): string {
  return formatTimestampDisplay(ts);
}

/**
 * 格式化持续时间显示
 */
export function formatDurationDisplay(duration: QuantizedTime | undefined): string {
  if (!duration || duration.value === 0) return '';

  const { value, unit } = duration;

  if (unit === 'day') {
    if (value === 1) return '1天';
    return `${value}天`;
  } else {
    // hour
    if (value === 0.5) return '半小时';
    if (value === 1) return '1小时';
    if (value < 1) return `${value * 60}分钟`;
    if (value === Math.floor(value)) return `${value}小时`;
    // 带小数的小时
    const hours = Math.floor(value);
    const minutes = Math.round((value - hours) * 60);
    if (minutes === 0) return `${hours}小时`;
    if (minutes === 30) return `${hours}半小时`;
    return `${hours}小时${minutes}分钟`;
  }
}

/**
 * 计算结束时间戳
 */
export function calculateEndTime(startTs: StoryTimeStamp, duration: QuantizedTime): StoryTimeStamp {
  const startHours = timestampToHours(startTs);
  const durationHours = toHours(duration);
  const endHours = startHours + durationHours;

  // day 从1开始
  const endDay = Math.floor(endHours / 24) + 1;
  const endHour = endHours % 24;

  return { day: endDay, hour: endHour };
}

/**
 * 格式化时间范围显示（几点到几点）
 */
export function formatTimeRangeDisplay(startTs: StoryTimeStamp | undefined, duration: QuantizedTime | undefined): string {
  if (!startTs) return '';

  // 格式化开始时间
  const startHour = Math.floor(startTs.hour);
  const startMinutes = Math.round((startTs.hour - startHour) * 60);
  const startTimeStr = startMinutes > 0
    ? `${startHour.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}`
    : `${startHour.toString().padStart(2, '0')}:00`;

  // 如果没有持续时间或持续时间为0，只显示开始时间
  if (!duration || duration.value === 0) {
    return `第${startTs.day}天 ${startTimeStr}`;
  }

  // 计算结束时间
  const endTs = calculateEndTime(startTs, duration);
  const endHour = Math.floor(endTs.hour);
  const endMinutes = Math.round((endTs.hour - endHour) * 60);
  const endTimeStr = endMinutes > 0
    ? `${endHour.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`
    : `${endHour.toString().padStart(2, '0')}:00`;

  // 如果跨天
  if (endTs.day !== startTs.day) {
    return `第${startTs.day}天 ${startTimeStr} ~ 第${endTs.day}天 ${endTimeStr}`;
  }

  return `第${startTs.day}天 ${startTimeStr} ~ ${endTimeStr}`;
}

/**
 * 计算时间范围显示（基于时间戳）
 */
export function calculateTimeRangeDisplay(events: TimelineEvent[]): string {
  if (events.length === 0) return '';

  // 过滤有有效时间戳的事件
  const validEvents = events.filter(e => e.timestamp);
  if (validEvents.length === 0) return '';

  // 找到最早和最晚的时间
  const timestamps = validEvents.map(e => timestampToHours(e.timestamp));
  const minHours = Math.min(...timestamps);
  const maxHours = Math.max(...timestamps);

  const minDay = Math.floor(minHours / 24);
  const maxDay = Math.floor(maxHours / 24);

  if (minDay === maxDay) {
    return `第${minDay}天`;
  }
  return `第${minDay}天 ~ 第${maxDay}天`;
}

/**
 * 按时间戳排序事件
 */
export function sortEventsByTimestamp(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    // 没有时间戳的排到最后
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return compareTimestamps(a.timestamp, b.timestamp);
  });
}

/**
 * 为排序后的事件分配 eventIndex
 */
export function assignEventIndexes(events: TimelineEvent[]): TimelineEvent[] {
  return events.map((e, i) => ({ ...e, eventIndex: i }));
}

/**
 * 重建章节的事件映射关系（根据事件的 chapterId 重建章节的 eventIds）
 * 用于修复旧数据中映射不一致的问题
 */
function rebuildChapterEventMappings(
  events: TimelineEvent[],
  chapters: ChapterGroup[]
): ChapterGroup[] {
  // 按章节 ID 分组事件
  const eventsByChapterId = new Map<string, string[]>();

  for (const event of events) {
    if (event.chapterId) {
      if (!eventsByChapterId.has(event.chapterId)) {
        eventsByChapterId.set(event.chapterId, []);
      }
      eventsByChapterId.get(event.chapterId)!.push(event.id);
    }
  }

  // 重建章节的 eventIds
  return chapters.map(chapter => ({
    ...chapter,
    eventIds: eventsByChapterId.get(chapter.id) || []
  }));
}

/**
 * 计算章节时间范围（基于事件时间戳）
 */
function calculateChapterTimeRange(
  chapter: ChapterGroup,
  events: TimelineEvent[]
): string {
  const chapterEvents = events.filter(e => chapter.eventIds.includes(e.id) && e.timestamp);
  if (chapterEvents.length === 0) return '';
  return calculateTimeRangeDisplay(chapterEvents);
}

/**
 * 计算卷时间范围（基于章节事件时间戳）
 */
function calculateVolumeTimeRange(
  volume: VolumeGroup,
  chapters: ChapterGroup[],
  events: TimelineEvent[]
): string {
  const volumeChapters = chapters.filter(c => volume.chapterIds.includes(c.id));
  const allEventIds = volumeChapters.flatMap(c => c.eventIds);
  const volumeEvents = events.filter(e => allEventIds.includes(e.id) && e.timestamp);
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

export const useWorldTimelineStore: UseBoundStore<StoreApi<WorldTimelineState>> = createPersistingStore<WorldTimelineState>(
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

            // 按时间戳排序事件，并重新分配 eventIndex
            timeline.events = assignEventIndexes(sortEventsByTimestamp(timeline.events));

            // 按章节序号排序
            timeline.chapters = timeline.chapters
              .sort((a, b) => a.chapterIndex - b.chapterIndex)
              .map((c, i) => ({ ...c, chapterIndex: i + 1 }));

            // ⚠️ 重建章节的事件映射关系（修复旧数据）
            timeline.chapters = rebuildChapterEventMappings(timeline.events, timeline.chapters);

            // 更新章节时间范围
            timeline.chapters = timeline.chapters.map(c => ({
              ...c,
              timeRange: calculateChapterTimeRange(c, timeline.events)
            }));

            useWorldTimelineStore.setState({ timeline, isLoading: false });
            console.log('[WorldTimelineStore] 加载完成，已重建事件映射');
            return;
          } catch (parseError) {
            // 解析失败：文件可能损坏，不要覆盖！保持原文件，只记录错误
            console.error('[WorldTimelineStore] JSON解析失败，文件可能损坏，保留原文件不覆盖:', parseError);
            console.error('[WorldTimelineStore] 损坏的文件内容前100字符:', timelineFile.content.substring(0, 100));
            useWorldTimelineStore.setState({ timeline: null, isLoading: false });
            return;
          }
        }

        // 文件不存在或内容为空，才创建新时间线
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

      // 如果没有时间戳，计算一个默认的（最后一个事件之后）
      let timestamp = eventData.timestamp;
      if (!timestamp) {
        const lastEvent = state.timeline.events[state.timeline.events.length - 1];
        if (lastEvent?.timestamp) {
          // 在最后一个事件之后 1 小时
          timestamp = {
            day: lastEvent.timestamp.day,
            hour: lastEvent.timestamp.hour + 1
          };
        } else {
          // 默认第1天 8点
          timestamp = { day: 1, hour: 8 };
        }
      }

      const newEvent: TimelineEvent = {
        id: generateId(),
        eventIndex: 0, // 占位，后面按时间戳排序后重新编号
        timestamp,
        duration: eventData.duration,
        title: eventData.title,
        content: eventData.content || '',
        storyLineId: eventData.storyLineId || DEFAULT_STORYLINE.id,
        location: eventData.location,
        characters: eventData.characters,
        emotion: eventData.emotion,
        emotions: eventData.emotions,
        chapterId: eventData.chapterId,
        purpose: eventData.purpose
      };

      // 如果没有指定 storyLineId，使用主线
      if (!newEvent.storyLineId) {
        const mainStoryLine = state.timeline.storyLines.find(s => s.isMain);
        newEvent.storyLineId = mainStoryLine?.id || DEFAULT_STORYLINE.id;
      }

      // 添加新事件，然后按时间戳排序并重新编号
      let newEvents = assignEventIndexes(
        sortEventsByTimestamp([...state.timeline.events, newEvent])
      );

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
      console.log('[WorldTimelineStore] 添加事件:', newEvent.title, 'timestamp:', timestamp, 'chapterId:', eventData.chapterId);
      return JSON.stringify({ id: newEvent.id, eventIndex: newEvent.eventIndex });
    },

    updateEvent: (eventId: string, updates: Partial<TimelineEvent>) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      const oldEvent = state.timeline.events.find(e => e.id === eventId);

      // 更新事件，然后按时间戳重新排序并编号
      let newEvents = assignEventIndexes(
        sortEventsByTimestamp(
          state.timeline.events.map(e =>
            e.id === eventId ? { ...e, ...updates } : e
          )
        )
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

      // 删除事件后，保持按时间戳排序并重新编号
      const newEvents = assignEventIndexes(
        state.timeline.events.filter(e => e.id !== eventId)
      );

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

    moveEvent: (eventId: string, newTimestamp: StoryTimeStamp) => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return;

      // 更新事件的时间戳，然后重新排序
      const newEvents = assignEventIndexes(
        sortEventsByTimestamp(
          state.timeline.events.map(e =>
            e.id === eventId ? { ...e, timestamp: newTimestamp } : e
          )
        )
      );

      const newTimeline: WorldTimeline = {
        ...state.timeline,
        events: newEvents,
        totalTimeRange: calculateTimeRangeDisplay(newEvents),
        lastModified: Date.now()
      };

      useWorldTimelineStore.setState({ timeline: newTimeline });
      console.log('[WorldTimelineStore] 移动事件时间戳:', eventId, '到', newTimestamp);
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

      // 按时间戳排序
      return sortEventsByTimestamp(events);
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
    },

    // === Hook/Foreshadowing Extension Methods ===

    mapDurationToWindow: (duration: string) => {
      const mapped = DURATION_WINDOW_MAP[duration as keyof typeof DURATION_WINDOW_MAP];
      return mapped?.window ?? 10;
    },

    mapDurationToStrength: (duration: string) => {
      const mapped = DURATION_WINDOW_MAP[duration as keyof typeof DURATION_WINDOW_MAP];
      return mapped?.strength ?? 'medium';
    },

    getForeshadowingStats: (foreshadowings: ForeshadowingItem[], currentChapter: number = 1) => {
      const stats: ForeshadowingStats = {
        total: foreshadowings.length,
        pending: 0,
        fulfilled: 0,
        overdue: 0,
        totalRewardScore: 0,
        fulfilledRewardScore: 0,
        overdueRate: 0,
        byHookType: { crisis: { total: 0, fulfilled: 0, pending: 0 }, mystery: { total: 0, fulfilled: 0, pending: 0 }, emotion: { total: 0, fulfilled: 0, pending: 0 }, choice: { total: 0, fulfilled: 0, pending: 0 }, desire: { total: 0, fulfilled: 0, pending: 0 } },
        byStrength: { strong: { total: 0, fulfilled: 0, pending: 0 }, medium: { total: 0, fulfilled: 0, pending: 0 }, weak: { total: 0, fulfilled: 0, pending: 0 } }
      };

      for (const f of foreshadowings) {
        if (f.type === 'planted' || f.type === 'developed') {
          stats.pending++;
          // 计算状态
          const dueChapter = f.dueChapter ?? (f.window ? (f.sourceRef ? currentChapter : currentChapter) : currentChapter + (f.window ?? 10));
          if (dueChapter < currentChapter) {
            stats.overdue++;
          }
        } else if (f.type === 'resolved') {
          stats.fulfilled++;
        }

        // 奖励分
        if (f.rewardScore) {
          stats.totalRewardScore += f.rewardScore;
          if (f.type === 'resolved') {
            stats.fulfilledRewardScore += f.actualScore ?? f.rewardScore;
          }
        }

        // 按钩子类型统计
        if (f.hookType) {
          if (!stats.byHookType[f.hookType]) {
            stats.byHookType[f.hookType] = { total: 0, fulfilled: 0, pending: 0 };
          }
          stats.byHookType[f.hookType].total++;
          if (f.type === 'resolved') stats.byHookType[f.hookType].fulfilled++;
          else stats.byHookType[f.hookType].pending++;
        }

        // 按强度统计
        if (f.strength) {
          stats.byStrength[f.strength].total++;
          if (f.type === 'resolved') stats.byStrength[f.strength].fulfilled++;
          else stats.byStrength[f.strength].pending++;
        }
      }

      stats.overdueRate = stats.total > 0 ? stats.overdue / stats.total : 0;
      return stats;
    },

    getOverdueForeshadowings: (foreshadowings: ForeshadowingItem[], currentChapter: number) => {
      return foreshadowings.filter(f => {
        if (f.type === 'resolved') return false;
        const dueChapter = f.dueChapter ?? (currentChapter + (f.window ?? 10));
        return dueChapter < currentChapter;
      });
    },

    getExpiringForeshadowings: (foreshadowings: ForeshadowingItem[], currentChapter: number, withinChapters: number) => {
      return foreshadowings.filter(f => {
        if (f.type === 'resolved') return false;
        const dueChapter = f.dueChapter ?? (currentChapter + (f.window ?? 10));
        return dueChapter >= currentChapter && dueChapter <= currentChapter + withinChapters;
      });
    },

    // === 情绪曲线 ===

    getNodeEmotionCurve: () => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return [];

      return state.timeline.events
        .filter(e => e.emotions && e.emotions.length > 0)
        .map((e) => {
          const emotions = e.emotions as EmotionItem[];
          const totalScore = emotions.reduce((sum: number, item: EmotionItem) => sum + item.score, 0) as EmotionScore;
          const chapter = e.chapterId
            ? state.timeline!.chapters.find(c => c.id === e.chapterId)
            : undefined;

          return {
            eventId: e.id,
            chapterIndex: chapter?.chapterIndex ?? 0,
            eventIndex: e.eventIndex,
            emotions,
            totalScore,
            timestamp: e.timestamp
          } as NodeEmotionCurvePoint;
        });
    },

    getHookEmotionCurve: () => {
      const state = useWorldTimelineStore.getState();
      if (!state.timeline) return [];

      // 从 chapterAnalysisStore 获取伏笔数据
      const foreshadowings = useChapterAnalysisStore.getState().data.foreshadowing;
      const points: HookEmotionCurvePoint[] = [];

      for (const f of foreshadowings) {
        if (f.type === 'resolved' && !f.emotionReward) continue;

        const reward = f.emotionReward ?? DEFAULT_EMOTION_REWARD;
        const event = state.timeline.events.find(e => e.id === f.sourceRef);
        if (!event) continue;

        const chapter = event.chapterId
          ? state.timeline!.chapters.find(c => c.id === event.chapterId)
          : undefined;
        const dueChapter = f.dueChapter ?? (chapter?.chapterIndex ?? 0 + (f.window ?? 10));
        const isOverdue = f.type === 'resolved' && dueChapter < (chapter?.chapterIndex ?? 0);

        // 埋下时的情绪奖励
        if (f.type === 'planted' || f.type === 'developed' || f.type === 'resolved') {
          points.push({
            foreshadowingId: f.id,
            eventId: event.id,
            chapterIndex: chapter?.chapterIndex ?? 0,
            eventIndex: event.eventIndex,
            action: f.type === 'resolved' ? 'fulfilled' : (f.parentId ? 'advanced' : 'planted'),
            bonus: f.type === 'resolved'
              ? (isOverdue ? reward.fulfilled - 3 : reward.fulfilled)
              : (f.parentId ? reward.advanced : reward.planted),
            timestamp: event.timestamp,
            isOverdue
          });
        }
      }

      return points.sort((a, b) => {
        const aTime = a.chapterIndex * 1000 + a.eventIndex;
        const bTime = b.chapterIndex * 1000 + b.eventIndex;
        return aTime - bTime;
      });
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
