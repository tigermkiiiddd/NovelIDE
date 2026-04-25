/**
 * Outline 工具执行
 */

import { AIService } from '../../geminiService';
import { createRoutedAIService } from '../../modelRouter';
import { runTimelineSubAgent, TimelineInput, TimelineContext } from '../../subAgents/timelineAgent';
import { useAgentStore } from '../../../stores/agentStore';
import { useWorldTimelineStore, toHours } from '../../../stores/worldTimelineStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useChapterAnalysisStore } from '../../../stores/chapterAnalysisStore';
import { TimelineEvent, ChapterGroup, VolumeGroup, StoryLine, ForeshadowingItem } from '../../../types';

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
  getUnresolvedForeshadowingTool,
  getForeshadowingDetailTool,
  manageForeshadowingTool,
  allOutlineTools
} from '../toolDefinitions/timeline';

// ============================================
// 辅助函数
// ============================================

const getStore = () => useWorldTimelineStore.getState();
const getProjectId = () => useProjectStore.getState().getCurrentProject()?.id;

const findChapterByIndex = (chapterIndex: number) => {
  const chapters = getStore().getChapters();
  return chapters.find((c: ChapterGroup) => c.chapterIndex === chapterIndex) || null;
};

const findVolumeByIndex = (volumeIndex: number) => {
  const volumes = getStore().getVolumes();
  return volumes.find((v: VolumeGroup) => v.volumeIndex === volumeIndex) || null;
};

