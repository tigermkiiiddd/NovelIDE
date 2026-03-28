/**
 * ForeshadowingTrackerPanel.tsx
 * 伏笔追踪面板 - 显示伏笔统计、预警、奖励分曲线和情绪曲线
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, AlertTriangle, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { useWorldTimelineStore } from '../stores/worldTimelineStore';
import { useChapterAnalysisStore } from '../stores/chapterAnalysisStore';
import { useProjectStore } from '../stores/projectStore';
import { ForeshadowingItem, HookType, HookStrength, EmotionItem, STRENGTH_SCORES } from '../types';

interface ForeshadowingTrackerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewMode = 'all' | 'pending' | 'fulfilled' | 'overdue';
type CurveView = 'node' | 'hook' | 'both';

const HOOK_TYPE_LABELS: Record<string, string> = {
  crisis: '⚡ 危机',
  mystery: '❓ 悬疑',
  emotion: '💗 情感',
  choice: '⚖ 选择',
  desire: '🔥 欲望',
};

const HOOK_TYPES = [
  { value: 'crisis', label: '危机', icon: '⚡', color: '#f14c4c' },
  { value: 'mystery', label: '悬疑', icon: '❓', color: '#9cdcfe' },
  { value: 'emotion', label: '情感', icon: '💗', color: '#c586c0' },
  { value: 'choice', label: '选择', icon: '⚖', color: '#dcdcaa' },
  { value: 'desire', label: '欲望', icon: '🔥', color: '#ce9178' },
];

const HOOK_STRENGTHS = [
  { value: 'weak', label: '弱', color: '#6a8759', bg: '#6a875922' },
  { value: 'medium', label: '中', color: '#d7ba7d', bg: '#d7ba7d22' },
  { value: 'strong', label: '强', color: '#f14c4c', bg: '#f14c4c22' },
];

const STRENGTH_LABELS: Record<string, string> = {
  weak: '弱',
  medium: '中',
  strong: '强',
};

const STRENGTH_COLORS: Record<string, string> = {
  weak: '#6a8759',
  medium: '#d7ba7d',
  strong: '#f14c4c',
};

const HOOK_ICONS: Record<string, string> = {
  crisis: '⚡',
  mystery: '❓',
  emotion: '💗',
  choice: '⚖',
  desire: '🔥',
};

// 情绪类型颜色
const EMOTION_COLORS: Record<string, { color: string; bg: string }> = {
  '期待': { color: '#4ec9b0', bg: '#4ec9b033' },
  '害怕': { color: '#ce9178', bg: '#ce917833' },
  '不安': { color: '#dcdcaa', bg: '#dcdcaa33' },
  '兴奋': { color: '#569cd6', bg: '#569cd633' },
  '悲伤': { color: '#9cdcfe', bg: '#9cdcfe33' },
  '愤怒': { color: '#f14c4c', bg: '#f14c4c33' },
  '温馨': { color: '#d7ba7d', bg: '#d7ba7d33' },
  '紧张': { color: '#cc7832', bg: '#cc783233' },
  '轻松': { color: '#6a8759', bg: '#6a875933' },
  '压抑': { color: '#646495', bg: '#64649533' },
  '感动': { color: '#c586c0', bg: '#c586c033' },
};

const ForeshadowingTrackerPanel: React.FC<ForeshadowingTrackerPanelProps> = ({ isOpen, onClose }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [curveView, setCurveView] = useState<CurveView>('both');
  const [withinChapters, setWithinChapters] = useState<number>(5);

  // 获取 store 数据
  const timeline = useWorldTimelineStore((s) => s.timeline);
  const loadTimeline = useWorldTimelineStore((s) => s.loadTimeline);
  const getNodeEmotionCurve = useWorldTimelineStore((s) => s.getNodeEmotionCurve);
  const getHookEmotionCurve = useWorldTimelineStore((s) => s.getHookEmotionCurve);
  const getForeshadowingStats = useWorldTimelineStore((s) => s.getForeshadowingStats);
  const getOverdueForeshadowings = useWorldTimelineStore((s) => s.getOverdueForeshadowings);
  const getExpiringForeshadowings = useWorldTimelineStore((s) => s.getExpiringForeshadowings);
  const chapterAnalysisStore = useChapterAnalysisStore((s) => s.data);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  // 面板打开时确保 timeline 已加载
  useEffect(() => {
    if (isOpen && !timeline && currentProjectId) {
      loadTimeline(currentProjectId);
    }
  }, [isOpen, timeline, currentProjectId, loadTimeline]);

  // 获取伏笔数据
  const foreshadowings = useMemo(() => {
    if (!chapterAnalysisStore?.foreshadowing) return [];
    // 只取来源为 timeline 的伏笔
    return chapterAnalysisStore.foreshadowing.filter(
      (f: ForeshadowingItem) => f.source === 'timeline'
    );
  }, [chapterAnalysisStore?.foreshadowing]);

  // 当前最大章节序号
  const maxChapter = useMemo(() => {
    if (!timeline?.chapters?.length) return 1;
    return Math.max(...timeline.chapters.map(c => c.chapterIndex));
  }, [timeline?.chapters]);

  // 计算统计
  const stats = useMemo(() => getForeshadowingStats(foreshadowings, maxChapter), [foreshadowings, maxChapter, getForeshadowingStats]);

  // 即将到期
  const expiring = useMemo(
    () => getExpiringForeshadowings(foreshadowings, maxChapter, withinChapters),
    [foreshadowings, maxChapter, withinChapters, getExpiringForeshadowings]
  );

  // 逾期
  const overdue = useMemo(
    () => getOverdueForeshadowings(foreshadowings, maxChapter),
    [foreshadowings, maxChapter, getOverdueForeshadowings]
  );

  // 节点情绪曲线
  const nodeEmotionCurve = useMemo(() => getNodeEmotionCurve(), [getNodeEmotionCurve]);

  // 钩子情绪奖励曲线
  const hookEmotionCurve = useMemo(() => getHookEmotionCurve(), [getHookEmotionCurve]);

  // 过滤伏笔列表
  const filteredForeshadowings = useMemo(() => {
    let list = [...foreshadowings];
    if (viewMode === 'pending') list = list.filter((f: ForeshadowingItem) => f.type !== 'resolved');
    else if (viewMode === 'fulfilled') list = list.filter((f: ForeshadowingItem) => f.type === 'resolved');
    else if (viewMode === 'overdue') list = overdue;
    return list.sort((a: ForeshadowingItem, b: ForeshadowingItem) => {
      const aDue = a.dueChapter ?? (maxChapter + (a.window ?? 10));
      const bDue = b.dueChapter ?? (maxChapter + (b.window ?? 10));
      return aDue - bDue;
    });
  }, [foreshadowings, viewMode, overdue, maxChapter]);

  // 奖励分累计曲线数据
  const rewardCurveData = useMemo(() => {
    const sorted = [...foreshadowings]
      .filter((f: ForeshadowingItem) => f.type === 'resolved' && f.rewardScore)
      .sort((a: ForeshadowingItem, b: ForeshadowingItem) => {
        const aChapter = timeline?.events.find(e => e.id === a.sourceRef)?.chapterId
          ? timeline?.chapters.find(c => c.id === timeline.events.find(e => e.id === a.sourceRef)?.chapterId)?.chapterIndex ?? 0
          : 0;
        const bChapter = timeline?.events.find(e => e.id === b.sourceRef)?.chapterId
          ? timeline?.chapters.find(c => c.id === timeline.events.find(e => e.id === b.sourceRef)?.chapterId)?.chapterIndex ?? 0
          : 0;
        return aChapter - bChapter;
      });

    let cumulative = 0;
    return sorted.map((f: ForeshadowingItem) => {
      const event = timeline?.events.find(e => e.id === f.sourceRef);
      const chapter = event?.chapterId
        ? timeline?.chapters.find(c => c.id === event.chapterId)?.chapterIndex ?? 0
        : 0;
      cumulative += f.actualScore ?? f.rewardScore ?? 0;
      return { chapter, score: cumulative, reward: f.actualScore ?? f.rewardScore ?? 0 };
    });
  }, [foreshadowings, timeline]);

  // 情绪曲线数据计算
  const nodeCurveStats = useMemo(() => {
    if (nodeEmotionCurve.length === 0) return null;
    const scores = nodeEmotionCurve.map(p => p.totalScore);
    const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const variance = scores.reduce((s: number, v: number) => s + (v - avg) ** 2, 0) / scores.length;
    const stddev = Math.sqrt(variance);
    return { avg, max, min, stddev };
  }, [nodeEmotionCurve]);

  const hookCurveStats = useMemo(() => {
    if (hookEmotionCurve.length === 0) return null;
    const total = hookEmotionCurve.reduce((s: number, p: any) => s + p.bonus, 0);
    return { total };
  }, [hookEmotionCurve]);

  // 绘制简单折线图
  const renderMiniChart = (data: { x: number; y: number }[], maxY: number, minY: number, height: number = 60) => {
    // 即使数据不足也显示空图表框架
    if (data.length < 2) {
      return (
        <div className="relative" style={{ height }}>
          <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
            <line x1="0" y1="50" x2="100" y2="50" stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
            <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fill="#555" fontSize="8">暂无数据</text>
          </svg>
        </div>
      );
    }

    const xs = data.map(d => d.x);
    const ys = data.map(d => d.y);
    const maxX = Math.max.apply(Math, xs.concat([1]));
    const minX = Math.min.apply(Math, xs.concat([0]));
    const rangeY = maxY - minY || 1;
    const rangeX = maxX - minX || 1;

    const points = data.map(d => ({
      x: ((d.x - minX) / rangeX) * 100,
      y: 100 - ((d.y - minY) / rangeY) * 100
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <svg viewBox="0 0 100 100" className="w-full" style={{ height }} preserveAspectRatio="none">
        {/* 零线 */}
        {minY < 0 && maxY > 0 && (
          <line
            x1="0" y1={100 - ((0 - minY) / rangeY) * 100}
            x2="100" y2={100 - ((0 - minY) / rangeY) * 100}
            stroke="#555" strokeDasharray="2,2" strokeWidth="0.5"
          />
        )}
        {/* 折线 */}
        <path d={pathD} fill="none" stroke="#4ec9b0" strokeWidth="2" />
        {/* 数据点 */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="#4ec9b0" />
        ))}
      </svg>
    );
  };

  // 获取事件所在章节
  const getEventChapter = (eventId: string) => {
    const event = timeline?.events.find(e => e.id === eventId);
    if (!event?.chapterId) return null;
    return timeline?.chapters.find(c => c.id === event.chapterId);
  };

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-purple-400" />
          <span className="font-semibold text-lg">伏笔追踪</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '总伏笔', value: stats.total, color: 'text-gray-300' },
            { label: '待回收', value: stats.pending, color: 'text-blue-400' },
            { label: '已回收', value: stats.fulfilled, color: 'text-green-400' },
            { label: '逾期', value: stats.overdue, color: 'text-red-400' }
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-800 rounded p-2 text-center">
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 奖励分统计 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '总奖励分', value: stats.totalRewardScore, color: 'text-yellow-400' },
            { label: '已回收分', value: stats.fulfilledRewardScore, color: 'text-green-400' },
            { label: '逾期率', value: `${(stats.overdueRate * 100).toFixed(0)}%`, color: 'text-red-400' }
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-800 rounded p-2 text-center">
              <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 预警区 */}
        {(expiring.length > 0 || overdue.length > 0) && (
          <div className="bg-gray-800 rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-orange-400" />
              <span className="text-sm font-medium text-orange-400">预警</span>
            </div>
            <div className="space-y-1">
              {overdue.slice(0, 3).map((f: ForeshadowingItem) => {
                const event = timeline?.events.find(e => e.id === f.sourceRef);
                const chapter = getEventChapter(f.sourceRef);
                const hookDef = f.hookType ? HOOK_TYPES.find(t => t.value === f.hookType) : null;
                return (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 rounded p-1.5">
                    <span>⚠️</span>
                    <span className="flex-1 truncate">{f.content}</span>
                    {chapter && <span>第{chapter.chapterIndex}章</span>}
                    {hookDef && <span>{hookDef.icon}</span>}
                    {f.rewardScore && <span>+{f.rewardScore}</span>}
                  </div>
                );
              })}
              {expiring.slice(0, 3).map((f: ForeshadowingItem) => {
                const event = timeline?.events.find(e => e.id === f.sourceRef);
                const chapter = getEventChapter(f.sourceRef);
                const dueChapter = f.dueChapter ?? (maxChapter + (f.window ?? 10));
                const remaining = dueChapter - maxChapter;
                const hookDef = f.hookType ? HOOK_TYPES.find(t => t.value === f.hookType) : null;
                return (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/20 rounded p-1.5">
                    <span>⏳</span>
                    <span className="flex-1 truncate">{f.content}</span>
                    {chapter && <span>第{chapter.chapterIndex}章</span>}
                    <span>剩{remaining}章</span>
                    {hookDef && <span>{hookDef.icon}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 图表切换 */}
        <div className="flex gap-1 text-xs">
          {([
            ['node', '节点情绪'],
            ['hook', '钩子奖励'],
            ['both', '全部']
          ] as [CurveView, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setCurveView(mode)}
              className={`px-2 py-1 rounded ${
                curveView === mode ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 节点情绪曲线 */}
        {(curveView === 'node' || curveView === 'both') && nodeEmotionCurve.length > 0 && (
          <div className="bg-gray-800 rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-blue-400" />
              <span className="text-sm font-medium text-blue-400">节点情绪曲线</span>
            </div>
            {nodeCurveStats && (
              <div className="text-xs text-gray-500 mb-2">
                平均：{nodeCurveStats.avg >= 0 ? '+' : ''}{nodeCurveStats.avg.toFixed(1)} |
                峰值：+{nodeCurveStats.max} | 低谷：{nodeCurveStats.min} |
                波动：σ={nodeCurveStats.stddev.toFixed(1)}
              </div>
            )}
            {renderMiniChart(
              nodeEmotionCurve.map(p => ({
                x: p.chapterIndex,
                y: p.totalScore
              })),
              Math.max(5, ...nodeEmotionCurve.map(p => p.totalScore)),
              Math.min(-5, ...nodeEmotionCurve.map(p => p.totalScore)),
              80
            )}
            {/* 情绪标签图例 */}
            <div className="flex flex-wrap gap-1 mt-2">
              {nodeEmotionCurve.map((p) =>
                p.emotions.map((e: EmotionItem, idx: number) => {
                  const colorDef = EMOTION_COLORS[e.type as string] || { color: '#888', bg: '#88833' };
                  return (
                    <span
                      key={`${p.eventId}-${idx}`}
                      className="text-xs px-1 py-0.5 rounded"
                      style={{ backgroundColor: colorDef.bg, color: colorDef.color }}
                      title={`第${p.chapterIndex}章`}
                    >
                      {e.type}{e.score >= 0 ? '+' : ''}{e.score}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 钩子情绪奖励曲线 */}
        {(curveView === 'hook' || curveView === 'both') && hookEmotionCurve.length > 0 && (
          <div className="bg-gray-800 rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={14} className="text-orange-400" />
              <span className="text-sm font-medium text-orange-400">钩子情绪奖励曲线</span>
            </div>
            {hookCurveStats && (
              <div className="text-xs text-gray-500 mb-2">
                累计奖励：+{hookCurveStats.total} | 活跃钩子：{hookEmotionCurve.length}个
              </div>
            )}
            {renderMiniChart(
              hookEmotionCurve.reduce((acc: { x: number; y: number }[], p: any) => {
                const last = acc.length > 0 ? acc[acc.length - 1].y : 0;
                acc.push({ x: p.chapterIndex, y: last + p.bonus });
                return acc;
              }, []),
              Math.max(10, ...hookEmotionCurve.reduce((acc: number[], p: any) => {
                const last = acc.length > 0 ? acc[acc.length - 1] : 0;
                acc.push(last + p.bonus);
                return acc;
              }, [])),
              0,
              80
            )}
            {/* 钩子活动图例 */}
            <div className="flex flex-wrap gap-1 mt-2">
              {hookEmotionCurve.slice(-10).map((p: any) => {
                const actionLabels: Record<string, string> = { planted: '埋', advanced: '进', fulfilled: '收' };
                const actionColors: Record<string, string> = { planted: '#ce9178', advanced: '#dcdcaa', fulfilled: '#4ec9b0' };
                return (
                  <span
                    key={p.foreshadowingId + p.action}
                    className="text-xs px-1 py-0.5 rounded"
                    style={{ backgroundColor: actionColors[p.action] + '33', color: actionColors[p.action] }}
                    title={`第${p.chapterIndex}章 ${actionLabels[p.action]}`}
                  >
                    {actionLabels[p.action]}+{p.bonus}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* 奖励分累计曲线 */}
        {rewardCurveData.length > 0 && (
          <div className="bg-gray-800 rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-yellow-400" />
              <span className="text-sm font-medium text-yellow-400">奖励分累计曲线</span>
            </div>
            {renderMiniChart(
              rewardCurveData.map(d => ({ x: d.chapter, y: d.score })),
              Math.max(0, ...rewardCurveData.map(d => d.score)),
              0,
              60
            )}
          </div>
        )}

        {/* 伏笔列表 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-300">伏笔列表</span>
            <div className="flex gap-1 text-xs">
              {([
                ['all', '全部'],
                ['pending', '待收'],
                ['fulfilled', '已收'],
                ['overdue', '逾期']
              ] as [ViewMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-0.5 rounded ${
                    viewMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filteredForeshadowings.length === 0 ? (
              <div className="text-center text-gray-500 py-4 text-sm">暂无伏笔</div>
            ) : (
              filteredForeshadowings.map((f: ForeshadowingItem) => {
                const event = timeline?.events.find(e => e.id === f.sourceRef);
                const chapter = getEventChapter(f.sourceRef);
                const dueChapter = f.dueChapter ?? (maxChapter + (f.window ?? 10));
                const remaining = dueChapter - maxChapter;
                const isOverdue = remaining < 0 && f.type !== 'resolved';
                const hookDef = f.hookType ? HOOK_TYPES.find(t => t.value === f.hookType) : null;
                const strengthDef = f.strength ? HOOK_STRENGTHS.find(t => t.value === f.strength) : null;
                const typeColors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
                const typeLabels: Record<string, string> = { planted: '🌱埋', developed: '🌿进', resolved: '✅收' };

                return (
                  <div
                    key={f.id}
                    className="bg-gray-800 rounded p-2 flex flex-col gap-1"
                    style={{ borderLeft: `3px solid ${typeColors[f.type] || '#555'}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: typeColors[f.type] }}>
                        {typeLabels[f.type]}
                      </span>
                      <span className="flex-1 text-sm text-gray-200 truncate">{f.content}</span>
                      {chapter && <span className="text-xs text-gray-500">第{chapter.chapterIndex}章</span>}
                      {f.hookType && hookDef && (
                        <span className="text-xs" style={{ color: hookDef.color }}>{hookDef.icon}</span>
                      )}
                      {f.strength && strengthDef && (
                        <span className="text-xs" style={{ color: strengthDef.color }}>{strengthDef.label}</span>
                      )}
                      {f.rewardScore && (
                        <span className="text-xs text-yellow-400">+{f.rewardScore}</span>
                      )}
                      {f.type !== 'resolved' && (
                        <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                          {isOverdue ? `逾期${Math.abs(remaining)}章` : `剩${remaining}章`}
                        </span>
                      )}
                    </div>
                    {/* 父伏笔上下文（子伏笔时显示） */}
                    {f.parentId && (() => {
                      const parent = foreshadowings.find((p: ForeshadowingItem) => p.id === f.parentId);
                      if (!parent) return null;
                      return (
                        <div className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 rounded px-2 py-1">
                          <span>↳ 推进自：</span>
                          <span className="truncate">{parent.content}</span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForeshadowingTrackerPanel;
