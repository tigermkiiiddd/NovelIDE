import React, { useState, useMemo } from 'react';
import { useChapterAnalysisStore } from '../stores/chapterAnalysisStore';
import { useProjectStore } from '../stores/projectStore';
import { useFileStore } from '../stores/fileStore';
import { useEntityVersionStore } from '../stores/entityVersionStore';
import { ChapterAnalysis, PlotKeyPoint, CharacterState, ForeshadowingItem } from '../types';
import { Plus, Trash2, Edit2, X, ChevronDown, ChevronRight, BookOpen, User, Sparkles, Zap, History } from 'lucide-react';
import { EntityVersionHistory } from './EntityVersionHistory';

type ViewMode = 'plot' | 'character' | 'foreshadowing';

// ==================== 样式常量（与 CharacterProfileView 统一） ====================

// 视图颜色映射
const VIEW_COLORS: Record<ViewMode, string> = {
  foreshadowing: '#f59e0b', // 伏笔 - 橙色
  character: '#38bdf8',     // 角色 - 蓝色
  plot: '#a78bfa',          // 剧情 - 紫色
};

// 卡片样式
const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(35,39,46,0.96) 0%, rgba(24,27,33,0.96) 100%)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: 16,
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
};

// 章节卡片样式
const chapterCardStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(35,39,46,0.96) 0%, rgba(24,27,33,0.96) 100%)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
};

// Pill 按钮样式（版本历史等）
const pillButtonStyle = (color: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  backgroundColor: `${color}14`,
  border: `1px solid ${color}33`,
  borderRadius: 6,
  color: color,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'all 0.2s',
});

// 图标容器样式
const iconContainerStyle = (color: string): React.CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: `${color}14`,
  color: color,
});

// 输入框样式
const inputStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.8)',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 6,
  padding: '6px 10px',
  color: '#f8fafc',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

// 标签样式
const tagStyle: React.CSSProperties = {
  padding: '2px 6px',
  backgroundColor: 'rgba(148, 163, 184, 0.1)',
  borderRadius: 4,
  color: '#94a3b8',
  fontSize: 11,
};