const findEventByIndex = (eventIndex: number) => {
  const events = getStore().getEvents();
  return events.find((e: TimelineEvent) => e.eventIndex === eventIndex) || null;
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

/**
 * 处理伏笔操作（创建新伏笔或继续已有伏笔）
 * @param foreshadowingData 伏笔数据列表
 * @param eventId 关联的事件 ID
 * @param eventChapterIndex 事件所属章节序号
 * @returns 处理的伏笔 ID 列表
 */
const processForeshadowings = (
  foreshadowingData: Array<{
    // 场景A：继续已有伏笔
    existingForeshadowingId?: string;
    // 场景B：创建新伏笔
    content?: string;
    // 通用字段
    type: 'planted' | 'developed' | 'resolved';
    tags: string[];
    notes?: string;
    // 章节量化
    plantedChapter?: number;
    plannedChapter?: number;
    // 钩子扩展
    hookType?: 'crisis' | 'mystery' | 'emotion' | 'choice' | 'desire';
    strength?: 'strong' | 'medium' | 'weak';
  }>,
  eventId: string,
  eventChapterIndex?: number
): string[] => {
  if (!foreshadowingData || foreshadowingData.length === 0) {
    return [];
  }

  const chapterAnalysisStore = useChapterAnalysisStore.getState();
  const processedIds: string[] = [];
  const TIMELINE_SOURCE = 'timeline';

  for (const item of foreshadowingData) {
    if (item.existingForeshadowingId) {
      // 场景A：继续已有伏笔（推进或收尾）- 创建子伏笔
      const parent = chapterAnalysisStore.getForeshadowingById(item.existingForeshadowingId);
      if (parent) {
        // 创建子伏笔作为推进/收尾记录
        const childId = chapterAnalysisStore.addForeshadowing({
          content: item.content || (item.type === 'resolved' ? '伏笔收尾' : '伏笔推进'),
          type: item.type,
          plantedChapter: parent.plantedChapter,
          plannedChapter: item.type === 'resolved' ? eventChapterIndex : parent.plannedChapter,
          resolvedChapter: item.type === 'resolved' ? eventChapterIndex : undefined,
          tags: item.tags && item.tags.length > 0 ? item.tags : parent.tags,
          notes: item.notes,
          source: TIMELINE_SOURCE,
          sourceRef: eventId,
          parentId: parent.id,  // 关联父伏笔
          createdAt: Date.now()
        });
        processedIds.push(childId);
      }
    } else if (item.content) {
      // 场景B：创建新伏笔（根伏笔）
      const id = chapterAnalysisStore.addForeshadowing({
        content: item.content,
        type: item.type,
        plantedChapter: item.plantedChapter ?? eventChapterIndex ?? 1,
        plannedChapter: item.plannedChapter,
        tags: item.tags,
        notes: item.notes,
        source: TIMELINE_SOURCE,
        sourceRef: eventId,
        createdAt: Date.now(),
        hookType: item.hookType,
        strength: item.strength,
        rewardScore: item.strength ? (item.strength === 'strong' ? 30 : item.strength === 'medium' ? 20 : 10) : undefined
      });
      processedIds.push(id);
    }
  }

  return processedIds;
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
  const volumeIdToIndex = new Map(existingVolumes.map((v: VolumeGroup) => [v.id, v.volumeIndex]));

  // 获取最新10个事件（按时间戳排序后的最后10个）
  const recentEvents = existingEvents.slice(-10).map((e: TimelineEvent) => ({
    eventIndex: e.eventIndex,
    timestamp: e.timestamp,
    title: e.title,
    content: e.content || '',
    duration: e.duration
  }));

  // 提取时间线最新位置
  const lastEvent = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1] : null;
  const lastEventTimestamp = lastEvent ? {
    day: lastEvent.timestamp.day,
    hour: lastEvent.timestamp.hour,
    ...(lastEvent.duration && { endHour: lastEvent.timestamp.hour + toHours(lastEvent.duration) })
  } : null;

  // 获取未完结伏笔（用于继续/收尾已有伏笔）
  const chapterAnalysisStore = useChapterAnalysisStore.getState();
  const unresolvedForeshadowing = chapterAnalysisStore.getUnresolvedForeshadowing();

  const context = {
    existingVolumeCount: existingVolumes.length,
    existingChapterCount: existingChapters.length,
    existingEventCount: existingEvents.length,
    volumeSummaries: existingVolumes.map((v: VolumeGroup) => ({ volumeIndex: v.volumeIndex, title: v.title })),
    chapterSummaries: existingChapters.map((c: ChapterGroup) => ({
      chapterIndex: c.chapterIndex,
      title: c.title,
      volumeIndex: c.volumeId ? (volumeIdToIndex.get(c.volumeId) ?? 0) : 0,
      eventCount: c.eventIds.length
    })),
    recentEvents,
    lastEventTimestamp,
    unresolvedForeshadowing: unresolvedForeshadowing.map((f: ForeshadowingItem & { children: ForeshadowingItem[] }) => ({
      id: f.id,
      content: f.content,
      type: f.type as 'planted' | 'developed',
      plantedChapter: f.plantedChapter,
      ...(f.plannedChapter !== undefined && { plannedChapter: f.plannedChapter }),
      tags: f.tags,
      source: f.source,
      sourceRef: f.sourceRef,
      notes: f.notes,
      hookType: f.hookType,
      strength: f.strength,
      rewardScore: f.rewardScore,
      ...(f.children.length > 0 && {
        children: f.children.map((c: ForeshadowingItem) => ({
          id: c.id,
          content: c.content,
          type: c.type,
          sourceRef: c.sourceRef,
          createdAt: c.createdAt
        }))
      })
    }))
  };

  const aiService = createRoutedAIService(agentStore.aiConfig, 'outline');
  const input: TimelineInput = {
    userInput: args.userInput,
    projectId: getProjectId() || '',
    mode: args.mode,
    instructions: args.instructions  // 传递主 agent 的指令
  };

  try {
    const result = await runTimelineSubAgent(aiService, input, context as TimelineContext, onUiLog, signal);
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
        events = events.filter((e: TimelineEvent) => eventIdSet.has(e.id));
      }

      if (fromIndex !== undefined || toIndex !== undefined) {
        const from = fromIndex ?? 0;
        const to = toIndex ?? Infinity;
        events = events.filter((e: TimelineEvent) => e.eventIndex >= from && e.eventIndex <= to);
      }

      const chapters = store.getChapters();
      const chapterIdToIndex = new Map(chapters.map((c: ChapterGroup) => [c.id, c.chapterIndex]));

      return JSON.stringify({
        total: events.length,
        events: events.map((e: TimelineEvent) => ({
          eventIndex: e.eventIndex,
          timestamp: e.timestamp,
          duration: e.duration,
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
        if (volume) chapters = chapters.filter((c: ChapterGroup) => c.volumeId === volume.id);
      }

      // 最多返回 40 条
      const MAX_CHAPTERS = 40;
      let truncated = false;
      let remaining = 0;

      if (fromIndex !== undefined || toIndex !== undefined) {
        const from = fromIndex ?? 0;
        const to = toIndex ?? Infinity;
        chapters = chapters.filter((c: ChapterGroup) => c.chapterIndex >= from && c.chapterIndex <= to);
      }

      if (chapters.length > MAX_CHAPTERS) {
        remaining = chapters.length - MAX_CHAPTERS;
        chapters = chapters.slice(0, MAX_CHAPTERS);
        truncated = true;
      }

      const volumes = store.getVolumes();
      const volumeIdToIndex = new Map(volumes.map((v: VolumeGroup) => [v.id, v.volumeIndex]));

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
        volumes: volumes.map((v: VolumeGroup) => ({
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
        storyLines: storyLines.map((s: StoryLine, i: number) => ({
          storyLineIndex: i,
          name: s.name,
          color: s.color,
          isMain: s.isMain
        }))
      });
    }

    case 'outline_getUnresolvedForeshadowing': {
      const chapterAnalysisStore = useChapterAnalysisStore.getState();
      let unresolvedWithChildren = chapterAnalysisStore.getUnresolvedForeshadowing();

      // 按标签筛选
      if (args.tags && args.tags.length > 0) {
        unresolvedWithChildren = unresolvedWithChildren.filter((f: ForeshadowingItem & { children: ForeshadowingItem[] }) =>
          f.tags.some((t: string) => args.tags.includes(t))
        );
      }

      // 按钩子类型筛选
      if (args.hookType) {
        unresolvedWithChildren = unresolvedWithChildren.filter((f: ForeshadowingItem & { children: ForeshadowingItem[] }) =>
          f.hookType === args.hookType
        );
      }

      // 按状态筛选
      if (args.status && args.status !== 'all') {
        unresolvedWithChildren = unresolvedWithChildren.filter((f: ForeshadowingItem & { children: ForeshadowingItem[] }) =>
          f.type === args.status
        );
      }

      return JSON.stringify({
        total: unresolvedWithChildren.length,
        foreshadowing: unresolvedWithChildren.map((f: ForeshadowingItem & { children: ForeshadowingItem[] }) => ({
          id: f.id,
          content: f.content,
          type: f.type,
          plantedChapter: f.plantedChapter,
          plannedChapter: f.plannedChapter,
          resolvedChapter: f.resolvedChapter,
          tags: f.tags,
          source: f.source,
          sourceRef: f.sourceRef,
          notes: f.notes,
          hookType: f.hookType,
          strength: f.strength,
          rewardScore: f.rewardScore,
          // 子伏笔（推进/收尾记录）
          children: f.children.map((c: ForeshadowingItem) => ({
            id: c.id,
            content: c.content,
            type: c.type as 'developed' | 'resolved',
            sourceRef: c.sourceRef,
            createdAt: c.createdAt
          }))
        }))
      });
    }

    case 'outline_getForeshadowingDetail': {
      const chapterAnalysisStore = useChapterAnalysisStore.getState();
      const foreshadowing = chapterAnalysisStore.getForeshadowingById(args.foreshadowingId);

      if (!foreshadowing) {
        return JSON.stringify({ error: '伏笔不存在' });
      }

      // 获取相关事件
      const event = store.timeline?.events.find(e => e.id === foreshadowing.sourceRef);
      const chapter = event?.chapterId
        ? store.timeline?.chapters.find(c => c.id === event.chapterId)
        : undefined;

      // 获取父伏笔信息
      const parentForeshadowing = foreshadowing.parentId
        ? chapterAnalysisStore.getForeshadowingById(foreshadowing.parentId)
        : null;

      return JSON.stringify({
        foreshadowing: {
          ...foreshadowing,
          chapterIndex: chapter?.chapterIndex,
          chapterTitle: chapter?.title,
          parent: parentForeshadowing ? {
            id: parentForeshadowing.id,
            content: parentForeshadowing.content,
            type: parentForeshadowing.type,
            plantedChapter: parentForeshadowing.plantedChapter,
            plannedChapter: parentForeshadowing.plannedChapter
          } : null,
          // 子伏笔（推进/收尾记录）
          children: (chapterAnalysisStore.getAllForeshadowing().filter(f => f.parentId === foreshadowing.id) as ForeshadowingItem[]).map((c) => ({
            id: c.id,
            content: c.content,
            type: c.type,
            sourceRef: c.sourceRef,
            createdAt: c.createdAt
          }))
        }
      });
    }

    case 'outline_manageForeshadowing': {
      const chapterAnalysisStore = useChapterAnalysisStore.getState();

      switch (args.action) {
        case 'update': {
          if (!args.foreshadowingId) {
            return JSON.stringify({ success: false, error: 'update 操作需要提供 foreshadowingId' });
          }
          const existing = chapterAnalysisStore.getForeshadowingById(args.foreshadowingId);
          if (!existing) {
            return JSON.stringify({ success: false, error: `伏笔 ${args.foreshadowingId} 不存在` });
          }
          chapterAnalysisStore.updateForeshadowing(args.foreshadowingId, args.updates || {});
          return JSON.stringify({
            success: true,
            message: `伏笔已更新: ${args.foreshadowingId}`,
            updatedFields: Object.keys(args.updates || {})
          });
        }

        case 'delete': {
          if (!args.foreshadowingId) {
            return JSON.stringify({ success: false, error: 'delete 操作需要提供 foreshadowingId' });
          }
          const existing = chapterAnalysisStore.getForeshadowingById(args.foreshadowingId);
          if (!existing) {
            return JSON.stringify({ success: false, error: `伏笔 ${args.foreshadowingId} 不存在` });
          }
          chapterAnalysisStore.deleteForeshadowing(args.foreshadowingId);
          return JSON.stringify({
            success: true,
            message: `伏笔已删除: ${args.foreshadowingId}`,
            deletedContent: existing.content
          });
        }

        case 'list': {
          const all = chapterAnalysisStore.getAllForeshadowing();
          const unresolved = chapterAnalysisStore.getUnresolvedForeshadowing();
          return JSON.stringify({
            success: true,
            total: all.length,
            unresolvedCount: unresolved.length,
            foreshadowings: all.map((f: ForeshadowingItem) => ({
              id: f.id,
              content: f.content,
              type: f.type,
              plantedChapter: f.plantedChapter,
              plannedChapter: f.plannedChapter,
              tags: f.tags,
              hookType: f.hookType,
              strength: f.strength,
              parentId: f.parentId
            }))
          });
        }

        case 'update_planned': {
          const batch = args.batchUpdates || [];
          if (!Array.isArray(batch) || batch.length === 0) {
            return JSON.stringify({ success: false, error: 'update_planned 需要提供 batchUpdates 数组' });
          }
          const results: any[] = [];
          for (const item of batch) {
            const existing = chapterAnalysisStore.getForeshadowingById(item.foreshadowingId);
            if (existing) {
              chapterAnalysisStore.updateForeshadowing(item.foreshadowingId, { plannedChapter: item.plannedChapter });
              results.push({ foreshadowingId: item.foreshadowingId, success: true, newPlannedChapter: item.plannedChapter });
            } else {
              results.push({ foreshadowingId: item.foreshadowingId, success: false, error: '伏笔不存在' });
            }
          }
          return JSON.stringify({ success: true, updated: results });
        }

        default:
          return JSON.stringify({ success: false, error: `未知 action: ${args.action}` });
      }
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
        // 检测时间戳回退：获取时间线最后一个事件的位置
        const allEventsBeforeAdd = store.getEvents();
        const lastEvt = allEventsBeforeAdd.length > 0 ? allEventsBeforeAdd[allEventsBeforeAdd.length - 1] : null;
        // 计算最后一个事件结束后的时间（分钟）
        const lastHours = lastEvt
          ? (lastEvt.timestamp.day - 1) * 24 * 60 + lastEvt.timestamp.hour * 60 + (lastEvt.timestamp.minute || 0) + (lastEvt.duration ? toHours(lastEvt.duration) * 60 : 0)
          : 0;

        for (const e of args.add) {
          // 校验：新事件 timestamp 不能早于时间线末尾
          const newMins = (e.timestamp.day - 1) * 24 * 60 + e.timestamp.hour * 60 + (e.timestamp.minute || 0);
          if (lastEvt && newMins < lastHours) {
            return JSON.stringify({
              success: false,
              error: `时间戳回退错误：新事件「${e.title}」的 timestamp（第${e.timestamp.day}天${e.timestamp.hour}时${e.timestamp.minute}分）早于时间线末尾（第${lastEvt.timestamp.day}天${lastEvt.timestamp.hour}时${lastEvt.timestamp.minute}分）。add 模式下新事件的 timestamp 必须接续当前时间线位置，请使用正确的绝对时间戳。`
            });
          }
          const eventData: any = { ...e };
          if (e.chapterIndex !== undefined) {
            const chapter = findChapterByIndex(e.chapterIndex);
            if (chapter) eventData.chapterId = chapter.id;
            delete eventData.chapterIndex;
          }
          // 暂存伏笔数据，先创建事件
          const foreshadowingData = e.foreshadowing;
          delete eventData.foreshadowing;

          // 创建事件
          const r = JSON.parse(store.addEvent(eventData));
          const eventId = r.id;

          // 处理伏笔（创建新伏笔或继续已有伏笔）
          let foreshadowingIds: string[] = [];
          if (foreshadowingData && foreshadowingData.length > 0) {
            foreshadowingIds = processForeshadowings(foreshadowingData, eventId, e.chapterIndex);
            // 如果有伏笔，更新事件的 foreshadowingIds
            if (foreshadowingIds.length > 0) {
              store.updateEvent(eventId, { foreshadowingIds });
            }
          }

          result.added.push({
            title: e.title,
            eventIndex: r.eventIndex,
            foreshadowingCount: foreshadowingIds.length
          });
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
            if (unit === 'hour') totalDurationHours += value;
            else if (unit === 'day') totalDurationHours += value * 24;
            else totalDurationHours += value / 60; // minute fallback
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

        // 计算插入点的时间戳（以分钟为单位）
        let insertAfterMinutes: number;
        if (afterEvent) {
          insertAfterMinutes = (afterEvent.timestamp.day - 1) * 24 * 60 + afterEvent.timestamp.hour * 60 + (afterEvent.timestamp.minute || 0);
          // 加上 afterEvent 自己的持续时间
          if (afterEvent.duration) {
            const durationMinutes = afterEvent.duration.unit === 'hour' ? afterEvent.duration.value * 60 :
                                    afterEvent.duration.value * 24 * 60;
            insertAfterMinutes += durationMinutes;
          }
        } else {
          // 在最前面插入，从第一个事件之前开始
          if (allEvents.length > 0) {
            insertAfterMinutes = (allEvents[0].timestamp.day - 1) * 24 * 60 + allEvents[0].timestamp.hour * 60 + (allEvents[0].timestamp.minute || 0);
          } else {
            insertAfterMinutes = 8 * 60; // 默认第1天8点
          }
        }

        // 偏移后续事件的时间戳
        const afterEventId = afterEvent?.id;
        const shouldShift = (e: TimelineEvent) => {
          if (!afterEvent) return true; // 在最前面插入，所有事件都偏移
          // 在 afterEvent 之后的事件才偏移
          const eMins = (e.timestamp.day - 1) * 24 * 60 + e.timestamp.hour * 60 + (e.timestamp.minute || 0);
          const afterMins = (afterEvent.timestamp.day - 1) * 24 * 60 + afterEvent.timestamp.hour * 60 + (afterEvent.timestamp.minute || 0);
          return eMins > afterMins || (eMins === afterMins && e.eventIndex > afterEvent.eventIndex);
        };

        for (const e of allEvents) {
          if (shouldShift(e)) {
            const oldMins = (e.timestamp.day - 1) * 24 * 60 + e.timestamp.hour * 60 + (e.timestamp.minute || 0);
            const newMins = oldMins + totalDurationHours * 60;
            const newTimestamp = {
              day: Math.floor(newMins / (24 * 60)) + 1,
              hour: Math.floor((newMins % (24 * 60)) / 60),
              minute: Math.round(newMins % 60)
            };
            store.updateEvent(e.id, { timestamp: newTimestamp });
          }
        }

        // 插入新事件
        let currentMinutes = insertAfterMinutes;
        for (const e of events) {
          const durationMinutes = e.duration
            ? (e.duration.unit === 'hour' ? e.duration.value * 60 :
               e.duration.value * 24 * 60)
            : 60; // 默认1小时

          const totalMins = currentMinutes;
          const timestamp = {
            day: Math.floor(totalMins / (24 * 60)) + 1,
            hour: Math.floor((totalMins % (24 * 60)) / 60),
            minute: totalMins % 60
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

          // 暂存伏笔数据，先创建事件
          const foreshadowingData = e.foreshadowing;

          // 创建事件
          const r = JSON.parse(store.addEvent(eventData));
          const eventId = r.id;

          // 处理伏笔（创建新伏笔或继续已有伏笔）
          let foreshadowingIds: string[] = [];
          if (foreshadowingData && foreshadowingData.length > 0) {
            foreshadowingIds = processForeshadowings(foreshadowingData, eventId, e.chapterIndex);
            // 如果有伏笔，更新事件的 foreshadowingIds
            if (foreshadowingIds.length > 0) {
              store.updateEvent(eventId, { foreshadowingIds });
            }
          }

          result.inserted.push({
            title: e.title,
            eventIndex: r.eventIndex,
            foreshadowingCount: foreshadowingIds.length
          });

          currentMinutes += durationMinutes;
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
