/**
 * @file MemoryGraphView.tsx
 * @description 知识图谱可视化组件 - SVG 节点 + 边连线
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useLongTermMemoryStore } from '../stores/longTermMemoryStore';
import { LongTermMemory, MemoryEdge, MemoryType, MemoryEdgeType } from '../types';

// 类型颜色
const TYPE_COLORS: Record<MemoryType, { fill: string; stroke: string; text: string }> = {
  setting:     { fill: '#1e3a5f', stroke: '#3b82f6', text: '#93c5fd' },
  style:       { fill: '#3b1f5f', stroke: '#a855f7', text: '#d8b4fe' },
  restriction: { fill: '#5f1f1f', stroke: '#ef4444', text: '#fca5a5' },
  experience:  { fill: '#1f4f3f', stroke: '#22c55e', text: '#86efac' },
  world_rule:  { fill: '#4f2f1f', stroke: '#f97316', text: '#fdba74' },
};

// 边类型样式
const EDGE_STYLES: Record<MemoryEdgeType, { color: string; label: string; dashArray: string }> = {
  extends:     { color: '#3b82f6', label: '扩展', dashArray: '' },
  refines:     { color: '#22c55e', label: '细化', dashArray: '5,5' },
  conflicts:   { color: '#ef4444', label: '冲突', dashArray: '10,5' },
  relates_to:  { color: '#6b7280', label: '关联', dashArray: '3,3' },
};

// 类型标签
const TYPE_LABELS: Record<MemoryType, string> = {
  setting: '设定',
  style: '风格',
  restriction: '限制',
  experience: '经验',
  world_rule: '世界观',
};

interface Props {
  onSelectMemory?: (memory: LongTermMemory) => void;
  className?: string;
}

// 简单力导向布局
const calculateLayout = (
  memories: LongTermMemory[],
  edges: MemoryEdge[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> => {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeCount = memories.length;

  if (nodeCount === 0) return positions;

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;

  // 初始位置：圆形布局
  memories.forEach((memory, i) => {
    const angle = (i / nodeCount) * 2 * Math.PI - Math.PI / 2;
    positions.set(memory.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  });

  // 简化的力导向迭代
  const iterations = 50;
  const edgeMap = new Map<string, string[]>();

  edges.forEach(edge => {
    if (!edgeMap.has(edge.from)) edgeMap.set(edge.from, []);
    if (!edgeMap.has(edge.to)) edgeMap.set(edge.to, []);
    edgeMap.get(edge.from)!.push(edge.to);
    edgeMap.get(edge.to)!.push(edge.from);
  });

  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();

    memories.forEach(m => forces.set(m.id, { fx: 0, fy: 0 }));

    // 节点间斥力
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const p1 = positions.get(memories[i].id)!;
        const p2 = positions.get(memories[j].id)!;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 5000 / (dist * dist);

        const f1 = forces.get(memories[i].id)!;
        const f2 = forces.get(memories[j].id)!;

        f1.fx -= (dx / dist) * force;
        f1.fy -= (dy / dist) * force;
        f2.fx += (dx / dist) * force;
        f2.fy += (dy / dist) * force;
      }
    }

    // 边的引力
    edges.forEach(edge => {
      const p1 = positions.get(edge.from);
      const p2 = positions.get(edge.to);
      if (!p1 || !p2) return;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * 0.05;

      const f1 = forces.get(edge.from);
      const f2 = forces.get(edge.to);

      if (f1) { f1.fx += (dx / dist) * force; f1.fy += (dy / dist) * force; }
      if (f2) { f2.fx -= (dx / dist) * force; f2.fy -= (dy / dist) * force; }
    });

    // 应用力
    const cooling = 1 - iter / iterations;
    const padding = 50;

    memories.forEach(memory => {
      const pos = positions.get(memory.id)!;
      const f = forces.get(memory.id)!;

      pos.x += f.fx * cooling * 0.1;
      pos.y += f.fy * cooling * 0.1;

      // 边界约束
      pos.x = Math.max(padding, Math.min(width - padding, pos.x));
      pos.y = Math.max(padding, Math.min(height - padding, pos.y));
    });
  }

  return positions;
};

/**
 * 详情面板
 */
