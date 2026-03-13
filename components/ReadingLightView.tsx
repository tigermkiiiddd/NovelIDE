import React, { useState, useMemo } from 'react';
import { useChapterAnalysisStore } from '../stores/chapterAnalysisStore';
import { useProjectStore } from '../stores/projectStore';
import { useFileStore } from '../stores/fileStore';
import { ChapterAnalysis, PlotKeyPoint, CharacterState, ForeshadowingItem } from '../types';
import { Plus, Trash2, Edit2, X, ChevronDown, ChevronRight, BookOpen, User, Sparkles, Zap } from 'lucide-react';

type ViewMode = 'plot' | 'character' | 'foreshadowing';

export const ReadingLightView: React.FC = () => {
  const getCurrentProject = useProjectStore(state => state.getCurrentProject);
  const project = getCurrentProject();
  const { analyses, addAnalysis, updateAnalysis, deleteAnalysis } = useChapterAnalysisStore();
  const fileStore = useFileStore();

  const [viewMode, setViewMode] = useState<ViewMode>('foreshadowing');
  const [editMode, setEditMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);

  // 可用的章节列表
  const availableChapters = useMemo(() => {
    const draftFolder = fileStore.files.find(f => f.name === '05_正文草稿' && f.parentId === 'root');
    if (!draftFolder) return [];
    return fileStore.files.filter(f => f.parentId === draftFolder.id && f.name.endsWith('.md'));
  }, [fileStore.files]);

  // 按章节排序的分析数据
  const sortedAnalyses = useMemo(() => {
    return [...analyses].sort((a, b) => a.extractedAt - b.extractedAt);
  }, [analyses]);

  const handleAddNew = () => {
    setEditMode('add');
    setEditingId(null);
  };

  const handleEdit = (id: string) => {
    setEditMode('edit');
    setEditingId(id);
  };

  const handleDelete = (id: string) => {
    if (confirm('确定删除这个章节分析吗？')) {
      deleteAnalysis(id);
    }
  };

  const handleSave = (analysis: ChapterAnalysis) => {
    if (editMode === 'add') {
      addAnalysis(analysis);
    } else if (editMode === 'edit' && editingId) {
      updateAnalysis(editingId, analysis);
    }
    setEditMode('none');
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditMode('none');
    setEditingId(null);
  };

  if (!project) {
    return <div style={{ padding: '20px', color: '#888' }}>请先打开一个项目</div>;
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #333',
        backgroundColor: '#252526'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>📖 阅读灯视图</h2>
          <button onClick={handleAddNew} style={addButtonStyle}>
            <Plus size={16} /> 添加分析
          </button>
        </div>

        {/* View Mode Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <TabButton
            active={viewMode === 'foreshadowing'}
            onClick={() => setViewMode('foreshadowing')}
            icon={<Zap size={14} />}
            label="伏笔跟踪"
            count={analyses.reduce((sum, a) => sum + a.foreshadowing.length, 0)}
          />
          <TabButton
            active={viewMode === 'character'}
            onClick={() => setViewMode('character')}
            icon={<User size={14} />}
            label="角色状态"
            count={analyses.reduce((sum, a) => sum + a.characterStates.length, 0)}
          />
          <TabButton
            active={viewMode === 'plot'}
            onClick={() => setViewMode('plot')}
            icon={<Sparkles size={14} />}
            label="剧情关键点"
            count={analyses.reduce((sum, a) => sum + a.plotSummary.length, 0)}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* 添加/编辑表单 */}
        {editMode !== 'none' && (
          <AnalysisForm
            mode={editMode}
            editingData={editMode === 'edit' ? analyses.find(a => a.id === editingId) : undefined}
            availableChapters={availableChapters}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}

        {analyses.length === 0 && editMode === 'none' ? (
          <div style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>
            暂无章节分析数据。<br />点击右上角"添加分析"按钮手动添加。
          </div>
        ) : (
          <>
            {viewMode === 'foreshadowing' && (
              <ForeshadowingView analyses={sortedAnalyses} onEdit={handleEdit} onDelete={handleDelete} />
            )}
            {viewMode === 'character' && (
              <CharacterView analyses={sortedAnalyses} onEdit={handleEdit} onDelete={handleDelete} />
            )}
            {viewMode === 'plot' && (
              <PlotView analyses={sortedAnalyses} onEdit={handleEdit} onDelete={handleDelete} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

// --- Tab Button ---

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}> = ({ active, onClick, icon, label, count }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      backgroundColor: active ? '#2563eb' : '#3c3c3c',
      color: active ? 'white' : '#d4d4d4',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '13px',
      transition: 'all 0.2s'
    }}
  >
    {icon}
    <span>{label}</span>
    <span style={{
      backgroundColor: active ? 'rgba(255,255,255,0.2)' : '#555',
      padding: '2px 6px',
      borderRadius: '10px',
      fontSize: '11px'
    }}>{count}</span>
  </button>
);

// --- Foreshadowing View (跨章节) ---

const ForeshadowingView: React.FC<{
  analyses: ChapterAnalysis[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ analyses, onEdit, onDelete }) => {
  // 收集所有伏笔，按内容分组
  const allForeshadowing = useMemo(() => {
    const map = new Map<string, ForeshadowingItem & { chapterTitle: string; chapterPath: string }[]>();

    analyses.forEach(analysis => {
      analysis.foreshadowing.forEach(item => {
        const key = item.content;
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)!.push({
          ...item,
          chapterTitle: analysis.chapterTitle,
          chapterPath: analysis.chapterPath
        });
      });
    });

    return Array.from(map.entries()).map(([content, items]) => ({
      content,
      items: items.sort((a, b) => {
        const order = { planted: 0, developed: 1, resolved: 2 };
        return order[a.type] - order[b.type];
      })
    }));
  }, [analyses]);

  const typeColors = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
  const typeLabels = { planted: '埋下', developed: '推进', resolved: '收回' };

  if (allForeshadowing.length === 0) {
    return <EmptyState message="暂无伏笔数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {allForeshadowing.map((group, idx) => (
        <div key={idx} style={{
          backgroundColor: '#252526',
          border: '1px solid #3c3c3c',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* 伏笔主题 */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#2d2d30',
            borderBottom: '1px solid #3c3c3c'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>{group.content}</div>
          </div>

          {/* 时间线 */}
          <div style={{ padding: '12px 16px' }}>
            {group.items.map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: i < group.items.length - 1 ? '12px' : 0
              }}>
                {/* 时间线点和连线 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: typeColors[item.type],
                    flexShrink: 0
                  }} />
                  {i < group.items.length - 1 && (
                    <div style={{
                      width: '2px',
                      flex: 1,
                      backgroundColor: '#3c3c3c',
                      marginTop: '4px'
                    }} />
                  )}
                </div>

                {/* 内容 */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    backgroundColor: typeColors[item.type],
                    color: '#1e1e1e',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    marginBottom: '4px'
                  }}>
                    {typeLabels[item.type]} - {item.chapterTitle}
                  </div>
                  {item.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {item.tags.map(tag => (
                        <span key={tag} style={tagStyle}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- Character View (跨章节) ---

const CharacterView: React.FC<{
  analyses: ChapterAnalysis[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ analyses, onEdit, onDelete }) => {
  // 按角色分组，展示状态变化
  const characters = useMemo(() => {
    const charMap = new Map<string, {
      name: string;
      states: (CharacterState & { chapterTitle: string; chapterPath: string })[];
    }>();

    analyses.forEach(analysis => {
      analysis.characterStates.forEach(state => {
        if (!charMap.has(state.characterName)) {
          charMap.set(state.characterName, { name: state.characterName, states: [] });
        }
        charMap.get(state.characterName)!.states.push({
          ...state,
          chapterTitle: analysis.chapterTitle,
          chapterPath: analysis.chapterPath
        });
      });
    });

    return Array.from(charMap.values());
  }, [analyses]);

  if (characters.length === 0) {
    return <EmptyState message="暂无角色数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {characters.map((char, idx) => (
        <div key={idx} style={{
          backgroundColor: '#252526',
          border: '1px solid #3c3c3c',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* 角色名 */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#2d2d30',
            borderBottom: '1px solid #3c3c3c',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '16px' }}>👤</span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#dcdcaa' }}>{char.name}</span>
            <span style={{ fontSize: '12px', color: '#888' }}>({char.states.length} 个章节记录)</span>
          </div>

          {/* 状态时间线 */}
          <div style={{ padding: '12px 16px' }}>
            {char.states.map((state, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: i < char.states.length - 1 ? '16px' : 0
              }}>
                {/* 时间线点 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px' }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#4ec9b0',
                    flexShrink: 0
                  }} />
                  {i < char.states.length - 1 && (
                    <div style={{
                      width: '2px',
                      flex: 1,
                      backgroundColor: '#3c3c3c',
                      marginTop: '4px'
                    }} />
                  )}
                </div>

                {/* 内容 */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>
                    {state.chapterTitle}
                  </div>
                  <div style={{ fontSize: '14px', marginBottom: '8px' }}>{state.stateDescription}</div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#888' }}>
                    {state.emotionalState && <span>😊 {state.emotionalState}</span>}
                    {state.location && <span>📍 {state.location}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- Plot View ---

const PlotView: React.FC<{
  analyses: ChapterAnalysis[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ analyses, onEdit, onDelete }) => {
  // 收集所有剧情点
  const allPlotPoints = useMemo(() => {
    const points: (PlotKeyPoint & { chapterTitle: string; chapterPath: string })[] = [];
    analyses.forEach(analysis => {
      analysis.plotSummary.forEach(point => {
        points.push({
          ...point,
          chapterTitle: analysis.chapterTitle,
          chapterPath: analysis.chapterPath
        });
      });
    });
    return points.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.importance] - order[b.importance];
    });
  }, [analyses]);

  const importanceColors = { high: '#f48771', medium: '#dcdcaa', low: '#9cdcfe' };
  const importanceLabels = { high: '重要', medium: '一般', low: '次要' };

  if (allPlotPoints.length === 0) {
    return <EmptyState message="暂无剧情数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {allPlotPoints.map((point, idx) => (
        <div key={idx} style={{
          padding: '12px 16px',
          backgroundColor: '#252526',
          border: '1px solid #3c3c3c',
          borderLeft: `3px solid ${importanceColors[point.importance]}`,
          borderRadius: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{
              padding: '2px 8px',
              backgroundColor: importanceColors[point.importance],
              color: '#1e1e1e',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600
            }}>
              {importanceLabels[point.importance]}
            </span>
            <span style={{ fontSize: '12px', color: '#888' }}>{point.chapterTitle}</span>
          </div>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>{point.description}</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {point.tags.map(tag => (
              <span key={tag} style={tagStyle}>{tag}</span>
            ))}
            {point.relatedCharacters.length > 0 && (
              <span style={{ color: '#888', fontSize: '12px' }}>
                👤 {point.relatedCharacters.join(', ')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- Empty State ---

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>{message}</div>
);

// --- Analysis Form ---

interface AnalysisFormProps {
  mode: 'add' | 'edit';
  editingData?: ChapterAnalysis;
  availableChapters: { name: string; id: string }[];
  onSave: (analysis: ChapterAnalysis) => void;
  onCancel: () => void;
}

const AnalysisForm: React.FC<AnalysisFormProps> = ({ mode, editingData, availableChapters, onSave, onCancel }) => {
  const [chapterPath, setChapterPath] = useState(editingData?.chapterPath || '');
  const [chapterTitle, setChapterTitle] = useState(editingData?.chapterTitle || '');
  const [plotSummary, setPlotSummary] = useState<PlotKeyPoint[]>(editingData?.plotSummary || []);
  const [characterStates, setCharacterStates] = useState<CharacterState[]>(editingData?.characterStates || []);
  const [foreshadowing, setForeshadowing] = useState<ForeshadowingItem[]>(editingData?.foreshadowing || []);

  const handleSave = () => {
    const now = Date.now();
    const analysis: ChapterAnalysis = {
      id: editingData?.id || `analysis-${now}`,
      chapterPath: chapterPath || '手动添加',
      chapterTitle: chapterTitle || '未命名章节',
      sessionId: editingData?.sessionId || 'manual',
      projectId: editingData?.projectId || '',
      plotSummary,
      characterStates,
      foreshadowing,
      extractedAt: editingData?.extractedAt || now,
      lastModified: now,
      wordCount: editingData?.wordCount || 0
    };
    onSave(analysis);
  };

  return (
    <div style={{
      backgroundColor: '#252526',
      border: '1px solid #3c3c3c',
      borderRadius: '6px',
      padding: '16px',
      marginBottom: '16px'
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
        {mode === 'add' ? '添加章节分析' : '编辑章节分析'}
      </h3>

      {/* 章节选择 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>选择章节</label>
        <select
          value={chapterPath}
          onChange={(e) => {
            setChapterPath(e.target.value);
            const chapter = availableChapters.find(c => c.id === e.target.value);
            if (chapter) {
              setChapterTitle(chapter.name.replace('.md', ''));
            }
          }}
          style={selectStyle}
        >
          <option value="">-- 选择章节 --</option>
          {availableChapters.map(ch => (
            <option key={ch.id} value={`05_正文草稿/${ch.name}`}>{ch.name}</option>
          ))}
          <option value="手动添加">手动输入</option>
        </select>
      </div>

      {chapterPath === '手动添加' && (
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            placeholder="章节标题"
            style={inputStyle}
          />
        </div>
      )}

      {/* 伏笔 */}
      <SectionEditor
        title="伏笔"
        items={foreshadowing}
        onChange={setForeshadowing}
        renderItem={(item, idx) => (
          <>
            <select
              value={item.type}
              onChange={(e) => {
                const newItems = [...foreshadowing];
                newItems[idx] = { ...item, type: e.target.value as any };
                setForeshadowing(newItems);
              }}
              style={{ ...inputStyle, width: '100px' }}
            >
              <option value="planted">新埋下</option>
              <option value="developed">推进中</option>
              <option value="resolved">已回收</option>
            </select>
            <input
              type="text"
              value={item.content}
              onChange={(e) => {
                const newItems = [...foreshadowing];
                newItems[idx] = { ...item, content: e.target.value };
                setForeshadowing(newItems);
              }}
              placeholder="伏笔内容..."
              style={{ ...inputStyle, flex: 1 }}
            />
          </>
        )}
      />

      {/* 角色状态 */}
      <SectionEditor
        title="角色状态"
        items={characterStates}
        onChange={setCharacterStates}
        renderItem={(item, idx) => (
          <>
            <input
              type="text"
              value={item.characterName}
              onChange={(e) => {
                const newItems = [...characterStates];
                newItems[idx] = { ...item, characterName: e.target.value };
                setCharacterStates(newItems);
              }}
              placeholder="角色名"
              style={{ ...inputStyle, width: '100px' }}
            />
            <input
              type="text"
              value={item.stateDescription}
              onChange={(e) => {
                const newItems = [...characterStates];
                newItems[idx] = { ...item, stateDescription: e.target.value };
                setCharacterStates(newItems);
              }}
              placeholder="状态描述"
              style={{ ...inputStyle, flex: 1 }}
            />
          </>
        )}
      />

      {/* 剧情关键点 */}
      <SectionEditor
        title="剧情关键点"
        items={plotSummary}
        onChange={setPlotSummary}
        renderItem={(item, idx) => (
          <>
            <select
              value={item.importance}
              onChange={(e) => {
                const newItems = [...plotSummary];
                newItems[idx] = { ...item, importance: e.target.value as any };
                setPlotSummary(newItems);
              }}
              style={{ ...inputStyle, width: '80px' }}
            >
              <option value="high">重要</option>
              <option value="medium">一般</option>
              <option value="low">次要</option>
            </select>
            <input
              type="text"
              value={item.description}
              onChange={(e) => {
                const newItems = [...plotSummary];
                newItems[idx] = { ...item, description: e.target.value };
                setPlotSummary(newItems);
              }}
              placeholder="关键点描述..."
              style={{ ...inputStyle, flex: 1 }}
            />
          </>
        )}
      />

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button onClick={onCancel} style={cancelButtonStyle}>取消</button>
        <button onClick={handleSave} style={saveButtonStyle}>保存</button>
      </div>
    </div>
  );
};

// --- Section Editor ---

const SectionEditor: React.FC<{
  title: string;
  items: any[];
  onChange: (items: any[]) => void;
  renderItem: (item: any, idx: number) => React.ReactNode;
}> = ({ title, items, onChange, renderItem }) => (
  <div style={{ marginBottom: '16px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <label style={{ fontSize: '13px', color: '#888' }}>{title}</label>
      <button
        onClick={() => onChange([...items, { id: `${Date.now()}-${Math.random()}`, content: '', type: 'planted', tags: [] }])}
        style={addButtonStyle}
      >
        <Plus size={14} /> 添加
      </button>
    </div>
    {items.map((item, idx) => (
      <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        {renderItem(item, idx)}
        <button
          onClick={() => onChange(items.filter((_, i) => i !== idx))}
          style={deleteButtonStyle}
        >
          <Trash2 size={14} />
        </button>
      </div>
    ))}
  </div>
);

// --- Styles ---

const addButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  backgroundColor: '#3c3c3c',
  color: '#d4d4d4',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px'
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '6px',
  backgroundColor: 'transparent',
  color: '#f48771',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#3c3c3c',
  color: '#d4d4d4',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px'
};

const saveButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px'
};

const inputStyle: React.CSSProperties = {
  padding: '8px',
  backgroundColor: '#3c3c3c',
  color: '#d4d4d4',
  border: '1px solid #555',
  borderRadius: '4px',
  fontSize: '13px'
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%'
};

const tagStyle: React.CSSProperties = {
  padding: '2px 6px',
  backgroundColor: '#3c3c3c',
  borderRadius: '3px',
  color: '#888',
  fontSize: '11px'
};
