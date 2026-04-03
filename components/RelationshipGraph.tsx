import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCenter, forceCollide, forceManyBody, forceRadial } from 'd3-force-3d';
import { useRelationshipStore, RelationshipState } from '../stores/relationshipStore';
import { CharacterRelation } from '../types';
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

const getNodeRadius = (node: Pick<GraphNode, 'val'>) => Math.max(16, 11 + (node.val || 1) * 2.4);

const getPairKey = (from: string, to: string) => [from, to].sort().join('||');

const getLinkIdentity = (relation: CharacterRelation) =>
  `${relation.from}=>${relation.to}=>${relation.type}=>${relation.description || ''}`;

const getCurveControlPoint = (
  src: { x: number; y: number },
  tgt: { x: number; y: number },
  curvature: number,
) => {
  const midX = (src.x + tgt.x) / 2;
  const midY = (src.y + tgt.y) / 2;
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  return {
    x: midX + (-dy / len) * curvature * len * 0.5,
    y: midY + (dx / len) * curvature * len * 0.5,
    len,
  };
};

const getQuadraticPoint = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) => {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
};

const getQuadraticTangent = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) => ({
  x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
  y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
});

const getCurvatureSpread = (count: number, index: number) => {
  if (count <= 1) return 0;
  const center = (count - 1) / 2;
  const distanceFromCenter = index - center;
  const step = count <= 3 ? 0.42 : 0.3;

  return distanceFromCenter * step;
};

// ============================================
// Props
// ============================================

interface RelationshipGraphProps {
  focusCharacter?: string;
  height?: number;
  onNodeDoubleClick?: (name: string) => void;
  onNodeClick?: (name: string) => void;
  onLinkClick?: (link: GraphLink, event: MouseEvent) => void;
  onLinkHover?: (link: GraphLink | null) => void;
  onBackgroundDoubleClick?: (x: number, y: number) => void;
}

interface GraphNode {
  id: string;
  name: string;
  val?: number;
  isHighlight?: boolean;
  isFocus?: boolean;
}

