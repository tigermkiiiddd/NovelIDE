/**
 * @file KnowledgeNodeEditor.tsx
 * @description 知识节点编辑表单组件
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, AlertCircle } from 'lucide-react';
import {
  KnowledgeCategory,
  KnowledgeNode,
  KnowledgeNodeDraft,
  KnowledgeWing,
  DEFAULT_SUB_CATEGORIES,
  WING_LABELS,
  WING_ROOMS,
  CATEGORY_TO_WING_ROOM,
} from '../types';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';

// ============================================
// 常量
// ============================================

const CATEGORY_OPTIONS: { value: KnowledgeCategory; label: string }[] = [
  { value: '设定', label: '设定 - 世界观、背景、体系' },
  { value: '规则', label: '规则 - 必须遵守的创作规则' },
  { value: '禁止', label: '禁止 - 不能做的事情' },
  { value: '风格', label: '风格 - 文风、写作风格' },
  { value: '用户偏好', label: '用户偏好 - 个人写作习惯（全局）' },
];

const IMPORTANCE_OPTIONS = [
  { value: 'normal', label: '普通' },
  { value: 'important', label: '重要' },
  { value: 'critical', label: '关键（会注入系统提示词）' },
] as const;

const MAX_NAME_LENGTH = 20;
const MAX_SUMMARY_LENGTH = 50;
const MAX_DETAIL_LENGTH = 200;

// ============================================
// Props
// ============================================

interface Props {
  node?: KnowledgeNode | null;
  onSave: (draft: KnowledgeNodeDraft) => void;
  onCancel: () => void;
  defaultCategory?: KnowledgeCategory;
  defaultWing?: KnowledgeWing;
}

// ============================================
// 组件
// ============================================

export const KnowledgeNodeEditor: React.FC<Props> = ({
  node,
  onSave,
  onCancel,
  defaultCategory = '设定',
  defaultWing,
}) => {
  const store = useKnowledgeGraphStore();
  const availableSubCategories = store.availableSubCategories;
  const availableTags = store.availableTags;

  // 表单状态
  const [category, setCategory] = useState<KnowledgeCategory>(node?.category || defaultCategory);
  const [subCategory, setSubCategory] = useState(node?.subCategory || '');
  const [topic, setTopic] = useState(node?.topic || '');
  const [name, setName] = useState(node?.name || '');
  const [summary, setSummary] = useState(node?.summary || '');
  const [detail, setDetail] = useState(node?.detail || '');
  const [tags, setTags] = useState<string[]>(node?.tags || []);
  const [importance, setImportance] = useState<'critical' | 'important' | 'normal'>(
    node?.importance || 'normal'
  );
  const [wing, setWing] = useState<KnowledgeWing | undefined>(
    node?.wing || defaultWing || undefined
  );
  const [room, setRoom] = useState<string | undefined>(node?.room || undefined);
  const [newTag, setNewTag] = useState('');

  // 分类变化时重置子分类 + 自动更新 Wing/Room
  useEffect(() => {
    if (!availableSubCategories[category]?.includes(subCategory)) {
      setSubCategory(DEFAULT_SUB_CATEGORIES[category][0]);
    }
    // 自动分配 Wing/Room
    const mapping = CATEGORY_TO_WING_ROOM[category];
    if (mapping && !wing) {
      setWing(mapping.wing);
      setRoom(mapping.room);
    }
  }, [category, availableSubCategories, subCategory, wing]);

  // 可用的子分类选项
  const subCategoryOptions = useMemo(() => {
    return availableSubCategories[category] || DEFAULT_SUB_CATEGORIES[category];
  }, [category, availableSubCategories]);

  // 验证错误
  const errors = useMemo(() => {
    const result: string[] = [];
    if (!name.trim()) result.push('名称不能为空');
    if (name.length > MAX_NAME_LENGTH) result.push(`名称不能超过${MAX_NAME_LENGTH}字`);
    if (!summary.trim()) result.push('摘要不能为空');
    if (summary.length > MAX_SUMMARY_LENGTH) result.push(`摘要不能超过${MAX_SUMMARY_LENGTH}字`);
    if (detail.length > MAX_DETAIL_LENGTH) result.push(`详情不能超过${MAX_DETAIL_LENGTH}字`);
    return result;
  }, [name, summary, detail]);

  // 是否可以保存
  const canSave = errors.length === 0;

  // 添加标签
  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTag('');
    }
  };

  // 移除标签
  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // 保存
  const handleSave = () => {
    if (!canSave) return;

    const draft: KnowledgeNodeDraft = {
      category,
      subCategory,
      topic: topic.trim() || undefined,
      name: name.trim(),
      summary: summary.trim(),
      detail: detail.trim() || undefined,
      tags,
      importance,
      parentId: node?.parentId,
      wing,
      room,
    };

    onSave(draft);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 w-[560px] max-h-[85vh] overflow-auto">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium">
          {node ? `编辑: ${node.name}` : '添加知识'}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 表单 */}
      <div className="space-y-4">
        {/* 一级分类 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">一级分类 *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Wing/Room 宫殿位置 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Wing</label>
            <select
              value={wing || ''}
              onChange={(e) => {
                const w = e.target.value as KnowledgeWing | '';
                setWing(w || undefined);
                // 重置 room 为新 Wing 的第一个
                if (w && WING_ROOMS[w as KnowledgeWing]) {
                  setRoom(WING_ROOMS[w as KnowledgeWing][0]);
                } else {
                  setRoom(undefined);
                }
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">自动</option>
              {(Object.keys(WING_LABELS) as KnowledgeWing[]).map((w) => (
                <option key={w} value={w}>{WING_LABELS[w]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Room</label>
            <select
              value={room || ''}
              onChange={(e) => setRoom(e.target.value || undefined)}
              disabled={!wing}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              <option value="">自动</option>
              {wing && WING_ROOMS[wing]?.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 二级分类 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">二级分类 *</label>
          <select
            value={subCategory}
            onChange={(e) => setSubCategory(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          >
            {subCategoryOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* 三级主题 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">三级主题（可选）</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="如：魔法体系、战斗规则"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* 名称 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            名称 * ({name.length}/{MAX_NAME_LENGTH})
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="简短明确的名称"
            className={`w-full bg-gray-700 border rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none ${
              name.length > MAX_NAME_LENGTH ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
        </div>

        {/* 摘要 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            摘要 * ({summary.length}/{MAX_SUMMARY_LENGTH})
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="一句话概括，≤50字"
            rows={2}
            className={`w-full bg-gray-700 border rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none resize-none ${
              summary.length > MAX_SUMMARY_LENGTH ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
        </div>

        {/* 详情 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            详情（可选）({detail.length}/{MAX_DETAIL_LENGTH})
          </label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="详细说明，≤200字。如果更长，请拆分为多个节点"
            rows={4}
            className={`w-full bg-gray-700 border rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none resize-none ${
              detail.length > MAX_DETAIL_LENGTH ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
        </div>

        {/* 标签 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">标签</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded text-sm"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="输入标签后按回车"
              list="available-tags"
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleAddTag}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {/* 可用标签 */}
          {availableTags.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-gray-500 mr-1">可用：</span>
              {availableTags.slice(0, 10).map((t) => (
                <button
                  key={t}
                  onClick={() => !tags.includes(t) && setTags([...tags, t])}
                  className={`text-xs px-1.5 py-0.5 rounded mr-1 ${
                    tags.includes(t) ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 重要程度 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">重要程度</label>
          <div className="flex gap-2">
            {IMPORTANCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setImportance(opt.value as any)}
                className={`flex-1 px-3 py-2 rounded text-sm ${
                  importance === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 错误提示 */}
        {errors.length > 0 && (
          <div className="bg-red-900/30 border border-red-800 rounded p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <ul className="text-sm text-red-300 space-y-1">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 按钮 */}
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-700">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`flex items-center gap-2 px-4 py-2 rounded ${
            canSave
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Save className="w-4 h-4" />
          保存
        </button>
      </div>
    </div>
  );
};

export default KnowledgeNodeEditor;
