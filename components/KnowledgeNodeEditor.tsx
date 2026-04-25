/**
 * @file KnowledgeNodeEditor.tsx
 * @description 知识节点编辑表单组件
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

const CATEGORY_OPTIONS: { value: KnowledgeCategory; labelKey: string }[] = [
  { value: '设定', labelKey: 'knowledge.categories.设定' },
  { value: '规则', labelKey: 'knowledge.categories.规则' },
  { value: '禁止', labelKey: 'knowledge.categories.禁止' },
  { value: '风格', labelKey: 'knowledge.categories.风格' },
  { value: '用户偏好', labelKey: 'knowledge.categories.用户偏好' },
];

const IMPORTANCE_OPTIONS = [
  { value: 'normal', labelKey: 'knowledge.priority.normal' },
  { value: 'important', labelKey: 'knowledge.priority.important' },
  { value: 'critical', labelKey: 'knowledge.priority.critical' },
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
  const { t } = useTranslation();
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
    if (!name.trim()) result.push(t('knowledge.errors.nameRequired'));
    if (name.length > MAX_NAME_LENGTH) result.push(t('knowledge.errors.nameMaxLength', { max: MAX_NAME_LENGTH }));
    if (!summary.trim()) result.push(t('knowledge.errors.summaryRequired'));
    if (summary.length > MAX_SUMMARY_LENGTH) result.push(t('knowledge.errors.summaryMaxLength', { max: MAX_SUMMARY_LENGTH }));
    if (detail.length > MAX_DETAIL_LENGTH) result.push(t('knowledge.errors.detailMaxLength', { max: MAX_DETAIL_LENGTH }));
    return result;
  }, [name, summary, detail, t]);

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
          {node ? t('knowledge.editTitle', { name: node.name }) : t('knowledge.addTitle')}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 表单 */}
      <div className="space-y-4">
        {/* 一级分类 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('knowledge.labels.category')} *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Wing/Room 宫殿位置 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('knowledge.labels.wing')}</label>
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
              <option value="">{t('knowledge.labels.auto')}</option>
              {(Object.keys(WING_LABELS) as KnowledgeWing[]).map((w) => (
                <option key={w} value={w}>{t(`knowledge.wings.${w}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('knowledge.labels.room')}</label>
            <select
              value={room || ''}
              onChange={(e) => setRoom(e.target.value || undefined)}
              disabled={!wing}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              <option value="">{t('knowledge.labels.auto')}</option>
              {wing && WING_ROOMS[wing]?.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 二级分类 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('knowledge.labels.subCategory')} *</label>
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
          <label className="block text-sm text-gray-400 mb-1">{t('knowledge.labels.topicOptional')}</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('knowledge.placeholders.topic')}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* 名称 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            {t('knowledge.labels.name')} * ({name.length}/{MAX_NAME_LENGTH})
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('knowledge.placeholders.name')}
            className={`w-full bg-gray-700 border rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none ${
              name.length > MAX_NAME_LENGTH ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
        </div>

        {/* 摘要 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            {t('knowledge.labels.summary')} * ({summary.length}/{MAX_SUMMARY_LENGTH})
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={t('knowledge.placeholders.summary')}
            rows={2}
            className={`w-full bg-gray-700 border rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none resize-none ${
              summary.length > MAX_SUMMARY_LENGTH ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
        </div>

        {/* 详情 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            {t('knowledge.labels.detailOptional')} ({detail.length}/{MAX_DETAIL_LENGTH})
          </label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('knowledge.placeholders.detail')}
            rows={4}
            className={`w-full bg-gray-700 border rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none resize-none ${
              detail.length > MAX_DETAIL_LENGTH ? 'border-red-500' : 'border-gray-600 focus:border-blue-500'
            }`}
          />
        </div>

        {/* 标签 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('knowledge.labels.tags')}</label>
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
              placeholder={t('knowledge.placeholders.tagInput')}
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
              <span className="text-xs text-gray-500 mr-1">{t('knowledge.labels.available')}</span>
              {availableTags.slice(0, 10).map((at) => (
                <button
                  key={at}
                  onClick={() => !tags.includes(at) && setTags([...tags, at])}
                  className={`text-xs px-1.5 py-0.5 rounded mr-1 ${
                    tags.includes(at) ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {at}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 重要程度 */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('knowledge.labels.importance')}</label>
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
                {t(opt.labelKey)}
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
          {t('knowledge.buttons.cancel')}
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
          {t('knowledge.buttons.save')}
        </button>
      </div>
    </div>
  );
};

export default KnowledgeNodeEditor;
