import React, { useState, useMemo } from 'react';
import { useChapterAnalysisStore } from '../stores/chapterAnalysisStore';
import { useProjectStore } from '../stores/projectStore';
import { useFileStore } from '../stores/fileStore';
import { useEntityVersionStore } from '../stores/entityVersionStore';
import {
  ForeshadowingItem,
  ChapterCharacterState,
  ChapterPlotKeyPoint,
  HookType,
  HookStrength,
} from '../types';
import { Plus, Trash2, Edit2, X, User, Sparkles, Zap, History, Clock, Check } from 'lucide-react';
import { EntityVersionHistory } from './EntityVersionHistory';

type ViewMode = 'foreshadowing' | 'character' | 'plot';

// 钩子类型映射
const HOOK_TYPE_CONFIG: Record<HookType, { label: string; emoji: string; color: string }> = {
  crisis: { label: '危机', emoji: '⚡', color: '#f14c4c' },
  mystery: { label: '悬疑', emoji: '❓', color: '#9cdcfe' },
  emotion: { label: '情感', emoji: '💗', color: '#c586c0' },
  choice: { label: '选择', emoji: '⚖', color: '#dcdcaa' },
  desire: { label: '欲望', emoji: '🔥', color: '#ce9178' },
};

// 钩子强度映射
const STRENGTH_CONFIG: Record<HookStrength, { label: string; color: string; bgColor: string }> = {
  strong: { label: '强', color: '#f14c4c', bgColor: '#f14c4c22' },
  medium: { label: '中', color: '#d7ba7d', bgColor: '#d7ba7d22' },
  weak: { label: '弱', color: '#6a8759', bgColor: '#6a875922' },
};

// ==================== 样式常量 ====================

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

// Pill 按钮样式
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

// 操作按钮样式
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

