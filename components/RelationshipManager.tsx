import React, { useMemo, useState, useCallback } from 'react';
import { useRelationshipStore, RelationshipState } from '../stores/relationshipStore';
import { useCharacterMemoryStore, CharacterMemoryState } from '../stores/characterMemoryStore';
import {
  CharacterRelation,
  PRESET_RELATION_TYPES,
  RelationType,
  RelationStrength,
} from '../types';
import {
  Search, Plus, Trash2, Edit3, Check, X,
  ChevronDown, ChevronUp, HeartHandshake,
} from 'lucide-react';

const inputStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.8)',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 8,
  padding: '6px 10px',
  color: '#f8fafc',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const btnStyle = (color = '#94a3b8'): React.CSSProperties => ({
  padding: '4px 8px',
  borderRadius: 6,
  background: 'transparent',
  border: `1px solid ${color}30`,
  color,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  transition: 'all 0.2s',
});

const RELATION_COLOR_MAP: Record<string, string> = {
  '朋友': '#60a5fa', '敌人': '#ef4444', '恋人': '#f472b6', '夫妻': '#e879f9',
  '师徒': '#fbbf24', '同门': '#34d399', '亲属': '#a78bfa', '盟友': '#22d3ee',
  '对手': '#f97316', '上下级': '#8b5cf6', '暗恋': '#fb7185', '仇人': '#dc2626',
  '同窗': '#2dd4bf', '邻居': '#a3e635', '合作者': '#38bdf8', '陌生人': '#6b7280',
};

const getRelationColor = (type: string) => RELATION_COLOR_MAP[type] || '#94a3b8';

interface RelationshipManagerProps {
  onClose?: () => void;
}