const DetailPanel: React.FC<{
  memory: LongTermMemory;
  edges: MemoryEdge[];
  allMemories: LongTermMemory[];
  onClose: () => void;
  onNavigate: (memory: LongTermMemory) => void;
}> = ({ memory, edges, allMemories, onClose, onNavigate }) => {
  const relatedEdges = edges.filter(e => e.from === memory.id || e.to === memory.id);
  const colors = TYPE_COLORS[memory.type];

  return (
    <div className="absolute top-4 right-4 w-80 bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-xl z-10 max-h-[calc(100%-2rem)] overflow-y-auto">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-medium text-white">{memory.name}</h3>
          <span style={{ color: colors.text }} className="text-xs">
            {TYPE_LABELS[memory.type]}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
          ×
        </button>
      </div>

      {memory.summary && (
        <p className="text-gray-300 text-sm mb-3">{memory.summary}</p>
      )}

      {memory.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {memory.keywords.map((kw, i) => (
            <span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
              {kw}
            </span>
          ))}
        </div>
      )}

      {memory.content && (
        <div className="mb-3">
          <h4 className="text-gray-400 text-xs mb-1">完整内容</h4>
          <p className="text-gray-200 text-sm whitespace-pre-wrap bg-gray-900 rounded p-2">
            {memory.content}
          </p>
        </div>
      )}

      {relatedEdges.length > 0 && (
        <div className="border-t border-gray-700 pt-3">
          <h4 className="text-gray-400 text-xs mb-2">关联 ({relatedEdges.length}条)</h4>
          <div className="space-y-2">
            {relatedEdges.map(edge => {
              const isFrom = edge.from === memory.id;
              const relatedId = isFrom ? edge.to : edge.from;
              const related = allMemories.find(m => m.id === relatedId);
              if (!related) return null;

              const style = EDGE_STYLES[edge.type];

              return (
                <div
                  key={edge.id}
                  onClick={() => onNavigate(related)}
                  className="flex items-center gap-2 p-2 bg-gray-700/50 rounded cursor-pointer hover:bg-gray-700"
                >
                  <span className="text-xs" style={{ color: style.color }}>●</span>
                  <span className="text-xs text-gray-400">{style.label}</span>
                  <span className="text-sm text-gray-200 truncate flex-1">{related.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 主组件
 */
export const MemoryGraphView: React.FC<Props> = ({ onSelectMemory, className = '' }) => {
  const store = useLongTermMemoryStore();
  const memories = Array.isArray(store.memories) ? store.memories : [];
  const rawEdges = store.edges;
  const edges: MemoryEdge[] = Array.isArray(rawEdges) ? rawEdges : [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all');

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // 计算容器尺寸
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 800,
          height: containerRef.current.clientHeight || 600,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // 过滤
  const filteredMemories = useMemo(() => {
    if (filterType === 'all') return memories;
    return memories.filter(m => m.type === filterType);
  }, [memories, filterType]);

  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredMemories.map(m => m.id));
    return edges.filter(e => ids.has(e.from) && ids.has(e.to));
  }, [edges, filteredMemories]);

  // 计算布局
  const nodePositions = useMemo(
    () => calculateLayout(filteredMemories, filteredEdges, dimensions.width, dimensions.height),
    [filteredMemories, filteredEdges, dimensions]
  );

  // 选中的记忆
  const selectedMemory = useMemo(
    () => memories.find(m => m.id === selectedId) || null,
    [memories, selectedId]
  );

  // 高亮相关的边
  const highlightedEdges = useMemo(() => {
    if (!selectedId) return new Set<string>();
    return new Set(
      filteredEdges
        .filter(e => e.from === selectedId || e.to === selectedId)
        .map(e => e.id)
    );
  }, [filteredEdges, selectedId]);

  const handleNodeClick = useCallback((memory: LongTermMemory) => {
    setSelectedId(prev => prev === memory.id ? null : memory.id);
    onSelectMemory?.(memory);
  }, [onSelectMemory]);

  const handleNavigate = useCallback((memory: LongTermMemory) => {
    setSelectedId(memory.id);
  }, []);

  // 统计
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    memories.forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + 1;
    });
    return { total: memories.length, edges: edges.length, byType };
  }, [memories, edges]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {memories.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">🧠</div>
            <div>暂无记忆数据</div>
          </div>
        </div>
      ) : (
        <>
          <svg
            width={dimensions.width}
            height={dimensions.height}
            className="bg-gray-900"
          >
            {/* 箭头定义 */}
            <defs>
              {Object.entries(EDGE_STYLES).map(([key, style]) => (
                <marker
                  key={key}
                  id={`arrow-${key}`}
                  viewBox="0 0 10 10"
                  refX="30"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={style.color} />
                </marker>
              ))}
            </defs>

            {/* 绘制边 */}
            <g className="edges">
              {filteredEdges.map(edge => {
                const from = nodePositions.get(edge.from);
                const to = nodePositions.get(edge.to);
                if (!from || !to) return null;

                const style = EDGE_STYLES[edge.type];
                const isHighlighted = highlightedEdges.has(edge.id);

                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={style.color}
                    strokeWidth={isHighlighted ? 3 : 2}
                    strokeDasharray={style.dashArray}
                    opacity={isHighlighted ? 1 : 0.5}
                    markerEnd={`url(#arrow-${edge.type})`}
                    className="transition-all duration-200"
                  />
                );
              })}
            </g>

            {/* 绘制节点 */}
            <g className="nodes">
              {filteredMemories.map(memory => {
                const pos = nodePositions.get(memory.id);
                if (!pos) return null;

                const colors = TYPE_COLORS[memory.type];
                const isSelected = selectedId === memory.id;

                return (
                  <g
                    key={memory.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={() => handleNodeClick(memory)}
                    className="cursor-pointer"
                    style={{ userSelect: 'none' }}
                  >
                    {/* 节点圆 */}
                    <circle
                      r={isSelected ? 32 : 26}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 3 : 2}
                      className="transition-all duration-200"
                    />

                    {/* 节点名称 */}
                    <text
                      textAnchor="middle"
                      y={4}
                      fill="#fff"
                      fontSize="11"
                      fontWeight="500"
                      className="pointer-events-none"
                    >
                      {memory.name.length > 5 ? memory.name.slice(0, 4) + '…' : memory.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* 左上角统计 */}
          <div className="absolute top-4 left-4 bg-gray-800 border border-gray-700 rounded-lg p-3 z-10">
            <div className="text-sm text-gray-300">
              <span className="text-gray-400">节点:</span> {filteredMemories.length}
              <span className="mx-2">|</span>
              <span className="text-gray-400">边:</span> {filteredEdges.length}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(stats.byType).map(([type, count]) => (
                <span
                  key={type}
                  style={{ color: TYPE_COLORS[type as MemoryType]?.text }}
                  className="text-xs"
                >
                  {TYPE_LABELS[type as MemoryType]}: {count}
                </span>
              ))}
            </div>
          </div>

          {/* 左下角筛选 */}
          <div className="absolute bottom-4 left-4 bg-gray-800 border border-gray-700 rounded-lg p-3 z-10">
            <div className="text-xs text-gray-400 mb-2">筛选类型</div>
            <div className="flex gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2 py-1 rounded text-xs ${
                  filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                }`}
              >
                全部
              </button>
              {(Object.keys(TYPE_LABELS) as MemoryType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2 py-1 rounded text-xs ${
                    filterType === type ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="text-xs text-gray-400 mt-3 mb-1">边类型图例</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(EDGE_STYLES).map(([key, style]) => (
                <div key={key} className="flex items-center gap-1">
                  <div
                    className="w-4 h-0.5"
                    style={{
                      backgroundColor: style.color,
                      borderStyle: style.dashArray ? 'dashed' : 'solid'
                    }}
                  />
                  <span className="text-xs text-gray-400">{style.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 详情面板 */}
          {selectedMemory && (
            <DetailPanel
              memory={selectedMemory}
              edges={edges}
              allMemories={memories}
              onClose={() => setSelectedId(null)}
              onNavigate={handleNavigate}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MemoryGraphView;