export const ReadingLightView: React.FC = () => {
  const getCurrentProject = useProjectStore(state => state.getCurrentProject);
  const project = getCurrentProject();
  const fileStore = useFileStore();

  const {
    data,
    // 新的 CRUD 方法
    addForeshadowing,
    updateForeshadowing,
    deleteForeshadowing,
    addCharacterState,
    updateCharacterState,
    deleteCharacterState,
    addPlotKeyPoint,
    updatePlotKeyPoint,
    deletePlotKeyPoint,
  } = useChapterAnalysisStore();

  const [viewMode, setViewMode] = useState<ViewMode>('foreshadowing');

  // 编辑状态 - 分别管理三种类型
  const [editingForeshadowing, setEditingForeshadowing] = useState<ForeshadowingItem | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<ChapterCharacterState | null>(null);
  const [editingPlot, setEditingPlot] = useState<ChapterPlotKeyPoint | null>(null);
  const [isAdding, setIsAdding] = useState<'foreshadowing' | 'character' | 'plot' | null>(null);

  // 可用的章节列表
  const availableChapters = useMemo(() => {
    const draftFolder = fileStore.files.find(f => f.name === '05_正文草稿' && f.parentId === 'root');
    if (!draftFolder) return [];
    return fileStore.files.filter(f => f.parentId === draftFolder.id && f.name.endsWith('.md'));
  }, [fileStore.files]);

  // 统计数据
  const stats = useMemo(() => ({
    foreshadowing: data.foreshadowing.length,
    characters: data.characterStates.length,
    plots: data.plotKeyPoints.length,
    chapters: new Set([
      ...data.characterStates.map((s: ChapterCharacterState) => s.chapterRef),
      ...data.foreshadowing.map((f: ForeshadowingItem) => f.sourceRef),
      ...data.plotKeyPoints.map((p: ChapterPlotKeyPoint) => p.chapterRef),
    ]).size,
  }), [data]);

  // 获取章节标题
  const getChapterTitle = (ref: string) => {
    const chapter = availableChapters.find(c => c.name.replace('.md', '') === ref.split('/').pop()?.replace('.md', ''));
    return chapter?.name.replace('.md', '') || ref.split('/').pop()?.replace('.md', '') || ref;
  };

  // ========== 伏笔操作 ==========

  const handleAddForeshadowing = () => {
    setIsAdding('foreshadowing');
    setEditingForeshadowing(null);
  };

  const handleEditForeshadowing = (item: ForeshadowingItem) => {
    setEditingForeshadowing(item);
    setIsAdding(null);
  };

  const handleSaveForeshadowing = (item: Omit<ForeshadowingItem, 'id'> & { id?: string }) => {
    if (item.id) {
      updateForeshadowing(item.id, item);
    } else {
      addForeshadowing(item as Omit<ForeshadowingItem, 'id'>);
    }
    setEditingForeshadowing(null);
    setIsAdding(null);
  };

  const handleDeleteForeshadowing = (id: string) => {
    deleteForeshadowing(id);
  };

  // ========== 角色状态操作 ==========

  const handleAddCharacter = () => {
    setIsAdding('character');
    setEditingCharacter(null);
  };

  const handleEditCharacter = (state: ChapterCharacterState) => {
    setEditingCharacter(state);
    setIsAdding(null);
  };

  const handleSaveCharacter = (state: Omit<ChapterCharacterState, 'id'> & { id?: string }) => {
    if (state.id) {
      updateCharacterState(state.id, state);
    } else {
      addCharacterState(state as Omit<ChapterCharacterState, 'id'>);
    }
    setEditingCharacter(null);
    setIsAdding(null);
  };

  const handleDeleteCharacter = (id: string) => {
    deleteCharacterState(id);
  };

  // ========== 剧情关键点操作 ==========

  const handleAddPlot = () => {
    setIsAdding('plot');
    setEditingPlot(null);
  };

  const handleEditPlot = (point: ChapterPlotKeyPoint) => {
    setEditingPlot(point);
    setIsAdding(null);
  };

  const handleSavePlot = (point: Omit<ChapterPlotKeyPoint, 'id'> & { id?: string }) => {
    if (point.id) {
      updatePlotKeyPoint(point.id, point);
    } else {
      addPlotKeyPoint(point as Omit<ChapterPlotKeyPoint, 'id'>);
    }
    setEditingPlot(null);
    setIsAdding(null);
  };

  const handleDeletePlot = (id: string) => {
    deletePlotKeyPoint(id);
  };

  // ========== 取消编辑 ==========

  const handleCancelEdit = () => {
    setEditingForeshadowing(null);
    setEditingCharacter(null);
    setEditingPlot(null);
    setIsAdding(null);
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

  const hasAnyData = data.foreshadowing.length > 0 || data.characterStates.length > 0 || data.plotKeyPoints.length > 0;
  const isEditing = editingForeshadowing || editingCharacter || editingPlot || isAdding;

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
              onClick={() => {
                if (viewMode === 'foreshadowing') handleAddForeshadowing();
                else if (viewMode === 'character') handleAddCharacter();
                else if (viewMode === 'plot') handleAddPlot();
              }}
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
              添加{viewMode === 'foreshadowing' ? '伏笔' : viewMode === 'character' ? '角色状态' : '剧情点'}
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

        {/* 编辑表单 */}
        {(isAdding === 'foreshadowing' || editingForeshadowing) && (
          <ForeshadowingForm
            item={editingForeshadowing}
            availableChapters={availableChapters}
            onSave={handleSaveForeshadowing}
            onCancel={handleCancelEdit}
          />
        )}

        {(isAdding === 'character' || editingCharacter) && (
          <CharacterForm
            state={editingCharacter}
            availableChapters={availableChapters}
            onSave={handleSaveCharacter}
            onCancel={handleCancelEdit}
          />
        )}

        {(isAdding === 'plot' || editingPlot) && (
          <PlotForm
            point={editingPlot}
            availableChapters={availableChapters}
            onSave={handleSavePlot}
            onCancel={handleCancelEdit}
          />
        )}

        {/* 内容区 */}
        {!hasAnyData && !isEditing ? (
          <div style={{
            ...cardStyle,
            padding: 48,
            textAlign: 'center',
            color: '#64748b',
          }}>
            <Zap size={40} style={{ marginBottom: 16, opacity: 0.4 }} />
            <div style={{ fontSize: 15, marginBottom: 8, color: '#94a3b8' }}>暂无章节分析数据</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              在章节编辑器中选中章节，点击"AI 分析"按钮触发分析
            </div>
          </div>
        ) : (
          <>
            {viewMode === 'foreshadowing' && !isEditing && (
              <ForeshadowingView
                data={data}
                getChapterTitle={getChapterTitle}
                onEdit={handleEditForeshadowing}
                onDelete={handleDeleteForeshadowing}
              />
            )}
            {viewMode === 'character' && !isEditing && (
              <CharacterView
                data={data}
                getChapterTitle={getChapterTitle}
                onEdit={handleEditCharacter}
                onDelete={handleDeleteCharacter}
              />
            )}
            {viewMode === 'plot' && !isEditing && (
              <PlotView
                data={data}
                getChapterTitle={getChapterTitle}
                onEdit={handleEditPlot}
                onDelete={handleDeletePlot}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================
// 子组件
// ============================================

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

// ============================================
// 伏笔视图
// ============================================

const ForeshadowingView: React.FC<{
  data: { foreshadowing: ForeshadowingItem[] };
  getChapterTitle: (ref: string) => string;
  onEdit: (item: ForeshadowingItem) => void;
  onDelete: (id: string) => void;
}> = ({ data, getChapterTitle, onEdit, onDelete }) => {
  const typeColors = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
  const typeLabels = { planted: '埋下', developed: '推进', resolved: '收回' };

  // 获取未完结伏笔（包含子伏笔树）
  const unresolvedWithChildren: Array<ForeshadowingItem & { children: ForeshadowingItem[] }> = useChapterAnalysisStore.getState().getUnresolvedForeshadowing();

  // 按状态排序（planted > developed）
  const sortedItems = useMemo(() => {
    return [...unresolvedWithChildren].sort((a, b) => {
      const order: Record<string, number> = { planted: 0, developed: 1, resolved: 2 };
      return order[a.type] - order[b.type];
    });
  }, [unresolvedWithChildren, data.foreshadowing]); // 依赖 data.foreshadowing 以响应数据变化

  if (sortedItems.length === 0) {
    return <EmptyState message="暂无伏笔数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sortedItems.map((item) => {
        const spanColor = '#9cdcfe';  // 固定蓝色
        const children = item.children || [];
        const hookConfig = item.hookType ? HOOK_TYPE_CONFIG[item.hookType] : null;
        const strengthConfig = item.strength ? STRENGTH_CONFIG[item.strength] : null;
        const span = item.plannedChapter ? item.plannedChapter - item.plantedChapter : null;

        return (
          <div
            key={item.id}
            style={{
              ...chapterCardStyle,
              padding: '14px 18px',
              borderLeft: `3px solid ${hookConfig?.color || '#555'}`,
            }}
          >
            {/* 顶部：状态 + 章节跨度 + 钩子类型/强度 + 操作按钮 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '3px 10px',
                  backgroundColor: `${typeColors[item.type]}22`,
                  border: `1px solid ${typeColors[item.type]}44`,
                  borderRadius: 4,
                  color: typeColors[item.type],
                  fontSize: 12,
                  fontWeight: 500,
                }}>
                  {typeLabels[item.type]}
                </span>
                {span !== null && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    backgroundColor: `${spanColor}14`,
                    border: `1px solid ${spanColor}33`,
                    borderRadius: 4,
                    color: spanColor,
                    fontSize: 11,
                  }}>
                    <Clock size={12} />
                    第{item.plantedChapter}章埋 → 第{item.plannedChapter}章收（跨{span}章）
                  </span>
                )}
                {/* 钩子类型 */}
                {hookConfig && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    backgroundColor: `${hookConfig.color}22`,
                    border: `1px solid ${hookConfig.color}44`,
                    borderRadius: 4,
                    color: hookConfig.color,
                    fontSize: 11,
                  }}>
                    {hookConfig.emoji} {hookConfig.label}
                    {strengthConfig && <span style={{ opacity: 0.8 }}>({strengthConfig.label})</span>}
                  </span>
                )}
                {/* 奖励分 */}
                {item.rewardScore && (
                  <span style={{
                    padding: '3px 8px',
                    backgroundColor: '#f59e0b22',
                    border: '1px solid #f59e0b44',
                    borderRadius: 4,
                    color: '#f59e0b',
                    fontSize: 11,
                    fontWeight: 500,
                  }}>
                    +{item.rewardScore}分
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onEdit(item)} style={actionButtonStyle} title="编辑">
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  style={{ ...actionButtonStyle, color: '#f87171' }}
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* 伏笔内容 */}
            <div style={{ fontSize: 14, marginBottom: 10, lineHeight: 1.6, color: '#e2e8f0' }}>
              {item.content}
            </div>

            {/* 来源章节 + 计划回收章节 */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              <span>📍 来源：{getChapterTitle(item.sourceRef || '')}</span>
              {item.plannedChapter && (
                <span>📅 计划第{item.plannedChapter}章回收（跨{item.plannedChapter - item.plantedChapter}章）</span>
              )}
            </div>

            {/* 标签 */}
            {item.tags && item.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: children.length > 0 ? 12 : 0 }}>
                {item.tags.map((tag: string) => (
                  <span key={tag} style={tagStyle}>{tag}</span>
                ))}
              </div>
            )}

            {/* 备注 */}
            {item.notes && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: children.length > 0 ? 12 : 0 }}>
                💡 {item.notes}
              </div>
            )}

            {/* 子伏笔（推进/收尾记录） */}
            {children.length > 0 && (
              <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid rgba(148, 163, 184, 0.1)',
              }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  📖 发展轨迹 ({children.length})
                </div>
                {children.map((child: ForeshadowingItem) => (
                  <div
                    key={child.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 10px',
                      marginBottom: 6,
                      backgroundColor: 'rgba(30, 41, 59, 0.4)',
                      borderRadius: 6,
                      borderLeft: `2px solid ${typeColors[child.type]}`,
                    }}
                  >
                    <span style={{
                      padding: '2px 6px',
                      backgroundColor: `${typeColors[child.type]}22`,
                      borderRadius: 3,
                      color: typeColors[child.type],
                      fontSize: 10,
                      flexShrink: 0,
                    }}>
                      {typeLabels[child.type]}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#cbd5e1' }}>{child.content}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        📍 {getChapterTitle(child.sourceRef || '')}
                      </div>
                    </div>
                    <button
                      onClick={() => onDelete(child.id)}
                      style={{ ...actionButtonStyle, padding: 4, color: '#f87171' }}
                      title="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// 角色状态视图
// ============================================

const CharacterView: React.FC<{
  data: { characterStates: ChapterCharacterState[] };
  getChapterTitle: (ref: string) => string;
  onEdit: (state: ChapterCharacterState) => void;
  onDelete: (id: string) => void;
}> = ({ data, getChapterTitle, onEdit, onDelete }) => {
  // 按章节分组
  const groupedByChapter = useMemo(() => {
    const groups: Record<string, ChapterCharacterState[]> = {};
    for (const state of data.characterStates) {
      if (!groups[state.chapterRef]) {
        groups[state.chapterRef] = [];
      }
      groups[state.chapterRef].push(state);
    }
    return groups;
  }, [data.characterStates]);

  const chapters = Object.keys(groupedByChapter);

  if (chapters.length === 0) {
    return <EmptyState message="暂无角色状态数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {chapters.map((chapterRef) => (
        <div key={chapterRef} style={chapterCardStyle}>
          {/* 章节标题 */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e8f0' }}>
              {getChapterTitle(chapterRef)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {groupedByChapter[chapterRef].length} 个角色
            </div>
          </div>

          {/* 角色状态列表 */}
          <div style={{ padding: '12px 18px' }}>
            {groupedByChapter[chapterRef].map((state, i, arr) => (
              <div key={state.id} style={{
                marginBottom: i < arr.length - 1 ? 16 : 0,
                paddingBottom: i < arr.length - 1 ? 16 : 0,
                borderBottom: i < arr.length - 1 ? '1px solid rgba(148, 163, 184, 0.1)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onEdit(state)} style={actionButtonStyle} title="编辑">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(state.id)}
                      style={{ ...actionButtonStyle, color: '#f87171' }}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
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

// ============================================
// 剧情关键点视图
// ============================================

const PlotView: React.FC<{
  data: { plotKeyPoints: ChapterPlotKeyPoint[] };
  getChapterTitle: (ref: string) => string;
  onEdit: (point: ChapterPlotKeyPoint) => void;
  onDelete: (id: string) => void;
}> = ({ data, getChapterTitle, onEdit, onDelete }) => {
  const importanceColors = { high: '#f48771', medium: '#dcdcaa', low: '#9cdcfe' };
  const importanceLabels = { high: '重要', medium: '一般', low: '次要' };

  // 按章节分组
  const groupedByChapter = useMemo(() => {
    const groups: Record<string, ChapterPlotKeyPoint[]> = {};
    for (const point of data.plotKeyPoints) {
      if (!groups[point.chapterRef]) {
        groups[point.chapterRef] = [];
      }
      groups[point.chapterRef].push(point);
    }
    return groups;
  }, [data.plotKeyPoints]);

  const chapters = Object.keys(groupedByChapter);

  if (chapters.length === 0) {
    return <EmptyState message="暂无剧情关键点数据" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {chapters.map((chapterRef) => (
        <div key={chapterRef} style={chapterCardStyle}>
          {/* 章节标题 */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e8f0' }}>
              {getChapterTitle(chapterRef)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {groupedByChapter[chapterRef].length} 个关键点
            </div>
          </div>

          {/* 剧情点列表 */}
          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groupedByChapter[chapterRef].map((point) => (
              <div key={point.id} style={{
                padding: '12px 14px',
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                borderLeft: `3px solid ${importanceColors[point.importance]}`,
                borderRadius: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
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
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onEdit(point)} style={actionButtonStyle} title="编辑">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(point.id)}
                      style={{ ...actionButtonStyle, color: '#f87171' }}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
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

// ============================================
// 编辑表单
// ============================================

// --- 伏笔表单 ---
const ForeshadowingForm: React.FC<{
  item: ForeshadowingItem | null;
  availableChapters: { name: string; id: string }[];
  onSave: (item: Omit<ForeshadowingItem, 'id'> & { id?: string; plantedChapter?: number }) => void;
  onCancel: () => void;
}> = ({ item, availableChapters, onSave, onCancel }) => {
  const [content, setContent] = useState(item?.content || '');
  const [type, setType] = useState<'planted' | 'developed' | 'resolved'>(item?.type || 'planted');
  const [hookType, setHookType] = useState<HookType | undefined>(item?.hookType);
  const [strength, setStrength] = useState<HookStrength | undefined>(item?.strength);
  const [plannedChapter, setPlannedChapter] = useState<number | undefined>(item?.plannedChapter);
  const [sourceRef, setSourceRef] = useState(item?.sourceRef || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [tags, setTags] = useState(item?.tags?.join(', ') || '');

  const handleSave = () => {
    if (!content.trim() || !sourceRef) {
      alert('请填写伏笔内容和来源章节');
      return;
    }
    if (item?.type === 'planted' && plannedChapter === undefined) {
      alert('请填写计划回收章节');
      return;
    }

    // 自动计算奖励分
    const rewardScore = strength ? (strength === 'strong' ? 30 : strength === 'medium' ? 20 : 10) : undefined;

    onSave({
      id: item?.id,
      content: content.trim(),
      type,
      source: 'chapter_analysis',
      sourceRef,
      notes: notes.trim() || undefined,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: item?.createdAt || Date.now(),
      hookType,
      strength,
      plannedChapter,
      plantedChapter: item?.plantedChapter ?? 1,
      rewardScore,
    });
  };

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <h3 style={{ margin: '0 0 18px 0', fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
        {item ? '编辑伏笔' : '添加伏笔'}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 伏笔内容 */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
            伏笔内容 <span style={{ color: '#f87171' }}>*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="简洁描述伏笔（30字以内）..."
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          />
        </div>

        {/* 类型 + 计划回收章节 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>状态</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="planted">新埋下</option>
              <option value="developed">推进中</option>
              <option value="resolved">已收回</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>计划回收章节</label>
            <input
              type="number"
              value={plannedChapter ?? ''}
              onChange={(e) => setPlannedChapter(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="填章节序号"
              style={{ ...inputStyle }}
              min={1}
            />
          </div>
        </div>

        {/* 钩子类型 + 强度 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>钩子类型</label>
            <select
              value={hookType || ''}
              onChange={(e) => setHookType(e.target.value as HookType || undefined)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">-- 不指定 --</option>
              <option value="crisis">⚡ 危机</option>
              <option value="mystery">❓ 悬疑</option>
              <option value="emotion">💗 情感</option>
              <option value="choice">⚖ 选择</option>
              <option value="desire">🔥 欲望</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
              钩子强度
              {strength && (
                <span style={{ marginLeft: 8, color: STRENGTH_CONFIG[strength]?.color }}>
                  → +{strength === 'strong' ? '30' : strength === 'medium' ? '20' : '10'}分
                </span>
              )}
            </label>
            <select
              value={strength || ''}
              onChange={(e) => setStrength(e.target.value as HookStrength || undefined)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">-- 不指定 --</option>
              <option value="strong">强（30分）</option>
              <option value="medium">中（20分）</option>
              <option value="weak">弱（10分）</option>
            </select>
          </div>
        </div>

        {/* 来源章节 */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
            来源章节 <span style={{ color: '#f87171' }}>*</span>
          </label>
          <select
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">-- 选择章节 --</option>
            {availableChapters.map(ch => (
              <option key={ch.id} value={`05_正文草稿/${ch.name}`}>{ch.name.replace('.md', '')}</option>
            ))}
          </select>
        </div>

        {/* 标签 */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>标签（逗号分隔）</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="神秘, 道具, 伏笔..."
            style={inputStyle}
          />
        </div>

        {/* 备注 */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>备注</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="额外说明..."
            style={inputStyle}
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
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
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: 6,
            color: '#4ade80',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <Check size={14} />
          保存
        </button>
      </div>
    </div>
  );
};

// --- 角色状态表单 ---
const CharacterForm: React.FC<{
  state: ChapterCharacterState | null;
  availableChapters: { name: string; id: string }[];
  onSave: (state: Omit<ChapterCharacterState, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}> = ({ state, availableChapters, onSave, onCancel }) => {
  const [characterName, setCharacterName] = useState(state?.characterName || '');
  const [chapterRef, setChapterRef] = useState(state?.chapterRef || '');
  const [stateDescription, setStateDescription] = useState(state?.stateDescription || '');
  const [emotionalState, setEmotionalState] = useState(state?.emotionalState || '');
  const [location, setLocation] = useState(state?.location || '');
  const [changes, setChanges] = useState(state?.changes?.join(', ') || '');

  const handleSave = () => {
    if (!characterName.trim() || !chapterRef) {
      alert('请填写角色名和章节');
      return;
    }
    onSave({
      id: state?.id,
      characterName: characterName.trim(),
      chapterRef,
      stateDescription: stateDescription.trim(),
      emotionalState: emotionalState.trim() || undefined,
      location: location.trim() || undefined,
      relationships: state?.relationships || [],
      changes: changes.split(',').map(c => c.trim()).filter(Boolean),
      createdAt: state?.createdAt || Date.now(),
    });
  };

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <h3 style={{ margin: '0 0 18px 0', fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
        {state ? '编辑角色状态' : '添加角色状态'}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 角色名 + 章节 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
              角色名 <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="角色名称"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
              章节 <span style={{ color: '#f87171' }}>*</span>
            </label>
            <select
              value={chapterRef}
              onChange={(e) => setChapterRef(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">-- 选择章节 --</option>
              {availableChapters.map(ch => (
                <option key={ch.id} value={`05_正文草稿/${ch.name}`}>{ch.name.replace('.md', '')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 状态描述 */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>状态描述</label>
          <textarea
            value={stateDescription}
            onChange={(e) => setStateDescription(e.target.value)}
            placeholder="描述角色当前状态..."
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          />
        </div>

        {/* 情绪 + 位置 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>情绪状态</label>
            <input
              type="text"
              value={emotionalState}
              onChange={(e) => setEmotionalState(e.target.value)}
              placeholder="愤怒、悲伤、平静..."
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>位置</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="客栈、森林..."
              style={inputStyle}
            />
          </div>
        </div>

        {/* 变化 */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>变化（逗号分隔）</label>
          <input
            type="text"
            value={changes}
            onChange={(e) => setChanges(e.target.value)}
            placeholder="获得新技能, 关系变化..."
            style={inputStyle}
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
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
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: 6,
            color: '#4ade80',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <Check size={14} />
          保存
        </button>
      </div>
    </div>
  );
};

// --- 剧情关键点表单 ---
const PlotForm: React.FC<{
  point: ChapterPlotKeyPoint | null;
  availableChapters: { name: string; id: string }[];
  onSave: (point: Omit<ChapterPlotKeyPoint, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}> = ({ point, availableChapters, onSave, onCancel }) => {
  const [chapterRef, setChapterRef] = useState(point?.chapterRef || '');
  const [description, setDescription] = useState(point?.description || '');
  const [importance, setImportance] = useState<'high' | 'medium' | 'low'>(point?.importance || 'medium');
  const [tags, setTags] = useState(point?.tags?.join(', ') || '');
  const [relatedCharacters, setRelatedCharacters] = useState(point?.relatedCharacters?.join(', ') || '');

  const handleSave = () => {
    if (!description.trim() || !chapterRef) {
      alert('请填写描述和章节');
      return;
    }
    onSave({
      id: point?.id,
      chapterRef,
      description: description.trim(),
      importance,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      relatedCharacters: relatedCharacters.split(',').map(c => c.trim()).filter(Boolean),
      createdAt: point?.createdAt || Date.now(),
    });
  };

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <h3 style={{ margin: '0 0 18px 0', fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
        {point ? '编辑剧情关键点' : '添加剧情关键点'}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 章节 + 重要程度 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
              章节 <span style={{ color: '#f87171' }}>*</span>
            </label>
            <select
              value={chapterRef}
              onChange={(e) => setChapterRef(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">-- 选择章节 --</option>
              {availableChapters.map(ch => (
                <option key={ch.id} value={`05_正文草稿/${ch.name}`}>{ch.name.replace('.md', '')}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>重要程度</label>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as any)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="high">重要</option>
              <option value="medium">一般</option>
              <option value="low">次要</option>
            </select>
          </div>
        </div>

        {/* 描述 */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
            描述 <span style={{ color: '#f87171' }}>*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述剧情关键点..."
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          />
        </div>

        {/* 标签 + 相关角色 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>标签（逗号分隔）</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="战斗, 转折..."
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>相关角色（逗号分隔）</label>
            <input
              type="text"
              value={relatedCharacters}
              onChange={(e) => setRelatedCharacters(e.target.value)}
              placeholder="张三, 李四..."
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
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
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: 6,
            color: '#4ade80',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <Check size={14} />
          保存
        </button>
      </div>
    </div>
  );
};