export interface GraphLink {
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
  onNodeClick,
  onLinkClick,
  onLinkHover,
  onBackgroundDoubleClick,
}) => {
  const relations = useRelationshipStore((s: RelationshipState) => s.relations);
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedNode, setSelectedNode] = useState<string | null>(focusCharacter || null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<CharacterRelation | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    setSelectedNode(focusCharacter || null);
    setHoveredNode(null);
  }, [focusCharacter]);

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

    // 同一对节点多条关系时，给每条边稳定分配不同曲率
    const pairGroups = new Map<string, CharacterRelation[]>();
    filteredRelations.forEach(relation => {
      const pairKey = getPairKey(relation.from, relation.to);
      const group = pairGroups.get(pairKey);
      if (group) group.push(relation);
      else pairGroups.set(pairKey, [relation]);
    });

    const finalLinks: GraphLink[] = [];
    pairGroups.forEach(group => {
      const sortedGroup = [...group].sort((a, b) => getLinkIdentity(a).localeCompare(getLinkIdentity(b), 'zh-CN'));
      const [canonicalFrom] = [sortedGroup[0].from, sortedGroup[0].to].sort((a, b) => a.localeCompare(b, 'zh-CN'));

      sortedGroup.forEach((relation, idx) => {
        const baseCurvature = getCurvatureSpread(sortedGroup.length, idx);
        const curvature = relation.from === canonicalFrom ? baseCurvature : -baseCurvature;

        finalLinks.push({
          source: relation.from,
          target: relation.to,
          relation,
          curvature,
        });
      });
    });

    return { nodes, links: finalLinks };
  }, [filteredRelations, focusCharacter]);

  const activeNode = hoveredNode || selectedNode;

  // 选中节点及其一级邻居
  const firstDegreeNodes = useMemo(() => {
    if (!activeNode) return new Set<string>();
    const neighbors = new Set<string>();
    neighbors.add(activeNode);
    filteredRelations.forEach(r => {
      if (r.from === activeNode) neighbors.add(r.to);
      if (r.to === activeNode) neighbors.add(r.from);
    });
    return neighbors;
  }, [activeNode, filteredRelations]);

  const firstDegreeLinks = useMemo(() => {
    if (!activeNode) return new Set<string>();
    const links = new Set<string>();
    filteredRelations.forEach(r => {
      if (r.from === activeNode || r.to === activeNode) {
        links.add(getLinkIdentity(r));
      }
    });
    return links;
  }, [activeNode, filteredRelations]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node?.id || null);
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node.id);
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  const handleLinkClick = useCallback((link: any, event: MouseEvent) => {
    onLinkClick?.(link as GraphLink, event);
  }, [onLinkClick]);

  const handleBackgroundClick = useCallback(() => {
    setHoveredLink(null);
    setHoveredNode(null);
    setSelectedNode(focusCharacter || null);
    onLinkHover?.(null);
  }, [focusCharacter, onLinkHover]);

  const handleLinkHover = useCallback((link: any) => {
    setHoveredLink(link?.relation || null);
    onLinkHover?.(link ? (link as GraphLink) : null);
  }, [onLinkHover]);

  const handlePointerMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setPointerPosition({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY });
  }, []);

  const handleBackgroundDoubleClick = useCallback((event: MouseEvent) => {
    onBackgroundDoubleClick?.(event.offsetX, event.offsetY);
  }, [onBackgroundDoubleClick]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const spreadBase = Math.max(220, Math.min(containerWidth, height) * 0.36);
    const linkDistance = Math.max(140, Math.min(180, spreadBase * 0.62));
    const radialRadius = Math.max(140, Math.min(300, spreadBase * 0.8));

    const linkForce = fg.d3Force('link');
    if (linkForce) {
      linkForce
        .distance(linkDistance)
        .strength((link: any) => {
          const strength = link.relation?.strength;
          if (strength === '强') return 0.32;
          if (strength === '中') return 0.24;
          return 0.18;
        });
    }

    fg.d3Force(
      'charge',
      forceManyBody()
        .strength((node: any) => -Math.min(900, 180 + (node.val || 1) * 55))
        .distanceMin(60)
        .distanceMax(spreadBase * 2.4)
    );

    fg.d3Force(
      'collide',
      forceCollide((node: any) => getNodeRadius(node) + 18).iterations(3)
    );

    fg.d3Force('center', forceCenter(0, 0));
    fg.d3Force(
      'radial',
      forceRadial(graphData.nodes.length > 2 ? radialRadius : 0, 0, 0)
        .strength(graphData.nodes.length > 2 ? 0.008 : 0)
    );

    fg.d3ReheatSimulation();
  }, [containerWidth, graphData, height]);

  // 自定义节点绘制
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isSelected = selectedNode === node.id;
    const isNeighbor = activeNode ? firstDegreeNodes.has(node.id) && node.id !== activeNode : false;
    const isHighlighted = !!activeNode && (isSelected || node.id === activeNode || isNeighbor);
    const isDimmed = !!activeNode && !isHighlighted;
    const isFocus = node.id === focusCharacter;

    const baseRadius = getNodeRadius(node);
    const radius = baseRadius;
    const alpha = isDimmed ? 0.18 : 1;

    // 确保节点位置有效
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(radius)) {
      return;
    }

    const { x, y } = node;

    // 外部光晕
    if (isFocus || isSelected || isNeighbor) {
      const glowColor = isSelected || node.id === activeNode
        ? 'rgba(59, 130, 246, 0.28)'
        : isNeighbor
          ? 'rgba(34, 197, 94, 0.22)'
          : 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
      const glow = ctx.createRadialGradient(x, y, radius, x, y, radius * 2.5);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // 投影
    ctx.shadowColor = isSelected || node.id === activeNode
      ? 'rgba(59, 130, 246, 0.48)'
      : isNeighbor
        ? 'rgba(34, 197, 94, 0.36)'
        : isFocus
          ? 'rgba(56, 189, 248, 0.5)'
          : 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = isSelected || node.id === activeNode ? 18 : isNeighbor || isFocus ? 14 : 8;
    ctx.shadowOffsetY = 3;

    // 节点渐变填充
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    if (isDimmed) {
      grad.addColorStop(0, `rgba(71, 85, 105, ${alpha})`);
      grad.addColorStop(1, `rgba(51, 65, 85, ${alpha})`);
    } else if (isSelected || node.id === activeNode) {
      grad.addColorStop(0, '#60a5fa');
      grad.addColorStop(1, '#2563eb');
    } else if (isNeighbor) {
      grad.addColorStop(0, '#86efac');
      grad.addColorStop(1, '#16a34a');
    } else if (isFocus) {
      grad.addColorStop(0, '#7dd3fc');
      grad.addColorStop(1, '#0ea5e9');
    } else {
      grad.addColorStop(0, '#64748b');
      grad.addColorStop(1, '#334155');
    }
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha;
    ctx.fill();

    // 重置阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 边框
    ctx.strokeStyle = isSelected || node.id === activeNode
      ? '#bfdbfe'
      : isNeighbor
        ? '#bbf7d0'
        : isFocus
          ? '#bae6fd'
          : 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = isSelected || node.id === activeNode ? 3 : isNeighbor || isFocus ? 2 : 1;
    ctx.stroke();

    // 内圈让节点层次更清晰
    ctx.beginPath();
    ctx.arc(x, y, Math.max(6, radius - 4), 0, Math.PI * 2);
    ctx.strokeStyle = isDimmed ? `rgba(226, 232, 240, ${alpha * 0.15})` : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 球内文字至少容纳 3 个汉字，不再用过大的字号
    const label = node.name.length > 3 ? node.name.slice(0, 3) : node.name;
    let fontSize = Math.max(9, radius * 0.48);
    ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
    const maxInnerWidth = radius * 1.55;
    const measuredWidth = ctx.measureText(label).width;
    if (measuredWidth > maxInnerWidth) {
      fontSize = Math.max(8, fontSize * (maxInnerWidth / measuredWidth));
      ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isDimmed ? `rgba(100, 116, 139, ${alpha})` : isFocus ? '#ffffff' : '#f1f5f9';
    ctx.fillText(label, x, y);

    // 名称标签（放大镜下才显示）
    if (globalScale > 0.6) {
      const labelFontSize = Math.max(10, Math.min(13, 11 / globalScale));
      ctx.font = `${isHighlighted || isFocus ? 600 : 400} ${labelFontSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = y + radius + 7;
      const labelWidth = ctx.measureText(node.name).width;
      ctx.fillStyle = isDimmed ? `rgba(15, 23, 42, ${alpha * 0.5})` : 'rgba(15, 23, 42, 0.72)';
      ctx.beginPath();
      ctx.roundRect(x - labelWidth / 2 - 6, labelY - 2, labelWidth + 12, labelFontSize + 6, 8);
      ctx.fill();
      ctx.fillStyle = isDimmed ? `rgba(148, 163, 184, ${alpha})` : '#f8fafc';
      ctx.globalAlpha = alpha * (isHighlighted || isFocus ? 1 : 0.8);
      ctx.fillText(node.name, x, labelY);
    }

    ctx.globalAlpha = 1;
  }, [activeNode, firstDegreeNodes, focusCharacter, selectedNode]);

  const paintNodePointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const radius = getNodeRadius(node) + 2;
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      return;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2, false);
    ctx.fill();
  }, []);

  const paintLinkPointerArea = useCallback((link: any, color: string, ctx: CanvasRenderingContext2D) => {
    const src = typeof link.source === 'object' ? link.source : { x: 0, y: 0, val: 1 };
    const tgt = typeof link.target === 'object' ? link.target : { x: 0, y: 0, val: 1 };
    if (!Number.isFinite(src.x) || !Number.isFinite(src.y) || !Number.isFinite(tgt.x) || !Number.isFinite(tgt.y)) {
      return;
    }

    const curv = link.curvature || 0;
    const srcRadius = typeof link.source === 'object' ? getNodeRadius(link.source) : 16;
    const tgtRadius = typeof link.target === 'object' ? getNodeRadius(link.target) : 16;
    const control = getCurveControlPoint(src, tgt, curv);
    const pathStart = curv === 0
      ? {
          x: src.x + ((tgt.x - src.x) / control.len) * srcRadius,
          y: src.y + ((tgt.y - src.y) / control.len) * srcRadius,
        }
      : getQuadraticPoint(src, control, tgt, 0.08);
    const pathEnd = curv === 0
      ? {
          x: tgt.x - ((tgt.x - src.x) / control.len) * tgtRadius,
          y: tgt.y - ((tgt.y - src.y) / control.len) * tgtRadius,
        }
      : getQuadraticPoint(src, control, tgt, 0.92);

    ctx.strokeStyle = color;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (curv === 0) {
      ctx.moveTo(pathStart.x, pathStart.y);
      ctx.lineTo(pathEnd.x, pathEnd.y);
    } else {
      ctx.moveTo(pathStart.x, pathStart.y);
      ctx.quadraticCurveTo(control.x, control.y, pathEnd.x, pathEnd.y);
    }
    ctx.stroke();
  }, []);

  // 自定义连线绘制
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const relation: CharacterRelation = link.relation;
    const linkKey = getLinkIdentity(relation);
    const hoveredLinkKey = hoveredLink
      ? getLinkIdentity(hoveredLink)
      : null;
    const isHovered = hoveredLinkKey === linkKey;
    const isFirstDegreeLink = !!activeNode && firstDegreeLinks.has(linkKey);
    const isHighlighted = isHovered || isFirstDegreeLink;
    const isDimmed = !isHovered && !!activeNode && !isFirstDegreeLink;
    const color = getRelationColor(relation.type);
    const width = STRENGTH_WIDTH[relation.strength] || 2;
    const alpha = isHovered ? 1 : isDimmed ? 0.08 : isFirstDegreeLink ? 0.95 : 0.42;

    // 曲线绘制
    const src = typeof link.source === 'object' ? link.source : { x: 0, y: 0 };
    const tgt = typeof link.target === 'object' ? link.target : { x: 0, y: 0 };

    // 确保连线位置有效
    if (!Number.isFinite(src.x) || !Number.isFinite(src.y) || !Number.isFinite(tgt.x) || !Number.isFinite(tgt.y)) {
      return;
    }

    const curv = link.curvature || 0;
    const srcRadius = typeof link.source === 'object' ? getNodeRadius(link.source) : 16;
    const tgtRadius = typeof link.target === 'object' ? getNodeRadius(link.target) : 16;
    const control = getCurveControlPoint(src, tgt, curv);
    const pathStart = curv === 0
      ? {
          x: src.x + ((tgt.x - src.x) / control.len) * srcRadius,
          y: src.y + ((tgt.y - src.y) / control.len) * srcRadius,
        }
      : getQuadraticPoint(src, control, tgt, 0.08);
    const pathEnd = curv === 0
      ? {
          x: tgt.x - ((tgt.x - src.x) / control.len) * tgtRadius,
          y: tgt.y - ((tgt.y - src.y) / control.len) * tgtRadius,
        }
      : getQuadraticPoint(src, control, tgt, 0.92);

    // 外发光（高亮时）
    if (isHighlighted && !isDimmed) {
      ctx.beginPath();
      if (curv === 0) {
        ctx.moveTo(pathStart.x, pathStart.y);
        ctx.lineTo(pathEnd.x, pathEnd.y);
      } else {
        ctx.moveTo(pathStart.x, pathStart.y);
        ctx.quadraticCurveTo(control.x, control.y, pathEnd.x, pathEnd.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width * 2 + 3;
      ctx.globalAlpha = isHovered ? 0.3 : 0.18;
      ctx.stroke();
    }

    // 主连线
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = isHovered ? width * 2.1 : isFirstDegreeLink ? width * 1.7 : width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (curv === 0) {
      ctx.moveTo(pathStart.x, pathStart.y);
      ctx.lineTo(pathEnd.x, pathEnd.y);
    } else {
      ctx.moveTo(pathStart.x, pathStart.y);
      ctx.quadraticCurveTo(control.x, control.y, pathEnd.x, pathEnd.y);
    }
    ctx.stroke();

    if (!relation.isBidirectional) {
      const arrowPoint = curv === 0
        ? pathEnd
        : getQuadraticPoint(pathStart, control, pathEnd, 0.96);
      const tangent = curv === 0
        ? { x: pathEnd.x - pathStart.x, y: pathEnd.y - pathStart.y }
        : getQuadraticTangent(pathStart, control, pathEnd, 0.96);
      const tangentLen = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y) || 1;
      const ux = tangent.x / tangentLen;
      const uy = tangent.y / tangentLen;
      const arrowLength = isHovered ? 11 : 9;
      const arrowWidth = isHovered ? 5.5 : 4.5;

      ctx.beginPath();
      ctx.moveTo(arrowPoint.x, arrowPoint.y);
      ctx.lineTo(
        arrowPoint.x - ux * arrowLength - uy * arrowWidth,
        arrowPoint.y - uy * arrowLength + ux * arrowWidth,
      );
      ctx.lineTo(
        arrowPoint.x - ux * arrowLength + uy * arrowWidth,
        arrowPoint.y - uy * arrowLength - ux * arrowWidth,
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }

    // 关系标签（高亮或缩放足够时显示）
    if (!isDimmed && (isHighlighted || globalScale > 0.7)) {
      const labelPoint = curv === 0
        ? {
            x: (pathStart.x + pathEnd.x) / 2,
            y: (pathStart.y + pathEnd.y) / 2,
          }
        : getQuadraticPoint(pathStart, control, pathEnd, 0.5);
      const labelX = labelPoint.x;
      const labelY = labelPoint.y - 1;

      const fontSize = Math.max(9, 11 / globalScale);
      ctx.font = `500 ${fontSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 标签背景
      const labelText = relation.type;
      const textWidth = ctx.measureText(labelText).width;
      ctx.fillStyle = '#0f172a';
      ctx.globalAlpha = alpha;
      const padding = 3;
      const boxHeight = fontSize + 6;
      ctx.beginPath();
      ctx.roundRect(labelX - textWidth / 2 - padding, labelY - boxHeight / 2, textWidth + padding * 2, boxHeight, boxHeight / 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fillText(labelText, labelX, labelY);
    }

    ctx.globalAlpha = 1;
  }, [activeNode, firstDegreeLinks, hoveredLink]);

  const handleEngineStop = useCallback(() => {
    if (!fgRef.current) return;

    if (focusCharacter) {
      fgRef.current.centerAt(0, 0, 800);
    }
  }, [focusCharacter]);

  const resetView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 60);
      setTimeout(() => fgRef.current.zoomToFit(400, 60), 200);
    }
  }, []);

  const relaxLayout = useCallback(() => {
    graphData.nodes.forEach(node => {
      delete (node as any).fx;
      delete (node as any).fy;
    });

    if (fgRef.current) {
      fgRef.current.d3ReheatSimulation();
    }
  }, [graphData]);

  const handleNodeDragEnd = useCallback((node: any) => {
    node.fx = node.x;
    node.fy = node.y;

    window.setTimeout(() => {
      if (!node) return;
      node.fx = undefined;
      node.fy = undefined;
    }, 220);
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
      onMouseMove={handlePointerMove}
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#0a0f1a',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        height,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 40%), radial-gradient(circle at bottom, rgba(168, 85, 247, 0.10), transparent 45%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

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

        <button
          onClick={relaxLayout}
          title="重新散开"
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
          <RotateCcw size={14} />
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
        backgroundColor="#0a0f1a"
        linkCurvature="curvature"
        linkColor={() => 'transparent'}
        linkLineDash={null}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onNodeDragEnd={handleNodeDragEnd}
        onNodeDoubleClick={(node: any) => onNodeDoubleClick?.(node.id)}
        onLinkClick={handleLinkClick as any}
        onLinkHover={handleLinkHover as any}
        onBackgroundClick={handleBackgroundClick}
        onBackgroundDoubleClick={handleBackgroundDoubleClick as any}
        onEngineStop={handleEngineStop}
        nodeCanvasObject={paintNode as any}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={paintNodePointerArea as any}
        linkCanvasObject={paintLink as any}
        linkCanvasObjectMode={() => 'replace'}
        linkPointerAreaPaint={paintLinkPointerArea as any}
        cooldownTicks={500}
        warmupTicks={200}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        minZoom={0.3}
        maxZoom={5}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.38}
      />

      {/* Tooltip */}
      {hoveredLink && (
        <Tooltip
          x={pointerPosition.x}
          y={pointerPosition.y}
          relation={hoveredLink}
          onClose={() => setHoveredLink(null)}
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