export const ReadingLightView: React.FC = () => {
  const getCurrentProject = useProjectStore(state => state.getCurrentProject);
  const project = getCurrentProject();
  const { analyses, addAnalysis, updateAnalysis, deleteAnalysis } = useChapterAnalysisStore();
  const fileStore = useFileStore();

  const [viewMode, setViewMode] = useState<ViewMode>('foreshadowing');
  const [editMode, setEditMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [versionHistoryAnalysis, setVersionHistoryAnalysis] = useState<ChapterAnalysis | null>(null);

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

  // 统计数据
  const stats = useMemo(() => ({
    foreshadowing: analyses.reduce((sum, a) => sum + a.foreshadowing.length, 0),
    characters: analyses.reduce((sum, a) => sum + a.characterStates.length, 0),
    plots: analyses.reduce((sum, a) => sum + a.plotSummary.length, 0),
    chapters: analyses.length,
  }), [analyses]);

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
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
      }}>
        请先打开一个项目
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: 24,
      background: `radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 34%),
                   radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 28%),
                   linear-gradient(180deg, #0f172a 0%, #111827 100%)`,
    }}>
      {/* 内容容器 */}
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}>
        {/* Header 卡片 */}
        <div style={{ ...cardStyle, padding: 18 }}>
          {/* 标题行 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* 图标容器 */}
              <div style={iconContainerStyle(VIEW_COLORS[viewMode])}>
                <Zap size={18} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f8fafc' }}>
                  阅读灯视图
                </h2>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  章节分析与伏笔跟踪
                </div>
              </div>
            </div>
            {/* 添加按钮 */}
            <button
              onClick={handleAddNew}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: 8,
                color: '#4ade80',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Plus size={16} />
              添加分析
            </button>
          </div>

          {/* 统计指标 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginTop: 16,
          }}>
            <MetricCard label="章节" value={stats.chapters} color="#38bdf8" />
            <MetricCard label="伏笔" value={stats.foreshadowing} color="#f59e0b" />
            <MetricCard label="角色状态" value={stats.characters} color="#a78bfa" />
            <MetricCard label="剧情点" value={stats.plots} color="#4ade80" />
          </div>

          {/* Tab 行 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <TabButton
              active={viewMode === 'foreshadowing'}
              onClick={() => setViewMode('foreshadowing')}
              icon={<Zap size={14} />}
              label="伏笔跟踪"
              count={stats.foreshadowing}
              color={VIEW_COLORS.foreshadowing}
            />
            <TabButton
              active={viewMode === 'character'}
              onClick={() => setViewMode('character')}
              icon={<User size={14} />}
              label="角色状态"
              count={stats.characters}
              color={VIEW_COLORS.character}
            />
            <TabButton
              active={viewMode === 'plot'}
              onClick={() => setViewMode('plot')}
              icon={<Sparkles size={14} />}
              label="剧情关键点"
              count={stats.plots}
              color={VIEW_COLORS.plot}
            />
          </div>
        </div>

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

        {/* 内容区 */}
        {analyses.length === 0 && editMode === 'none' ? (
          <div style={{
            ...cardStyle,
            padding: 40,
            textAlign: 'center',
            color: '#64748b',
          }}>
            <div style={{ marginBottom: 12 }}>暂无章节分析数据</div>
            <div style={{ fontSize: 13 }}>点击右上角"添加分析"按钮手动添加</div>
          </div>
        ) : (
          <>
            {viewMode === 'foreshadowing' && (
              <ForeshadowingView
                analyses={sortedAnalyses}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onVersionHistory={(analysis) => setVersionHistoryAnalysis(analysis)}
              />
            )}
            {viewMode === 'character' && (
              <CharacterView
                analyses={sortedAnalyses}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onVersionHistory={(analysis) => setVersionHistoryAnalysis(analysis)}
              />
            )}
            {viewMode === 'plot' && (
              <PlotView
                analyses={sortedAnalyses}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onVersionHistory={(analysis) => setVersionHistoryAnalysis(analysis)}
              />
            )}
          </>
        )}
      </div>

      {/* 版本历史弹窗 */}
      {versionHistoryAnalysis && (
        <EntityVersionHistory
          isOpen={true}
          onClose={() => setVersionHistoryAnalysis(null)}
          entityType="chapter_analysis"
          entityId={versionHistoryAnalysis.id}
          entityName={versionHistoryAnalysis.chapterTitle}
          onRestore={(versionId) => {
            const versionStore = useEntityVersionStore.getState();
            const restored = versionStore.restoreAnalysisVersion(versionId);
            if (restored) {
              updateAnalysis(versionHistoryAnalysis.id, restored);
              setVersionHistoryAnalysis(null);
            }
          }}
        />
      )}
    </div>
  );
};

// --- Metric Card ---

const MetricCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{
    padding: 14,
    borderRadius: 12,
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
  }}>
    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
  </div>
);

// --- Tab Button ---

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}> = ({ active, onClick, icon, label, count, color }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 14px',
      backgroundColor: active ? `${color}1a` : 'transparent',
      border: active ? `1px solid ${color}33` : '1px solid transparent',
      borderRadius: 8,
      color: active ? color : '#94a3b8',
      cursor: 'pointer',
      fontSize: 13,
      transition: 'all 0.2s',
    }}
  >
    {icon}
    <span>{label}</span>
    <span style={{
      backgroundColor: active ? `${color}22` : 'rgba(148, 163, 184, 0.1)',
      padding: '2px 6px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 500,
    }}>
      {count}
    </span>
  </button>
);

// --- Foreshadowing View (按章节) ---

