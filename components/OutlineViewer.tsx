/**
 * OutlineViewer.tsx
 * 时间线编辑器 - 管理事件、章节和卷
 *
 * 层级结构：事件 → 章节 → 卷
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Clock, Plus, Pencil, ChevronDown, ChevronRight
} from 'lucide-react';
import { useWorldTimelineStore, formatTimeDisplay } from '../stores/worldTimelineStore';
import { useProjectStore } from '../stores/projectStore';
import { TimelineEvent, ChapterGroup, VolumeGroup, StoryLine } from '../types';

interface OutlineViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

type TimelineLevel = 'events' | 'chapters' | 'volumes';

// 事件表单数据类型
interface EventFormData {
  timeValue: number;
  timeUnit: 'hour' | 'day';
  title: string;
  content: string;
  location: string;
  characters: string;
  emotion: string;
  storyLineId: string;
  chapterId: string;  // 所属章节
}

// === 独立的 EventForm 组件（避免内部定义导致的重渲染问题）===
const EventForm = React.memo(({
  formData,
  storyLines,
  chapters,
  onFieldChange,
  onSubmit,
  onCancel,
  onQuickCreateChapter
}: {
  formData: EventFormData;
  storyLines: { id: string; name: string }[];
  chapters: { id: string; chapterIndex: number; title: string; volumeId?: string }[];
  onFieldChange: (field: keyof EventFormData, value: any) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onQuickCreateChapter?: (title: string) => Promise<string | null>; // 返回新章节ID
}) => {
  const previewTime = formatTimeDisplay({ value: formData.timeValue, unit: formData.timeUnit });
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateTitle, setQuickCreateTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-700">
      {/* 时间输入：数值 + 单位 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500">时间数值</label>
          <input
            type="number"
            min="0"
            step="1"
            value={formData.timeValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onFieldChange('timeValue', 0);
              } else {
                const num = parseInt(val);
                if (!isNaN(num) && num >= 0) {
                  onFieldChange('timeValue', num);
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">单位</label>
          <select
            value={formData.timeUnit}
            onChange={(e) => onFieldChange('timeUnit', e.target.value as 'hour' | 'day')}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="hour">小时</option>
            <option value="day">天</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">显示预览</label>
          <div className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-blue-300">
            {previewTime}
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">事件标题</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => onFieldChange('title', e.target.value)}
          placeholder="事件标题"
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">事件内容</label>
        <textarea
          value={formData.content}
          onChange={(e) => onFieldChange('content', e.target.value)}
          placeholder="事件详细描述..."
          rows={3}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">地点</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => onFieldChange('location', e.target.value)}
            placeholder="事件地点"
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">出场角色（逗号分隔）</label>
          <input
            type="text"
            value={formData.characters}
            onChange={(e) => onFieldChange('characters', e.target.value)}
            placeholder="角色A, 角色B"
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">情绪氛围</label>
          <input
            type="text"
            value={formData.emotion}
            onChange={(e) => onFieldChange('emotion', e.target.value)}
            placeholder="紧张、温馨、压抑..."
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">故事线</label>
          <select
            value={formData.storyLineId}
            onChange={(e) => onFieldChange('storyLineId', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="">默认主线</option>
            {storyLines.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">所属章节（可选）</label>
        {showQuickCreate ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={quickCreateTitle}
              onChange={(e) => setQuickCreateTitle(e.target.value)}
              placeholder="输入章节标题"
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              autoFocus
              disabled={isCreating}
            />
            <button
              onClick={async () => {
                if (!quickCreateTitle.trim() || !onQuickCreateChapter) return;
                setIsCreating(true);
                const newId = await onQuickCreateChapter(quickCreateTitle.trim());
                setIsCreating(false);
                if (newId) {
                  onFieldChange('chapterId', newId);
                  setShowQuickCreate(false);
                  setQuickCreateTitle('');
                }
              }}
              disabled={!quickCreateTitle.trim() || isCreating}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded text-sm"
            >
              {isCreating ? '...' : '创建'}
            </button>
            <button
              onClick={() => {
                setShowQuickCreate(false);
                setQuickCreateTitle('');
              }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <select
            value={formData.chapterId}
            onChange={(e) => {
              if (e.target.value === '__quick_create__') {
                setShowQuickCreate(true);
              } else {
                onFieldChange('chapterId', e.target.value);
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="">未分类</option>
            {chapters.map(c => (
              <option key={c.id} value={c.id}>第{c.chapterIndex}章「{c.title}」</option>
            ))}
            <option value="__quick_create__">➕ 快速创建章节</option>
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onSubmit} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm">
          确认
        </button>
        <button onClick={onCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm">
          取消
        </button>
      </div>
    </div>
  );
});

// === Chapter Form Component ===
const ChapterForm = React.memo(({
  mode,
  formData,
  volumes,
  onFieldChange,
  onSubmit,
  onCancel,
  onQuickCreateVolume
}: {
  mode: 'add' | 'edit';
  formData: { title: string; summary: string; volumeId: string };
  volumes: { id: string; volumeIndex: number; title: string }[];
  onFieldChange: (field: string, value: any) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onQuickCreateVolume?: (title: string) => Promise<string | null>;
}) => {
  const [showQuickCreateVolume, setShowQuickCreateVolume] = useState(false);
  const [quickVolumeTitle, setQuickVolumeTitle] = useState('');
  const [isCreatingVolume, setIsCreatingVolume] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-blue-500 mb-4">
      <div>
        <label className="text-xs text-gray-500">章节标题</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => onFieldChange('title', e.target.value)}
          placeholder="第一章"
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">章节概要</label>
        <textarea
          value={formData.summary}
          onChange={(e) => onFieldChange('summary', e.target.value)}
          placeholder="章节概要..."
          rows={2}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">所属卷（可选）</label>
        {showQuickCreateVolume ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={quickVolumeTitle}
              onChange={(e) => setQuickVolumeTitle(e.target.value)}
              placeholder="输入卷标题"
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              autoFocus
              disabled={isCreatingVolume}
            />
            <button
              onClick={async () => {
                if (!quickVolumeTitle.trim() || !onQuickCreateVolume) return;
                setIsCreatingVolume(true);
                const newId = await onQuickCreateVolume(quickVolumeTitle.trim());
                setIsCreatingVolume(false);
                if (newId) {
                  onFieldChange('volumeId', newId);
                  setShowQuickCreateVolume(false);
                  setQuickVolumeTitle('');
                }
              }}
              disabled={!quickVolumeTitle.trim() || isCreatingVolume}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded text-sm"
            >
              {isCreatingVolume ? '...' : '创建'}
            </button>
            <button
              onClick={() => {
                setShowQuickCreateVolume(false);
                setQuickVolumeTitle('');
              }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <select
            value={formData.volumeId}
            onChange={(e) => {
              if (e.target.value === '__quick_create__') {
                setShowQuickCreateVolume(true);
              } else {
                onFieldChange('volumeId', e.target.value);
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="">未分组</option>
            {volumes.map(v => (
              <option key={v.id} value={v.id}>第{v.volumeIndex}卷「{v.title}」</option>
            ))}
            <option value="__quick_create__">➕ 快速创建卷</option>
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onSubmit} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm">
          {mode === 'edit' ? '保存' : '确认'}
        </button>
        <button onClick={onCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm">
          取消
        </button>
      </div>
    </div>
  );
});

// === Chapter Card Component ===
const ChapterCard = React.memo(({
  chapter,
  isEditing,
  onEdit,
  onDelete
}: {
  chapter: { id: string; chapterIndex: number; title: string; summary?: string; eventIds: string[] };
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">第{chapter.chapterIndex}章</span>
          <h4 className="font-medium text-gray-200 truncate">{chapter.title}</h4>
        </div>
        {chapter.summary && (
          <p className="text-xs text-gray-400 mt-1 truncate">{chapter.summary}</p>
        )}
        <div className="text-xs text-gray-500 mt-1">
          {chapter.eventIds.length} 个事件
        </div>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onEdit}
          className="p-1 text-gray-500 hover:text-blue-400"
          title="编辑"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-500 hover:text-red-400"
          title="删除"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
});

// === Event Card Component (memoized for performance) ===
interface EventCardProps {
  event: TimelineEvent;
  storyLineColor: string;
  storyLineName?: string;
  chapterInfo?: { chapterIndex: number; title: string } | null;
  showChapterInfo?: boolean;
  onEdit: (eventId: string) => void;
  onDelete: (eventId: string) => void;
}

const EventCard = React.memo(({ event, storyLineColor, storyLineName, chapterInfo, showChapterInfo, onEdit, onDelete }: EventCardProps) => {
  const handleEdit = useCallback(() => onEdit(event.id), [event.id, onEdit]);
  const handleDelete = useCallback(() => onDelete(event.id), [event.id, onDelete]);

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">#{event.eventIndex}</span>
            {event.time && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded">
                {formatTimeDisplay(event.time)}
              </span>
            )}
            {storyLineName && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: storyLineColor + '30', color: storyLineColor }}>
                {storyLineName}
              </span>
            )}
          </div>
          <h5 className="font-medium text-gray-200">{event.title}</h5>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleEdit}
            className="text-gray-500 hover:text-blue-400"
            title="编辑"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="text-gray-500 hover:text-red-400"
            title="删除"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showChapterInfo && chapterInfo && (
        <div className="text-xs text-gray-500 mb-2">
          所属章节：第{chapterInfo.chapterIndex}章「{chapterInfo.title}」
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
        {event.location && <span>📍 {event.location}</span>}
        {event.characters && event.characters.length > 0 && <span>👥 {event.characters.join(', ')}</span>}
        {event.emotion && <span>💫 {event.emotion}</span>}
      </div>

      {event.content && (
        <p className="text-sm text-gray-300 mt-2">{event.content}</p>
      )}
    </div>
  );
});

// === Volume Section Component ===
const VolumeSection = React.memo(({
  volume,
  chapters,
  editingChapterId,
  editingVolumeId,
  newVolume,
  onEditChapter,
  onDeleteChapter,
  onEditVolume,
  onSaveVolume,
  onCancelVolume,
  onDeleteVolume,
  newChapter,
  onChapterFieldChange,
  onSaveChapter,
  onCancelChapter,
  onQuickCreateVolume,
  volumes
}: {
  volume: { id: string; volumeIndex: number; title: string; description?: string };
  chapters: Array<{ id: string; chapterIndex: number; title: string; summary?: string; eventIds: string[]; volumeId?: string }>;
  editingChapterId: string | null;
  editingVolumeId: string | null;
  newVolume: { volumeIndex: number; title: string; description: string };
  onEditChapter: (chapter: any) => void;
  onDeleteChapter: (id: string) => void;
  onEditVolume: (volume: any) => void;
  onSaveVolume: () => void;
  onCancelVolume: () => void;
  onDeleteVolume: (id: string) => void;
  newChapter: { title: string; summary: string; volumeId: string };
  onChapterFieldChange: (field: string, value: any) => void;
  onSaveChapter: () => void;
  onCancelChapter: () => void;
  onQuickCreateVolume?: (title: string) => Promise<string | null>;
  volumes: { id: string; volumeIndex: number; title: string }[];
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const totalEvents = chapters.reduce((sum, ch) => sum + ch.eventIds.length, 0);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Volume Header */}
      {editingVolumeId === volume.id ? (
        <div className="bg-gray-800 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">卷序号</label>
              <input
                type="number"
                min="1"
                value={newVolume.volumeIndex}
                onChange={(e) => onEditVolume({ ...volume, volumeIndex: parseInt(e.target.value) || 1 })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">卷标题</label>
              <input
                type="text"
                value={newVolume.title}
                onChange={(e) => onEditVolume({ ...volume, title: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">卷描述</label>
            <input
              type="text"
              value={newVolume.description}
              onChange={(e) => onEditVolume({ ...volume, description: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveVolume} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1 text-sm">保存</button>
            <button onClick={onCancelVolume} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1 text-sm">取消</button>
          </div>
        </div>
      ) : (
        <div
          className="bg-gray-800/80 p-3 flex items-center justify-between cursor-pointer hover:bg-gray-800"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
            <span className="text-xs text-gray-500">第{volume.volumeIndex}卷</span>
            <h3 className="font-medium text-gray-200">{volume.title}</h3>
            <span className="text-xs text-gray-500">({chapters.length}章 / {totalEvents}事件)</span>
          </div>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEditVolume(volume)}
              className="p-1 text-gray-500 hover:text-blue-400"
              title="编辑卷"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDeleteVolume(volume.id)}
              className="p-1 text-gray-500 hover:text-red-400"
              title="删除卷"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Chapters in Volume */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-gray-900/50">
          {chapters.map(chapter => (
            editingChapterId === chapter.id ? (
              <ChapterForm
                key={chapter.id}
                mode="edit"
                formData={newChapter}
                volumes={volumes}
                onFieldChange={onChapterFieldChange}
                onSubmit={onSaveChapter}
                onCancel={onCancelChapter}
                onQuickCreateVolume={onQuickCreateVolume}
              />
            ) : (
              <ChapterCard
                key={chapter.id}
                chapter={chapter}
                isEditing={false}
                onEdit={() => onEditChapter(chapter)}
                onDelete={() => onDeleteChapter(chapter.id)}
              />
            )
          ))}
          {chapters.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-4">暂无章节</div>
          )}
        </div>
      )}
    </div>
  );
});

