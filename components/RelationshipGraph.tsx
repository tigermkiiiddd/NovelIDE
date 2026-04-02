import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useRelationshipStore, RelationshipState } from '../stores/relationshipStore';
import { CharacterRelation, PRESET_RELATION_TYPES, RelationType } from '../types';
import { Search, X, Filter, Maximize2, RotateCcw } from 'lucide-react';

// ============================================
// 关系类型颜色映射
// ============================================

const RELATION_COLOR_MAP: Record<string, string> = {
  '朋友': '#60a5fa',
  '敌人': '#ef4444',
  '恋人': '#f472b6',
  '夫妻': '#e879f9',
  '师徒': '#fbbf24',
  '同门': '#34d399',
  '亲属': '#a78bfa',
  '盟友': '#22d3ee',
  '对手': '#f97316',
  '上下级': '#8b5cf6',
  '暗恋': '#fb7185',
  '仇人': '#dc2626',
  '同窗': '#2dd4bf',
  '邻居': '#a3e635',
  '合作者': '#38bdf8',
  '陌生人': '#6b7280',
};

const DEFAULT_COLOR = '#94a3b8';

const getRelationColor = (type: string) => RELATION_COLOR_MAP[type] || DEFAULT_COLOR;

const STRENGTH_WIDTH: Record<string, number> = { '强': 3, '中': 2, '弱': 1 };
const STRENGTH_PARTICLES: Record<string, number> = { '强': 4, '中': 2, '弱': 0 };

// ============================================
// Props
// ============================================

interface RelationshipGraphProps {
  focusCharacter?: string;
  height?: number;
  onNodeDoubleClick?: (name: string) => void;
}

interface GraphNode {
  id: string;
  name: string;
  val?: number;
  isHighlight?: boolean;
  isFocus?: boolean;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relation: CharacterRelation;
  curvature?: number;
}

// Wrapper to bypass ForceGraph2D strict type checking
const GraphRenderer: React.FC<any> = (props) => {
  // @ts-ignore
  return <ForceGraph2D {...props} />;
};

// ============================================
// Tooltip
// ============================================

