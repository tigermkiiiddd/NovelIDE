import React, { useEffect, useMemo, useState } from 'react';
import { useLongTermMemoryStore } from '../stores/longTermMemoryStore';
import { LongTermMemory, MemoryType } from '../types';
import { Plus, Trash2, Edit2, X, Save, BookOpen, Tag, AlertTriangle, PenTool, User, Globe } from 'lucide-react';
import { getMemoryDynamicState, sortMemoriesForReview } from '../utils/memoryIntelligence';

const MEMORY_TYPE_LABELS: Record<MemoryType, { label: string; icon: React.ReactNode; color: string }> = {
  setting: { label: '设定', icon: <Globe className="w-4 h-4" />, color: 'text-blue-400' },
  style: { label: '风格', icon: <PenTool className="w-4 h-4" />, color: 'text-purple-400' },
  restriction: { label: '限制', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-400' },
  experience: { label: '经验', icon: <BookOpen className="w-4 h-4" />, color: 'text-green-400' },
  character_rule: { label: '角色规则', icon: <User className="w-4 h-4" />, color: 'text-yellow-400' },
  world_rule: { label: '世界观', icon: <Globe className="w-4 h-4" />, color: 'text-cyan-400' }
};

const IMPORTANCE_COLORS = {
  critical: 'bg-red-900/30 border-red-500',
  important: 'bg-yellow-900/30 border-yellow-500',
  normal: 'bg-gray-800/30 border-gray-600'
};

const EMPTY_MEMORY: Omit<LongTermMemory, 'id' | 'metadata'> = {
  name: '',
  type: 'setting',
  tags: [],
  keywords: [],
  summary: '',
  content: '',
  importance: 'normal',
  isResident: false,
  relatedMemories: []
};

export const LongTermMemoryView: React.FC = () => {
  const { memories, addMemory, updateMemory, deleteMemory, ensureInitialized } = useLongTermMemoryStore();
  const sortedMemories = useMemo(() => sortMemoriesForReview(memories, Date.now()), [memories]);
  const reviewCount = useMemo(
    () => memories.filter((memory) => getMemoryDynamicState(memory, Date.now()).isDueForReview).length,
    [memories]
  );

  // 组件挂载时确保初始化
  useEffect(() => {
    ensureInitialized();
  }, [ensureInitialized]);

  const [editMode, setEditMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<LongTermMemory, 'id' | 'metadata'>>(EMPTY_MEMORY);
  const [tagInput, setTagInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  const handleAdd = () => {
    setEditMode('add');
    setEditingId(null);
    setFormData(EMPTY_MEMORY);
    setTagInput('');
    setKeywordInput('');
  };

  const handleEdit = (memory: LongTermMemory) => {
    setEditMode('edit');
    setEditingId(memory.id);
    setFormData({
      name: memory.name,
      type: memory.type,
      tags: [...memory.tags],
      keywords: [...memory.keywords],
      summary: memory.summary,
      content: memory.content,
      importance: memory.importance,
      isResident: memory.isResident ?? false,
      relatedMemories: [...memory.relatedMemories]
    });
    setTagInput('');
    setKeywordInput('');
  };

  const handleDelete = (id: string) => {
    if (confirm('确定删除这条记忆吗？')) {
      deleteMemory(id);
    }
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('请输入记忆名称');
      return;
    }

    if (editMode === 'add') {
      addMemory({
        ...formData,
        metadata: { source: 'user' }
      });
    } else if (editMode === 'edit' && editingId) {
      updateMemory(editingId, formData);
    }

    setEditMode('none');
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditMode('none');
    setEditingId(null);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !formData.keywords.includes(keywordInput.trim())) {
      setFormData({ ...formData, keywords: [...formData.keywords, keywordInput.trim()] });
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData({ ...formData, keywords: formData.keywords.filter(k => k !== keyword) });
  };

  // 编辑模式
  if (editMode !== 'none') {
    return (
      <div className="h-full overflow-auto bg-gray-900 text-gray-100 p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            {editMode === 'add' ? '添加长期记忆' : '编辑长期记忆'}
          </h2>

          <div className="space-y-4">
            {/* 记忆名称 */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-400">记忆名称 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="例如：主角性格设定"
              />
            </div>

            {/* 记忆类型 */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-400">记忆类型</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as MemoryType })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(MEMORY_TYPE_LABELS).map(([type, { label }]) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </div>

            {/* 重要程度 */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-400">重要程度</label>
              <select
                value={formData.importance}
                onChange={(e) => setFormData({ ...formData, importance: e.target.value as 'critical' | 'important' | 'normal' })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
              >
                <option value="critical">Critical - 必须遵守（会注入系统提示词）</option>
                <option value="important">Important - 重要</option>
                <option value="normal">Normal - 普通</option>
              </select>
            </div>

            {/* 常驻标记 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isResident}
                  onChange={(e) => setFormData({ ...formData, isResident: e.target.checked })}
                  className="w-4 h-4 bg-gray-800 border border-gray-700 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span>常驻记忆（在系统提示词中显示标题和关键词）</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">
                常驻记忆会自动注入到每次对话的上下文中，方便快速索引。需要完整内容时，AI会使用recall_memory工具召回。
              </p>
            </div>

            {/* 关键字 */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-400">关键字（用于检索）</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                  placeholder="输入关键字后按回车添加"
                />
                <button
                  type="button"
                  onClick={addKeyword}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-sm">
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* 标签 */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-400">标签（用于分类）</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                  placeholder="输入标签后按回车添加"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/50 text-purple-300 rounded text-sm">
                    <Tag className="w-3 h-3" />
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* 摘要 */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-400">摘要（50-100字，会注入系统提示词）</label>
              <textarea
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none h-20"
                placeholder="简要描述这条记忆的核心内容"
              />
            </div>

            {/* 完整内容 */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-400">完整内容</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none h-40"
                placeholder="详细描述这条记忆的内容"
              />
            </div>

            {/* 按钮 */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 查看模式
  return (
    <div className="h-full overflow-auto bg-gray-900 text-gray-100">
      {/* 头部 */}
      <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          长期记忆
          <span className="text-sm font-normal text-gray-400">({memories.length} 条 / 待复习 {reviewCount})</span>
        </h2>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm"
        >
          <Plus className="w-4 h-4" />
          添加记忆
        </button>
      </div>

      {/* 记忆列表 */}
      {memories.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <BookOpen className="w-12 h-12 mb-4 opacity-50" />
          <p>暂无长期记忆</p>
          <p className="text-sm">点击上方按钮添加第一条记忆</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {sortedMemories.map((memory) => {
            const typeInfo = MEMORY_TYPE_LABELS[memory.type];
            const dynamic = getMemoryDynamicState(memory, Date.now());
            return (
              <div
                key={memory.id}
                className={`border rounded-lg p-4 ${IMPORTANCE_COLORS[memory.importance]}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{memory.name}</h3>
                    <span className={`flex items-center gap-1 text-xs ${typeInfo.color}`}>
                      {typeInfo.icon}
                      {typeInfo.label}
                    </span>
                    {memory.importance === 'critical' && (
                      <span className="text-xs text-red-400 bg-red-900/50 px-1.5 py-0.5 rounded">
                        Critical
                      </span>
                    )}
                    {memory.isResident && (
                      <span className="text-xs text-blue-400 bg-blue-900/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        🔖 常驻
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(memory)}
                      className="p-1.5 hover:bg-gray-700 rounded"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(memory.id)}
                      className="p-1.5 hover:bg-red-900/50 text-red-400 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {memory.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {memory.keywords.map((kw) => (
                      <span key={kw} className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-2 text-xs text-gray-300">
                  <span className="px-2 py-1 rounded bg-gray-800/80">state: {dynamic.state}</span>
                  <span className="px-2 py-1 rounded bg-gray-800/80">activation: {Math.round(dynamic.activation * 100)}%</span>
                  <span className="px-2 py-1 rounded bg-gray-800/80">strength: {Math.round(dynamic.strength * 100)}%</span>
                  <span className="px-2 py-1 rounded bg-gray-800/80">recall: {memory.metadata.recallCount}</span>
                  <span className="px-2 py-1 rounded bg-gray-800/80">source: {memory.metadata.sourceKind || memory.metadata.source}</span>
                  <span className="px-2 py-1 rounded bg-gray-800/80">review: {new Date(memory.metadata.nextReviewAt).toLocaleDateString('zh-CN')}</span>
                </div>

                {memory.summary && (
                  <p className="text-sm text-gray-300 mb-2">{memory.summary}</p>
                )}

                {memory.content && (
                  <p className="text-sm text-gray-400">{memory.content}</p>
                )}

                {memory.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {memory.tags.map((tag) => (
                      <span key={tag} className="text-xs flex items-center gap-1 px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded">
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