const OutlineViewer: React.FC<OutlineViewerProps> = ({ isOpen, onClose }) => {
  // 视图状态
  const [timelineLevel, setTimelineLevel] = useState<TimelineLevel>('events');

  // 创建表单状态
  const [showAddVolume, setShowAddVolume] = useState(false);
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [showAddChapter, setShowAddChapter] = useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState<boolean>(false);
  const [newVolume, setNewVolume] = useState({ volumeIndex: 1, title: '', description: '' });
  const [newChapter, setNewChapter] = useState({ title: '', summary: '', volumeId: '' });

  // Event form states
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    timeValue: 8,
    timeUnit: 'hour' as 'hour' | 'day',
    title: '',
    content: '',
    location: '',
    characters: '',
    emotion: '',
    storyLineId: '',
    chapterId: ''
  });

  // Store - 使用 worldTimelineStore 作为唯一数据源
  const timeline = useWorldTimelineStore(state => state.timeline);
  const isLoading = useWorldTimelineStore(state => state.isLoading);
  const loadTimeline = useWorldTimelineStore(state => state.loadTimeline);
  const addEvent = useWorldTimelineStore(state => state.addEvent);
  const updateEvent = useWorldTimelineStore(state => state.updateEvent);
  const deleteEvent = useWorldTimelineStore(state => state.deleteEvent);
  const addChapter = useWorldTimelineStore(state => state.addChapter);
  const updateChapter = useWorldTimelineStore(state => state.updateChapter);
  const addVolume = useWorldTimelineStore(state => state.addVolume);
  const updateVolume = useWorldTimelineStore(state => state.updateVolume);
  const deleteVolume = useWorldTimelineStore(state => state.deleteVolume);
  const deleteChapter = useWorldTimelineStore(state => state.deleteChapter);
  const getEvents = useWorldTimelineStore(state => state.getEvents);
  const getChapters = useWorldTimelineStore(state => state.getChapters);
  const getVolumes = useWorldTimelineStore(state => state.getVolumes);
  const getStoryLines = useWorldTimelineStore(state => state.getStoryLines);
  const getTimeRange = useWorldTimelineStore(state => state.getTimeRange);
  const addChaptersToVolume = useWorldTimelineStore(state => state.addChaptersToVolume);
  const currentProjectId = useProjectStore(state => state.currentProjectId);

  // 缓存数据，避免每次渲染返回新数组
  // 使用具体的数组引用作为依赖，避免整个 timeline 对象变化触发重新计算
  const cachedChapters = useMemo(() => {
    return timeline?.chapters ? getChapters() : [];
  }, [timeline?.chapters]);

  const cachedVolumes = useMemo(() => {
    return timeline?.volumes ? getVolumes() : [];
  }, [timeline?.volumes]);

  const cachedStoryLines = useMemo(() => {
    return timeline?.storyLines ? getStoryLines() : [];
  }, [timeline?.storyLines]);

  // 加载时间线数据
  useEffect(() => {
    if (isOpen && currentProjectId && !timeline) {
      loadTimeline(currentProjectId);
    }
  }, [isOpen, currentProjectId, timeline, loadTimeline]);

  if (!isOpen) return null;

  // === Timeline Handlers ===

  const handleAddTimelineEvent = async () => {
    if (!newEvent.title.trim()) return;
    if (!timeline && currentProjectId) {
      await loadTimeline(currentProjectId);
    }
    if (!timeline) return;

    addEvent({
      time: {
        value: newEvent.timeValue,
        unit: newEvent.timeUnit
      },
      title: newEvent.title.trim(),
      content: newEvent.content.trim(),
      location: newEvent.location.trim(),
      characters: newEvent.characters.split(',').map(c => c.trim()).filter(Boolean),
      emotion: newEvent.emotion.trim(),
      storyLineId: newEvent.storyLineId || undefined,
      chapterId: newEvent.chapterId || undefined
    });
    setNewEvent({
      timeValue: newEvent.timeValue + (newEvent.timeUnit === 'hour' ? 4 : 1),
      timeUnit: newEvent.timeUnit,
      title: '',
      content: '',
      location: '',
      characters: '',
      emotion: '',
      storyLineId: '',
      chapterId: ''
    });
    setShowAddEvent(false);
  };

  const handleDeleteTimelineEvent = useCallback((eventId: string) => {
    deleteEvent(eventId);
  }, [deleteEvent]);

  const handleStartEditEvent = useCallback((event: TimelineEvent) => {
    setEditingEventId(event.id);
    setNewEvent({
      timeValue: event.time?.value || 0,
      timeUnit: event.time?.unit || 'hour',
      title: event.title,
      content: event.content,
      location: event.location || '',
      characters: event.characters?.join(', ') || '',
      emotion: event.emotion || '',
      storyLineId: event.storyLineId || '',
      chapterId: event.chapterId || ''
    });
    setShowAddEvent(false);
  }, []);

  // 稳定的编辑回调 - 供 EventCard 使用
  const handleEventEdit = useCallback((eventId: string) => {
    const events = getEvents();
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    handleStartEditEvent(event);
  }, [getEvents, handleStartEditEvent]);

  const handleSaveEditEvent = () => {
    if (!editingEventId || !newEvent.title.trim()) return;
    updateEvent(editingEventId, {
      time: {
        value: newEvent.timeValue,
        unit: newEvent.timeUnit
      },
      title: newEvent.title.trim(),
      content: newEvent.content.trim(),
      location: newEvent.location.trim() || undefined,
      characters: newEvent.characters ? newEvent.characters.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      emotion: newEvent.emotion.trim() || undefined,
      storyLineId: newEvent.storyLineId || undefined,
      chapterId: newEvent.chapterId || undefined
    });
    setEditingEventId(null);
    setNewEvent({
      timeValue: 8,
      timeUnit: 'hour',
      title: '',
      content: '',
      location: '',
      characters: '',
      emotion: '',
      storyLineId: '',
      chapterId: ''
    });
  };

  const handleCancelEditEvent = () => {
    setEditingEventId(null);
    setNewEvent({
      timeValue: 8,
      timeUnit: 'hour',
      title: '',
      content: '',
      location: '',
      characters: '',
      emotion: '',
      storyLineId: '',
      chapterId: ''
    });
  };

  const handleAddTimelineChapter = () => {
    if (!newChapter.title.trim()) {
      console.warn('[OutlineViewer] 章节标题不能为空');
      return;
    }

    const result = addChapter({
      title: newChapter.title.trim(),
      summary: newChapter.summary.trim(),
      volumeId: newChapter.volumeId || undefined
    });

    // 解析返回结果
    try {
      const parsed = JSON.parse(result);
      if (parsed.existing) {
        console.log('[OutlineViewer] 章节序号已存在，已自动关联');
      }
    } catch {
      // 忽略解析错误
    }

    setNewChapter({ title: '', summary: '', volumeId: '' });
    setShowAddChapter(null);
  };

  // 开始编辑章节
  const handleStartEditChapter = useCallback((chapter: { id: string; chapterIndex: number; title: string; summary?: string; volumeId?: string }) => {
    setEditingChapterId(chapter.id);
    setNewChapter({
      title: chapter.title,
      summary: chapter.summary || '',
      volumeId: chapter.volumeId || ''
    });
    setShowAddChapter(null);
  }, []);

  // 保存编辑的章节
  const handleSaveEditChapter = () => {
    if (!editingChapterId || !newChapter.title.trim()) return;
    updateChapter(editingChapterId, {
      title: newChapter.title.trim(),
      summary: newChapter.summary.trim(),
      volumeId: newChapter.volumeId || undefined
    });
    setEditingChapterId(null);
    setNewChapter({ title: '', summary: '', volumeId: '' });
  };

  // 取消编辑章节
  const handleCancelEditChapter = () => {
    setEditingChapterId(null);
    setNewChapter({ title: '', summary: '', volumeId: '' });
  };

  // 快速创建卷（从章节表单调用）
  const handleQuickCreateVolume = useCallback(async (title: string): Promise<string | null> => {
    if (!title.trim()) return null;

    const existingVolumes = getVolumes();
    const maxIndex = existingVolumes.reduce((max, v) => Math.max(max, v.volumeIndex), 0);
    const nextIndex = maxIndex + 1;

    const result = addVolume({
      volumeIndex: nextIndex,
      title: title.trim(),
      description: ''
    });

    try {
      const parsed = JSON.parse(result);
      return parsed.id || null;
    } catch {
      return null;
    }
  }, [getVolumes, addVolume]);

  // 快速创建章节（从事件表单调用）
  const handleQuickCreateChapter = useCallback(async (title: string): Promise<string | null> => {
    if (!title.trim()) return null;

    // 自动计算下一个章节序号
    const result = addChapter({
      title: title.trim(),
      summary: ''
    });

    // addChapter 返回 JSON 字符串，需要解析
    try {
      const parsed = JSON.parse(result);
      return parsed.id || null;
    } catch {
      return null;
    }
  }, [getChapters, addChapter]);

  const handleAddTimelineVolume = () => {
    if (!newVolume.title.trim()) return;
    addVolume({
      volumeIndex: newVolume.volumeIndex,
      title: newVolume.title.trim(),
      description: newVolume.description.trim()
    });
    setNewVolume({ volumeIndex: newVolume.volumeIndex + 1, title: '', description: '' });
    setShowAddVolume(false);
  };

  // 事件表单字段变更处理（用 useCallback 缓存）
  const handleEventFieldChange = useCallback((field: keyof EventFormData, value: any) => {
    setNewEvent(prev => ({ ...prev, [field]: value }));
  }, []);

  // === Performance: Map lookups for O(1) access ===
  const storyLineMap = useMemo(() =>
    new Map<string, StoryLine>(cachedStoryLines.map(s => [s.id, s])),
    [cachedStoryLines]
  );

  const chapterMap = useMemo(() =>
    new Map<string, ChapterGroup>(cachedChapters.map(c => [c.id, c])),
    [cachedChapters]
  );

  // === Performance: Memoize event list to avoid re-sorting on every render ===
  const cachedEvents = useMemo(() => getEvents(), [timeline?.events]);

  // === Performance: Memoize chapters and volumes ===
  const cachedChaptersList = useMemo(() => getChapters(), [timeline?.chapters]);
  const cachedVolumesList = useMemo(() => getVolumes(), [timeline?.volumes]);

  // === Performance: Memoize chaptersByVolume grouping ===
  const chaptersByVolume = useMemo(() => {
    const map = new Map<string | undefined, ChapterGroup[]>();
    cachedChaptersList.forEach(ch => {
      const vid = ch.volumeId || undefined;
      if (!map.has(vid)) map.set(vid, []);
      map.get(vid)!.push(ch);
    });
    return map;
  }, [cachedChaptersList]);

  // === Render ===
  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Clock size={20} className="text-blue-400" />
          <span className="font-semibold text-lg">时间线</span>
          {timeline && (
            <span className="text-sm text-gray-400">({getTimeRange() || '暂无时间'})</span>
          )}
        </div>

        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-gray-500">加载时间线...</span>
          </div>
        ) : !timeline ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Clock size={32} className="mb-2 opacity-50" />
            <p>时间线未初始化</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Timeline Level Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setTimelineLevel('events')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineLevel === 'events' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  事件
                </button>
                <button
                  onClick={() => setTimelineLevel('chapters')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineLevel === 'chapters' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  章节
                </button>
              </div>

              {/* === Events Level === */}
              {timelineLevel === 'events' && (
                <>
                  {/* Add Event Button */}
              {!showAddEvent && (
                <button
                  onClick={() => setShowAddEvent(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors"
                >
                  <Plus size={16} />
                  <span>添加事件</span>
                </button>
              )}

              {showAddEvent && (
                <EventForm
                  formData={newEvent}
                  storyLines={cachedStoryLines}
                  chapters={cachedChapters}
                  onFieldChange={handleEventFieldChange}
                  onSubmit={handleAddTimelineEvent}
                  onCancel={() => setShowAddEvent(false)}
                  onQuickCreateChapter={handleQuickCreateChapter}
                />
              )}

              {/* Events */}
              {(() => {
                if (cachedEvents.length === 0 && !showAddEvent) {
                  return (
                    <div className="text-gray-500 text-sm text-center py-8">
                      暂无事件，请添加事件或使用 Agent 生成时间线
                    </div>
                  );
                }

                return (
                  <div className="relative">
                    {/* Timeline Line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />

                    {/* Event Count */}
                    <div className="mb-4 ml-10 text-sm text-gray-500">
                      共 {cachedEvents.length} 个事件
                    </div>

                    {/* Events - using optimized EventCard with Map lookups */}
                    {cachedEvents.map((event) => {
                      const storyLine = storyLineMap.get(event.storyLineId);
                      const chapter = event.chapterId ? chapterMap.get(event.chapterId) : null;

                      return (
                        <div key={event.id} className="relative pl-10 pb-4 last:pb-0">
                          {/* Timeline Dot */}
                          <div
                            className="absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-gray-900"
                            style={{ backgroundColor: storyLine?.color || '#4A90D9' }}
                          />

                          {/* Event Card or Edit Form */}
                          {editingEventId === event.id ? (
                            <div className="bg-gray-800 rounded-lg p-4 border border-blue-500">
                              <EventForm
                                formData={newEvent}
                                storyLines={cachedStoryLines}
                                chapters={cachedChapters}
                                onFieldChange={handleEventFieldChange}
                                onSubmit={handleSaveEditEvent}
                                onCancel={handleCancelEditEvent}
                                onQuickCreateChapter={handleQuickCreateChapter}
                              />
                            </div>
                          ) : (
                            <EventCard
                              event={event}
                              storyLineColor={storyLine?.color || '#4A90D9'}
                              storyLineName={storyLine?.name}
                              chapterInfo={chapter ? { chapterIndex: chapter.chapterIndex, title: chapter.title } : null}
                              showChapterInfo
                              onEdit={handleEventEdit}
                              onDelete={handleDeleteTimelineEvent}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
                </>
              )}

              {/* === Chapters Level === */}
              {timelineLevel === 'chapters' && (
                <>
                  {/* Add Chapter Button */}
                  {!showAddChapter && !editingChapterId && (
                    <button
                      onClick={() => setShowAddChapter('new')}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors mb-4"
                    >
                      <Plus size={16} />
                      <span>添加章节</span>
                    </button>
                  )}

                  {/* Add/Edit Chapter Form */}
                  {(showAddChapter || editingChapterId) && (
                    <ChapterForm
                      mode={editingChapterId ? 'edit' : 'add'}
                      formData={newChapter}
                      volumes={cachedVolumes}
                      onFieldChange={(field, value) => setNewChapter(prev => ({ ...prev, [field]: value }))}
                      onSubmit={editingChapterId ? handleSaveEditChapter : handleAddTimelineChapter}
                      onCancel={editingChapterId ? handleCancelEditChapter : () => setShowAddChapter(null)}
                      onQuickCreateVolume={handleQuickCreateVolume}
                    />
                  )}

                  {/* Chapters grouped by Volume */}
                  {(() => {
                    if (cachedChaptersList.length === 0 && cachedVolumesList.length === 0) {
                      return (
                        <div className="text-gray-500 text-sm text-center py-8">
                          暂无章节，点击上方按钮添加
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {/* 有卷分组的章节 */}
                        {cachedVolumesList.map(volume => {
                          const volumeChapters = chaptersByVolume.get(volume.id) || [];
                          return (
                            <VolumeSection
                              key={volume.id}
                              volume={volume}
                              chapters={volumeChapters}
                              editingChapterId={editingChapterId}
                              editingVolumeId={editingVolumeId}
                              newVolume={newVolume}
                              onEditChapter={handleStartEditChapter}
                              onDeleteChapter={deleteChapter}
                              onEditVolume={(v) => {
                                setEditingVolumeId(v.id);
                                setNewVolume({ volumeIndex: v.volumeIndex, title: v.title, description: v.description || '' });
                              }}
                              onSaveVolume={() => {
                                if (!editingVolumeId) return;
                                updateVolume(editingVolumeId, {
                                  volumeIndex: newVolume.volumeIndex,
                                  title: newVolume.title.trim(),
                                  description: newVolume.description.trim()
                                });
                                setEditingVolumeId(null);
                                setNewVolume({ volumeIndex: 1, title: '', description: '' });
                              }}
                              onCancelVolume={() => {
                                setEditingVolumeId(null);
                                setNewVolume({ volumeIndex: 1, title: '', description: '' });
                              }}
                              onDeleteVolume={deleteVolume}
                              newChapter={newChapter}
                              onChapterFieldChange={(field, value) => setNewChapter(prev => ({ ...prev, [field]: value }))}
                              onSaveChapter={handleSaveEditChapter}
                              onCancelChapter={handleCancelEditChapter}
                              onQuickCreateVolume={handleQuickCreateVolume}
                              volumes={cachedVolumesList}
                            />
                          );
                        })}

                        {/* 未分组的章节 */}
                        {(() => {
                          const ungrouped = chaptersByVolume.get(undefined) || [];
                          if (ungrouped.length === 0) return null;
                          return (
                            <div className="space-y-2">
                              <div className="text-sm text-gray-400 px-2">未分组章节</div>
                              {ungrouped.map(chapter => (
                                <ChapterCard
                                  key={chapter.id}
                                  chapter={chapter}
                                  isEditing={editingChapterId === chapter.id}
                                  onEdit={() => handleStartEditChapter(chapter)}
                                  onDelete={() => deleteChapter(chapter.id)}
                                />
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )
        }
      </div>
    </div>
  );
};

export default OutlineViewer;
