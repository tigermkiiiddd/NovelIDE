/**
 * @file KnowledgeNodePreview.tsx
 * @description 知识节点详情面板 - 即时编辑模式
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Trash2,
  Globe,
  BookOpen,
  AlertTriangle,
  PenTool,
  Clock,
  Zap,
  Tag,
  Star,
  ChevronRight,
  Plus,
  X,
  Check,
  Save,
  User,
} from 'lucide-react';
import { KnowledgeNode, KnowledgeCategory, KnowledgeWing, DEFAULT_SUB_CATEGORIES, WING_LABELS } from '../types';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';

// ============================================
// 常量
// ============================================

const CATEGORY_CONFIG: Record<
  KnowledgeCategory,
  { icon: React.ReactNode; color: string; bgColor: string; label: string }
> = {
  '设定': {
    icon: <Globe className="w-4 h-4" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/30',
    label: '设定',
  },
  '规则': {
    icon: <BookOpen className="w-4 h-4" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30',
    label: '规则',
  },
  '禁止': {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
    label: '禁止',
  },
  '风格': {
    icon: <PenTool className="w-4 h-4" />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/30',
    label: '风格',
  },
  '用户偏好': {
    icon: <User className="w-4 h-4" />,
    color: 'text-green-400',
    bgColor: 'bg-green-900/30',
    label: '用户偏好',
  },
};

const IMPORTANCE_OPTIONS = [
  { value: 'critical', label: '关键', color: 'text-red-400', bgColor: 'bg-red-900/30' },
  { value: 'important', label: '重要', color: 'text-amber-400', bgColor: 'bg-amber-900/30' },
  { value: 'normal', label: '普通', color: 'text-gray-400', bgColor: 'bg-gray-700/50' },
] as const;

// ============================================
// 可编辑字段组件
// ============================================

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  maxLength?: number;
}

const EditableText: React.FC<EditableTextProps> = ({
  value,
  onChange,
  placeholder = '点击输入...',
  className = '',
  multiline = false,
  maxLength,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const charCount = value.length;
  const showCount = maxLength && isFocused;

  const baseClass = `w-full bg-transparent border-none outline-none resize-none text-gray-200 placeholder-gray-500 ${className}`;

  if (multiline) {
    return (
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={baseClass}
          rows={4}
        />
        {showCount && (
          <span className="absolute bottom-1 right-2 text-xs text-gray-500">
            {charCount}/{maxLength}
          </span>
        )}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={baseClass}
    />
  );
};

// ============================================
// 主组件
// ============================================

interface Props {
  node: KnowledgeNode | null;
  onUpdate: (id: string, updates: Partial<KnowledgeNode>) => void;
  onDelete: (node: KnowledgeNode) => void;
  onAdd?: () => void;
}

export const KnowledgeNodePreview: React.FC<Props> = ({ node, onUpdate, onDelete, onAdd }) => {
  const store = useKnowledgeGraphStore();
  const { availableSubCategories, getNodeDynamicState } = store;

  // 本地编辑状态
  const [localData, setLocalData] = useState<Partial<KnowledgeNode>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasChangesRef = useRef(false);
  const localDataRef = useRef<Partial<KnowledgeNode>>({});
  const nodeRef = useRef<KnowledgeNode | null>(null);

  // 同步 refs
  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  useEffect(() => {
    nodeRef.current = node;
  }, [node]);

  // 当节点变化时，重置本地状态
  useEffect(() => {
    if (node) {
      setLocalData({
        name: node.name,
        summary: node.summary,
        detail: node.detail || '',
        tags: Array.isArray(node.tags) ? [...node.tags] : [],
        category: node.category,
        subCategory: node.subCategory,
        topic: node.topic || '',
        importance: node.importance,
      });
    }
    setHasChanges(false);
    hasChangesRef.current = false;
  }, [node?.id]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // 更新本地数据并标记有变更
  const updateField = useCallback((key: keyof KnowledgeNode, value: any) => {
    setLocalData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    hasChangesRef.current = true;
  }, []);

  // 保存到 store（使用 ref 获取最新值）
  const saveChanges = useCallback(() => {
    const currentNode = nodeRef.current;
    const currentLocalData = localDataRef.current;
    if (!currentNode || !hasChangesRef.current || !currentLocalData.name?.trim()) return;
    onUpdate(currentNode.id, currentLocalData);
    setHasChanges(false);
    hasChangesRef.current = false;
  }, [onUpdate]);

  // 自动保存（防抖 1 秒）
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveChanges();
    }, 1000);
  }, [saveChanges]);

  // 字段变更时触发自动保存
  const handleChange = useCallback((key: keyof KnowledgeNode, value: any) => {
    updateField(key, value);
    scheduleAutoSave();
  }, [updateField, scheduleAutoSave]);

  // 标签操作
  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const currentTags = localData.tags || [];
    if (!currentTags.includes(trimmed)) {
      handleChange('tags', [...currentTags, trimmed]);
    }
  }, [localData.tags, handleChange]);

  const removeTag = useCallback((tag: string) => {
    const currentTags = localData.tags || [];
    handleChange('tags', currentTags.filter((t: string) => t !== tag));
  }, [localData.tags, handleChange]);

  // 空状态
  if (!node) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-900">
        <div className="text-center">
          <div className="text-5xl mb-4">📚</div>
          <p className="text-lg mb-4">选择一个知识节点查看详情</p>
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded mx-auto"
            >
              <Plus className="w-4 h-4" />
              添加知识
            </button>
          )}
        </div>
      </div>
    );
  }

  const categoryConfig = CATEGORY_CONFIG[localData.category || node.category];
  const importanceOption = IMPORTANCE_OPTIONS.find((o) => o.value === (localData.importance || node.importance));
  const dynamicState = getNodeDynamicState(node.id);
  const currentCategory = localData.category || node.category;
  const subCategories = availableSubCategories[currentCategory] || DEFAULT_SUB_CATEGORIES[currentCategory];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-700">
        {/* 分类路径 */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <select
            value={localData.category || node.category}
            onChange={(e) => {
              const newCategory = e.target.value as KnowledgeCategory;
              handleChange('category', newCategory);
              handleChange('subCategory', DEFAULT_SUB_CATEGORIES[newCategory][0]);
            }}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none hover:border-gray-500"
          >
            {(Object.keys(CATEGORY_CONFIG) as KnowledgeCategory[]).map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <ChevronRight className="w-3 h-3" />
          <select
            value={localData.subCategory || node.subCategory}
            onChange={(e) => handleChange('subCategory', e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none hover:border-gray-500"
          >
            {subCategories.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
          <input
            type="text"
            value={localData.topic || ''}
            onChange={(e) => handleChange('topic', e.target.value)}
            placeholder="Topic"
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm w-20 focus:border-blue-500 focus:outline-none hover:border-gray-500"
          />
        </div>

        {/* Wing/Room 标签 */}
        {node.wing && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs px-1.5 py-0.5 bg-blue-900/40 text-blue-300 rounded">
              {WING_LABELS[node.wing as KnowledgeWing]}
            </span>
            {node.room && (
              <>
                <ChevronRight className="w-2.5 h-2.5 text-gray-600" />
                <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
                  {node.room}
                </span>
              </>
            )}
          </div>
        )}

        {/* 名称 */}
        <EditableText
          value={localData.name || ''}
          onChange={(v) => handleChange('name', v)}
          placeholder="节点名称"
          maxLength={20}
          className="text-xl font-semibold"
        />
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 摘要 */}
        <div className="bg-gray-800/50 rounded p-3">
          <label className="text-xs font-medium text-gray-500 block mb-1">摘要</label>
          <EditableText
            value={localData.summary || ''}
            onChange={(v) => handleChange('summary', v)}
            placeholder="一句话概括..."
            maxLength={50}
          />
        </div>

        {/* 详情 */}
        <div className="bg-gray-800/50 rounded p-3">
          <label className="text-xs font-medium text-gray-500 block mb-1">详情（≤300字）</label>
          <EditableText
            value={localData.detail || ''}
            onChange={(v) => handleChange('detail', v)}
            placeholder="详细说明..."
            multiline
            maxLength={300}
          />
        </div>

        {/* 附件 */}
        <div className="bg-gray-800/50 rounded p-3">
          <label className="text-xs font-medium text-gray-500 block mb-2">
            📎 附件
          </label>
          {node.attachments && node.attachments.length > 0 ? (
            <div className="space-y-2">
              {node.attachments.map((att, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-700/50 rounded px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-300 truncate">{att.fileName}</div>
                    <div className="text-xs text-gray-500 truncate">{att.filePath}</div>
                    {att.reason && (
                      <div className="text-xs text-gray-400 mt-1">{att.reason}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">暂无附件</div>
          )}
        </div>

        {/* 标签 */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-2">
            <Tag className="w-3 h-3 inline mr-1" />
            标签
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(localData.tags || []).map((tag: string) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-1 bg-gray-700 text-gray-300 rounded text-sm group"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            placeholder="输入标签后按回车添加..."
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addTag((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </div>

        {/* 重要度 */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-2">
            <Star className="w-3 h-3 inline mr-1" />
            重要度
          </label>
          <div className="flex gap-2">
            {IMPORTANCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange('importance', opt.value)}
                className={`px-3 py-1.5 rounded text-sm transition-all ${
                  (localData.importance || node.importance) === opt.value
                    ? `${opt.bgColor} ${opt.color} ring-1 ring-current`
                    : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 元数据 */}
        <div className="bg-gray-800/30 rounded p-3">
          <label className="text-xs font-medium text-gray-500 block mb-2">
            <Clock className="w-3 h-3 inline mr-1" />
            元数据
          </label>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">创建时间</span>
              <span className="text-gray-400">{formatDate(node.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">更新时间</span>
              <span className="text-gray-400">{formatDate(node.updatedAt)}</span>
            </div>
            {node.metadata && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">激活度</span>
                  <span className="text-gray-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    {dynamicState ? (dynamicState.activation * 100).toFixed(0) + '%' : '100%'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">复习次数</span>
                  <span className="text-gray-400">{node.metadata.reviewCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">强化次数</span>
                  <span className="text-gray-400">{node.metadata.reinforceCount || 0}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 底部操作 */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => onDelete(node)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded text-sm w-full justify-center"
        >
          <Trash2 className="w-4 h-4" />
          删除此节点
        </button>
      </div>
    </div>
  );
};

export default KnowledgeNodePreview;
