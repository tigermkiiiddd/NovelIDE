import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { RelationshipGraph, GraphLink } from './RelationshipGraph';
import { useRelationshipStore, RelationshipState } from '../stores/relationshipStore';
import { useCharacterMemoryStore, CharacterMemoryState } from '../stores/characterMemoryStore';
import {
  CharacterRelation,
  PRESET_RELATION_TYPES,
  RelationType,
  RelationStrength,
} from '../types';
import {
  Search, X, Filter, Plus, Trash2, Edit3, Check,
  ChevronRight, HeartHandshake, User, UserPlus,
} from 'lucide-react';

// ============================================
// Styles
// ============================================

const inputStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.8)',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 8,
  padding: '6px 10px',
  color: '#f8fafc',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
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

// ============================================
// Props
// ============================================

interface RelationshipManagerProps {
  onClose?: () => void;
  isMobile?: boolean;
}

type DrawerMode = 'none' | 'create' | 'edit-link';
type SelectMode = 'idle' | 'selecting';

export const RelationshipManager: React.FC<RelationshipManagerProps> = ({ onClose, isMobile = false }) => {
  const relations = useRelationshipStore((s: RelationshipState) => s.relations);
  const customRelationTypes = useRelationshipStore((s: RelationshipState) => s.customRelationTypes);
  const addRelation = useRelationshipStore((s: RelationshipState) => s.addRelation);
  const updateRelation = useRelationshipStore((s: RelationshipState) => s.updateRelation);
  const deleteRelation = useRelationshipStore((s: RelationshipState) => s.deleteRelation);
  const searchRelations = useRelationshipStore((s: RelationshipState) => s.searchRelations);
  const _syncToFiles = useRelationshipStore((s: RelationshipState) => s._syncToFiles);
  const addCustomRelationType = useRelationshipStore((s: RelationshipState) => s.addCustomRelationType);
  const removeCustomRelationType = useRelationshipStore((s: RelationshipState) => s.removeCustomRelationType);

  const profiles = useCharacterMemoryStore((s: CharacterMemoryState) => s.profiles);
  const characterNames = useMemo(() => profiles.map(p => p.characterName), [profiles]);

  // ============================================
  // UI State
  // ============================================

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Node selection panel
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Node selection mode (for creating relationships via node clicks)
  const [selectMode, setSelectMode] = useState<SelectMode>('idle');
  const [selectFrom, setSelectFrom] = useState<string | null>(null);

  // Drawer (create / edit link)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('none');
  const [editingRelation, setEditingRelation] = useState<CharacterRelation | null>(null);

  // Link inline edit (on side panel)
  const [editingRelationId, setEditingRelationId] = useState<string | null>(null);

  // ============================================
  // Form State — Create
  // ============================================
  const [createFrom, setCreateFrom] = useState('');
  const [createTo, setCreateTo] = useState('');
  const [createType, setCreateType] = useState('');
  const [createCustomType, setCreateCustomType] = useState('');
  const [createStrength, setCreateStrength] = useState<RelationStrength>('中');
  const [createDescription, setCreateDescription] = useState('');

  // ============================================
  // Form State — Edit
  // ============================================
  const [editType, setEditType] = useState('');
  const [editStrength, setEditStrength] = useState<RelationStrength>('中');
  const [editDescription, setEditDescription] = useState('');

  // ============================================
  // All available types
  // ============================================
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    [...PRESET_RELATION_TYPES, ...customRelationTypes].forEach(t => types.add(t));
    relations.forEach(r => types.add(r.type));
    return [...types].sort();
  }, [customRelationTypes, relations]);

  // ============================================
  // Filtered relations (for stats bar)
  // ============================================
  const filteredRelations = useMemo(() => {
    let result = searchQuery.trim() ? searchRelations(searchQuery) : relations;
    if (filterTypes.size > 0) {
      result = result.filter(r => filterTypes.has(r.type));
    }
    return result;
  }, [relations, searchQuery, filterTypes, searchRelations]);

  // ============================================
  // Stats
  // ============================================
  const stats = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    relations.forEach(r => {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    });
    return typeCounts;
  }, [relations]);

  // ============================================
  // Relations for selected node (side panel)
  // ============================================
  const nodeRelations = useMemo(() => {
    if (!selectedNode) return [];
    return relations.filter(r => r.from === selectedNode || r.to === selectedNode);
  }, [selectedNode, relations]);

  // ============================================
  // Handlers
  // ============================================

  const handleNodeClick = useCallback((name: string) => {
    if (selectMode === 'selecting') {
      // Second click: create relationship between selectFrom and name
      if (name !== selectFrom) {
        setCreateFrom(selectFrom!);
        setCreateTo(name);
        setCreateType('');
        setCreateCustomType('');
        setCreateStrength('中');
        setCreateDescription('');
        setDrawerMode('create');
      }
      setSelectMode('idle');
      setSelectFrom(null);
      setSelectedNode(null);
    } else {
      setSelectedNode(name);
    }
  }, [selectMode, selectFrom]);

  const handleNodeDoubleClick = useCallback((name: string) => {
    setSelectMode('selecting');
    setSelectFrom(name);
    setSelectedNode(null);
  }, []);

  const handleLinkClick = useCallback((_link: GraphLink, _event: MouseEvent) => {
    // Link click is handled by RelationshipGraph's internal tooltip + we intercept
  }, []);

  const handleBackgroundDoubleClick = useCallback(() => {
    setCreateFrom('');
    setCreateTo('');
    setCreateType('');
    setCreateCustomType('');
    setCreateStrength('中');
    setCreateDescription('');
    setDrawerMode('create');
    setSelectedNode(null);
    setSelectMode('idle');
    setSelectFrom(null);
  }, []);

  const openCreateFromNode = useCallback((nodeName: string) => {
    setCreateFrom(nodeName);
    setCreateTo('');
    setCreateType('');
    setCreateCustomType('');
    setCreateStrength('中');
    setCreateDescription('');
    setDrawerMode('create');
    setSelectedNode(null);
  }, []);

  const openEditDrawer = useCallback((relation: CharacterRelation) => {
    setEditingRelation(relation);
    setEditType(relation.type);
    setEditStrength(relation.strength);
    setEditDescription(relation.description || '');
    setDrawerMode('edit-link');
  }, []);

  const handleCreate = useCallback(() => {
    const type = createCustomType || createType;
    if (!createFrom || !createTo || !type) return;
    if (createFrom === createTo) return;
    addRelation({
      from: createFrom,
      to: createTo,
      type,
      strength: createStrength,
      description: createDescription || undefined,
      isBidirectional: false,
    });
    _syncToFiles();
    setDrawerMode('none');
    setCreateFrom('');
    setCreateTo('');
    setCreateType('');
    setCreateCustomType('');
  }, [createFrom, createTo, createType, createCustomType, createStrength, createDescription, addRelation, _syncToFiles]);

  const handleSaveEdit = useCallback(() => {
    if (!editingRelation) return;
    updateRelation(editingRelation.id, {
      type: editType,
      strength: editStrength,
      description: editDescription || undefined,
    });
    _syncToFiles();
    setDrawerMode('none');
    setEditingRelation(null);
  }, [editingRelation, editType, editStrength, editDescription, updateRelation, _syncToFiles]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm('确定删除这条关系吗？')) return;
    deleteRelation(id);
    _syncToFiles();
  }, [deleteRelation, _syncToFiles]);

  const handleBatchDeleteFromNode = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`确定删除选中的 ${ids.length} 条关系吗？`)) return;
    ids.forEach(id => deleteRelation(id));
    _syncToFiles();
  }, [deleteRelation, _syncToFiles]);

  const cancelDrawer = useCallback(() => {
    setDrawerMode('none');
    setEditingRelation(null);
  }, []);

  const cancelSelectMode = useCallback(() => {
    setSelectMode('idle');
    setSelectFrom(null);
  }, []);

  // ESC to cancel select mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectMode === 'selecting') cancelSelectMode();
        else if (drawerMode !== 'none') cancelDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectMode, drawerMode, cancelSelectMode, cancelDrawer]);

  // Close side panel when drawer opens
  useEffect(() => {
    if (drawerMode !== 'none') setSelectedNode(null);
  }, [drawerMode]);

  // ============================================
  // Filter toggle
  // ============================================
  const toggleFilter = useCallback((type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // ============================================
  // Render
  // ============================================

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)' }}>
      {/* Top toolbar */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        zIndex: 20,
      }}>
        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 10,
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          flex: 1,
          maxWidth: 260,
        }}>
          <Search size={14} style={{ color: '#64748b', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索角色或关系..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: 13, width: '100%' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter */}
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 10,
            background: filterTypes.size > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.85)',
            border: filterTypes.size > 0 ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
            color: filterTypes.size > 0 ? '#bae6fd' : '#94a3b8',
            cursor: 'pointer', fontSize: 13,
          }}
        >
          <Filter size={14} />
          {filterTypes.size > 0 ? `${filterTypes.size}` : '筛选'}
        </button>

        {/* Stats */}
        <div style={{
          padding: '4px 10px', borderRadius: 8,
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          color: '#64748b', fontSize: 11,
          whiteSpace: 'nowrap',
        }}>
          {filteredRelations.length} 关系
        </div>

        {/* Close */}
        {onClose && (
          <button onClick={onClose} style={btnStyle()}>
            <X size={14} /> 关闭
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <div style={{
          position: 'absolute',
          top: 50,
          left: 12,
          padding: '10px 14px',
          borderRadius: 12,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          zIndex: 20,
          maxWidth: 320,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          {allTypes.map(type => (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                border: `1px solid ${getRelationColor(type)}${filterTypes.has(type) ? 'cc' : '40'}`,
                background: filterTypes.has(type) ? `${getRelationColor(type)}25` : 'transparent',
                color: filterTypes.has(type) ? getRelationColor(type) : '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Selection mode banner */}
      {selectMode === 'selecting' && (
        <div style={{
          position: 'absolute',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          padding: '8px 20px',
          borderRadius: 12,
          background: 'rgba(56, 189, 248, 0.15)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          color: '#bae6fd',
          fontSize: 13,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 4px 16px rgba(56, 189, 248, 0.2)',
        }}>
          <UserPlus size={14} />
          已选择 <strong>{selectFrom}</strong> — 点击另一角色创建关系
          <button
            onClick={cancelSelectMode}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginLeft: 4, padding: 0, display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main graph */}
      <RelationshipGraph
        focusCharacter={undefined}
        height={window.innerHeight - 80}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onBackgroundDoubleClick={handleBackgroundDoubleClick}
      />

      {/* FAB */}
      <button
        onClick={handleBackgroundDoubleClick}
        title="添加关系"
        style={{
          position: 'absolute',
          bottom: isMobile ? 80 : 20,
          right: isMobile ? 16 : 20,
          zIndex: 20,
          width: isMobile ? 52 : 48,
          height: isMobile ? 52 : 48,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #34d399, #059669)',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(52, 211, 153, 0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => {
          (e.target as HTMLElement).style.transform = 'scale(1.08)';
        }}
        onMouseLeave={e => {
          (e.target as HTMLElement).style.transform = 'scale(1)';
        }}
      >
        <Plus size={22} />
      </button>

      {/* Right side panel — selected node */}
      {selectedNode && drawerMode === 'none' && (
        <div style={{
          position: 'absolute',
          ...(isMobile ? { bottom: 0, left: 0, right: 0, borderTop: '1px solid rgba(148, 163, 184, 0.12)', borderRadius: '16px 16px 0 0', animation: 'slideUpPanel 0.2s ease-out' } : { top: 0, right: 0, bottom: 0, width: 320, borderLeft: '1px solid rgba(148, 163, 184, 0.12)', animation: 'slideInRight 0.2s ease-out' }),
          background: 'rgba(15, 23, 42, 0.97)',
          zIndex: 25,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: isMobile ? '70vh' : '100%',
        }}>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } } @keyframes slideUpPanel { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

          {/* Panel header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={16} style={{ color: '#38bdf8' }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{selectedNode}</span>
              </div>
              <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {nodeRelations.length} 条关系
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button
                onClick={() => openCreateFromNode(selectedNode)}
                style={{ ...btnStyle('#34d399'), flex: 1, justifyContent: 'center' }}
              >
                <UserPlus size={12} /> 添加关系
              </button>
              <button
                onClick={() => { handleNodeDoubleClick(selectedNode); setSelectedNode(null); }}
                style={{ ...btnStyle('#60a5fa') }}
                title="双击此角色开始连线"
              >
                <ChevronRight size={12} /> 连线
              </button>
            </div>
          </div>

          {/* Relations list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {nodeRelations.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                暂无关系数据
              </div>
            ) : (
              nodeRelations.map(r => {
                const isEditing = editingRelationId === r.id;
                const otherName = r.from === selectedNode ? r.to : r.from;
                return (
                  <div key={r.id} style={{ padding: '8px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.06)' }}>
                    {isEditing ? (
                      /* Inline edit */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{otherName}</span>
                        </div>
                        <select value={editType} onChange={e => setEditType(e.target.value)} style={{ ...selectStyle, padding: '4px 6px', fontSize: 12 }}>
                          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={editStrength} onChange={e => setEditStrength(e.target.value as RelationStrength)} style={{ ...selectStyle, padding: '4px 6px', fontSize: 12 }}>
                          <option value="强">强</option><option value="中">中</option><option value="弱">弱</option>
                        </select>
                        <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="描述" style={{ ...inputStyle, padding: '4px 6px', fontSize: 12 }} />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => {
                            if (!editingRelation) return;
                            updateRelation(editingRelation.id, { type: editType, strength: editStrength, description: editDescription || undefined });
                            _syncToFiles();
                            setEditingRelationId(null);
                            setEditingRelation(null);
                          }} style={{ ...btnStyle('#34d399'), flex: 1, justifyContent: 'center' }}><Check size={12} /></button>
                          <button onClick={() => { setEditingRelationId(null); setEditingRelation(null); }} style={{ ...btnStyle(), flex: 1, justifyContent: 'center' }}><X size={12} /></button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          {r.from === selectedNode ? (r.isBidirectional ? '⇄' : '→') : (r.isBidirectional ? '⇄' : '←')}
                          {' '}{otherName}
                        </span>
                        <span style={{
                          padding: '2px 7px', borderRadius: 999, fontSize: 11,
                          background: `${getRelationColor(r.type)}18`, color: getRelationColor(r.type),
                        }}>
                          {r.type}
                        </span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                          <button
                            onClick={() => { setEditingRelationId(r.id); setEditingRelation(r); setEditType(r.type); setEditStrength(r.strength); setEditDescription(r.description || ''); }}
                            style={{ ...btnStyle(), padding: '2px 5px' }}
                          >
                            <Edit3 size={11} />
                          </button>
                          <button onClick={() => handleDelete(r.id)} style={{ ...btnStyle('#ef4444'), padding: '2px 5px' }}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    )}
                    {r.description && !isEditing && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>{r.description}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Drawer — Create / Edit */}
      {drawerMode !== 'none' && (
        <>
          <div
            onClick={cancelDrawer}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
          />
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'rgba(15, 23, 42, 0.98)',
            borderTop: '1px solid rgba(148, 163, 184, 0.15)',
            borderRadius: '16px 16px 0 0',
            zIndex: 45,
            padding: 20,
            maxHeight: '80vh',
            overflowY: 'auto',
            animation: 'slideUp 0.2s ease-out',
          }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HeartHandshake size={18} style={{ color: drawerMode === 'create' ? '#34d399' : '#60a5fa' }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                  {drawerMode === 'create' ? '添加关系' : '编辑关系'}
                </span>
              </div>
              <button onClick={cancelDrawer} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            {drawerMode === 'edit-link' && editingRelation && (
              <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  {editingRelation.from} {editingRelation.isBidirectional ? '⇄' : '→'} {editingRelation.to}
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {drawerMode === 'create' ? (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>角色 A</div>
                    <select value={createFrom} onChange={e => setCreateFrom(e.target.value)} style={selectStyle}>
                      <option value="">选择角色</option>
                      {characterNames.map(n => <option key={n} value={n}>{n}</option>)}
                      {createFrom && !characterNames.includes(createFrom) && <option value={createFrom}>{createFrom}</option>}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>角色 B</div>
                    <select value={createTo} onChange={e => setCreateTo(e.target.value)} style={selectStyle}>
                      <option value="">选择角色</option>
                      {characterNames.map(n => n !== createFrom && <option key={n} value={n}>{n}</option>)}
                      {createTo && createTo !== createFrom && <option value={createTo}>{createTo}</option>}
                    </select>
                  </div>
                </>
              ) : null}

              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>关系类型</div>
                <select value={drawerMode === 'create' ? createType : editType} onChange={e => {
                  if (drawerMode === 'create') setCreateType(e.target.value);
                  else setEditType(e.target.value);
                }} style={selectStyle}>
                  <option value="">选择类型</option>
                  {[...PRESET_RELATION_TYPES, ...customRelationTypes].map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom__">自定义...</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>强度</div>
                <select value={drawerMode === 'create' ? createStrength : editStrength}
                  onChange={e => drawerMode === 'create' ? setCreateStrength(e.target.value as RelationStrength) : setEditStrength(e.target.value as RelationStrength)}
                  style={selectStyle}>
                  <option value="强">强</option><option value="中">中</option><option value="弱">弱</option>
                </select>
              </div>

              {drawerMode === 'create' && createType === '__custom__' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>自定义类型名称</div>
                  <input type="text" value={createCustomType} onChange={e => setCreateCustomType(e.target.value)} placeholder="输入自定义关系类型..." style={inputStyle} />
                </div>
              )}

              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>关系描述</div>
                <textarea
                  value={drawerMode === 'create' ? createDescription : editDescription}
                  onChange={e => drawerMode === 'create' ? setCreateDescription(e.target.value) : setEditDescription(e.target.value)}
                  placeholder="描述这段关系..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'none', minHeight: isMobile ? 60 : 36 }}
                />
              </div>

            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={cancelDrawer} style={btnStyle()}>取消</button>
              <button
                onClick={drawerMode === 'create' ? handleCreate : handleSaveEdit}
                disabled={drawerMode === 'create' ? (!createFrom || !createTo || (!createType && !createCustomType)) : false}
                style={btnStyle(drawerMode === 'create' ? '#34d399' : '#60a5fa')}
              >
                <Check size={14} />
                {drawerMode === 'create' ? '确认添加' : '保存修改'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
