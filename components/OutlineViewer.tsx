/**
 * OutlineViewer.tsx
 * 时间线编辑器 - 管理事件、章节和卷
 *
 * 层级结构：事件 → 章节 → 卷
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Clock, Plus, Pencil, ChevronDown, ChevronRight, GripVertical
} from 'lucide-react';
import { useWorldTimelineStore, formatTimeDisplay, formatTimeRangeDisplay, WorldTimelineState } from '../stores/worldTimelineStore';
import { useProjectStore, ProjectState } from '../stores/projectStore';
import { useChapterAnalysisStore, ChapterAnalysisState } from '../stores/chapterAnalysisStore';
import { TimelineEvent, ChapterGroup, VolumeGroup, StoryLine, ForeshadowingItem } from '../types';

interface OutlineViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

type TimelineLevel = 'events' | 'chapters' | 'volumes' | 'foreshadowing';
type EventGroupMode = 'none' | 'day' | 'chapter';

// 事件表单数据类型
interface EventFormData {
  // 时间戳（开始时间）
  day: number;          // 第几天
  hour: number;         // 小时（0-23，支持小数）
  // 持续时间
  durationValue: number;
  durationUnit: 'hour' | 'day';
  title: string;
  content: string;
  location: string;
  characters: string;
  emotion: string;          // 现有：情绪氛围（文本）
  emotions: EventEmotion[]; // 新增：情绪数组
  storyLineId: string;
  chapterId: string;  // 所属章节
}

// 事件情绪项
interface EventEmotion {
  type: string;
  score: number;
}

// 情绪类型选项（从 types 导入读者情绪定义）
import { READER_EMOTIONS, READER_EMOTION_GROUPS, ReaderEmotionGroup, ReaderEmotionDef } from '../types';

// 情绪查找 Map（value → 定义）
const EMOTION_DEF_MAP = new Map<string, ReaderEmotionDef>(
  READER_EMOTIONS.map(e => [e.value, e])
);

// 情绪强度选项
const EMOTION_SCORES = [
  { label: '-5', value: -5 },
  { label: '-3', value: -3 },
  { label: '-1', value: -1 },
  { label: '+1', value: 1 },
  { label: '+3', value: 3 },
  { label: '+5', value: 5 },
];

// 钩子类型
const HOOK_TYPES = [
  { value: 'crisis', label: '危机', icon: '⚡', color: '#f14c4c' },
  { value: 'mystery', label: '悬疑', icon: '❓', color: '#9cdcfe' },
  { value: 'emotion', label: '情感', icon: '💗', color: '#c586c0' },
  { value: 'choice', label: '选择', icon: '⚖', color: '#dcdcaa' },
  { value: 'desire', label: '欲望', icon: '🔥', color: '#ce9178' },
];

// 钩子强度
const HOOK_STRENGTHS = [
  { value: 'weak', label: '弱', color: '#6a8759', bg: '#6a875922' },
  { value: 'medium', label: '中', color: '#d7ba7d', bg: '#d7ba7d22' },
  { value: 'strong', label: '强', color: '#f14c4c', bg: '#f14c4c22' },
];

// === 统一曲线图面板组件 ===
interface ChartSeries {
  id: string;
  name: string;
  color: string;
  data: { x: number; y: number }[];
}

const CombinedTimelineChart: React.FC<{ series: ChartSeries[] }> = ({ series }) => {
  const [activeSeries, setActiveSeries] = useState<Set<string>>(new Set(series.map(s => s.id)));
  const [hoverX, setHoverX] = useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  const visibleSeries = series.filter(s => activeSeries.has(s.id));
  
  if (series.length === 0 || series.every(s => s.data.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-gray-800/50 rounded-lg border border-gray-700/50">
        <span className="text-gray-500 text-sm">暂无数据</span>
      </div>
    );
  }

  // Find global min and max X across ALL series so X-axis is stable
  let minX = Infinity;
  let maxX = -Infinity;
  series.forEach(s => {
    s.data.forEach(d => {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
    });
  });
  
  if (minX === Infinity || visibleSeries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-gray-800/50 rounded-lg border border-gray-700/50">
        <span className="text-gray-500 text-sm">按需点击下方图例显示曲线</span>
        <div className="flex gap-2 mt-2">
          {series.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSeries(new Set([s.id]))}
              className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300 hover:bg-gray-600 transition-colors"
            >
              显示 {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const rangeX = Math.max(maxX - minX, 1);
  const width = 800;
  const height = 200;
  const padding = { top: 20, right: 10, bottom: 20, left: 10 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const pointsBySeries = visibleSeries.map(s => {
    const sortedData = [...s.data].sort((a,b) => a.x - b.x);
    
    // 如果只有1个点，添加一个相同值的终点以形成一条水平短线
    if (sortedData.length === 1) {
      sortedData.push({ x: sortedData[0].x + 1, y: sortedData[0].y });
      maxX = Math.max(maxX, sortedData[1].x);
    }
    
    const ys = sortedData.map(d => d.y);
    const maxY = Math.max(...ys, 0); 
    const minY = Math.min(...ys, 0); 
    
    const yPad = (maxY - minY) * 0.1 || 1;
    const adjustedMaxY = maxY + yPad;
    const adjustedMinY = minY < 0 ? minY - yPad : 0; 

    const rangeY = Math.max(adjustedMaxY - adjustedMinY, 1);
    
    const points = sortedData.map(d => ({
      x: padding.left + ((d.x - minX) / Math.max(maxX - minX, 1)) * graphWidth,
      y: padding.top + graphHeight - ((d.y - adjustedMinY) / rangeY) * graphHeight,
      origin: d
    }));
    
    const pathD = points.map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1];
      const cp1x = prev.x + (p.x - prev.x) / 3;
      const cp1y = prev.y;
      const cp2x = p.x - (p.x - prev.x) / 3;
      const cp2y = p.y;
      return `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p.x} ${p.y}`;
    }).join(' ');
    
    let zeroY = null;
    if (adjustedMinY < 0 && adjustedMaxY > 0) {
      zeroY = padding.top + graphHeight - ((0 - adjustedMinY) / rangeY) * graphHeight;
    }

    return { ...s, points, pathD, zeroY, adjustedMinY, adjustedMaxY };
  });

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50 flex flex-col gap-3">
      {/* Legend / Toggles */}
      <div className="flex flex-wrap gap-3 items-center justify-center">
        {series.map(s => {
          const isActive = activeSeries.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                const next = new Set(activeSeries);
                if (next.has(s.id)) next.delete(s.id);
                else next.add(s.id);
                if (next.size > 0) setActiveSeries(next);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-200"
              style={{ 
                backgroundColor: isActive ? `${s.color}22` : 'transparent',
                border: `1px solid ${isActive ? s.color : '#444'}`,
                color: isActive ? '#fff' : '#666',
                opacity: isActive ? 1 : 0.6
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isActive ? s.color : '#444' }} />
              <span className="font-medium">{s.name}</span>
            </button>
          );
        })}
      </div>
      
      {/* Chart Canvas */}
      <div 
        ref={containerRef}
        className="relative w-full h-[180px] bg-gray-900/40 rounded-lg overflow-hidden"
        onMouseLeave={() => setHoverX(null)}
        onMouseMove={(e) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const viewX = (e.clientX - rect.left) / rect.width * width;
          const mapX = minX + ((viewX - padding.left) / graphWidth) * rangeX;
          
          let bestDif = Infinity;
          let bestX = null;
          pointsBySeries.forEach(s => {
             s.points.forEach(p => {
               const dif = Math.abs(p.origin.x - mapX);
               if (dif < bestDif) {
                 bestDif = dif;
                 bestX = p.origin.x;
               }
             });
          });
          if (bestX !== null && bestDif < (rangeX * 0.1)) {
            setHoverX(bestX);
          } else {
            const roundedX = Math.round(mapX);
            if (roundedX >= minX && roundedX <= maxX) setHoverX(roundedX);
          }
        }}
        onTouchMove={(e) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const viewX = (e.touches[0].clientX - rect.left) / rect.width * width;
          const mapX = minX + ((viewX - padding.left) / graphWidth) * rangeX;
          const roundedX = Math.round(mapX);
          if (roundedX >= minX && roundedX <= maxX) setHoverX(roundedX);
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          {/* Grid lines */}
          {[1, 0.75, 0.5, 0.25, 0].map(r => (
            <line 
              key={r}
              x1={padding.left} y1={padding.top + r * graphHeight} 
              x2={width - padding.right} y2={padding.top + r * graphHeight} 
              stroke="#333" strokeDasharray="3,3" strokeWidth="1.5"
            />
          ))}
          
          {/* Zero lines */}
          {pointsBySeries.map(s => s.zeroY !== null && (
            <line 
              key={`zero-${s.id}`}
              x1={padding.left} y1={s.zeroY} 
              x2={width - padding.right} y2={s.zeroY} 
              stroke={s.color} strokeOpacity="0.4" strokeDasharray="2,2" strokeWidth="1"
            />
          ))}

          {/* Paths */}
          {pointsBySeries.map(s => {
            if (s.points.length < 2) return null;
            const groundY = s.adjustedMinY < 0 ? s.zeroY! : padding.top + graphHeight;
            return (
            <g key={`curve-${s.id}`}>
              <path 
                d={`${s.pathD} L ${s.points[s.points.length-1].x} ${groundY} L ${s.points[0].x} ${groundY} Z`} 
                fill={`url(#grad-${s.id})`} 
                opacity="0.3"
              />
              <path 
                d={s.pathD} 
                fill="none" 
                stroke={s.color} 
                strokeWidth="2.5" 
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0px 2px 3px rgba(0,0,0,0.5))' }}
              />
            </g>
          )})}
          
          <defs>
            {visibleSeries.map(s => (
              <linearGradient key={`grad-${s.id}`} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
        </svg>

        {/* Hover Line */}
        {hoverX !== null && (
          <div 
            className="absolute top-0 bottom-0 border-l border-dashed border-gray-400 pointer-events-none"
            style={{ left: `${(padding.left + ((hoverX - minX) / Math.max(rangeX, 1)) * graphWidth) / width * 100}%` }}
          />
        )}

        {/* Hover Points */}
        {hoverX !== null && pointsBySeries.map(s => {
          const point = s.points.find(p => p.origin.x === hoverX);
          if (!point) return null;
          return (
            <div 
              key={`dot-${s.id}`}
              className="absolute w-2.5 h-2.5 rounded-full shadow border border-gray-900 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-transform scale-150"
              style={{
                backgroundColor: s.color,
                left: `${(point.x / width) * 100}%`,
                top: `${(point.y / height) * 100}%`
              }}
            />
          );
        })}

        {/* Tooltip Popup */}
        {hoverX !== null && (
          <div 
            className="absolute z-20 bg-gray-900/95 backdrop-blur border border-gray-600 rounded-lg p-2.5 shadow-xl pointer-events-none transform -translate-x-1/2 min-w-[120px]"
            style={{ 
              left: `${(padding.left + ((hoverX - minX) / Math.max(rangeX, 1)) * graphWidth) / width * 100}%`,
              top: '5%',
              ...( (hoverX - minX) / Math.max(rangeX, 1) > 0.8 ? { transform: 'translateX(-100%)' } : {} ),
              ...( (hoverX - minX) / Math.max(rangeX, 1) < 0.2 ? { transform: 'translateX(0%)' } : {} )
            }}
          >
            <div className="font-bold text-gray-200 text-xs mb-1.5 border-b border-gray-700 pb-1">
              第 {hoverX} 章
            </div>
            <div className="space-y-1 text-xs">
              {pointsBySeries.map(s => {
                const point = s.points.find(p => p.origin.x === hoverX);
                if (!point) return null;
                return (
                  <div key={`tt-${s.id}`} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-gray-400">{s.name}</span>
                    </div>
                    <span className="text-white font-mono font-medium">{point.origin.y > 0 ? '+' : ''}{(Math.round(point.origin.y * 10) / 10).toString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// === 曲线图面板组件（内嵌到 OutlineViewer） ===
const TimelineCurvesPanel: React.FC = () => {
  const timeline = useWorldTimelineStore((s) => s.timeline);
  const getNodeEmotionCurve = useWorldTimelineStore((s) => s.getNodeEmotionCurve);
  const getHookEmotionCurve = useWorldTimelineStore((s) => s.getHookEmotionCurve);
  const getForeshadowingStats = useWorldTimelineStore((s) => s.getForeshadowingStats);
  const chapterAnalysisStore = useChapterAnalysisStore((s) => s.data);
  const [curveView, setCurveView] = useState<'node' | 'hook' | 'both'>('both');

  // 获取伏笔数据
  const foreshadowings = useMemo(() => {
    if (!chapterAnalysisStore?.foreshadowing) return [];
    return chapterAnalysisStore.foreshadowing.filter((f: any) => f.source === 'timeline');
  }, [chapterAnalysisStore?.foreshadowing]);

  const maxChapter = useMemo(() => {
    if (!timeline?.chapters?.length) return 1;
    return Math.max(...timeline.chapters.map((c: any) => c.chapterIndex));
  }, [timeline?.chapters]);

  const stats = useMemo(() => getForeshadowingStats(foreshadowings, maxChapter), [foreshadowings, maxChapter, getForeshadowingStats]);
  const nodeEmotionCurve = useMemo(() => getNodeEmotionCurve(), [getNodeEmotionCurve]);
  const hookEmotionCurve = useMemo(() => getHookEmotionCurve(), [getHookEmotionCurve]);

  // 奖励分累计曲线数据
  const rewardCurveData = useMemo(() => {
    if (!foreshadowings.length) return [];
    const sorted = [...foreshadowings].sort((a: any, b: any) => {
      const aCh = timeline?.events.find((e: any) => e.id === a.sourceRef)?.eventIndex ?? 0;
      const bCh = timeline?.events.find((e: any) => e.id === b.sourceRef)?.eventIndex ?? 0;
      return aCh - bCh;
    });
    let cumulative = 0;
    return sorted.map((f: any) => {
      const event = timeline?.events.find((e: any) => e.id === f.sourceRef);
      const chapter = event?.chapterId ? timeline?.chapters.find((c: any) => c.id === event.chapterId)?.chapterIndex ?? 0 : 0;
      cumulative += f.actualScore ?? f.rewardScore ?? 0;
      return { chapter, score: cumulative };
    });
  }, [foreshadowings, timeline]);

  // 构建统一的系列数据
  const chartSeries = useMemo(() => {
    const nodeData = nodeEmotionCurve.map((p: any) => ({ x: p.chapterIndex, y: p.totalScore }));
    const hookData = hookEmotionCurve.reduce((acc: any[], p: any) => {
      const last = acc.length > 0 ? acc[acc.length - 1].y : 0;
      acc.push({ x: p.chapterIndex, y: last + p.bonus });
      return acc;
    }, []);
    const rewardData = rewardCurveData.map(d => ({ x: d.chapter, y: d.score }));
    return [
      { id: 'node', name: '读者情绪曲线', color: '#4ec9b0', data: nodeData },
      { id: 'hook', name: '钩子情绪奖励', color: '#ce9178', data: hookData },
      { id: 'reward', name: '奖励分累计', color: '#d7ba7d', data: rewardData },
    ];
  }, [nodeEmotionCurve, hookEmotionCurve, rewardCurveData]);

  if (!timeline) return null;

  return (
    <div className="border-b border-gray-700 bg-gray-900/50 p-3">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-xs text-gray-400">总伏笔</div>
          <div className="text-lg font-bold text-yellow-400">{stats.total}</div>
        </div>
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-xs text-gray-400">待回收</div>
          <div className="text-lg font-bold text-blue-400">{stats.pending}</div>
        </div>
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-xs text-gray-400">已回收</div>
          <div className="text-lg font-bold text-green-400">{stats.fulfilled}</div>
        </div>
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-xs text-gray-400">逾期</div>
          <div className="text-lg font-bold text-red-400">{stats.overdue}</div>
        </div>
      </div>

      {/* 统一视图曲线图 */}
      <CombinedTimelineChart series={chartSeries} />
    </div>
  );
};

// === 伏笔追踪完整页面视图 ===
const ForeshadowingTrackerView: React.FC = () => {
  const timeline = useWorldTimelineStore((s) => s.timeline);
  const getNodeEmotionCurve = useWorldTimelineStore((s) => s.getNodeEmotionCurve);
  const getHookEmotionCurve = useWorldTimelineStore((s) => s.getHookEmotionCurve);
  const getForeshadowingStats = useWorldTimelineStore((s) => s.getForeshadowingStats);
  const getOverdueForeshadowings = useWorldTimelineStore((s) => s.getOverdueForeshadowings);
  const getExpiringForeshadowings = useWorldTimelineStore((s) => s.getExpiringForeshadowings);
  const chapterAnalysisStore = useChapterAnalysisStore((s) => s.data);
  const [curveView, setCurveView] = useState<'node' | 'hook' | 'both'>('node');
  const [viewMode, setViewMode] = useState<'all' | 'pending' | 'fulfilled' | 'overdue'>('all');

  // 获取伏笔数据
  const foreshadowings = useMemo(() => {
    if (!chapterAnalysisStore?.foreshadowing) return [];
    return chapterAnalysisStore.foreshadowing.filter((f: any) => f.source === 'timeline');
  }, [chapterAnalysisStore?.foreshadowing]);

  const maxChapter = useMemo(() => {
    if (!timeline?.chapters?.length) return 1;
    return Math.max(...timeline.chapters.map((c: any) => c.chapterIndex));
  }, [timeline?.chapters]);

  const stats = useMemo(() => getForeshadowingStats(foreshadowings, maxChapter), [foreshadowings, maxChapter, getForeshadowingStats]);
  const expiring = useMemo(() => getExpiringForeshadowings(foreshadowings, maxChapter, 5), [foreshadowings, maxChapter, getExpiringForeshadowings]);
  const overdue = useMemo(() => getOverdueForeshadowings(foreshadowings, maxChapter), [foreshadowings, maxChapter, getOverdueForeshadowings]);
  const nodeEmotionCurve = useMemo(() => getNodeEmotionCurve(), [getNodeEmotionCurve]);
  const hookEmotionCurve = useMemo(() => getHookEmotionCurve(), [getHookEmotionCurve]);

  // 过滤伏笔列表
  const filteredForeshadowings = useMemo(() => {
    let list = [...foreshadowings];
    if (viewMode === 'pending') list = list.filter((f: any) => f.type !== 'resolved');
    else if (viewMode === 'fulfilled') list = list.filter((f: any) => f.type === 'resolved');
    else if (viewMode === 'overdue') list = overdue;
    return list.sort((a: any, b: any) => {
      const aDue = a.dueChapter ?? (maxChapter + (a.window ?? 10));
      const bDue = b.dueChapter ?? (maxChapter + (b.window ?? 10));
      return aDue - bDue;
    });
  }, [foreshadowings, viewMode, overdue, maxChapter]);

  // 构建统一的系列数据用于伏笔追踪页面
  const chartSeries = useMemo(() => {
    const nodeData = foreshadowings.slice(0, 30).map((f: any, i: number) => ({ x: i + 1, y: (i + 1) * 2 }));
    const hookData = foreshadowings.slice(0, 30).map((f: any, i: number) => ({
      x: i + 1,
      y: f.type === 'resolved' ? 5 : (f.type === 'developed' ? 2 : 3)
    }));
    const rewardData = foreshadowings
      .filter((f: any) => f.type === 'resolved' && f.rewardScore)
      .map((f: any, i: number) => ({ x: i + 1, y: f.rewardScore || 0 }));

    return [
      { id: 'node', name: '读者情绪', color: '#4ec9b0', data: nodeData },
      { id: 'hook', name: '钩子情绪奖励', color: '#ce9178', data: hookData },
      { id: 'reward', name: '奖励分累计', color: '#d7ba7d', data: rewardData },
    ];
  }, [foreshadowings]);

  // 钩子图标
  const getHookIcon = (type?: string) => {
    const icons: Record<string, string> = { crisis: '⚡', mystery: '❓', emotion: '💗', choice: '⚖', desire: '🔥' };
    return icons[type || ''] || '❓';
  };

  const getHookColor = (type?: string) => {
    const colors: Record<string, string> = { crisis: '#f14c4c', mystery: '#9cdcfe', emotion: '#c586c0', choice: '#dcdcaa', desire: '#ce9178' };
    return colors[type || ''] || '#888';
  };

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">总伏笔</div>
          <div className="text-2xl font-bold text-yellow-400">{stats.total}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">待回收</div>
          <div className="text-2xl font-bold text-blue-400">{stats.pending}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">已回收</div>
          <div className="text-2xl font-bold text-green-400">{stats.fulfilled}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">逾期</div>
          <div className="text-2xl font-bold text-red-400">{stats.overdue}</div>
        </div>
      </div>

      {/* 即将到期预警 */}
      {expiring.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
          <div className="text-xs text-yellow-400 mb-2">⚠️ 即将到期（5章内）</div>
          <div className="space-y-1">
            {expiring.slice(0, 3).map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 text-xs">
                <span style={{ color: getHookColor(f.hookType) }}>{getHookIcon(f.hookType)}</span>
                <span className="flex-1 truncate text-gray-300">{f.content}</span>
                <span className="text-yellow-400">+{f.rewardScore}分</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 统一视图曲线图 */}
      <CombinedTimelineChart series={chartSeries} />

      {/* 伏笔列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-300">伏笔列表</div>
          <div className="flex gap-1">
            {(['all', 'pending', 'fulfilled', 'overdue'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-0.5 text-xs rounded ${viewMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
              >
                {mode === 'all' ? '全部' : mode === 'pending' ? '待收' : mode === 'fulfilled' ? '已收' : '逾期'}
              </button>
            ))}
          </div>
        </div>

        {filteredForeshadowings.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-4">暂无伏笔</div>
        ) : (
          <div className="space-y-2">
            {filteredForeshadowings.map((f: any) => {
              const event = timeline?.events.find((e: any) => e.id === f.sourceRef);
              const chapter = event?.chapterId ? timeline?.chapters.find((c: any) => c.id === event.chapterId) : null;
              const dueChapter = f.dueChapter ?? (maxChapter + (f.window ?? 10));
              const isOverdue = dueChapter < maxChapter && f.type !== 'resolved';
              return (
                <div
                  key={f.id}
                  className={`bg-gray-800/50 rounded-lg p-3 border-l-2 ${isOverdue ? 'border-red-500' : f.type === 'resolved' ? 'border-green-500' : 'border-yellow-500'}`}
                >
                  <div className="flex items-start gap-2">
                    <span style={{ color: getHookColor(f.hookType), fontSize: 16 }}>{getHookIcon(f.hookType)}</span>
                    <div className="flex-1">
                      <div className="text-sm text-gray-200">{f.content}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {chapter && <span>第{chapter.chapterIndex}章</span>}
                        {f.hookType && <span>{f.hookType}</span>}
                        {f.rewardScore && <span className="text-yellow-400">+{f.rewardScore}分</span>}
                        <span className={isOverdue ? 'text-red-400' : f.type === 'resolved' ? 'text-green-400' : 'text-blue-400'}>
                          {f.type === 'resolved' ? '✅已回收' : isOverdue ? '⚠️逾期' : `到期第${dueChapter}章`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// === 独立的 EventForm 组件（避免内部定义导致的重渲染问题）===
const EventForm = React.memo(({
  formData,
  storyLines,
  chapters,
  onFieldChange,
  onSubmit,
  onCancel,
  onQuickCreateChapter,
  // 伏笔相关
  foreshadowingItems,
  foreshadowingIds,
  onAddForeshadowing,
  onUpdateForeshadowing,
  onDeleteForeshadowing,
  onLinkForeshadowing
}: {
  formData: EventFormData;
  storyLines: { id: string; name: string }[];
  chapters: { id: string; chapterIndex: number; title: string; volumeId?: string }[];
  onFieldChange: (field: keyof EventFormData, value: any) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onQuickCreateChapter?: (title: string) => Promise<string | null>;
  // 伏笔相关
  foreshadowingItems?: Map<string, ForeshadowingItem>;
  foreshadowingIds?: string[];
  onAddForeshadowing?: (f: Omit<ForeshadowingItem, 'id'>) => string;
  onUpdateForeshadowing?: (id: string, updates: Partial<ForeshadowingItem>) => void;
  onDeleteForeshadowing?: (id: string) => void;
  onLinkForeshadowing?: (id: string) => void;
}) => {
  const previewTime = formatTimeDisplay({ day: formData.day, hour: formData.hour });
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateTitle, setQuickCreateTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // 伏笔编辑状态
  const [showForeshadowEditor, setShowForeshadowEditor] = useState<string | 'new' | null>(null);
  const [parentForeshadowingId, setParentForeshadowingId] = useState<string | null>(null); // 继续已有伏笔时的父ID
  const [editingForeshadow, setEditingForeshadow] = useState<{
    content: string;
    type: 'planted' | 'developed' | 'resolved';
    plannedChapter?: number;
    tags: string;
    notes: string;
    hookType: string;
    strength: string;
  }>({
    content: '',
    type: 'planted',
    plannedChapter: undefined,
    tags: '',
    notes: '',
    hookType: 'mystery',
    strength: 'medium'
  });
  const [showForeshadowSelector, setShowForeshadowSelector] = useState(false);

  // 情绪编辑器状态
  const [showEmotionEditor, setShowEmotionEditor] = useState(false);
  const [selectedEmotionType, setSelectedEmotionType] = useState<string>('好奇');
  const [selectedEmotionScore, setSelectedEmotionScore] = useState<number>(1);
  const [selectedGroup, setSelectedGroup] = useState<ReaderEmotionGroup>('追读钩子');

  // 计算情绪汇总
  const emotionTotal = (formData.emotions || []).reduce((sum: number, e: EventEmotion) => sum + e.score, 0);

  // 获取未完结的伏笔列表（用于选择关联）
  const unresolvedForeshadowing = useMemo(() => {
    if (!foreshadowingItems) return [];
    const allItems = Array.from(foreshadowingItems.values());
    // 只返回根伏笔（无 parentId），且未收尾的
    return allItems.filter(f =>
      !f.parentId &&  // 只显示根伏笔
      (f.type === 'planted' || f.type === 'developed') &&
      !foreshadowingIds?.includes(f.id)
    );
  }, [foreshadowingItems, foreshadowingIds]);

  // 开始编辑伏笔
  const handleStartEditForeshadow = (f?: ForeshadowingItem, isContinue: boolean = false) => {
    if (f) {
      if (isContinue) {
        // 继续已有伏笔：创建子伏笔，内容清空让用户填写推进描述
        setParentForeshadowingId(f.id);
        setEditingForeshadow({
          content: '',
          type: 'developed',
          plannedChapter: f.plannedChapter ?? undefined,
          tags: f.tags.join(', '),
          notes: '',
          hookType: f.hookType || 'mystery',
          strength: f.strength || 'medium'
        });
        setShowForeshadowEditor('new');
      } else {
        // 编辑现有伏笔（仅限编辑刚创建的子伏笔）
        setParentForeshadowingId(null);
        setEditingForeshadow({
          content: f.content,
          type: f.type,
          plannedChapter: f.plannedChapter ?? undefined,
          tags: f.tags.join(', '),
          notes: f.notes || '',
          hookType: f.hookType || 'mystery',
          strength: f.strength || 'medium'
        });
        setShowForeshadowEditor(f.id);
      }
    } else {
      // 新建根伏笔
      setParentForeshadowingId(null);
      setEditingForeshadow({
        content: '',
        type: 'planted',
        plannedChapter: 5,
        tags: '',
        notes: '',
        hookType: 'mystery',
        strength: 'medium'
      });
      setShowForeshadowEditor('new');
    }
  };

  const handleSaveForeshadow = () => {
    if (!editingForeshadow.content.trim()) return;

    const item: Omit<ForeshadowingItem, 'id'> & { plannedChapter?: number } = {
      content: editingForeshadow.content.trim(),
      type: editingForeshadow.type,
      tags: editingForeshadow.tags.split(',').map(t => t.trim()).filter(Boolean),
      notes: editingForeshadow.notes.trim() || undefined,
      source: 'timeline' as const,
      sourceRef: '', // 事件保存时由外部设置
      createdAt: Date.now(),
      plantedChapter: 1,
      // 钩子扩展字段（仅埋下时）
      hookType: editingForeshadow.hookType as any,
      strength: editingForeshadow.strength as any,
      plannedChapter: editingForeshadow.plannedChapter
    };

    if (showForeshadowEditor === 'new') {
      // 新建伏笔（可能是根伏笔或子伏笔）
      if (parentForeshadowingId) {
        // 有父ID，创建子伏笔
        const childItem = { ...item, parentId: parentForeshadowingId };
        onAddForeshadowing?.(childItem);
      } else {
        // 无父ID，创建根伏笔
        onAddForeshadowing?.(item);
      }
    } else if (typeof showForeshadowEditor === 'string') {
      // 更新现有伏笔
      onUpdateForeshadowing?.(showForeshadowEditor, item);
      // 如果这个伏笔还未关联到当前事件，则关联
      if (!foreshadowingIds?.includes(showForeshadowEditor)) {
        onLinkForeshadowing?.(showForeshadowEditor);
      }
    }
    // 重置状态
    setShowForeshadowEditor(null);
    setParentForeshadowingId(null);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-700">
      {/* 时间戳输入：天 + 小时 */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="text-xs text-gray-500">第几天</label>
          <input
            type="number"
            min="1"
            step="1"
            value={formData.day}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onFieldChange('day', 1);
              } else {
                const num = parseInt(val);
                if (!isNaN(num) && num >= 1) {
                  onFieldChange('day', num);
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">开始小时</label>
          <input
            type="number"
            min="0"
            max="23.5"
            step="0.5"
            value={formData.hour}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onFieldChange('hour', 0);
              } else {
                const num = parseFloat(val);
                if (!isNaN(num) && num >= 0 && num <= 23.5) {
                  onFieldChange('hour', num);
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">时间显示</label>
          <div className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-blue-300">
            {previewTime}
          </div>
        </div>
      </div>

      {/* 持续时间输入 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500">持续时长</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={formData.durationValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                onFieldChange('durationValue', 0);
              } else {
                const num = parseFloat(val);
                if (!isNaN(num) && num >= 0) {
                  onFieldChange('durationValue', num);
                }
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">单位</label>
          <select
            value={formData.durationUnit}
            onChange={(e) => onFieldChange('durationUnit', e.target.value as 'hour' | 'day')}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="hour">小时</option>
            <option value="day">天</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">说明</label>
          <div className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-400 flex items-center">
            {formData.durationValue}{formData.durationUnit === 'hour' ? '小时' : '天'}
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500">事件标题</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => onFieldChange('title', e.target.value)}
          placeholder="事件标题"
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">事件内容</label>
        <textarea
          value={formData.content}
          onChange={(e) => onFieldChange('content', e.target.value)}
          placeholder="事件详细描述..."
          rows={3}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">地点</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => onFieldChange('location', e.target.value)}
            placeholder="事件地点"
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">出场角色（逗号分隔）</label>
          <input
            type="text"
            value={formData.characters}
            onChange={(e) => onFieldChange('characters', e.target.value)}
            placeholder="角色A, 角色B"
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">
            情绪
            {formData.emotions.length > 0 && (
              <span className="ml-2 text-blue-400 font-medium">
                [{formData.emotions.length}项 汇总{emotionTotal >= 0 ? '+' : ''}{emotionTotal}]
              </span>
            )}
          </label>
          {/* 当前情绪标签 */}
          {formData.emotions.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {formData.emotions.map((e: EventEmotion, idx: number) => {
                const emoDef = EMOTION_DEF_MAP.get(e.type);
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer hover:opacity-70"
                    style={{ backgroundColor: emoDef?.bg || '#666', color: emoDef?.color || '#fff' }}
                    onClick={() => {
                      const newEmotions = formData.emotions.filter((_: EventEmotion, i: number) => i !== idx);
                      onFieldChange('emotions', newEmotions);
                    }}
                    title="点击移除"
                  >
                    {e.type}{e.score >= 0 ? '+' : ''}{e.score} ✕
                  </span>
                );
              })}
            </div>
          )}
          {/* 添加情绪 */}
          <button
            type="button"
            onClick={() => setShowEmotionEditor(!showEmotionEditor)}
            className="w-full bg-gray-700 border border-gray-600 hover:border-gray-500 rounded px-2 py-1 text-sm text-gray-400 hover:text-gray-200 text-left"
          >
            {showEmotionEditor ? '收起 ▲' : '+ 添加读者情绪'}
          </button>
          {showEmotionEditor && (
            <div className="mt-1 p-2 bg-gray-700/50 rounded border border-gray-600">
              {/* 情绪分类标签页 */}
              <div className="flex gap-1 mb-2">
                {READER_EMOTION_GROUPS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => {
                      setSelectedGroup(g.key);
                      // 自动选中该分类第一个情绪
                      const firstEmo = READER_EMOTIONS.find(e => e.group === g.key);
                      if (firstEmo) setSelectedEmotionType(firstEmo.value);
                    }}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      selectedGroup === g.key
                        ? 'ring-1 ring-white font-medium'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: g.hueColor + '22',
                      color: g.hueColor,
                    }}
                    title={g.hint}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              {/* 当前分类下的情绪按钮 */}
              <div className="flex flex-wrap gap-1 mb-2">
                {READER_EMOTIONS.filter(e => e.group === selectedGroup).map((emo) => (
                  <button
                    key={emo.value}
                    type="button"
                    onClick={() => setSelectedEmotionType(emo.value)}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                      selectedEmotionType === emo.value
                        ? 'ring-1 ring-white'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: emo.bg, color: emo.color }}
                    title={emo.readerVoice}
                  >
                    {emo.value}
                  </button>
                ))}
              </div>
              {/* 读者内心独白提示 */}
              {selectedEmotionType && (() => {
                const def = EMOTION_DEF_MAP.get(selectedEmotionType);
                return def ? (
                  <div className="text-xs text-gray-500 mb-2 italic">
                    💭 读者：「{def.readerVoice}」
                  </div>
                ) : null;
              })()}
              {/* 强度选择 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500">强度：</span>
                <div className="flex gap-1">
                  {EMOTION_SCORES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSelectedEmotionScore(s.value)}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        selectedEmotionScore === s.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newEmotions = [...formData.emotions, { type: selectedEmotionType, score: selectedEmotionScore } as EventEmotion];
                  onFieldChange('emotions', newEmotions);
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1 text-xs"
              >
                + 添加「{selectedEmotionType}{selectedEmotionScore >= 0 ? '+' : ''}{selectedEmotionScore}」
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-500">故事线</label>
          <select
            value={formData.storyLineId}
            onChange={(e) => onFieldChange('storyLineId', e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="">默认主线</option>
            {storyLines.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">所属章节（可选）</label>
        {showQuickCreate ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={quickCreateTitle}
              onChange={(e) => setQuickCreateTitle(e.target.value)}
              placeholder="输入章节标题"
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              autoFocus
              disabled={isCreating}
            />
            <button
              onClick={async () => {
                if (!quickCreateTitle.trim() || !onQuickCreateChapter) return;
                setIsCreating(true);
                const newId = await onQuickCreateChapter(quickCreateTitle.trim());
                setIsCreating(false);
                if (newId) {
                  onFieldChange('chapterId', newId);
                  setShowQuickCreate(false);
                  setQuickCreateTitle('');
                }
              }}
              disabled={!quickCreateTitle.trim() || isCreating}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded text-sm"
            >
              {isCreating ? '...' : '创建'}
            </button>
            <button
              onClick={() => {
                setShowQuickCreate(false);
                setQuickCreateTitle('');
              }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <select
            value={formData.chapterId}
            onChange={(e) => {
              if (e.target.value === '__quick_create__') {
                setShowQuickCreate(true);
              } else {
                onFieldChange('chapterId', e.target.value);
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="">未分类</option>
            {chapters.map(c => (
              <option key={c.id} value={c.id}>第{c.chapterIndex}章「{c.title}」</option>
            ))}
            <option value="__quick_create__">➕ 快速创建章节</option>
          </select>
        )}
      </div>

      {/* 伏笔编辑区域 */}
      <div className="border-t border-gray-700 pt-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-500">关联伏笔</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForeshadowSelector(!showForeshadowSelector)}
              className="text-xs text-green-400 hover:text-green-300"
            >
              📎 关联已有
            </button>
            <button
              type="button"
              onClick={() => handleStartEditForeshadow()}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + 新建伏笔
            </button>
          </div>
        </div>

        {/* 选择已有伏笔 */}
        {showForeshadowSelector && (
          <div className="mb-2 p-2 bg-gray-700/50 rounded border border-gray-600">
            <label className="text-xs text-gray-500 mb-1 block">选择已有伏笔推进或收尾</label>
            {unresolvedForeshadowing.length > 0 ? (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {unresolvedForeshadowing.map(f => {
                  const colors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
                  const labels: Record<string, string> = { planted: '🌱埋下', developed: '🌿推进', resolved: '✅收回' };
                  const durationLabels: Record<string, string> = { short_term: '短期', mid_term: '中期', long_term: '长期' };

                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 p-1.5 rounded bg-gray-800/50 hover:bg-gray-600/50 cursor-pointer border border-transparent hover:border-gray-500"
                      onClick={() => {
                        // 继续已有伏笔，创建子伏笔
                        handleStartEditForeshadow(f, true);
                        setShowForeshadowSelector(false);
                      }}
                    >
                      <span
                        className="text-xs px-1.5 py-0.5 rounded shrink-0"
                        style={{ backgroundColor: colors[f.type] + '22', color: colors[f.type] }}
                      >
                        {labels[f.type]}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {f.plannedChapter ? `第${f.plannedChapter}章` : '未设'}
                      </span>
                      <span className="flex-1 text-sm text-gray-200 truncate">
                        {f.content}
                      </span>
                      <span className="text-xs text-green-400">推进/收尾</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-500 py-2 text-center">
                暂无可关联的伏笔
              </div>
            )}
          </div>
        )}

        {/* 伏笔列表 */}
        {foreshadowingIds && foreshadowingIds.length > 0 && foreshadowingItems && (
          <div className="space-y-1 mb-2">
            {foreshadowingIds.map(fid => {
              const f = foreshadowingItems.get(fid);
              if (!f) return null;

              const colors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
              const labels: Record<string, string> = { planted: '🌱埋下', developed: '🌿推进', resolved: '✅收回' };
              const durationLabels: Record<string, string> = { short_term: '短期', mid_term: '中期', long_term: '长期' };

              return (
                <div
                  key={fid}
                  className="flex flex-col gap-1 p-2 rounded bg-gray-700/50 border border-gray-600"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: colors[f.type] + '22', color: colors[f.type] }}
                    >
                      {labels[f.type]}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {f.plannedChapter ? `第${f.plannedChapter}章` : '未设'}
                    </span>
                    <span className="flex-1 text-sm text-gray-200 truncate">
                      {f.content}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStartEditForeshadow(f)}
                      className="text-gray-500 hover:text-blue-400 p-1"
                      title="编辑"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteForeshadowing?.(fid)}
                      className="text-gray-500 hover:text-red-400 p-1"
                      title="取消关联"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {/* 子伏笔显示父伏笔上下文 */}
                  {f.parentId && (() => {
                    const parent = foreshadowingItems.get(f.parentId);
                    if (!parent) return null;
                    return (
                      <div className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 rounded px-2 py-1 ml-4">
                        <span>↳ 推进自：</span>
                        <span className="truncate">{parent.content}</span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* 伏笔编辑器 */}
        {showForeshadowEditor && (
          <div className="bg-gray-700/50 rounded p-3 space-y-2 border border-gray-600">
            {/* 父伏笔上下文（推进时显示） */}
            {parentForeshadowingId && foreshadowingItems?.get(parentForeshadowingId) && (() => {
              const parent = foreshadowingItems.get(parentForeshadowingId)!;
              const colors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
              const labels: Record<string, string> = { planted: '🌱埋下', developed: '🌿推进', resolved: '✅收回' };
              return (
                <div className="mb-2 p-2 bg-orange-500/10 rounded border border-orange-500/30">
                  <div className="text-xs text-orange-400 mb-1">正在推进的伏笔：</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: colors[parent.type] + '22', color: colors[parent.type] }}>
                      {labels[parent.type]}
                    </span>
                    <span className="text-sm text-gray-200">{parent.content}</span>
                  </div>
                </div>
              );
            })()}
            <div className="text-xs text-gray-400">
              {parentForeshadowingId ? '🌿 推进/收尾' : showForeshadowEditor === 'new' ? '🌱 新建伏笔' : '编辑伏笔'}
            </div>
            <div>
              <label className="text-xs text-gray-500">
                {parentForeshadowingId ? '推进/收尾描述' : '伏笔内容'}
              </label>
              <input
                type="text"
                value={editingForeshadow.content}
                onChange={(e) => setEditingForeshadow(prev => ({ ...prev, content: e.target.value }))}
                placeholder={parentForeshadowingId ? "描述如何推进或收尾此伏笔（30字以内）" : "简洁描述伏笔（30字以内）"}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500">状态</label>
                <select
                  value={editingForeshadow.type}
                  onChange={(e) => setEditingForeshadow(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                >
                  {parentForeshadowingId ? (
                    <>
                      <option value="developed">🌿 推进</option>
                      <option value="resolved">✅ 收回</option>
                    </>
                  ) : (
                    <>
                      <option value="planted">🌱 埋下</option>
                      <option value="developed">🌿 推进</option>
                      <option value="resolved">✅ 收回</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">计划回收章节</label>
                <input
                  type="number"
                  min="1"
                  value={editingForeshadow.plannedChapter ?? ''}
                  onChange={(e) => setEditingForeshadow(prev => ({
                    ...prev,
                    plannedChapter: e.target.value ? parseInt(e.target.value) : undefined
                  }))}
                  placeholder="章"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                  disabled={!!parentForeshadowingId}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">钩子强度</label>
                <div className="flex gap-1">
                  {HOOK_STRENGTHS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setEditingForeshadow(prev => ({ ...prev, strength: s.value }))}
                      className={`flex-1 text-xs px-1 py-1 rounded transition-colors ${
                        editingForeshadow.strength === s.value ? 'ring-1 ring-white' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: s.bg, color: s.color }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* 钩子类型选择 */}
            {!parentForeshadowingId && editingForeshadow.type === 'planted' && (
              <div>
                <label className="text-xs text-gray-500">钩子类型</label>
                <div className="flex gap-1 flex-wrap">
                  {HOOK_TYPES.map((ht) => (
                    <button
                      key={ht.value}
                      type="button"
                      onClick={() => setEditingForeshadow(prev => ({ ...prev, hookType: ht.value }))}
                      className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                        editingForeshadow.hookType === ht.value ? 'ring-1 ring-white' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: ht.color + '22', color: ht.color }}
                    >
                      {ht.icon} {ht.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">标签（逗号分隔）</label>
              <input
                type="text"
                value={editingForeshadow.tags}
                onChange={(e) => setEditingForeshadow(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="身世, 物品, 关系..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveForeshadow}
                disabled={!editingForeshadow.content.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded px-2 py-1 text-sm"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForeshadowEditor(null);
                  setParentForeshadowingId(null);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={onSubmit} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm">
          确认
        </button>
        <button onClick={onCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm">
          取消
        </button>
      </div>
    </div>
  );
});

// === Chapter Form Component ===
const ChapterForm = React.memo(({
  mode,
  formData,
  volumes,
  onFieldChange,
  onSubmit,
  onCancel,
  onQuickCreateVolume
}: {
  mode: 'add' | 'edit';
  formData: { title: string; summary: string; volumeId: string };
  volumes: { id: string; volumeIndex: number; title: string }[];
  onFieldChange: (field: string, value: any) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onQuickCreateVolume?: (title: string) => Promise<string | null>;
}) => {
  const [showQuickCreateVolume, setShowQuickCreateVolume] = useState(false);
  const [quickVolumeTitle, setQuickVolumeTitle] = useState('');
  const [isCreatingVolume, setIsCreatingVolume] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-blue-500 mb-4">
      <div>
        <label className="text-xs text-gray-500">章节标题</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => onFieldChange('title', e.target.value)}
          placeholder="第一章"
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">章节概要</label>
        <textarea
          value={formData.summary}
          onChange={(e) => onFieldChange('summary', e.target.value)}
          placeholder="章节概要..."
          rows={2}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">所属卷（可选）</label>
        {showQuickCreateVolume ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={quickVolumeTitle}
              onChange={(e) => setQuickVolumeTitle(e.target.value)}
              placeholder="输入卷标题"
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              autoFocus
              disabled={isCreatingVolume}
            />
            <button
              onClick={async () => {
                if (!quickVolumeTitle.trim() || !onQuickCreateVolume) return;
                setIsCreatingVolume(true);
                const newId = await onQuickCreateVolume(quickVolumeTitle.trim());
                setIsCreatingVolume(false);
                if (newId) {
                  onFieldChange('volumeId', newId);
                  setShowQuickCreateVolume(false);
                  setQuickVolumeTitle('');
                }
              }}
              disabled={!quickVolumeTitle.trim() || isCreatingVolume}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded text-sm"
            >
              {isCreatingVolume ? '...' : '创建'}
            </button>
            <button
              onClick={() => {
                setShowQuickCreateVolume(false);
                setQuickVolumeTitle('');
              }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <select
            value={formData.volumeId}
            onChange={(e) => {
              if (e.target.value === '__quick_create__') {
                setShowQuickCreateVolume(true);
              } else {
                onFieldChange('volumeId', e.target.value);
              }
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="">未分组</option>
            {volumes.map(v => (
              <option key={v.id} value={v.id}>第{v.volumeIndex}卷「{v.title}」</option>
            ))}
            <option value="__quick_create__">➕ 快速创建卷</option>
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onSubmit} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm">
          {mode === 'edit' ? '保存' : '确认'}
        </button>
        <button onClick={onCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm">
          取消
        </button>
      </div>
    </div>
  );
});

// === Chapter Card Component ===
const ChapterCard = React.memo(({
  chapter,
  isEditing,
  onEdit,
  onDelete
}: {
  chapter: { id: string; chapterIndex: number; title: string; summary?: string; eventIds: string[] };
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">第{chapter.chapterIndex}章</span>
          <h4 className="font-medium text-gray-200 truncate">{chapter.title}</h4>
        </div>
        {chapter.summary && (
          <p className="text-xs text-gray-400 mt-1 truncate">{chapter.summary}</p>
        )}
        <div className="text-xs text-gray-500 mt-1">
          {chapter.eventIds.length} 个事件
        </div>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onEdit}
          className="p-1 text-gray-500 hover:text-blue-400"
          title="编辑"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-500 hover:text-red-400"
          title="删除"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
});

// === Event Card Component (memoized for performance) ===
interface EventCardProps {
  event: TimelineEvent;
  storyLineColor: string;
  storyLineName?: string;
  chapterInfo?: { chapterIndex: number; title: string } | null;
  showChapterInfo?: boolean;
  foreshadowingItems?: Map<string, ForeshadowingItem>;
  onEdit: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  // Drag props
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart: (e: React.DragEvent, eventId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, eventId: string) => void;
  onDrop: (e: React.DragEvent, targetEventId: string) => void;
}

const EventCard = React.memo(({ event, storyLineColor, storyLineName, chapterInfo, showChapterInfo, foreshadowingItems, onEdit, onDelete, isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop }: EventCardProps) => {
  const handleEdit = useCallback(() => onEdit(event.id), [event.id, onEdit]);
  const handleDelete = useCallback(() => onDelete(event.id), [event.id, onDelete]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    onDragStart(e, event.id);
  }, [event.id, onDragStart]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    onDragOver(e, event.id);
  }, [event.id, onDragOver]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    onDrop(e, event.id);
  }, [event.id, onDrop]);

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 border ${
        isDragOver ? 'border-blue-500 border-2 bg-blue-900/20' : 'border-gray-700'
      } ${isDragging ? 'opacity-50' : ''} transition-colors cursor-default`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2 flex-1">
          {/* Drag Handle */}
          <div
            className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing pt-0.5"
            title="拖动排序"
          >
            <GripVertical size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500">#{event.eventIndex}</span>
              {event.timestamp && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded">
                  {formatTimeRangeDisplay(event.timestamp, event.duration)}
                </span>
              )}
              {storyLineName && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: storyLineColor + '30', color: storyLineColor }}>
                  {storyLineName}
                </span>
              )}
            </div>
            <h5 className="font-medium text-gray-200">{event.title}</h5>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleEdit}
            className="text-gray-500 hover:text-blue-400"
            title="编辑"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="text-gray-500 hover:text-red-400"
            title="删除"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showChapterInfo && chapterInfo && (
        <div className="text-xs text-gray-500 mb-2 ml-6">
          所属章节：第{chapterInfo.chapterIndex}章「{chapterInfo.title}」
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-gray-400 ml-6">
        {event.location && <span>📍 {event.location}</span>}
        {event.characters && event.characters.length > 0 && <span>👥 {event.characters.join(', ')}</span>}
        {event.emotion && <span>💫 {event.emotion}</span>}
        {/* 情绪数组标签 */}
        {event.emotions && event.emotions.length > 0 && (
          <span className="flex gap-1">
            {event.emotions.map((e: any, idx: number) => {
              const emoDef = EMOTION_DEF_MAP.get(e.type);
              return (
                <span
                  key={idx}
                  className="text-xs px-1 py-0.5 rounded"
                  style={{ backgroundColor: emoDef?.bg || '#666', color: emoDef?.color || '#fff' }}
                >
                  {e.type}{e.score >= 0 ? '+' : ''}{e.score}
                </span>
              );
            })}
            {event.emotions.length > 0 && (
              <span className="text-blue-400 font-medium ml-1">
                [{event.emotions.reduce((s: number, e: any) => s + e.score, 0) >= 0 ? '+' : ''}{event.emotions.reduce((s: number, e: any) => s + e.score, 0)}]
              </span>
            )}
          </span>
        )}
      </div>

      {event.content && (
        <p className="text-sm text-gray-300 mt-2 ml-6">{event.content}</p>
      )}

      {/* 伏笔显示 */}
      {event.foreshadowingIds && event.foreshadowingIds.length > 0 && foreshadowingItems && (
        <div className="flex flex-col gap-1 mt-2 ml-6">
          {event.foreshadowingIds.map(fid => {
            const f = foreshadowingItems.get(fid);
            if (!f || !f.content) return null;
            const colors: Record<string, string> = { planted: '#ce9178', developed: '#dcdcaa', resolved: '#4ec9b0' };
            const labels: Record<string, string> = { planted: '🌱埋', developed: '🌿进', resolved: '✅收' };
            const displayContent = f.content.length > 15 ? f.content.substring(0, 15) + '...' : f.content;
            const hookDef = f.hookType ? HOOK_TYPES.find(t => t.value === f.hookType) : null;
            const strengthDef = f.strength ? HOOK_STRENGTHS.find(t => t.value === f.strength) : null;
            return (
              <div key={fid} className="flex flex-col">
                <span
                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-help w-fit"
                  style={{ backgroundColor: colors[f.type] + '22', color: colors[f.type] }}
                  title={`${f.content}${f.hookType ? ` | ${hookDef?.label || f.hookType}` : ''}${f.strength ? ` | ${strengthDef?.label || f.strength}` : ''}${f.plannedChapter ? ` | 第${f.plannedChapter}章收` : ''}${f.rewardScore ? ` | +${f.rewardScore}分` : ''}`}
                >
                  {labels[f.type]} {displayContent}
                  {hookDef && <span className="opacity-70">{hookDef.icon}</span>}
                  {f.rewardScore && <span className="opacity-70">+{f.rewardScore}</span>}
                </span>
                {/* 子伏笔时显示父伏笔上下文 */}
                {f.parentId && (() => {
                  const parent = foreshadowingItems.get(f.parentId);
                  if (!parent) return null;
                  return (
                    <span className="text-xs text-orange-400 ml-2 mt-0.5">
                      ↳ 推进自：{parent.content.length > 12 ? parent.content.substring(0, 12) + '...' : parent.content}
                    </span>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// === Volume Section Component ===
const VolumeSection = React.memo(({
  volume,
  chapters,
  editingChapterId,
  editingVolumeId,
  newVolume,
  onEditChapter,
  onDeleteChapter,
  onEditVolume,
  onSaveVolume,
  onCancelVolume,
  onDeleteVolume,
  newChapter,
  onChapterFieldChange,
  onSaveChapter,
  onCancelChapter,
  onQuickCreateVolume,
  volumes
}: {
  volume: { id: string; volumeIndex: number; title: string; description?: string };
  chapters: Array<{ id: string; chapterIndex: number; title: string; summary?: string; eventIds: string[]; volumeId?: string }>;
  editingChapterId: string | null;
  editingVolumeId: string | null;
  newVolume: { volumeIndex: number; title: string; description: string };
  onEditChapter: (chapter: any) => void;
  onDeleteChapter: (id: string) => void;
  onEditVolume: (volume: any) => void;
  onSaveVolume: () => void;
  onCancelVolume: () => void;
  onDeleteVolume: (id: string) => void;
  newChapter: { title: string; summary: string; volumeId: string };
  onChapterFieldChange: (field: string, value: any) => void;
  onSaveChapter: () => void;
  onCancelChapter: () => void;
  onQuickCreateVolume?: (title: string) => Promise<string | null>;
  volumes: { id: string; volumeIndex: number; title: string }[];
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const totalEvents = chapters.reduce((sum, ch) => sum + ch.eventIds.length, 0);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Volume Header */}
      {editingVolumeId === volume.id ? (
        <div className="bg-gray-800 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">卷序号</label>
              <input
                type="number"
                min="1"
                value={newVolume.volumeIndex}
                onChange={(e) => onEditVolume({ ...volume, volumeIndex: parseInt(e.target.value) || 1 })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">卷标题</label>
              <input
                type="text"
                value={newVolume.title}
                onChange={(e) => onEditVolume({ ...volume, title: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">卷描述</label>
            <input
              type="text"
              value={newVolume.description}
              onChange={(e) => onEditVolume({ ...volume, description: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveVolume} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1 text-sm">保存</button>
            <button onClick={onCancelVolume} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1 text-sm">取消</button>
          </div>
        </div>
      ) : (
        <div
          className="bg-gray-800/80 p-3 flex items-center justify-between cursor-pointer hover:bg-gray-800"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
            <span className="text-xs text-gray-500">第{volume.volumeIndex}卷</span>
            <h3 className="font-medium text-gray-200">{volume.title}</h3>
            <span className="text-xs text-gray-500">({chapters.length}章 / {totalEvents}事件)</span>
          </div>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEditVolume(volume)}
              className="p-1 text-gray-500 hover:text-blue-400"
              title="编辑卷"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDeleteVolume(volume.id)}
              className="p-1 text-gray-500 hover:text-red-400"
              title="删除卷"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Chapters in Volume */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-gray-900/50">
          {chapters.map(chapter => (
            editingChapterId === chapter.id ? (
              <ChapterForm
                key={chapter.id}
                mode="edit"
                formData={newChapter}
                volumes={volumes}
                onFieldChange={onChapterFieldChange}
                onSubmit={onSaveChapter}
                onCancel={onCancelChapter}
                onQuickCreateVolume={onQuickCreateVolume}
              />
            ) : (
              <ChapterCard
                key={chapter.id}
                chapter={chapter}
                isEditing={false}
                onEdit={() => onEditChapter(chapter)}
                onDelete={() => onDeleteChapter(chapter.id)}
              />
            )
          ))}
          {chapters.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-4">暂无章节</div>
          )}
        </div>
      )}
    </div>
  );
});

const OutlineViewer: React.FC<OutlineViewerProps> = ({ isOpen, onClose }) => {
  // 视图状态
  const [timelineLevel, setTimelineLevel] = useState<TimelineLevel>('events');
  const [eventGroupMode, setEventGroupMode] = useState<EventGroupMode>('day');

  // 折叠状态（使用 Set 存储已折叠的组 key）
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // 创建表单状态
  const [showAddVolume, setShowAddVolume] = useState(false);
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [showAddChapter, setShowAddChapter] = useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState<boolean>(false);
  const [newVolume, setNewVolume] = useState({ volumeIndex: 1, title: '', description: '' });
  const [newChapter, setNewChapter] = useState({ title: '', summary: '', volumeId: '' });

  // Event form states
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventForeshadowingIds, setEditingEventForeshadowingIds] = useState<string[]>([]);
  const [newEvent, setNewEvent] = useState({
    day: 1,
    hour: 8,
    durationValue: 1,
    durationUnit: 'hour' as 'hour' | 'day',
    title: '',
    content: '',
    location: '',
    characters: '',
    emotion: '',
    emotions: [] as EventEmotion[],
    storyLineId: '',
    chapterId: ''
  });

  // Store - 使用 worldTimelineStore 作为唯一数据源
  const timeline = useWorldTimelineStore((state: WorldTimelineState) => state.timeline);
  const isLoading = useWorldTimelineStore((state: WorldTimelineState) => state.isLoading);
  const loadTimeline = useWorldTimelineStore((state: WorldTimelineState) => state.loadTimeline);
  const addEvent = useWorldTimelineStore((state: WorldTimelineState) => state.addEvent);
  const updateEvent = useWorldTimelineStore((state: WorldTimelineState) => state.updateEvent);
  const deleteEvent = useWorldTimelineStore((state: WorldTimelineState) => state.deleteEvent);
  const addChapter = useWorldTimelineStore((state: WorldTimelineState) => state.addChapter);
  const updateChapter = useWorldTimelineStore((state: WorldTimelineState) => state.updateChapter);
  const addVolume = useWorldTimelineStore((state: WorldTimelineState) => state.addVolume);
  const updateVolume = useWorldTimelineStore((state: WorldTimelineState) => state.updateVolume);
  const deleteVolume = useWorldTimelineStore((state: WorldTimelineState) => state.deleteVolume);
  const deleteChapter = useWorldTimelineStore((state: WorldTimelineState) => state.deleteChapter);
  const getEvents = useWorldTimelineStore((state: WorldTimelineState) => state.getEvents);
  const getChapters = useWorldTimelineStore((state: WorldTimelineState) => state.getChapters);
  const getVolumes = useWorldTimelineStore((state: WorldTimelineState) => state.getVolumes);
  const getStoryLines = useWorldTimelineStore((state: WorldTimelineState) => state.getStoryLines);
  const getTimeRange = useWorldTimelineStore((state: WorldTimelineState) => state.getTimeRange);
  const addChaptersToVolume = useWorldTimelineStore((state: WorldTimelineState) => state.addChaptersToVolume);
  const moveEvent = useWorldTimelineStore((state: WorldTimelineState) => state.moveEvent);
  const currentProjectId = useProjectStore((state: ProjectState) => state.currentProjectId);

  // 伏笔数据 - 从 chapterAnalysisStore 获取
  const foreshadowingList = useChapterAnalysisStore((state: ChapterAnalysisState) => state.data.foreshadowing);
  const addForeshadowingToStore = useChapterAnalysisStore((state: ChapterAnalysisState) => state.addForeshadowing);
  const updateForeshadowingInStore = useChapterAnalysisStore((state: ChapterAnalysisState) => state.updateForeshadowing);
  const deleteForeshadowingFromStore = useChapterAnalysisStore((state: ChapterAnalysisState) => state.deleteForeshadowing);
  const foreshadowingMap = useMemo<Map<string, ForeshadowingItem>>(() =>
    new Map(foreshadowingList.map((f: ForeshadowingItem) => [f.id, f])),
    [foreshadowingList]
  );

  // 伏笔操作 handlers
  const handleAddForeshadowing = useCallback((item: Omit<ForeshadowingItem, 'id'>) => {
    const id = addForeshadowingToStore({ ...item, source: 'timeline', sourceRef: editingEventId || '' });
    setEditingEventForeshadowingIds(prev => [...prev, id]);
    return id;
  }, [addForeshadowingToStore, editingEventId]);

  const handleUpdateForeshadowing = useCallback((id: string, updates: Partial<ForeshadowingItem>) => {
    updateForeshadowingInStore(id, updates);
  }, [updateForeshadowingInStore]);

  const handleDeleteForeshadowing = useCallback((id: string) => {
    deleteForeshadowingFromStore(id);
    setEditingEventForeshadowingIds(prev => prev.filter(fid => fid !== id));
  }, [deleteForeshadowingFromStore]);

  // 关联已有伏笔到当前事件
  const handleLinkForeshadowing = useCallback((id: string) => {
    setEditingEventForeshadowingIds(prev => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }, []);

  // Drag state
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverEventId, setDragOverEventId] = useState<string | null>(null);

  // 缓存数据，避免每次渲染返回新数组
  // 使用具体的数组引用作为依赖，避免整个 timeline 对象变化触发重新计算
  const cachedChapters = useMemo(() => {
    return timeline?.chapters ? getChapters() : [];
  }, [timeline?.chapters]);

  const cachedVolumes = useMemo(() => {
    return timeline?.volumes ? getVolumes() : [];
  }, [timeline?.volumes]);

  const cachedStoryLines = useMemo(() => {
    return timeline?.storyLines ? getStoryLines() : [];
  }, [timeline?.storyLines]);

  // 加载时间线数据
  useEffect(() => {
    if (isOpen && currentProjectId && !timeline) {
      loadTimeline(currentProjectId);
    }
  }, [isOpen, currentProjectId, timeline, loadTimeline]);

  if (!isOpen) return null;

  // === Timeline Handlers ===

  const handleAddTimelineEvent = async () => {
    if (!newEvent.title.trim()) return;
    if (!timeline && currentProjectId) {
      await loadTimeline(currentProjectId);
    }
    if (!timeline) return;

    addEvent({
      timestamp: {
        day: newEvent.day,
        hour: newEvent.hour
      },
      duration: {
        value: newEvent.durationValue,
        unit: newEvent.durationUnit
      },
      title: newEvent.title.trim(),
      content: newEvent.content.trim(),
      location: newEvent.location.trim(),
      characters: newEvent.characters.split(',').map(c => c.trim()).filter(Boolean),
      emotion: newEvent.emotion.trim(),
      emotions: newEvent.emotions.length > 0 ? newEvent.emotions as any : undefined,
      storyLineId: newEvent.storyLineId || '',
      chapterId: newEvent.chapterId || undefined
    });
    // 重置表单，保持时间设置
    setNewEvent({
      day: newEvent.day,
      hour: newEvent.hour + 1 > 23 ? 8 : newEvent.hour + 1,
      durationValue: newEvent.durationValue,
      durationUnit: newEvent.durationUnit,
      title: '',
      content: '',
      location: '',
      characters: '',
      emotion: '',
      emotions: [],
      storyLineId: '',
      chapterId: ''
    });
    setShowAddEvent(false);
  };

  const handleDeleteTimelineEvent = useCallback((eventId: string) => {
    deleteEvent(eventId);
  }, [deleteEvent]);

  const handleStartEditEvent = useCallback((event: TimelineEvent) => {
    setEditingEventId(event.id);
    setNewEvent({
      day: event.timestamp?.day || 1,
      hour: event.timestamp?.hour || 8,
      durationValue: event.duration?.value || 1,
      durationUnit: event.duration?.unit || 'hour',
      title: event.title,
      content: event.content,
      location: event.location || '',
      characters: event.characters?.join(', ') || '',
      emotion: event.emotion || '',
      emotions: (event.emotions as EventEmotion[]) || [],
      storyLineId: event.storyLineId || '',
      chapterId: event.chapterId || ''
    });
    // 加载该事件关联的伏笔ID
    setEditingEventForeshadowingIds(event.foreshadowingIds || []);
    setShowAddEvent(false);
  }, []);

  // 稳定的编辑回调 - 供 EventCard 使用
  const handleEventEdit = useCallback((eventId: string) => {
    const events = getEvents();
    const event = events.find((e: TimelineEvent) => e.id === eventId);
    if (!event) return;
    handleStartEditEvent(event);
  }, [getEvents, handleStartEditEvent]);

  const handleSaveEditEvent = () => {
    if (!editingEventId || !newEvent.title.trim()) return;
    updateEvent(editingEventId, {
      timestamp: {
        day: newEvent.day,
        hour: newEvent.hour
      },
      duration: {
        value: newEvent.durationValue,
        unit: newEvent.durationUnit
      },
      title: newEvent.title.trim(),
      content: newEvent.content.trim(),
      location: newEvent.location.trim() || undefined,
      characters: newEvent.characters ? newEvent.characters.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      emotion: newEvent.emotion.trim() || undefined,
      emotions: newEvent.emotions.length > 0 ? newEvent.emotions as any : undefined,
      storyLineId: newEvent.storyLineId || '',
      chapterId: newEvent.chapterId || undefined,
      foreshadowingIds: editingEventForeshadowingIds.length > 0 ? editingEventForeshadowingIds : undefined
    });
    setEditingEventId(null);
    setEditingEventForeshadowingIds([]);
    setNewEvent({
      day: 1,
      hour: 8,
      durationValue: 1,
      durationUnit: 'hour',
      title: '',
      content: '',
      location: '',
      characters: '',
      emotion: '',
      emotions: [] as EventEmotion[],
      storyLineId: '',
      chapterId: ''
    });
  };

  const handleCancelEditEvent = () => {
    setEditingEventId(null);
    setEditingEventForeshadowingIds([]);
    setNewEvent({
      day: 1,
      hour: 8,
      durationValue: 1,
      durationUnit: 'hour',
      title: '',
      content: '',
      location: '',
      characters: '',
      emotion: '',
      emotions: [] as EventEmotion[],
      storyLineId: '',
      chapterId: ''
    });
  };

  // === Drag Handlers ===
  const handleDragStart = useCallback((e: React.DragEvent, eventId: string) => {
    setDraggedEventId(eventId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedEventId(null);
    setDragOverEventId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, eventId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (eventId !== dragOverEventId) {
      setDragOverEventId(eventId);
    }
  }, [dragOverEventId]);

  const handleDrop = useCallback((e: React.DragEvent, targetEventId: string) => {
    e.preventDefault();
    if (!draggedEventId || draggedEventId === targetEventId) {
      setDraggedEventId(null);
      setDragOverEventId(null);
      return;
    }

    // 获取目标事件的位置
    const events = getEvents();
    const targetEvent = events.find((ev: TimelineEvent) => ev.id === targetEventId);
    if (targetEvent) {
      moveEvent(draggedEventId, targetEvent.timestamp);
    }

    setDraggedEventId(null);
    setDragOverEventId(null);
  }, [draggedEventId, getEvents, moveEvent]);

  const handleAddTimelineChapter = () => {
    if (!newChapter.title.trim()) {
      console.warn('[OutlineViewer] 章节标题不能为空');
      return;
    }

    const result = addChapter({
      title: newChapter.title.trim(),
      summary: newChapter.summary.trim(),
      volumeId: newChapter.volumeId || undefined
    });

    // 解析返回结果
    try {
      const parsed = JSON.parse(result);
      if (parsed.existing) {
        console.log('[OutlineViewer] 章节序号已存在，已自动关联');
      }
    } catch {
      // 忽略解析错误
    }

    setNewChapter({ title: '', summary: '', volumeId: '' });
    setShowAddChapter(null);
  };

  // 开始编辑章节
  const handleStartEditChapter = useCallback((chapter: { id: string; chapterIndex: number; title: string; summary?: string; volumeId?: string }) => {
    setEditingChapterId(chapter.id);
    setNewChapter({
      title: chapter.title,
      summary: chapter.summary || '',
      volumeId: chapter.volumeId || ''
    });
    setShowAddChapter(null);
  }, []);

  // 保存编辑的章节
  const handleSaveEditChapter = () => {
    if (!editingChapterId || !newChapter.title.trim()) return;
    updateChapter(editingChapterId, {
      title: newChapter.title.trim(),
      summary: newChapter.summary.trim(),
      volumeId: newChapter.volumeId || undefined
    });
    setEditingChapterId(null);
    setNewChapter({ title: '', summary: '', volumeId: '' });
  };

  // 取消编辑章节
  const handleCancelEditChapter = () => {
    setEditingChapterId(null);
    setNewChapter({ title: '', summary: '', volumeId: '' });
  };

  // 快速创建卷（从章节表单调用）
  const handleQuickCreateVolume = useCallback(async (title: string): Promise<string | null> => {
    if (!title.trim()) return null;

    const existingVolumes = getVolumes();
    const maxIndex = existingVolumes.reduce((max: number, v: VolumeGroup) => Math.max(max, v.volumeIndex), 0);
    const nextIndex = maxIndex + 1;

    const result = addVolume({
      volumeIndex: nextIndex,
      title: title.trim(),
      description: ''
    });

    try {
      const parsed = JSON.parse(result);
      return parsed.id || null;
    } catch {
      return null;
    }
  }, [getVolumes, addVolume]);

  // 快速创建章节（从事件表单调用）
  const handleQuickCreateChapter = useCallback(async (title: string): Promise<string | null> => {
    if (!title.trim()) return null;

    // 自动计算下一个章节序号
    const result = addChapter({
      title: title.trim(),
      summary: ''
    });

    // addChapter 返回 JSON 字符串，需要解析
    try {
      const parsed = JSON.parse(result);
      return parsed.id || null;
    } catch {
      return null;
    }
  }, [getChapters, addChapter]);

  const handleAddTimelineVolume = () => {
    if (!newVolume.title.trim()) return;
    addVolume({
      volumeIndex: newVolume.volumeIndex,
      title: newVolume.title.trim(),
      description: newVolume.description.trim()
    });
    setNewVolume({ volumeIndex: newVolume.volumeIndex + 1, title: '', description: '' });
    setShowAddVolume(false);
  };

  // 事件表单字段变更处理（用 useCallback 缓存）
  const handleEventFieldChange = useCallback((field: keyof EventFormData, value: any) => {
    setNewEvent(prev => ({ ...prev, [field]: value }));
  }, []);

  // === Performance: Map lookups for O(1) access ===
  const storyLineMap = useMemo(() =>
    new Map<string, StoryLine>(cachedStoryLines.map((s: StoryLine) => [s.id, s])),
    [cachedStoryLines]
  );

  const chapterMap = useMemo(() =>
    new Map<string, ChapterGroup>(cachedChapters.map((c: ChapterGroup) => [c.id, c])),
    [cachedChapters]
  );

  // === Performance: Memoize event list to avoid re-sorting on every render ===
  const cachedEvents = useMemo(() => getEvents(), [timeline?.events]);

  // === Performance: Memoize chapters and volumes ===
  const cachedChaptersList = useMemo(() => getChapters(), [timeline?.chapters]);
  const cachedVolumesList = useMemo(() => getVolumes(), [timeline?.volumes]);

  // === Performance: Memoize chaptersByVolume grouping ===
  const chaptersByVolume = useMemo(() => {
    const map = new Map<string | undefined, ChapterGroup[]>();
    cachedChaptersList.forEach((ch: ChapterGroup) => {
      const vid = ch.volumeId || undefined;
      if (!map.has(vid)) map.set(vid, []);
      map.get(vid)!.push(ch);
    });
    return map;
  }, [cachedChaptersList]);

  // === Event Grouping Logic ===
  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // 按天或章节分组事件
  const groupedEvents = useMemo(() => {
    if (eventGroupMode === 'none') {
      return null;
    }

    const groups = new Map<string, {
      key: string;
      label: string;
      events: TimelineEvent[];
      extraInfo?: string;
    }>();

    cachedEvents.forEach((event: TimelineEvent) => {
      let key: string;
      let label: string;

      if (eventGroupMode === 'day') {
        const day = event.timestamp?.day || 1;
        key = `day-${day}`;
        label = `第 ${day} 天`;
      } else {
        // 按章节分组
        const chapter = event.chapterId ? chapterMap.get(event.chapterId) : null;
        if (chapter) {
          key = `chapter-${chapter.chapterIndex}`;
          label = `第${chapter.chapterIndex}章「${chapter.title}」`;
        } else {
          key = 'chapter-ungrouped';
          label = '未分类事件';
        }
      }

      if (!groups.has(key)) {
        groups.set(key, { key, label, events: [] });
      }
      groups.get(key)!.events.push(event);
    });

    // 计算额外信息并按key排序
    return Array.from(groups.values())
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map(group => {
        if (eventGroupMode === 'day') {
          // 按天分组：显示包含的章节
          const chapterSet = new Set<string>();
          group.events.forEach(event => {
            if (event.chapterId) {
              const chapter = chapterMap.get(event.chapterId);
              if (chapter) {
                chapterSet.add(`第${chapter.chapterIndex}章`);
              }
            }
          });
          const chapters = Array.from(chapterSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          return {
            ...group,
            extraInfo: chapters.length > 0 ? `包含：${chapters.join('、')}` : undefined
          };
        } else {
          // 按章节分组：显示时间跨度
          const timestamps = group.events
            .filter(e => e.timestamp && typeof e.timestamp.day === 'number')
            .map(e => (e.timestamp.day - 1) * 24 + e.timestamp.hour);
          if (timestamps.length > 0) {
            const minHours = Math.min(...timestamps);
            const maxHours = Math.max(...timestamps);
            const startDay = Math.floor(minHours / 24) + 1;
            const startHour = minHours % 24;
            const endDay = Math.floor(maxHours / 24) + 1;
            const endHour = maxHours % 24;

            const formatTime = (day: number, hour: number) => {
              const h = Math.floor(hour);
              const m = Math.round((hour - h) * 60);
              return m > 0 ? `第${day}天${h}:${m.toString().padStart(2, '0')}` : `第${day}天${h}:00`;
            };

            if (startDay === endDay && startHour === endHour) {
              return { ...group, extraInfo: `时间：${formatTime(startDay, startHour)}` };
            } else {
              return { ...group, extraInfo: `时间：${formatTime(startDay, startHour)} ~ ${formatTime(endDay, endHour)}` };
            }
          }
          return group;
        }
      });
  }, [cachedEvents, eventGroupMode, chapterMap]);

  // === Render ===
  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Clock size={20} className="text-blue-400" />
          <span className="font-semibold text-lg">时间线</span>
          {timeline && (
            <span className="text-sm text-gray-400">({getTimeRange() || '暂无时间'})</span>
          )}
        </div>

        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-gray-500">加载时间线...</span>
          </div>
        ) : !timeline ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Clock size={32} className="mb-2 opacity-50" />
            <p>时间线未初始化</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Timeline Level Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setTimelineLevel('events')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineLevel === 'events' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  事件
                </button>
                <button
                  onClick={() => setTimelineLevel('chapters')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineLevel === 'chapters' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  章节
                </button>
                <button
                  onClick={() => setTimelineLevel('foreshadowing')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineLevel === 'foreshadowing' ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  伏笔追踪
                </button>
              </div>

              {/* === Events Level === */}
              {timelineLevel === 'events' && (
                <>
                  {/* Group Mode Selector */}
                  <div className="flex gap-1 mb-3 text-xs">
                    <span className="text-gray-500 py-1">分组：</span>
                    <button
                      onClick={() => setEventGroupMode('none')}
                      className={`px-2 py-1 rounded ${
                        eventGroupMode === 'none' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      无
                    </button>
                    <button
                      onClick={() => setEventGroupMode('day')}
                      className={`px-2 py-1 rounded ${
                        eventGroupMode === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      按天
                    </button>
                    <button
                      onClick={() => setEventGroupMode('chapter')}
                      className={`px-2 py-1 rounded ${
                        eventGroupMode === 'chapter' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      按章节
                    </button>
                    {eventGroupMode !== 'none' && groupedEvents && (
                      <button
                        onClick={() => {
                          if (collapsedGroups.size === groupedEvents.length) {
                            // 全部折叠 -> 全部展开
                            setCollapsedGroups(new Set());
                          } else {
                            // 部分折叠 -> 全部折叠
                            setCollapsedGroups(new Set(groupedEvents.map(g => g.key)));
                          }
                        }}
                        className="px-2 py-1 rounded bg-gray-700 text-gray-400 hover:text-gray-200 ml-2"
                      >
                        {collapsedGroups.size === groupedEvents.length ? '全部展开' : '全部折叠'}
                      </button>
                    )}
                  </div>

                  {/* Add Event Button */}
              {!showAddEvent && (
                <button
                  onClick={() => setShowAddEvent(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors"
                >
                  <Plus size={16} />
                  <span>添加事件</span>
                </button>
              )}

              {showAddEvent && (
                <EventForm
                  key={`event-form-${foreshadowingList.length}`}
                  formData={newEvent}
                  storyLines={cachedStoryLines}
                  chapters={cachedChapters}
                  onFieldChange={handleEventFieldChange}
                  onSubmit={handleAddTimelineEvent}
                  onCancel={() => {
                    setShowAddEvent(false);
                    setEditingEventForeshadowingIds([]);
                  }}
                  onQuickCreateChapter={handleQuickCreateChapter}
                  foreshadowingItems={foreshadowingMap}
                  foreshadowingIds={editingEventForeshadowingIds}
                  onAddForeshadowing={handleAddForeshadowing}
                  onUpdateForeshadowing={handleUpdateForeshadowing}
                  onDeleteForeshadowing={handleDeleteForeshadowing}
                  onLinkForeshadowing={handleLinkForeshadowing}
                />
              )}

              {/* Events */}
              {(() => {
                if (cachedEvents.length === 0 && !showAddEvent) {
                  return (
                    <div className="text-gray-500 text-sm text-center py-8">
                      暂无事件，请添加事件或使用 Agent 生成时间线
                    </div>
                  );
                }

                // 渲染单个事件的辅助函数
                const renderEvent = (event: TimelineEvent) => {
                  const storyLine = storyLineMap.get(event.storyLineId);
                  const chapter = event.chapterId ? chapterMap.get(event.chapterId) : null;

                  return (
                    <div key={event.id} className="relative pl-10 pb-4 last:pb-0">
                      {/* Timeline Dot */}
                      <div
                        className="absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-gray-900"
                        style={{ backgroundColor: storyLine?.color || '#4A90D9' }}
                      />

                      {/* Event Card or Edit Form */}
                      {editingEventId === event.id ? (
                        <div className="bg-gray-800 rounded-lg p-4 border border-blue-500">
                          <EventForm
                            key={`event-form-${foreshadowingList.length}`}
                            formData={newEvent}
                            storyLines={cachedStoryLines}
                            chapters={cachedChapters}
                            onFieldChange={handleEventFieldChange}
                            onSubmit={handleSaveEditEvent}
                            onCancel={handleCancelEditEvent}
                            onQuickCreateChapter={handleQuickCreateChapter}
                            foreshadowingItems={foreshadowingMap}
                            foreshadowingIds={editingEventForeshadowingIds}
                            onAddForeshadowing={handleAddForeshadowing}
                            onUpdateForeshadowing={handleUpdateForeshadowing}
                            onDeleteForeshadowing={handleDeleteForeshadowing}
                            onLinkForeshadowing={handleLinkForeshadowing}
                          />
                        </div>
                      ) : (
                        <EventCard
                          event={event}
                          storyLineColor={storyLine?.color || '#4A90D9'}
                          storyLineName={storyLine?.name}
                          chapterInfo={chapter ? { chapterIndex: chapter.chapterIndex, title: chapter.title } : null}
                          showChapterInfo
                          foreshadowingItems={foreshadowingMap}
                          onEdit={handleEventEdit}
                          onDelete={handleDeleteTimelineEvent}
                          isDragging={draggedEventId === event.id}
                          isDragOver={dragOverEventId === event.id && draggedEventId !== event.id}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                        />
                      )}
                    </div>
                  );
                };

                // 分组模式
                if (eventGroupMode !== 'none' && groupedEvents) {
                  return (
                    <div className="space-y-2">
                      {/* Event Count */}
                      <div className="text-sm text-gray-500 mb-2">
                        共 {cachedEvents.length} 个事件，{groupedEvents.length} 个分组
                      </div>

                      {groupedEvents.map(group => {
                        const isCollapsed = collapsedGroups.has(group.key);
                        return (
                          <div key={group.key} className="border border-gray-700 rounded-lg overflow-hidden">
                            {/* Group Header */}
                            <div
                              className="bg-gray-800/80 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-800"
                              onClick={() => toggleGroupCollapse(group.key)}
                            >
                              <div className="flex items-center gap-2">
                                {isCollapsed ? (
                                  <ChevronRight size={14} className="text-gray-500" />
                                ) : (
                                  <ChevronDown size={14} className="text-gray-500" />
                                )}
                                <span className="font-medium text-gray-200">{group.label}</span>
                                <span className="text-xs text-gray-500">({group.events.length} 个事件)</span>
                                {group.extraInfo && (
                                  <span className="text-xs text-blue-400">{group.extraInfo}</span>
                                )}
                              </div>
                            </div>

                            {/* Group Content */}
                            {!isCollapsed && (
                              <div className="relative p-2 bg-gray-900/50">
                                <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-gray-700" />
                                {group.events.map(renderEvent)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // 无分组模式
                return (
                  <div className="relative">
                    {/* Timeline Line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />

                    {/* Event Count */}
                    <div className="mb-4 ml-10 text-sm text-gray-500">
                      共 {cachedEvents.length} 个事件
                    </div>

                    {/* Events - using optimized EventCard with Map lookups */}
                    {cachedEvents.map(renderEvent)}
                  </div>
                );
              })()}
                </>
              )}

              {/* === Chapters Level === */}
              {timelineLevel === 'chapters' && (
                <>
                  {/* Add Chapter Button */}
                  {!showAddChapter && !editingChapterId && (
                    <button
                      onClick={() => setShowAddChapter('new')}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors mb-4"
                    >
                      <Plus size={16} />
                      <span>添加章节</span>
                    </button>
                  )}

                  {/* Add/Edit Chapter Form */}
                  {(showAddChapter || editingChapterId) && (
                    <ChapterForm
                      mode={editingChapterId ? 'edit' : 'add'}
                      formData={newChapter}
                      volumes={cachedVolumes}
                      onFieldChange={(field, value) => setNewChapter(prev => ({ ...prev, [field]: value }))}
                      onSubmit={editingChapterId ? handleSaveEditChapter : handleAddTimelineChapter}
                      onCancel={editingChapterId ? handleCancelEditChapter : () => setShowAddChapter(null)}
                      onQuickCreateVolume={handleQuickCreateVolume}
                    />
                  )}

                  {/* Chapters grouped by Volume */}
                  {(() => {
                    if (cachedChaptersList.length === 0 && cachedVolumesList.length === 0) {
                      return (
                        <div className="text-gray-500 text-sm text-center py-8">
                          暂无章节，点击上方按钮添加
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {/* 有卷分组的章节 */}
                        {cachedVolumesList.map((volume: VolumeGroup) => {
                          const volumeChapters = chaptersByVolume.get(volume.id) || [];
                          return (
                            <VolumeSection
                              key={volume.id}
                              volume={volume}
                              chapters={volumeChapters}
                              editingChapterId={editingChapterId}
                              editingVolumeId={editingVolumeId}
                              newVolume={newVolume}
                              onEditChapter={handleStartEditChapter}
                              onDeleteChapter={deleteChapter}
                              onEditVolume={(v) => {
                                setEditingVolumeId(v.id);
                                setNewVolume({ volumeIndex: v.volumeIndex, title: v.title, description: v.description || '' });
                              }}
                              onSaveVolume={() => {
                                if (!editingVolumeId) return;
                                updateVolume(editingVolumeId, {
                                  volumeIndex: newVolume.volumeIndex,
                                  title: newVolume.title.trim(),
                                  description: newVolume.description.trim()
                                });
                                setEditingVolumeId(null);
                                setNewVolume({ volumeIndex: 1, title: '', description: '' });
                              }}
                              onCancelVolume={() => {
                                setEditingVolumeId(null);
                                setNewVolume({ volumeIndex: 1, title: '', description: '' });
                              }}
                              onDeleteVolume={deleteVolume}
                              newChapter={newChapter}
                              onChapterFieldChange={(field, value) => setNewChapter(prev => ({ ...prev, [field]: value }))}
                              onSaveChapter={handleSaveEditChapter}
                              onCancelChapter={handleCancelEditChapter}
                              onQuickCreateVolume={handleQuickCreateVolume}
                              volumes={cachedVolumesList}
                            />
                          );
                        })}

                        {/* 未分组的章节 */}
                        {(() => {
                          const ungrouped = chaptersByVolume.get(undefined) || [];
                          if (ungrouped.length === 0) return null;
                          return (
                            <div className="space-y-2">
                              <div className="text-sm text-gray-400 px-2">未分组章节</div>
                              {ungrouped.map(chapter => (
                                <ChapterCard
                                  key={chapter.id}
                                  chapter={chapter}
                                  isEditing={editingChapterId === chapter.id}
                                  onEdit={() => handleStartEditChapter(chapter)}
                                  onDelete={() => deleteChapter(chapter.id)}
                                />
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* === Foreshadowing Level === */}
              {timelineLevel === 'foreshadowing' && (
                <ForeshadowingTrackerView />
              )}
            </div>
          )
        }
      </div>
    </div>
  );
};

export default OutlineViewer;