export const RelationshipManager: React.FC<RelationshipManagerProps> = ({ onClose }) => {
  const relations = useRelationshipStore((s: RelationshipState) => s.relations);
  const customRelationTypes = useRelationshipStore((s: RelationshipState) => s.customRelationTypes);
  const addRelation = useRelationshipStore((s: RelationshipState) => s.addRelation);
  const addRelationsBatch = useRelationshipStore((s: RelationshipState) => s.addRelationsBatch);
  const updateRelation = useRelationshipStore((s: RelationshipState) => s.updateRelation);
  const deleteRelation = useRelationshipStore((s: RelationshipState) => s.deleteRelation);
  const deleteRelationsBatch = useRelationshipStore((s: RelationshipState) => s.deleteRelationsBatch);
  const addCustomRelationType = useRelationshipStore((s: RelationshipState) => s.addCustomRelationType);
  const removeCustomRelationType = useRelationshipStore((s: RelationshipState) => s.removeCustomRelationType);
  const searchRelations = useRelationshipStore((s: RelationshipState) => s.searchRelations);
  const _syncToFiles = useRelationshipStore((s: RelationshipState) => s._syncToFiles);

  const profiles = useCharacterMemoryStore((s: CharacterMemoryState) => s.profiles);
  const characterNames = useMemo(() => profiles.map(p => p.characterName), [profiles]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'from' | 'type' | 'strength' | 'updatedAt'>('updatedAt');
  const [sortAsc, setSortAsc] = useState(false);

  // 添加表单
  const [addFrom, setAddFrom] = useState('');
  const [addTo, setAddTo] = useState('');
  const [addType, setAddType] = useState('');
  const [addCustomType, setAddCustomType] = useState('');
  const [addStrength, setAddStrength] = useState<RelationStrength>('中');
  const [addDescription, setAddDescription] = useState('');
  const [addBidirectional, setAddBidirectional] = useState(true);

  // 编辑表单
  const [editType, setEditType] = useState('');
  const [editStrength, setEditStrength] = useState<RelationStrength>('中');
  const [editDescription, setEditDescription] = useState('');

  // 自定义类型输入
  const [newCustomType, setNewCustomType] = useState('');
  const [showCustomTypeManager, setShowCustomTypeManager] = useState(false);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    [...PRESET_RELATION_TYPES, ...customRelationTypes].forEach(t => types.add(t));
    relations.forEach(r => types.add(r.type));
    return [...types].sort();
  }, [customRelationTypes, relations]);

  // 筛选 + 搜索
  const filteredRelations = useMemo(() => {
    let result = searchQuery.trim() ? searchRelations(searchQuery) : relations;
    if (filterType) {
      result = result.filter(r => r.type === filterType);
    }
    // 排序
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'from': cmp = a.from.localeCompare(b.from); break;
        case 'type': cmp = a.type.localeCompare(b.type); break;
        case 'strength': cmp = a.strength.localeCompare(b.strength); break;
        case 'updatedAt': cmp = a.updatedAt - b.updatedAt; break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [relations, searchQuery, filterType, sortField, sortAsc, searchRelations]);

  // 统计
  const stats = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    relations.forEach(r => {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    });
    return typeCounts;
  }, [relations]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredRelations.map(r => r.id)));
  }, [filteredRelations]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条关系吗？`)) return;
    deleteRelationsBatch([...selectedIds]);
    setSelectedIds(new Set());
    _syncToFiles();
  }, [selectedIds, deleteRelationsBatch, _syncToFiles]);

  const handleAdd = useCallback(() => {
    const type = addCustomType || addType;
    if (!addFrom || !addTo || !type) return;
    addRelation({
      from: addFrom,
      to: addTo,
      type,
      strength: addStrength,
      description: addDescription || undefined,
      isBidirectional: addBidirectional,
    });
    _syncToFiles();
    setAddFrom('');
    setAddTo('');
    setAddType('');
    setAddCustomType('');
    setAddStrength('中');
    setAddDescription('');
    setShowAddForm(false);
  }, [addFrom, addTo, addType, addCustomType, addStrength, addDescription, addBidirectional, addRelation, _syncToFiles]);

  const handleStartEdit = useCallback((r: CharacterRelation) => {
    setEditingId(r.id);
    setEditType(r.type);
    setEditStrength(r.strength);
    setEditDescription(r.description || '');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    updateRelation(editingId, {
      type: editType,
      strength: editStrength,
      description: editDescription || undefined,
    });
    _syncToFiles();
    setEditingId(null);
  }, [editingId, editType, editStrength, editDescription, updateRelation, _syncToFiles]);

  const handleDeleteSingle = useCallback((id: string) => {
    if (!confirm('确定删除这条关系吗？')) return;
    deleteRelation(id);
    _syncToFiles();
  }, [deleteRelation, _syncToFiles]);

  const handleAddCustomType = useCallback(() => {
    const t = newCustomType.trim();
    if (!t) return;
    addCustomRelationType(t);
    setNewCustomType('');
  }, [newCustomType, addCustomRelationType]);

  const toggleSort = useCallback((field: typeof sortField) => {
    if (sortField === field) setSortAsc(a => !a);
    else { setSortField(field); setSortAsc(true); }
  }, [sortField]);

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: 20,
        background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
        color: '#e2e8f0',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HeartHandshake size={24} style={{ color: '#f472b6' }} />
            <span style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>人际关系管理</span>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              共 {relations.length} 条关系
            </span>
          </div>
          <button onClick={onClose} style={btnStyle()}>
            <X size={16} /> 关闭
          </button>
        </div>

        {/* 搜索 + 筛选 + 操作栏 */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ color: '#64748b' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索角色名、关系描述..."
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ ...selectStyle, width: 'auto', minWidth: 100 }}
          >
            <option value="">全部类型</option>
            {allTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <button onClick={() => setShowAddForm(!showAddForm)} style={btnStyle('#34d399')}>
            <Plus size={14} /> 添加
          </button>

          {selectedIds.size > 0 && (
            <button onClick={handleBatchDelete} style={btnStyle('#ef4444')}>
              <Trash2 size={14} /> 删除 ({selectedIds.size})
            </button>
          )}

          <button onClick={() => setShowCustomTypeManager(!showCustomTypeManager)} style={btnStyle('#a78bfa')}>
            自定义类型
          </button>
        </div>

        {/* 统计条 */}
        {Object.keys(stats).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? '' : type)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: `1px solid ${getRelationColor(type)}${filterType === type ? 'cc' : '40'}`,
                  background: filterType === type ? `${getRelationColor(type)}25` : 'transparent',
                  color: getRelationColor(type),
                  cursor: 'pointer',
                }}
              >
                {type} ({count})
              </button>
            ))}
          </div>
        )}

        {/* 自定义类型管理 */}
        {showCustomTypeManager && (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa', marginBottom: 10 }}>
              自定义关系类型
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                type="text"
                value={newCustomType}
                onChange={e => setNewCustomType(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustomType()}
                placeholder="输入新的关系类型名称..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddCustomType} style={btnStyle('#34d399')}>
                <Plus size={14} /> 添加
              </button>
            </div>
            {customRelationTypes.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {customRelationTypes.map(type => (
                  <span
                    key={type}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'rgba(148, 163, 184, 0.1)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      color: '#cbd5e1',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {type}
                    <button
                      onClick={() => removeCustomRelationType(type)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 添加表单 */}
        {showAddForm && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(52, 211, 153, 0.2)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: '#34d399', marginBottom: 12 }}>
              添加关系
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>角色A</div>
                <select value={addFrom} onChange={e => setAddFrom(e.target.value)} style={selectStyle}>
                  <option value="">选择角色</option>
                  {characterNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>角色B</div>
                <select value={addTo} onChange={e => setAddTo(e.target.value)} style={selectStyle}>
                  <option value="">选择角色</option>
                  {characterNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>关系类型</div>
                <select value={addType} onChange={e => setAddType(e.target.value)} style={selectStyle}>
                  <option value="">选择类型</option>
                  {[...PRESET_RELATION_TYPES, ...customRelationTypes].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__custom__">自定义...</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>强度</div>
                <select value={addStrength} onChange={e => setAddStrength(e.target.value as RelationStrength)} style={selectStyle}>
                  <option value="强">强</option>
                  <option value="中">中</option>
                  <option value="弱">弱</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>关系描述</div>
                <input
                  type="text"
                  value={addDescription}
                  onChange={e => setAddDescription(e.target.value)}
                  placeholder="描述这段关系..."
                  style={inputStyle}
                />
              </div>
              {addType === '__custom__' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>自定义类型名称</div>
                  <input
                    type="text"
                    value={addCustomType}
                    onChange={e => setAddCustomType(e.target.value)}
                    placeholder="输入自定义关系类型..."
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8', flex: 1 }}>
                <input
                  type="checkbox"
                  checked={addBidirectional}
                  onChange={e => setAddBidirectional(e.target.checked)}
                />
                双向关系
              </label>
              <button onClick={() => setShowAddForm(false)} style={btnStyle()}>取消</button>
              <button
                onClick={handleAdd}
                disabled={!addFrom || !addTo || (!addType && !addCustomType)}
                style={btnStyle(addFrom && addTo ? '#34d399' : '#64748b')}
              >
                <Check size={14} /> 确认添加
              </button>
            </div>
          </div>
        )}

        {/* 关系列表 */}
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          {/* 表头 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 1fr 100px 70px 1fr 120px',
              gap: 8,
              padding: '10px 14px',
              background: 'rgba(30, 41, 59, 0.8)',
              fontSize: 12,
              fontWeight: 600,
              color: '#94a3b8',
              alignItems: 'center',
            }}
          >
            <span>
              <input
                type="checkbox"
                checked={selectedIds.size === filteredRelations.length && filteredRelations.length > 0}
                onChange={() => selectedIds.size === filteredRelations.length ? clearSelection() : selectAll()}
                style={{ cursor: 'pointer' }}
              />
            </span>
            <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('from')}>
              角色A {sortField === 'from' && (sortAsc ? '↑' : '↓')}
            </span>
            <span>角色B</span>
            <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('type')}>
              类型 {sortField === 'type' && (sortAsc ? '↑' : '↓')}
            </span>
            <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('strength')}>
              强度 {sortField === 'strength' && (sortAsc ? '↑' : '↓')}
            </span>
            <span>描述</span>
            <span>操作</span>
          </div>

          {/* 行 */}
          {filteredRelations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              {relations.length === 0 ? '暂无关系数据，点击"添加"按钮创建' : '没有匹配的关系'}
            </div>
          ) : (
            filteredRelations.map(r => (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 1fr 100px 70px 1fr 120px',
                  gap: 8,
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(148, 163, 184, 0.06)',
                  background: selectedIds.has(r.id) ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                  fontSize: 13,
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
              >
                {editingId === r.id ? (
                  /* 编辑模式 */
                  <>
                    <span />
                    <span style={{ color: '#e2e8f0' }}>{r.from}</span>
                    <span style={{ color: '#e2e8f0' }}>{r.to}</span>
                    <span>
                      <select value={editType} onChange={e => setEditType(e.target.value)} style={{ ...selectStyle, padding: '2px 6px', fontSize: 12 }}>
                        {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </span>
                    <span>
                      <select value={editStrength} onChange={e => setEditStrength(e.target.value as RelationStrength)} style={{ ...selectStyle, padding: '2px 6px', fontSize: 12 }}>
                        <option value="强">强</option>
                        <option value="中">中</option>
                        <option value="弱">弱</option>
                      </select>
                    </span>
                    <span>
                      <input
                        type="text"
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        style={{ ...inputStyle, padding: '2px 6px', fontSize: 12 }}
                      />
                    </span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button onClick={handleSaveEdit} style={btnStyle('#34d399')}><Check size={14} /></button>
                      <button onClick={() => setEditingId(null)} style={btnStyle()}><X size={14} /></button>
                    </span>
                  </>
                ) : (
                  /* 查看模式 */
                  <>
                    <span>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </span>
                    <span style={{ color: '#e2e8f0' }}>{r.from}</span>
                    <span style={{ color: '#e2e8f0' }}>
                      {r.isBidirectional ? '⇄' : '→'} {r.to}
                    </span>
                    <span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: `${getRelationColor(r.type)}18`,
                          color: getRelationColor(r.type),
                          fontSize: 12,
                        }}
                      >
                        {r.type}
                      </span>
                    </span>
                    <span style={{ color: r.strength === '强' ? '#fbbf24' : r.strength === '中' ? '#94a3b8' : '#64748b' }}>
                      {r.strength}
                    </span>
                    <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.description || '—'}
                    </span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleStartEdit(r)} style={btnStyle()}>
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => handleDeleteSingle(r.id)} style={btnStyle('#ef4444')}>
                        <Trash2 size={12} />
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