const Tooltip: React.FC<{
  x: number;
  y: number;
  relation: CharacterRelation;
  onClose: () => void;
}> = ({ x, y, relation, onClose }) => {
  const dir = relation.isBidirectional ? '⇄' : '→';
  const color = getRelationColor(relation.type);

  return (
    <div
      style={{
        position: 'absolute',
        left: x + 12,
        top: y - 8,
        background: 'rgba(15, 23, 42, 0.95)',
        border: `1px solid ${color}60`,
        borderRadius: 12,
        padding: '12px 16px',
        minWidth: 200,
        maxWidth: 320,
        boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 12px ${color}20`,
        zIndex: 100,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {relation.type}
          <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>
            ({relation.strength})
          </span>
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
        {relation.from} {dir} {relation.to}
      </div>
      {relation.description && (
        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, marginTop: 6 }}>
          {relation.description}
        </div>
      )}
      {relation.chapterRef && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
          来源: {relation.chapterRef}
        </div>
      )}
    </div>
  );
};

// ============================================
// 主组件
// ============================================

export const RelationshipGraph: React.FC<RelationshipGraphProps> = ({
  focusCharacter,
  height = 500,
  onNodeDoubleClick,
}) => {
  const relations = useRelationshipStore((s: RelationshipState) => s.relations);
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [highlightNode, setHighlightNode] = useState<string | null>(focusCharacter || null);
  const [selectedLink, setSelectedLink] = useState<{ relation: CharacterRelation; x: number; y: number } | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);

  // 监听容器宽度
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // 所有可用关系类型
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    relations.forEach(r => types.add(r.type));
    return [...types].sort();
  }, [relations]);

  // 筛选后的关系
  const filteredRelations = useMemo(() => {
    let result = relations;
    if (filterTypes.size > 0) {
      result = result.filter(r => filterTypes.has(r.type));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(r =>
        r.from.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [relations, filterTypes, searchQuery]);

  // 构建图数据
  const graphData = useMemo(() => {
    const nameSet = new Set<string>();
    filteredRelations.forEach(r => {
      nameSet.add(r.from);
      nameSet.add(r.to);
    });

    // 计算节点关系数作为 val
    const nameCount: Record<string, number> = {};
    filteredRelations.forEach(r => {
      nameCount[r.from] = (nameCount[r.from] || 0) + 1;
      nameCount[r.to] = (nameCount[r.to] || 0) + 1;
    });

    const nodes: GraphNode[] = [...nameSet].map(name => ({
      id: name,
      name,
      val: nameCount[name] || 1,
      isFocus: name === focusCharacter,
    }));

    // 同一对节点多条关系时，分配不同曲率
    const pairCount: Record<string, number> = {};
    const pairIndex: Record<string, number> = {};

    const links: GraphLink[] = filteredRelations.map(r => {
      const pairKey = [r.from, r.to].sort().join('||');
      pairCount[pairKey] = (pairCount[pairKey] || 0) + 1;
      const idx = pairCount[pairKey] - 1;
      pairIndex[pairKey] = idx;

      const totalForPair = pairCount[pairKey];
      // 如果后续发现同对有更多关系，curvature 会在下一轮修正
      // 这里先简单分配
      const curvature = totalForPair <= 1 ? 0 : 0.2 * (idx + 1);

      return {
        source: r.from,
        target: r.to,
        relation: r,
        curvature,
      };
    });

    // 修正曲率：如果同对有多条，第一轮 count 可能不准
    const finalLinks = links.map(link => {
      const pairKey = [link.relation.from, link.relation.to].sort().join('||');
      const total = pairCount[pairKey];
      if (total <= 1) {
        link.curvature = 0;
      } else {
        // 重新分配
        const idx = pairIndex[pairKey];
        link.curvature = 0.15 * ((idx % 2 === 0 ? 1 : -1) * Math.ceil((idx + 1) / 2));
      }
      return link;
    });

    return { nodes, links: finalLinks };
  }, [filteredRelations, focusCharacter]);

  // 高亮邻居
  const highlightNodes = useMemo(() => {
    if (!highlightNode) return new Set<string>();
    const neighbors = new Set<string>();
    neighbors.add(highlightNode);
    filteredRelations.forEach(r => {
      if (r.from === highlightNode) neighbors.add(r.to);
      if (r.to === highlightNode) neighbors.add(r.from);
    });
    return neighbors;
  }, [highlightNode, filteredRelations]);

  const handleNodeHover = useCallback((node: any) => {
    setHighlightNode(node?.id || focusCharacter || null);
  }, [focusCharacter]);

  const handleNodeClick = useCallback((node: any) => {
    setHighlightNode(node.id);
  }, []);

  const handleLinkClick = useCallback((link: any, event: MouseEvent) => {
    setSelectedLink({
      relation: link.relation,
      x: event.offsetX,
      y: event.offsetY,
    });
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedLink(null);
    setHighlightNode(focusCharacter || null);
  }, [focusCharacter]);

  // 自定义节点绘制
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isHighlight = highlightNodes.size > 0 && highlightNodes.has(node.id);
    const isDimmed = highlightNodes.size > 0 && !highlightNodes.has(node.id);
    const isFocus = node.id === focusCharacter;

    const baseRadius = Math.max(8, 4 + (node.val || 1) * 1.5);
    const radius = isHighlight ? baseRadius * 1.3 : baseRadius;
    const alpha = isDimmed ? 0.2 : 1;

    // 光晕
    if (isFocus || isHighlight) {
      const glowColor = isFocus ? 'rgba(56, 189, 248, 0.3)' : 'rgba(148, 163, 184, 0.2)';
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * 2.2, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, radius * 2.2);
      gradient.addColorStop(0, glowColor);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // 节点圆
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    const nodeColor = isFocus ? '#38bdf8' : isHighlight ? '#e2e8f0' : '#94a3b8';
    ctx.fillStyle = isDimmed
      ? `rgba(100, 116, 139, ${alpha})`
      : nodeColor;
    ctx.globalAlpha = alpha;
    ctx.fill();

    // 边框
    ctx.strokeStyle = isFocus ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = isFocus ? 2 : 1;
    ctx.stroke();

    // 名称标签
    const fontSize = Math.max(10, 12 / globalScale);
    ctx.font = `${isFocus || isHighlight ? 600 : 400} ${fontSize}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isDimmed ? `rgba(148, 163, 184, ${alpha})` : '#f8fafc';
    ctx.fillText(node.name, node.x, node.y + radius + 4);

    ctx.globalAlpha = 1;
  }, [highlightNodes, focusCharacter]);

  // 自定义连线绘制
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isHighlight = highlightNodes.size > 0 &&
      highlightNodes.has(typeof link.source === 'object' ? link.source.id : link.source) &&
      highlightNodes.has(typeof link.target === 'object' ? link.target.id : link.target);
    const isDimmed = highlightNodes.size > 0 && !isHighlight;

    const relation: CharacterRelation = link.relation;
    const color = getRelationColor(relation.type);
    const width = STRENGTH_WIDTH[relation.strength] || 2;
    const alpha = isDimmed ? 0.08 : isHighlight ? 1 : 0.5;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = isHighlight ? width * 1.5 : width;

    // 曲线绘制
    const src = typeof link.source === 'object' ? link.source : { x: 0, y: 0 };
    const tgt = typeof link.target === 'object' ? link.target : { x: 0, y: 0 };

    const curv = link.curvature || 0;
    if (curv === 0) {
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
    } else {
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const cpX = midX + (-dy / len) * curv * len * 0.5;
      const cpY = midY + (dx / len) * curv * len * 0.5;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.quadraticCurveTo(cpX, cpY, tgt.x, tgt.y);
      ctx.stroke();

      // 关系标签（仅在高亮或缩放足够时显示）
      if (isHighlight || globalScale > 0.8) {
        const fontSize = Math.max(8, 10 / globalScale);
        ctx.font = `${fontSize}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = color;
        ctx.globalAlpha = isDimmed ? 0.1 : 0.8;
        ctx.fillText(relation.type, cpX, cpY - 4);
      }
    }

    ctx.globalAlpha = 1;
  }, [highlightNodes]);

  const handleEngineStop = useCallback(() => {
    if (focusCharacter && fgRef.current) {
      fgRef.current.centerAt(0, 0, 800);
    }
  }, [focusCharacter]);

  const resetView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 60);
      setTimeout(() => fgRef.current.zoomToFit(400, 60), 200);
    }
  }, []);

  // 类型筛选切换
  const toggleFilter = useCallback((type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(10,15,25,0.98) 100%)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        height,
      }}
    >
      {/* 工具栏 */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          zIndex: 20,
        }}
      >
        {/* 搜索框 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            flex: 1,
            maxWidth: 260,
          }}
        >
          <Search size={14} style={{ color: '#64748b', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索角色或关系..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: 13,
              width: '100%',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 筛选按钮 */}
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 10,
            background: filterTypes.size > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.85)',
            border: filterTypes.size > 0 ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
            color: filterTypes.size > 0 ? '#bae6fd' : '#94a3b8',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <Filter size={14} />
          {filterTypes.size > 0 ? `${filterTypes.size}` : '筛选'}
        </button>

        {/* 重置视图 */}
        <button
          onClick={resetView}
          title="重置视图"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* 筛选面板 */}
      {showFilterPanel && (
        <div
          style={{
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
          }}
        >
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

      {/* 图谱 */}
      <GraphRenderer
        ref={fgRef as any}
        graphData={graphData}
        nodeId="id"
        nodeLabel="name"
        width={containerWidth}
        height={height}
        backgroundColor="transparent"
        linkCurvature="curvature"
        linkColor={() => 'transparent'}
        linkLineDash={null}
        linkDirectionalParticles={(link: any) => STRENGTH_PARTICLES[link.relation?.strength] || 0}
        linkDirectionalParticleWidth={2.5}
        linkDirectionalParticleColor={(link: any) => getRelationColor(link.relation?.type)}
        linkDirectionalParticleSpeed={0.004}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onNodeDragEnd={(node: any) => { node.fx = node.x; node.fy = node.y; }}
        onNodeDoubleClick={(node: any) => onNodeDoubleClick?.(node.id)}
        onLinkClick={handleLinkClick as any}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={handleEngineStop}
        nodeCanvasObject={paintNode as any}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={paintLink as any}
        linkCanvasObjectMode={() => 'replace'}
        cooldownTicks={300}
        warmupTicks={50}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        minZoom={0.3}
        maxZoom={5}
      />

      {/* Tooltip */}
      {selectedLink && (
        <Tooltip
          x={selectedLink.x}
          y={selectedLink.y}
          relation={selectedLink.relation}
          onClose={() => setSelectedLink(null)}
        />
      )}

      {/* 空状态 */}
      {filteredRelations.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: '#64748b',
            fontSize: 14,
          }}
        >
          {relations.length === 0
            ? '暂无角色关系数据'
            : '没有匹配的关系'}
        </div>
      )}

      {/* 统计角标 */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          padding: '4px 10px',
          borderRadius: 8,
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          color: '#64748b',
          fontSize: 11,
          zIndex: 10,
        }}
      >
        {graphData.nodes.length} 角色 · {filteredRelations.length} 关系
      </div>
    </div>
  );
};
