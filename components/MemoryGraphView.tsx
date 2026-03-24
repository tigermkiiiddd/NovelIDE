/**
 * @file MemoryGraphView.tsx
 * @description 记忆图谱可视化组件
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useLongTermMemoryStore } from '../stores/longTermMemoryStore';
import { LongTermMemory, MemoryEdge, MemoryType, MemoryMetadataStats } from '../types';
import { getMetadataStats } from '../utils/memoryGraph';

// 节点颜色映射
const TYPE_COLORS: Record<MemoryType, string> = {
  setting: '#3b82f6',     // 蓝色
  style: '#8b5cf6',        // 紫色
  restriction: '#ef4444',  // 红色
  experience: '#10b981',   // 绿色
  world_rule: '#f59e0b',   // 橙色
};

// 重要度颜色映射
const IMPORTANCE_COLORS = {
  critical: '#dc2626',
  important: '#f97316',
  normal: '#6b7280',
};

interface GraphNode {
  id: string;
  label: string;
  type: MemoryType;
  importance: string;
  x: number;
  y: number;
  isResident: boolean;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

interface Props {
  onSelectMemory?: (memory: LongTermMemory) => void;
  className?: string;
}

/**
 * 简单的力导向布局算法
 */
const calculateLayout = (
  memories: LongTermMemory[],
  edges: MemoryEdge[],
  width: number,
  height: number
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const nodeCount = memories.length;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4;

  const nodes: GraphNode[] = memories.map((memory, index) => {
    // 圆形布局
    const angle = (2 * Math.PI * index) / nodeCount;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    return {
      id: memory.id,
      label: memory.name.length > 12 ? memory.name.slice(0, 12) + '...' : memory.name,
      type: memory.type,
      importance: memory.importance,
      x,
      y,
      isResident: memory.isResident,
    };
  });

  const graphEdges: GraphEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: edge.type,
  }));

  return { nodes, edges: graphEdges };
};

/**
 * 节点组件
 */
const NodeComponent: React.FC<{
  node: GraphNode;
  isSelected: boolean;
  onClick: () => void;
}> = ({ node, isSelected, onClick }) => {
  const color = TYPE_COLORS[node.type] || '#6b7280';
  const borderColor = isSelected ? '#fff' : IMPORTANCE_COLORS[node.importance as keyof typeof IMPORTANCE_COLORS] || '#6b7280';

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* 节点圆形 */}
      <circle
        r={node.isResident ? 28 : 24}
        fill={color}
        stroke={borderColor}
        strokeWidth={isSelected ? 3 : 2}
        opacity={0.9}
      />
      {/* 常驻标记 */}
      {node.isResident && (
        <circle r={32} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="4,2" />
      )}
      {/* 节点标签 */}
      <text
        textAnchor="middle"
        y={4}
        fill="#fff"
        fontSize={10}
        fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {node.label}
      </text>
    </g>
  );
};

/**
 * 边组件
 */
const EdgeComponent: React.FC<{
  edge: GraphEdge;
  nodes: GraphNode[];
}> = ({ edge, nodes }) => {
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);

  if (!sourceNode || !targetNode) return null;

  const edgeColors: Record<string, string> = {
    extends: '#3b82f6',
    refines: '#8b5cf6',
    conflicts: '#ef4444',
    relates_to: '#6b7280',
  };

  const color = edgeColors[edge.type] || '#6b7280';

  return (
    <line
      x1={sourceNode.x}
      y1={sourceNode.y}
      x2={targetNode.x}
      y2={targetNode.y}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={edge.type === 'relates_to' ? '4,4' : undefined}
      opacity={0.6}
      markerEnd="url(#arrowhead)"
    />
  );
};

/**
 * 图例组件
 */
const Legend: React.FC = () => (
  <div className="absolute bottom-4 left-4 bg-gray-800 rounded-lg p-3 text-xs text-gray-300">
    <div className="font-bold mb-2">记忆类型</div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {Object.entries(TYPE_COLORS).map(([type, color]) => (
        <div key={type} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span>{type}</span>
        </div>
      ))}
    </div>
    <div className="mt-2 pt-2 border-t border-gray-700">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full border-2 border-dashed border-yellow-400" />
        <span>常驻记忆</span>
      </div>
    </div>
  </div>
);

/**
 * 统计面板组件
 */
const StatsPanel: React.FC<{ stats: MemoryMetadataStats }> = ({ stats }) => (
  <div className="absolute top-4 right-4 bg-gray-800 rounded-lg p-3 text-xs text-gray-300 w-48">
    <div className="font-bold mb-2">统计信息</div>
    <div className="space-y-1">
      <div className="flex justify-between">
        <span>记忆总数</span>
        <span>{stats.types.reduce((sum, t) => sum + t.count, 0)}</span>
      </div>
      <div className="flex justify-between">
        <span>类型数</span>
        <span>{stats.types.length}</span>
      </div>
      <div className="flex justify-between">
        <span>关键字数</span>
        <span>{stats.keywords.length}</span>
      </div>
      <div className="flex justify-between">
        <span>标签数</span>
        <span>{stats.tags.length}</span>
      </div>
    </div>
  </div>
);

/**
 * 主组件
 */
export const MemoryGraphView: React.FC<Props> = ({ onSelectMemory, className = '' }) => {
  const { memories, edges } = useLongTermMemoryStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all');

  // 过滤记忆
  const filteredMemories = useMemo(() => {
    if (filterType === 'all') return memories;
    return memories.filter((m) => m.type === filterType);
  }, [memories, filterType]);

  // 过滤边（只保留两端节点都在过滤结果中的边）
  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredMemories.map((m) => m.id));
    return edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  }, [edges, filteredMemories]);

  // 计算布局
  const layout = useMemo(() => {
    return calculateLayout(filteredMemories, filteredEdges, 800, 600);
  }, [filteredMemories, filteredEdges]);

  // 统计数据
  const stats = useMemo(() => getMetadataStats(memories), [memories]);

  // 点击节点
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedId(node.id);
      const memory = memories.find((m) => m.id === node.id);
      if (memory && onSelectMemory) {
        onSelectMemory(memory);
      }
    },
    [memories, onSelectMemory]
  );

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* 过滤器 */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as MemoryType | 'all')}
          className="bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm border border-gray-700"
        >
          <option value="all">全部类型</option>
          {Object.keys(TYPE_COLORS).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* SVG 画布 */}
      <svg width="100%" height="100%" viewBox="0 0 800 600">
        {/* 箭头标记定义 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
          </marker>
        </defs>

        {/* 边 */}
        {layout.edges.map((edge) => (
          <EdgeComponent key={edge.id} edge={edge} nodes={layout.nodes} />
        ))}

        {/* 节点 */}
        {layout.nodes.map((node) => (
          <NodeComponent
            key={node.id}
            node={node}
            isSelected={selectedId === node.id}
            onClick={() => handleNodeClick(node)}
          />
        ))}
      </svg>

      {/* 图例 */}
      <Legend />

      {/* 统计面板 */}
      <StatsPanel stats={stats} />

      {/* 空状态 */}
      {filteredMemories.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">🧠</div>
            <div>暂无记忆数据</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryGraphView;
