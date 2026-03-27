/**
 * OutlineViewer.tsx
 * 时间线编辑器 - 管理事件、章节和卷
 *
 * 层级结构：事件 → 章节 → 卷
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Clock, Plus, Pencil, ChevronDown, ChevronRight, GripVertical
} from 'lucide-react';
import { useWorldTimelineStore, formatTimeDisplay, formatTimeRangeDisplay, WorldTimelineState } from '../stores/worldTimelineStore';
import { useProjectStore, ProjectState } from '../stores/projectStore';
import { useChapterAnalysisStore, ChapterAnalysisState } from '../stores/chapterAnalysisStore';
import { TimelineEvent, ChapterGroup, VolumeGroup, StoryLine, ForeshadowingItem } from '../types';

interface OutlineViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

type TimelineLevel = 'events' | 'chapters' | 'volumes';
type EventGroupMode = 'none' | 'day' | 'chapter';

// 事件表单数据类型
interface EventFormData {
  // 时间戳（开始时间）
  day: number;          // 第几天
  hour: number;         // 小时（0-23，支持小数）
  // 持续时间
  durationValue: number;
  durationUnit: 'hour' | 'day';
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
  onQuickCreateChapter,
  // 伏笔相关
  foreshadowingItems,
  foreshadowingIds,
  onAddForeshadowing,
  onUpdateForeshadowing,
  onDeleteForeshadowing,
  onLinkForeshadowing
}: {
  formData: EventFormData;
  storyLines: { id: string; name: string }[];
  chapters: { id: string; chapterIndex: number; title: string; volumeId?: string }[];
  onFieldChange: (field: keyof EventFormData, value: any) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onQuickCreateChapter?: (title: string) => Promise<string | null>; // 返回新章节ID
  // 伏笔相关
  foreshadowingItems?: Map<string, ForeshadowingItem>;
  foreshadowingIds?: string[];
  onAddForeshadowing?: (f: Omit<ForeshadowingItem, 'id'>) => string;
  onUpdateForeshadowing?: (id: string, updates: Partial<ForeshadowingItem>) => void;
  onDeleteForeshadowing?: (id: string) => void;
  onLinkForeshadowing?: (id: string) => void; // 关联现有伏笔到事件
}) => {
  const previewTime = formatTimeDisplay({ day: formData.day, hour: formData.hour });
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateTitle, setQuickCreateTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // 伏笔编辑状态
  const [showForeshadowEditor, setShowForeshadowEditor] = useState<string | 'new' | null>(null);
  const [parentForeshadowingId, setParentForeshadowingId] = useState<string | null>(null); // 继续已有伏笔时的父ID
  const [editingForeshadow, setEditingForeshadow] = useState<{
    content: string;
    type: 'planted' | 'developed' | 'resolved';
    duration: 'short_term' | 'mid_term' | 'long_term';
    tags: string;
    notes: string;
  }>({
    content: '',
    type: 'planted',
    duration: 'short_term',
    tags: '',
    notes: ''
  });
  const [showForeshadowSelector, setShowForeshadowSelector] = useState(false);

  // 获取未完结的伏笔列表（用于选择关联）
  const unresolvedForeshadowing = useMemo(() => {
    if (!foreshadowingItems) return [];
    const allItems = Array.from(foreshadowingItems.values());
    // 只返回根伏笔（无 parentId），且未收尾的
    return allItems.filter(f =>
      !f.parentId &&  // 只显示根伏笔
      (f.type === 'planted' || f.type === 'developed') &&
      !foreshadowingIds?.includes(f.id)
    );
  }, [foreshadowingItems, foreshadowingIds]);

  // 开始编辑伏笔
  const handleStartEditForeshadow = (f?: ForeshadowingItem, isContinue: boolean = false) => {
    if (f) {
      if (isContinue) {
        // 继续已有伏笔：创建子伏笔，内容清空让用户填写推进描述
        setParentForeshadowingId(f.id);
        setEditingForeshadow({
          content: '',  // 用户需要填写如何推进/收尾
          type: 'developed',  // 默认推进
          duration: f.duration,  // 继承父伏笔的时长
          tags: f.tags.join(', '),
          notes: ''
        });
        setShowForeshadowEditor('new');  // 作为新伏笔创建
      } else {
        // 编辑现有伏笔（仅限编辑刚创建的子伏笔）
        setParentForeshadowingId(null);
        setEditingForeshadow({
          content: f.content,
          type: f.type,
          duration: f.duration,
          tags: f.tags.join(', '),
          notes: f.notes || ''
        });
        setShowForeshadowEditor(f.id);
      }
    } else {
      // 新建根伏笔
      setParentForeshadowingId(null);
      setEditingForeshadow({
        content: '',
        type: 'planted',
        duration: 'short_term',  // 默认短期
        tags: '',
        notes: ''
      });
      setShowForeshadowEditor('new');
    }
  };

  const handleSaveForeshadow = () => {
    if (!editingForeshadow.content.trim()) return;

    const item: Omit<ForeshadowingItem, 'id'> = {
      content: editingForeshadow.content.trim(),
      type: editingForeshadow.type,
      duration: editingForeshadow.duration,
      tags: editingForeshadow.tags.split(',').map(t => t.trim()).filter(Boolean),
      notes: editingForeshadow.notes.trim() || undefined,
      source: 'timeline' as const,
      sourceRef: '', // 事件保存时由外部设置
      createdAt: Date.now()
    };

    if (showForeshadowEditor === 'new') {
      // 新建伏笔（可能是根伏笔或子伏笔）
      if (parentForeshadowingId) {
        // 有父ID，创建子伏笔
        const childItem = { ...item, parentId: parentForeshadowingId };
        onAddForeshadowing?.(childItem);
      } else {
        // 无父ID，创建根伏笔
        onAddForeshadowing?.(item);
      }
    } else if (typeof showForeshadowEditor === 'string') {
      // 更新现有伏笔
      onUpdateForeshadowing?.(showForeshadowEditor, item);
      // 如果这个伏笔还未关联到当前事件，则关联
      if (!foreshadowingIds?.includes(showForeshadowEditor)) {
        onLinkForeshadowing?.(showForeshadowEditor);
      }
    }
    // 重置状态
    setShowForeshadowEditor(null);
    setParentForeshadowingId(null);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-700">
      {/* 时间戳输入：天 + 小时 */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="text-xs text-gray-500">第几天</label>
          <input
            type="number"
            min="1"
            step="1"
            value={formData.day}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onFieldChange('day', 1);
              } else {
                const num = parseInt(val);
                if (!isNaN(num) && num >= 1) {
                  onFieldChange('day', num);
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">开始小时</label>
          <input
            type="number"
            min="0"
            max="23.5"
            step="0.5"
            value={formData.hour}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onFieldChange('hour', 0);
              } else {
                const num = parseFloat(val);
                if (!isNaN(num) && num >= 0 && num <= 23.5) {
                  onFieldChange('hour', num);
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">时间显示</label>
          <div className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-blue-300">
            {previewTime}
          </div>
        </div>
      </div>

      {/* 持续时间输入 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500">持续时长</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={formData.durationValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onFieldChange('durationValue', 0);
              } else {
                const num = parseFloat(val);
                if (!isNaN(num) && num >= 0) {
                  onFieldChange('durationValue', num);
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">单位</label>
          <select
            value={formData.durationUnit}
            onChange={(e) => onFieldChange('durationUnit', e.target.value as 'hour' | 'day')}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="hour">小时</option>
            <option value="day">天</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">说明</label>
          <div className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-400 flex items-center">
            {formData.durationValue}{formData.durationUnit === 'hour' ? '小时' : '天'}
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

      {/* 伏笔编辑区域 */}
      <div className="border-t border-gray-700 pt-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-500">关联伏笔</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForeshadowSelector(!showForeshadowSelector)}
              className="text-xs text-green-400 hover:text-green-300"
            >
              📎 关联已有
            </button>
            <button
              type="button"
              onClick={() => handleStartEditForeshadow()}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + 新建伏笔
            </button>
          </div>
        </div>

        {/* 选择已有伏笔 */}
        {showForeshadowSelector && (
          <div className="mb-2 p-2 bg-gray-700/50 rounded border border-gray-600">
            <label className="text-xs text-gray-500 mb-1 block">选择已有伏笔推进或收尾</label>
            {unresolvedForeshadowing.length > 0 ? (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {unresolvedForeshadowing.map(f => {
                  const colors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
                  const labels: Record<string, string> = { planted: '🌱埋下', developed: '🌿推进', resolved: '✅收回' };
                  const durationLabels: Record<string, string> = { short_term: '短期', mid_term: '中期', long_term: '长期' };

                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 p-1.5 rounded bg-gray-800/50 hover:bg-gray-600/50 cursor-pointer border border-transparent hover:border-gray-500"
                      onClick={() => {
                        // 继续已有伏笔，创建子伏笔
                        handleStartEditForeshadow(f, true);
                        setShowForeshadowSelector(false);
                      }}
                    >
                      <span
                        className="text-xs px-1.5 py-0.5 rounded shrink-0"
                        style={{ backgroundColor: colors[f.type] + '22', color: colors[f.type] }}
                      >
                        {labels[f.type]}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        [{durationLabels[f.duration]}]
                      </span>
                      <span className="flex-1 text-sm text-gray-200 truncate">
                        {f.content}
                      </span>
                      <span className="text-xs text-green-400">推进/收尾</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-500 py-2 text-center">
                暂无可关联的伏笔
              </div>
            )}
          </div>
        )}

        {/* 伏笔列表 */}
        {foreshadowingIds && foreshadowingIds.length > 0 && foreshadowingItems && (
          <div className="space-y-1 mb-2">
            {foreshadowingIds.map(fid => {
              const f = foreshadowingItems.get(fid);
              if (!f) return null;

              const colors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
              const labels: Record<string, string> = { planted: '🌱埋下', developed: '🌿推进', resolved: '✅收回' };
              const durationLabels: Record<string, string> = { short_term: '短期', mid_term: '中期', long_term: '长期' };

              return (
                <div
                  key={fid}
                  className="flex items-center gap-2 p-2 rounded bg-gray-700/50 border border-gray-600"
                >
                  <span
                    className="text-xs px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: colors[f.type] + '22', color: colors[f.type] }}
                  >
                    {labels[f.type]}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    [{durationLabels[f.duration]}]
                  </span>
                  <span className="flex-1 text-sm text-gray-200 truncate">
                    {f.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleStartEditForeshadow(f)}
                    className="text-gray-500 hover:text-blue-400 p-1"
                    title="编辑"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteForeshadowing?.(fid)}
                    className="text-gray-500 hover:text-red-400 p-1"
                    title="取消关联"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 伏笔编辑器 */}
        {showForeshadowEditor && (
          <div className="bg-gray-700/50 rounded p-3 space-y-2 border border-gray-600">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {parentForeshadowingId ? '🌿 推进已有伏笔' : showForeshadowEditor === 'new' ? '🌱 新建伏笔' : '编辑伏笔'}
              </span>
              {parentForeshadowingId && foreshadowingItems?.get(parentForeshadowingId) && (
                <span className="text-xs text-gray-500">
                  原：{foreshadowingItems.get(parentForeshadowingId)?.content?.substring(0, 20)}...
                </span>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500">
                {parentForeshadowingId ? '推进/收尾描述' : '伏笔内容'}
              </label>
              <input
                type="text"
                value={editingForeshadow.content}
                onChange={(e) => setEditingForeshadow(prev => ({ ...prev, content: e.target.value }))}
                placeholder={parentForeshadowingId ? "描述如何推进或收尾此伏笔（30字以内）" : "简洁描述伏笔（30字以内）"}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">状态</label>
                <select
                  value={editingForeshadow.type}
                  onChange={(e) => setEditingForeshadow(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                >
                  <option value="planted">🌱 埋下</option>
                  <option value="developed">🌿 推进</option>
                  <option value="resolved">✅ 收回</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">时长</label>
                <select
                  value={editingForeshadow.duration}
                  onChange={(e) => setEditingForeshadow(prev => ({ ...prev, duration: e.target.value as any }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                  disabled={!!parentForeshadowingId}
                >
                  <option value="short_term">短期（1-5章）</option>
                  <option value="mid_term">中期（10-20章）</option>
                  <option value="long_term">长期（100章+）</option>
                </select>
                {parentForeshadowingId && (
                  <span className="text-xs text-gray-500">继承父伏笔</span>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">标签（逗号分隔）</label>
              <input
                type="text"
                value={editingForeshadow.tags}
                onChange={(e) => setEditingForeshadow(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="身世, 物品, 关系..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveForeshadow}
                disabled={!editingForeshadow.content.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded px-2 py-1 text-sm"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForeshadowEditor(null);
                  setParentForeshadowingId(null);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1 text-sm"
              >
                取消
              </button>
            </div>
          </div>
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
  foreshadowingItems?: Map<string, ForeshadowingItem>;
  onEdit: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  // Drag props
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart: (e: React.DragEvent, eventId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, eventId: string) => void;
  onDrop: (e: React.DragEvent, targetEventId: string) => void;
}

const EventCard = React.memo(({ event, storyLineColor, storyLineName, chapterInfo, showChapterInfo, foreshadowingItems, onEdit, onDelete, isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop }: EventCardProps) => {
  const handleEdit = useCallback(() => onEdit(event.id), [event.id, onEdit]);
  const handleDelete = useCallback(() => onDelete(event.id), [event.id, onDelete]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    onDragStart(e, event.id);
  }, [event.id, onDragStart]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    onDragOver(e, event.id);
  }, [event.id, onDragOver]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    onDrop(e, event.id);
  }, [event.id, onDrop]);

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 border ${
        isDragOver ? 'border-blue-500 border-2 bg-blue-900/20' : 'border-gray-700'
      } ${isDragging ? 'opacity-50' : ''} transition-colors cursor-default`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2 flex-1">
          {/* Drag Handle */}
          <div
            className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing pt-0.5"
            title="拖动排序"
          >
            <GripVertical size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500">#{event.eventIndex}</span>
              {event.timestamp && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded">
                  {formatTimeRangeDisplay(event.timestamp, event.duration)}
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
        <div className="text-xs text-gray-500 mb-2 ml-6">
          所属章节：第{chapterInfo.chapterIndex}章「{chapterInfo.title}」
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-gray-400 ml-6">
        {event.location && <span>📍 {event.location}</span>}
        {event.characters && event.characters.length > 0 && <span>👥 {event.characters.join(', ')}</span>}
        {event.emotion && <span>💫 {event.emotion}</span>}
      </div>

      {event.content && (
        <p className="text-sm text-gray-300 mt-2 ml-6">{event.content}</p>
      )}

      {/* 伏笔显示 */}
      {event.foreshadowingIds && event.foreshadowingIds.length > 0 && foreshadowingItems && (
        <div className="flex flex-wrap gap-1 mt-2 ml-6">
          {event.foreshadowingIds.map(fid => {
            const f = foreshadowingItems.get(fid);
            if (!f || !f.content) return null;
            const colors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
            const labels: Record<string, string> = { planted: '🌱埋', developed: '🌿进', resolved: '✅收' };
            const displayContent = f.content.length > 15 ? f.content.substring(0, 15) + '...' : f.content;
            return (
              <span
                key={fid}
                className="text-xs px-1.5 py-0.5 rounded cursor-help"
                style={{ backgroundColor: colors[f.type] + '22', color: colors[f.type] }}
                title={f.content}
              >
                {labels[f.type]} {displayContent}
              </span>
            );
          })}
        </div>
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
  const [eventGroupMode, setEventGroupMode] = useState<EventGroupMode>('day');

  // 折叠状态（使用 Set 存储已折叠的组 key）
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
  const [editingEventForeshadowingIds, setEditingEventForeshadowingIds] = useState<string[]>([]);
  const [newEvent, setNewEvent] = useState({
    day: 1,
    hour: 8,
    durationValue: 1,
    durationUnit: 'hour' as 'hour' | 'day',
    title: '',
    content: '',
    location: '',
    characters: '',
    emotion: '',
    storyLineId: '',
    chapterId: ''
  });

  // Store - 使用 worldTimelineStore 作为唯一数据源
  const timeline = useWorldTimelineStore((state: WorldTimelineState) => state.timeline);
  const isLoading = useWorldTimelineStore((state: WorldTimelineState) => state.isLoading);
  const loadTimeline = useWorldTimelineStore((state: WorldTimelineState) => state.loadTimeline);
  const addEvent = useWorldTimelineStore((state: WorldTimelineState) => state.addEvent);
  const updateEvent = useWorldTimelineStore((state: WorldTimelineState) => state.updateEvent);
  const deleteEvent = useWorldTimelineStore((state: WorldTimelineState) => state.deleteEvent);
  const addChapter = useWorldTimelineStore((state: WorldTimelineState) => state.addChapter);
  const updateChapter = useWorldTimelineStore((state: WorldTimelineState) => state.updateChapter);
  const addVolume = useWorldTimelineStore((state: WorldTimelineState) => state.addVolume);
  const updateVolume = useWorldTimelineStore((state: WorldTimelineState) => state.updateVolume);
  const deleteVolume = useWorldTimelineStore((state: WorldTimelineState) => state.deleteVolume);
  const deleteChapter = useWorldTimelineStore((state: WorldTimelineState) => state.deleteChapter);
  const getEvents = useWorldTimelineStore((state: WorldTimelineState) => state.getEvents);
  const getChapters = useWorldTimelineStore((state: WorldTimelineState) => state.getChapters);
  const getVolumes = useWorldTimelineStore((state: WorldTimelineState) => state.getVolumes);
  const getStoryLines = useWorldTimelineStore((state: WorldTimelineState) => state.getStoryLines);
  const getTimeRange = useWorldTimelineStore((state: WorldTimelineState) => state.getTimeRange);
  const addChaptersToVolume = useWorldTimelineStore((state: WorldTimelineState) => state.addChaptersToVolume);
  const moveEvent = useWorldTimelineStore((state: WorldTimelineState) => state.moveEvent);
  const currentProjectId = useProjectStore((state: ProjectState) => state.currentProjectId);

  // 伏笔数据 - 从 chapterAnalysisStore 获取
  const foreshadowingList = useChapterAnalysisStore((state: ChapterAnalysisState) => state.data.foreshadowing);
  const addForeshadowingToStore = useChapterAnalysisStore((state: ChapterAnalysisState) => state.addForeshadowing);
  const updateForeshadowingInStore = useChapterAnalysisStore((state: ChapterAnalysisState) => state.updateForeshadowing);
  const deleteForeshadowingFromStore = useChapterAnalysisStore((state: ChapterAnalysisState) => state.deleteForeshadowing);
  const foreshadowingMap = useMemo<Map<string, ForeshadowingItem>>(() =>
    new Map(foreshadowingList.map((f: ForeshadowingItem) => [f.id, f])),
    [foreshadowingList]
  );

  // 伏笔操作 handlers
  const handleAddForeshadowing = useCallback((item: Omit<ForeshadowingItem, 'id'>) => {
    const id = addForeshadowingToStore({ ...item, source: 'timeline', sourceRef: editingEventId || '' });
    setEditingEventForeshadowingIds(prev => [...prev, id]);
    return id;
  }, [addForeshadowingToStore, editingEventId]);

  const handleUpdateForeshadowing = useCallback((id: string, updates: Partial<ForeshadowingItem>) => {
    updateForeshadowingInStore(id, updates);
  }, [updateForeshadowingInStore]);

  const handleDeleteForeshadowing = useCallback((id: string) => {
    deleteForeshadowingFromStore(id);
    setEditingEventForeshadowingIds(prev => prev.filter(fid => fid !== id));
  }, [deleteForeshadowingFromStore]);

  // 关联已有伏笔到当前事件
  const handleLinkForeshadowing = useCallback((id: string) => {
    setEditingEventForeshadowingIds(prev => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }, []);

  // Drag state
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverEventId, setDragOverEventId] = useState<string | null>(null);

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
      timestamp: {
        day: newEvent.day,
        hour: newEvent.hour
      },
      duration: {
        value: newEvent.durationValue,
        unit: newEvent.durationUnit
      },
      title: newEvent.title.trim(),
      content: newEvent.content.trim(),
      location: newEvent.location.trim(),
      characters: newEvent.characters.split(',').map(c => c.trim()).filter(Boolean),
      emotion: newEvent.emotion.trim(),
      storyLineId: newEvent.storyLineId || undefined,
      chapterId: newEvent.chapterId || undefined
    });
    // 重置表单，保持时间设置
    setNewEvent({
      day: newEvent.day,
      hour: newEvent.hour + 1 > 23 ? 8 : newEvent.hour + 1,
      durationValue: newEvent.durationValue,
      durationUnit: newEvent.durationUnit,
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
      day: event.timestamp?.day || 1,
      hour: event.timestamp?.hour || 8,
      durationValue: event.duration?.value || 1,
      durationUnit: event.duration?.unit || 'hour',
      title: event.title,
      content: event.content,
      location: event.location || '',
      characters: event.characters?.join(', ') || '',
      emotion: event.emotion || '',
      storyLineId: event.storyLineId || '',
      chapterId: event.chapterId || ''
    });
    // 加载该事件关联的伏笔ID
    setEditingEventForeshadowingIds(event.foreshadowingIds || []);
    setShowAddEvent(false);
  }, []);

  // 稳定的编辑回调 - 供 EventCard 使用
  const handleEventEdit = useCallback((eventId: string) => {
    const events = getEvents();
    const event = events.find((e: TimelineEvent) => e.id === eventId);
    if (!event) return;
    handleStartEditEvent(event);
  }, [getEvents, handleStartEditEvent]);

  const handleSaveEditEvent = () => {
    if (!editingEventId || !newEvent.title.trim()) return;
    updateEvent(editingEventId, {
      timestamp: {
        day: newEvent.day,
        hour: newEvent.hour
      },
      duration: {
        value: newEvent.durationValue,
        unit: newEvent.durationUnit
      },
      title: newEvent.title.trim(),
      content: newEvent.content.trim(),
      location: newEvent.location.trim() || undefined,
      characters: newEvent.characters ? newEvent.characters.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      emotion: newEvent.emotion.trim() || undefined,
      storyLineId: newEvent.storyLineId || undefined,
      chapterId: newEvent.chapterId || undefined,
      foreshadowingIds: editingEventForeshadowingIds.length > 0 ? editingEventForeshadowingIds : undefined
    });
    setEditingEventId(null);
    setEditingEventForeshadowingIds([]);
    setNewEvent({
      day: 1,
      hour: 8,
      durationValue: 1,
      durationUnit: 'hour',
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
    setEditingEventForeshadowingIds([]);
    setNewEvent({
      day: 1,
      hour: 8,
      durationValue: 1,
      durationUnit: 'hour',
      title: '',
      content: '',
      location: '',
      characters: '',
      emotion: '',
      storyLineId: '',
      chapterId: ''
    });
  };

  // === Drag Handlers ===
  const handleDragStart = useCallback((e: React.DragEvent, eventId: string) => {
    setDraggedEventId(eventId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedEventId(null);
    setDragOverEventId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, eventId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (eventId !== dragOverEventId) {
      setDragOverEventId(eventId);
    }
  }, [dragOverEventId]);

  const handleDrop = useCallback((e: React.DragEvent, targetEventId: string) => {
    e.preventDefault();
    if (!draggedEventId || draggedEventId === targetEventId) {
      setDraggedEventId(null);
      setDragOverEventId(null);
      return;
    }

    // 获取目标事件的位置
    const events = getEvents();
    const targetIndex = events.findIndex((ev: TimelineEvent) => ev.id === targetEventId);
    if (targetIndex !== -1) {
      moveEvent(draggedEventId, targetIndex);
    }

    setDraggedEventId(null);
    setDragOverEventId(null);
  }, [draggedEventId, getEvents, moveEvent]);

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
    const maxIndex = existingVolumes.reduce((max: number, v: VolumeGroup) => Math.max(max, v.volumeIndex), 0);
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
    new Map<string, StoryLine>(cachedStoryLines.map((s: StoryLine) => [s.id, s])),
    [cachedStoryLines]
  );

  const chapterMap = useMemo(() =>
    new Map<string, ChapterGroup>(cachedChapters.map((c: ChapterGroup) => [c.id, c])),
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
    cachedChaptersList.forEach((ch: ChapterGroup) => {
      const vid = ch.volumeId || undefined;
      if (!map.has(vid)) map.set(vid, []);
      map.get(vid)!.push(ch);
    });
    return map;
  }, [cachedChaptersList]);

  // === Event Grouping Logic ===
  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // 按天或章节分组事件
  const groupedEvents = useMemo(() => {
    if (eventGroupMode === 'none') {
      return null;
    }

    const groups = new Map<string, {
      key: string;
      label: string;
      events: TimelineEvent[];
      extraInfo?: string;
    }>();

    cachedEvents.forEach((event: TimelineEvent) => {
      let key: string;
      let label: string;

      if (eventGroupMode === 'day') {
        const day = event.timestamp?.day || 1;
        key = `day-${day}`;
        label = `第 ${day} 天`;
      } else {
        // 按章节分组
        const chapter = event.chapterId ? chapterMap.get(event.chapterId) : null;
        if (chapter) {
          key = `chapter-${chapter.chapterIndex}`;
          label = `第${chapter.chapterIndex}章「${chapter.title}」`;
        } else {
          key = 'chapter-ungrouped';
          label = '未分类事件';
        }
      }

      if (!groups.has(key)) {
        groups.set(key, { key, label, events: [] });
      }
      groups.get(key)!.events.push(event);
    });

    // 计算额外信息并按key排序
    return Array.from(groups.values())
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map(group => {
        if (eventGroupMode === 'day') {
          // 按天分组：显示包含的章节
          const chapterSet = new Set<string>();
          group.events.forEach(event => {
            if (event.chapterId) {
              const chapter = chapterMap.get(event.chapterId);
              if (chapter) {
                chapterSet.add(`第${chapter.chapterIndex}章`);
              }
            }
          });
          const chapters = Array.from(chapterSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          return {
            ...group,
            extraInfo: chapters.length > 0 ? `包含：${chapters.join('、')}` : undefined
          };
        } else {
          // 按章节分组：显示时间跨度
          const timestamps = group.events
            .filter(e => e.timestamp && typeof e.timestamp.day === 'number')
            .map(e => (e.timestamp.day - 1) * 24 + e.timestamp.hour);
          if (timestamps.length > 0) {
            const minHours = Math.min(...timestamps);
            const maxHours = Math.max(...timestamps);
            const startDay = Math.floor(minHours / 24) + 1;
            const startHour = minHours % 24;
            const endDay = Math.floor(maxHours / 24) + 1;
            const endHour = maxHours % 24;

            const formatTime = (day: number, hour: number) => {
              const h = Math.floor(hour);
              const m = Math.round((hour - h) * 60);
              return m > 0 ? `第${day}天${h}:${m.toString().padStart(2, '0')}` : `第${day}天${h}:00`;
            };

            if (startDay === endDay && startHour === endHour) {
              return { ...group, extraInfo: `时间：${formatTime(startDay, startHour)}` };
            } else {
              return { ...group, extraInfo: `时间：${formatTime(startDay, startHour)} ~ ${formatTime(endDay, endHour)}` };
            }
          }
          return group;
        }
      });
  }, [cachedEvents, eventGroupMode, chapterMap]);

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
                  {/* Group Mode Selector */}
                  <div className="flex gap-1 mb-3 text-xs">
                    <span className="text-gray-500 py-1">分组：</span>
                    <button
                      onClick={() => setEventGroupMode('none')}
                      className={`px-2 py-1 rounded ${
                        eventGroupMode === 'none' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      无
                    </button>
                    <button
                      onClick={() => setEventGroupMode('day')}
                      className={`px-2 py-1 rounded ${
                        eventGroupMode === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      按天
                    </button>
                    <button
                      onClick={() => setEventGroupMode('chapter')}
                      className={`px-2 py-1 rounded ${
                        eventGroupMode === 'chapter' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      按章节
                    </button>
                    {eventGroupMode !== 'none' && groupedEvents && (
                      <button
                        onClick={() => {
                          if (collapsedGroups.size === groupedEvents.length) {
                            // 全部折叠 -> 全部展开
                            setCollapsedGroups(new Set());
                          } else {
                            // 部分折叠 -> 全部折叠
                            setCollapsedGroups(new Set(groupedEvents.map(g => g.key)));
                          }
                        }}
                        className="px-2 py-1 rounded bg-gray-700 text-gray-400 hover:text-gray-200 ml-2"
                      >
                        {collapsedGroups.size === groupedEvents.length ? '全部展开' : '全部折叠'}
                      </button>
                    )}
                  </div>

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
                  onCancel={() => {
                    setShowAddEvent(false);
                    setEditingEventForeshadowingIds([]);
                  }}
                  onQuickCreateChapter={handleQuickCreateChapter}
                  foreshadowingItems={foreshadowingMap}
                  foreshadowingIds={editingEventForeshadowingIds}
                  onAddForeshadowing={handleAddForeshadowing}
                  onUpdateForeshadowing={handleUpdateForeshadowing}
                  onDeleteForeshadowing={handleDeleteForeshadowing}
                  onLinkForeshadowing={handleLinkForeshadowing}
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

                // 渲染单个事件的辅助函数
                const renderEvent = (event: TimelineEvent) => {
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
                            foreshadowingItems={foreshadowingMap}
                            foreshadowingIds={editingEventForeshadowingIds}
                            onAddForeshadowing={handleAddForeshadowing}
                            onUpdateForeshadowing={handleUpdateForeshadowing}
                            onDeleteForeshadowing={handleDeleteForeshadowing}
                  onLinkForeshadowing={handleLinkForeshadowing}
                          />
                        </div>
                      ) : (
                        <EventCard
                          event={event}
                          storyLineColor={storyLine?.color || '#4A90D9'}
                          storyLineName={storyLine?.name}
                          chapterInfo={chapter ? { chapterIndex: chapter.chapterIndex, title: chapter.title } : null}
                          showChapterInfo
                          foreshadowingItems={foreshadowingMap}
                          onEdit={handleEventEdit}
                          onDelete={handleDeleteTimelineEvent}
                          isDragging={draggedEventId === event.id}
                          isDragOver={dragOverEventId === event.id && draggedEventId !== event.id}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                        />
                      )}
                    </div>
                  );
                };

                // 分组模式
                if (eventGroupMode !== 'none' && groupedEvents) {
                  return (
                    <div className="space-y-2">
                      {/* Event Count */}
                      <div className="text-sm text-gray-500 mb-2">
                        共 {cachedEvents.length} 个事件，{groupedEvents.length} 个分组
                      </div>

                      {groupedEvents.map(group => {
                        const isCollapsed = collapsedGroups.has(group.key);
                        return (
                          <div key={group.key} className="border border-gray-700 rounded-lg overflow-hidden">
                            {/* Group Header */}
                            <div
                              className="bg-gray-800/80 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-800"
                              onClick={() => toggleGroupCollapse(group.key)}
                            >
                              <div className="flex items-center gap-2">
                                {isCollapsed ? (
                                  <ChevronRight size={14} className="text-gray-500" />
                                ) : (
                                  <ChevronDown size={14} className="text-gray-500" />
                                )}
                                <span className="font-medium text-gray-200">{group.label}</span>
                                <span className="text-xs text-gray-500">({group.events.length} 个事件)</span>
                                {group.extraInfo && (
                                  <span className="text-xs text-blue-400">{group.extraInfo}</span>
                                )}
                              </div>
                            </div>

                            {/* Group Content */}
                            {!isCollapsed && (
                              <div className="relative p-2 bg-gray-900/50">
                                <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-gray-700" />
                                {group.events.map(renderEvent)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // 无分组模式
                return (
                  <div className="relative">
                    {/* Timeline Line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />

                    {/* Event Count */}
                    <div className="mb-4 ml-10 text-sm text-gray-500">
                      共 {cachedEvents.length} 个事件
                    </div>

                    {/* Events - using optimized EventCard with Map lookups */}
                    {cachedEvents.map(renderEvent)}
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
                        {cachedVolumesList.map((volume: VolumeGroup) => {
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