const ForeshadowingView: React.FC<{
  analyses: ChapterAnalysis[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onVersionHistory: (analysis: ChapterAnalysis) => void;
}> = ({ analyses, onEdit, onDelete, onVersionHistory }) => {
  const typeColors = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
  const typeLabels = { planted: '埋下', developed: '推进', resolved: '收回' };

  const chaptersWithForeshadowing = analyses.filter(a => a.foreshadowing.length > 0);

  if (chaptersWithForeshadowing.length === 0) {
    return <EmptyState message="暂无伏笔数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {chaptersWithForeshadowing.map((analysis) => (
        <div key={analysis.id} style={chapterCardStyle}>
          {/* 章节标题 + 操作按钮 */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e8f0' }}>
              {analysis.chapterTitle}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* 版本历史按钮 - 醒目的 pill 样式 */}
              <button
                onClick={() => onVersionHistory(analysis)}
                style={pillButtonStyle('#38bdf8')}
                title="版本历史"
              >
                <History size={14} />
                版本
              </button>
              <button onClick={() => onEdit(analysis.id)} style={actionButtonStyle} title="编辑">
                <Edit2 size={14} />
              </button>
              <button onClick={() => onDelete(analysis.id)} style={{ ...actionButtonStyle, color: '#f87171' }} title="删除">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* 伏笔列表 */}
          <div style={{ padding: '12px 18px' }}>
            {analysis.foreshadowing.map((item, i) => (
              <div key={item.id || i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                marginBottom: i < analysis.foreshadowing.length - 1 ? 12 : 0,
                padding: '10px 12px',
                borderRadius: 10,
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                transition: 'background-color 0.2s',
              }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.6)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.4)'}
              >
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: typeColors[item.type],
                  flexShrink: 0,
                  marginTop: 5,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: `${typeColors[item.type]}22`,
                      border: `1px solid ${typeColors[item.type]}33`,
                      borderRadius: 4,
                      color: typeColors[item.type],
                      fontSize: 11,
                      fontWeight: 500,
                    }}>
                      {typeLabels[item.type]}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.6, color: '#cbd5e1' }}>
                    {item.content}
                  </div>
                  {item.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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

// --- Character View (按章节) ---

const CharacterView: React.FC<{
  analyses: ChapterAnalysis[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onVersionHistory: (analysis: ChapterAnalysis) => void;
}> = ({ analyses, onEdit, onDelete, onVersionHistory }) => {
  const chaptersWithCharacters = analyses.filter(a => a.characterStates.length > 0);

  if (chaptersWithCharacters.length === 0) {
    return <EmptyState message="暂无角色数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {chaptersWithCharacters.map((analysis) => (
        <div key={analysis.id} style={chapterCardStyle}>
          {/* 章节标题 + 操作按钮 */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e8f0' }}>
              {analysis.chapterTitle}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => onVersionHistory(analysis)}
                style={pillButtonStyle('#38bdf8')}
                title="版本历史"
              >
                <History size={14} />
                版本
              </button>
              <button onClick={() => onEdit(analysis.id)} style={actionButtonStyle} title="编辑">
                <Edit2 size={14} />
              </button>
              <button onClick={() => onDelete(analysis.id)} style={{ ...actionButtonStyle, color: '#f87171' }} title="删除">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* 角色状态列表 */}
          <div style={{ padding: '12px 18px' }}>
            {analysis.characterStates.map((state, i) => (
              <div key={i} style={{
                marginBottom: i < analysis.characterStates.length - 1 ? 16 : 0,
                paddingBottom: i < analysis.characterStates.length - 1 ? 16 : 0,
                borderBottom: i < analysis.characterStates.length - 1 ? '1px solid rgba(148, 163, 184, 0.1)' : 'none',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'rgba(56, 189, 248, 0.12)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#38bdf8',
                  }}>
                    <User size={14} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#dcdcaa' }}>
                    {state.characterName}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8, color: '#cbd5e1', paddingLeft: 36 }}>
                  {state.stateDescription}
                </div>
                {state.emotionalState && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, paddingLeft: 36 }}>
                    情绪: <span style={{ color: '#94a3b8' }}>{state.emotionalState}</span>
                  </div>
                )}
                {state.location && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, paddingLeft: 36 }}>
                    位置: <span style={{ color: '#94a3b8' }}>{state.location}</span>
                  </div>
                )}
                {state.relationships && state.relationships.length > 0 && (
                  <div style={{ marginTop: 8, paddingLeft: 36 }}>
                    {state.relationships.map((rel, j) => (
                      <div key={j} style={{ fontSize: 12, color: '#9cdcfe', marginBottom: 2 }}>
                        与 {rel.with}: {rel.status}
                      </div>
                    ))}
                  </div>
                )}
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
  onVersionHistory: (analysis: ChapterAnalysis) => void;
}> = ({ analyses, onEdit, onDelete, onVersionHistory }) => {
  const importanceColors = { high: '#f48771', medium: '#dcdcaa', low: '#9cdcfe' };
  const importanceLabels = { high: '重要', medium: '一般', low: '次要' };

  const chaptersWithPlot = analyses.filter(a => a.plotSummary.length > 0);

  if (chaptersWithPlot.length === 0) {
    return <EmptyState message="暂无剧情数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {chaptersWithPlot.map((analysis) => (
        <div key={analysis.id} style={chapterCardStyle}>
          {/* 章节标题 + 操作按钮 */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e8f0' }}>
              {analysis.chapterTitle}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => onVersionHistory(analysis)}
                style={pillButtonStyle('#38bdf8')}
                title="版本历史"
              >
                <History size={14} />
                版本
              </button>
              <button onClick={() => onEdit(analysis.id)} style={actionButtonStyle} title="编辑">
                <Edit2 size={14} />
              </button>
              <button onClick={() => onDelete(analysis.id)} style={{ ...actionButtonStyle, color: '#f87171' }} title="删除">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* 剧情点列表 */}
          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {analysis.plotSummary.map((point, idx) => (
              <div key={idx} style={{
                padding: '12px 14px',
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                borderLeft: `3px solid ${importanceColors[point.importance]}`,
                borderRadius: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: `${importanceColors[point.importance]}22`,
                    border: `1px solid ${importanceColors[point.importance]}33`,
                    borderRadius: 4,
                    color: importanceColors[point.importance],
                    fontSize: 11,
                    fontWeight: 500,
                  }}>
                    {importanceLabels[point.importance]}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8, color: '#cbd5e1' }}>
                  {point.description}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {point.tags.map(tag => (
                    <span key={tag} style={tagStyle}>{tag}</span>
                  ))}
                  {point.relatedCharacters.length > 0 && (
                    <span style={{ color: '#64748b', fontSize: 12 }}>
                      👤 {point.relatedCharacters.join(', ')}
                    </span>
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

// --- Empty State ---

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    ...cardStyle,
    padding: 40,
    textAlign: 'center',
    color: '#64748b',
  }}>
    {message}
  </div>
);

// --- Action Button Style ---

const actionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 6,
  backgroundColor: 'transparent',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: 6,
  color: '#94a3b8',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

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
  const [foreshadowing, setForeshadowing] = useState<ForeshadowingItem[]>(
    (editingData?.foreshadowing || []).map(f => ({
      ...f,
      source: f.source || 'chapter_analysis'
    }))
  );

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
    <div style={{ ...cardStyle, padding: 18 }}>
      <h3 style={{ margin: '0 0 18px 0', fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
        {mode === 'add' ? '添加章节分析' : '编辑章节分析'}
      </h3>

      {/* 章节选择 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
          选择章节
        </label>
        <select
          value={chapterPath}
          onChange={(e) => {
            setChapterPath(e.target.value);
            const chapter = availableChapters.find(c => c.id === e.target.value);
            if (chapter) {
              setChapterTitle(chapter.name.replace('.md', ''));
            }
          }}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">-- 选择章节 --</option>
          {availableChapters.map(ch => (
            <option key={ch.id} value={`05_正文草稿/${ch.name}`}>{ch.name}</option>
          ))}
          <option value="手动添加">手动输入</option>
        </select>
      </div>

      {chapterPath === '手动添加' && (
        <div style={{ marginBottom: 16 }}>
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
              style={{ ...inputStyle, width: 100, cursor: 'pointer' }}
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
              style={{ ...inputStyle, width: 100 }}
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
              style={{ ...inputStyle, width: 80, cursor: 'pointer' }}
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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(148, 163, 184, 0.1)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 6,
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          取消
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: 6,
            color: '#4ade80',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          保存
        </button>
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
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <label style={{ fontSize: 13, color: '#94a3b8' }}>{title}</label>
      <button
        onClick={() => onChange([...items, { id: `${Date.now()}-${Math.random()}`, content: '', type: 'planted', tags: [], source: 'chapter_analysis' }])}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          backgroundColor: 'rgba(148, 163, 184, 0.1)',
          border: '1px solid rgba(148, 163, 184, 0.16)',
          borderRadius: 6,
          color: '#94a3b8',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        <Plus size={14} /> 添加
      </button>
    </div>
    {items.map((item, idx) => (
      <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {renderItem(item, idx)}
        <button
          onClick={() => onChange(items.filter((_, i) => i !== idx))}
          style={{
            padding: 6,
            backgroundColor: 'transparent',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            borderRadius: 6,
            color: '#f87171',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    ))}
  </div>
);
