/**
 * @file KnowledgeTreeView.tsx
 * @description 记忆宫殿 — 星象观测台 (Celestial Observatory)
 *
 * 力导向图可视化：5 个 Wing 星域，Room 星团聚类，知识节点如星辰闪烁。
 * 使用 react-force-graph-2d + d3-force-3d。
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCenter, forceCollide, forceManyBody, forceRadial } from 'd3-force-3d';
import {
  Search,
  X,
  Filter,
  Maximize2,
  RotateCcw,
  Plus,
  Globe,
  BookOpen,
  Users,
  GitBranch,
  FolderKanban,
} from 'lucide-react';
import {
  KnowledgeNode,
  KnowledgeEdgeType,
  KnowledgeWing,
  WING_LABELS,
  WING_ROOMS,
} from '../types';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';
import { KnowledgeNodeEditor } from './KnowledgeNodeEditor';
import { KnowledgeNodePreview } from './KnowledgeNodePreview';

// ============================================
// 色彩体系 — 星云配色
// ============================================

const WING_COLORS: Record<KnowledgeWing, { light: string; main: string; dark: string; rgb: string }> = {
  world: { light: '#60a5fa', main: '#3b82f6', dark: '#1e40af', rgb: '59,130,246' },
  writing_rules: { light: '#fbbf24', main: '#f59e0b', dark: '#b45309', rgb: '245,158,11' },
  characters: { light: '#34d399', main: '#10b981', dark: '#047857', rgb: '16,185,129' },
  plot: { light: '#a78bfa', main: '#8b5cf6', dark: '#6d28d9', rgb: '139,92,246' },
  project: { light: '#22d3ee', main: '#06b6d4', dark: '#0e7490', rgb: '6,182,212' },
};

const WING_ICONS: Record<KnowledgeWing, React.ReactNode> = {
  world: <Globe className="w-3.5 h-3.5" />,
  writing_rules: <BookOpen className="w-3.5 h-3.5" />,
  characters: <Users className="w-3.5 h-3.5" />,
  plot: <GitBranch className="w-3.5 h-3.5" />,
  project: <FolderKanban className="w-3.5 h-3.5" />,
};

const EDGE_STYLES: Record<KnowledgeEdgeType, { color: string; dash: number[] }> = {
  '属于': { color: 'rgba(255,255,255,0.7)', dash: [] },
  '细化': { color: 'rgba(148,163,184,0.75)', dash: [8, 5] },
  '依赖': { color: 'rgba(59,130,246,0.8)', dash: [3, 5] },
  '冲突': { color: 'rgba(239,68,68,0.95)', dash: [] },
};

const IMPORTANCE_RADIUS: Record<string, number> = {
  critical: 26,
  important: 18,
  normal: 12,
};

const IMPORTANCE_VAL: Record<string, number> = {
  critical: 4,
  important: 2,
  normal: 1,
};

// ============================================
// 图数据类型
// ============================================

interface MemPalaceNode {
  id: string;
  name: string;
  nodeType: 'knowledge' | 'room';
  wing?: KnowledgeWing;
  room?: string;
  importance?: 'critical' | 'important' | 'normal';
  summary?: string;
  tags?: string[];
  val: number;
  roomLabel?: string;
  roomWing?: KnowledgeWing;
  roomCount?: number;
  originalNode?: KnowledgeNode;
}

interface MemPalaceLink {
  source: string | MemPalaceNode;
  target: string | MemPalaceNode;
  linkType: 'room_membership' | 'knowledge_edge';
  edgeType?: KnowledgeEdgeType;
  note?: string;
  curvature?: number;
}

// Bypass strict type checking
const GraphRenderer: React.FC<any> = (props) => {
  // @ts-ignore
  return <ForceGraph2D {...props} />;
};

// ============================================
// Tooltip — 毛玻璃星辰信息卡
// ============================================

const NodeTooltip: React.FC<{
  x: number;
  y: number;
  node: MemPalaceNode;
  onClose: () => void;
}> = ({ x, y, node, onClose }) => {
  if (node.nodeType === 'room') return null;

  const wing = node.wing || 'world';
  const colors = WING_COLORS[wing];

  return (
    <div
      style={{
        position: 'absolute',
        left: x + 16,
        top: y - 12,
        background: 'rgba(10,15,30,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.main}50`,
        borderRadius: 14,
        padding: '14px 18px',
        minWidth: 200,
        maxWidth: 320,
        boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${colors.rgb}20`,
        zIndex: 100,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: colors.light }}>{node.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      {node.summary && (
        <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8, lineHeight: 1.5 }}>{node.summary}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
        <span style={{ color: colors.main }}>{WING_LABELS[wing]}</span>
        {node.room && (
          <>
            <span>›</span>
            <span>{node.room}</span>
          </>
        )}
        {node.importance === 'critical' && <span style={{ color: '#ef4444', marginLeft: 'auto' }}>关键</span>}
      </div>
      {node.tags && node.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          {node.tags.slice(0, 4).map((tag) => (
            <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: `${colors.main}20`, color: colors.light }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// 主组件
// ============================================

interface Props {
  onSelectNode?: (node: KnowledgeNode) => void;
  className?: string;
}

export const KnowledgeTreeView: React.FC<Props> = ({ onSelectNode, className = '' }) => {
  const store = useKnowledgeGraphStore();
  const { nodes, edges, ensureInitialized, addNode, addNodeWithEmbedding, updateNode, deleteNode } = store;

  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeWings, setActiveWings] = useState<Set<KnowledgeWing>>(new Set());
  const [showWingFilter, setShowWingFilter] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const [graphHeight, setGraphHeight] = useState(600);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'graph' | 'detail'>('graph');
  const [animFrame, setAnimFrame] = useState(0);

  // 初始化
  useEffect(() => { ensureInitialized(); }, [ensureInitialized]);

  // 响应式
  useEffect(() => {
    if (!graphContainerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerWidth(width);
      setGraphHeight(height);
    });
    obs.observe(graphContainerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      setIsMobile(entries[0].contentRect.width < 768);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // 动画帧（用于冲突边脉冲 + critical 呼吸）
  useEffect(() => {
    let frame: number;
    const tick = () => { setAnimFrame((f) => (f + 1) % 360); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Wing 筛选切换
  const toggleWing = useCallback((wing: KnowledgeWing) => {
    setActiveWings((prev) => { const next = new Set(prev); if (next.has(wing)) next.delete(wing); else next.add(wing); return next; });
  }, []);

  // ========== 图数据构建 ==========
  const graphData = useMemo(() => {
    let filtered = nodes.filter((n) => n.category !== '用户偏好');
    if (activeWings.size > 0) filtered = filtered.filter((n) => n.wing && activeWings.has(n.wing));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) => n.name.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q) || (Array.isArray(n.tags) && n.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    const graphNodes: MemPalaceNode[] = [];
    const graphLinks: MemPalaceLink[] = [];

    // 统计每个 Room 的节点数
    const roomNodeCounts: Record<string, number> = {};
    filtered.forEach((n) => { const key = `${n.wing}/${n.room}`; roomNodeCounts[key] = (roomNodeCounts[key] || 0) + 1; });

    // 创建 Room 锚点
    const roomAnchors = new Map<string, string>();
    const processedRooms = new Set<string>();
    filtered.forEach((n) => {
      const key = `${n.wing}/${n.room}`;
      if (processedRooms.has(key)) return;
      processedRooms.add(key);
      const anchorId = `room:${key}`;
      roomAnchors.set(key, anchorId);
      graphNodes.push({ id: anchorId, name: n.room || '未分类', nodeType: 'room', roomLabel: n.room || '未分类', roomWing: n.wing, roomCount: roomNodeCounts[key] || 0, val: 0 });
    });

    // 创建知识节点
    filtered.forEach((n) => {
      graphNodes.push({
        id: n.id, name: n.name, nodeType: 'knowledge',
        wing: n.wing, room: n.room, importance: n.importance,
        summary: n.summary, tags: n.tags,
        val: IMPORTANCE_VAL[n.importance] || 1,
        originalNode: n,
      });
      const roomKey = `${n.wing}/${n.room}`;
      const anchorId = roomAnchors.get(roomKey);
      if (anchorId) graphLinks.push({ source: n.id, target: anchorId, linkType: 'room_membership' });
    });

    // 知识边
    edges.forEach((e) => {
      if (filtered.some((n) => n.id === e.from) && filtered.some((n) => n.id === e.to)) {
        graphLinks.push({ source: e.from, target: e.to, linkType: 'knowledge_edge', edgeType: e.type, note: e.note });
      }
    });

    return { nodes: graphNodes, links: graphLinks };
  }, [nodes, edges, activeWings, searchQuery]);

  // 搜索高亮
  const searchHighlightIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    const ids = new Set<string>();
    nodes.forEach((n) => { if (n.name.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q) || (Array.isArray(n.tags) && n.tags.some((t) => t.toLowerCase().includes(q)))) ids.add(n.id); });
    return ids;
  }, [nodes, searchQuery]);

  // Wing 扇形角度
  const wingAngles = useMemo(() => {
    const wings = Object.keys(WING_LABELS) as KnowledgeWing[];
    const angles: Record<string, number> = {};
    wings.forEach((w, i) => { angles[w] = (i / wings.length) * Math.PI * 2 - Math.PI / 2; });
    return angles;
  }, []);

  // ========== d3 force 配置 ==========
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const spreadBase = Math.max(200, Math.min(containerWidth, graphHeight) * 0.32);

    // Configure the default link force (provided by ForceGraph2D)
    const linkForce = fg.d3Force('link');
    if (linkForce) {
      linkForce
        .id((d: any) => d.id)
        .distance((link: any) => {
          if (link.linkType === 'room_membership') return 25;
          return 140;
        })
        .strength((link: any) => {
          if (link.linkType === 'room_membership') return 0.12;
          return 0.25;
        });
    }

    // Charge
    fg.d3Force('charge', forceManyBody().strength((node: any) => node.nodeType === 'room' ? -250 : -100).distanceMin(40).distanceMax(spreadBase * 2.2));

    // Collide
    fg.d3Force('collide', forceCollide((node: any) => {
      if (node.nodeType === 'room') return 35 + (node.roomCount || 1) * 5 + 15;
      return IMPORTANCE_RADIUS[node.importance || 'normal'] + 6;
    }).iterations(3));

    // Center
    fg.d3Force('center', forceCenter(0, 0));

    // Radial: loose orbit
    fg.d3Force('radial', forceRadial(spreadBase * 0.75, 0, 0).strength(0.005));

    // Custom Wing cluster force
    fg.d3Force('wing_cluster', (alpha: number) => {
      graphData.nodes.forEach((node: any) => {
        const wing = node.nodeType === 'room' ? node.roomWing : node.wing;
        if (!wing || wingAngles[wing] === undefined) return;
        const angle = wingAngles[wing];
        const targetR = node.nodeType === 'room' ? spreadBase * 0.5 : spreadBase * 0.75;
        const targetX = Math.cos(angle) * targetR;
        const targetY = Math.sin(angle) * targetR;
        node.vx += (targetX - (node.x || 0)) * alpha * 0.025;
        node.vy += (targetY - (node.y || 0)) * alpha * 0.025;
      });
    });

    fg.d3ReheatSimulation();
  }, [containerWidth, graphHeight, graphData, wingAngles]);

  // ========== 选中节点 ==========
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const defaultWingForAdd = useMemo((): KnowledgeWing | undefined => {
    if (selectedNode?.wing) return selectedNode.wing;
    if (activeWings.size === 1) return Array.from(activeWings)[0];
    return undefined;
  }, [selectedNode, activeWings]);

  // 邻居
  const neighborIds = useMemo(() => {
    const activeId = hoveredNodeId || selectedNodeId;
    if (!activeId) return new Set<string>();
    const ids = new Set<string>([activeId]);
    edges.forEach((e) => { if (e.from === activeId) ids.add(e.to); if (e.to === activeId) ids.add(e.from); });
    return ids;
  }, [selectedNodeId, hoveredNodeId, edges]);

  // ========== 交互 ==========
  const handleNodeHover = useCallback((node: any) => { setHoveredNodeId(node?.id || null); }, []);
  const handleNodeClick = useCallback((node: any) => {
    if (node.nodeType === 'room') return;
    setSelectedNodeId(node.id);
    onSelectNode?.(node.originalNode);
    if (isMobile) setMobileTab('detail');
  }, [onSelectNode, isMobile]);
  const handleBackgroundClick = useCallback(() => { setHoveredNodeId(null); setSelectedNodeId(null); }, []);
  const handlePointerMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setPointerPosition({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY });
  }, []);

  const resetView = useCallback(() => {
    if (!fgRef.current) return;
    fgRef.current.zoomToFit(400, 60);
    setTimeout(() => fgRef.current?.zoomToFit(400, 60), 200);
  }, []);

  const relaxLayout = useCallback(() => {
    graphData.nodes.forEach((node: any) => { delete node.fx; delete node.fy; });
    fgRef.current?.d3ReheatSimulation();
  }, [graphData]);

  const handleDelete = useCallback((node: KnowledgeNode) => {
    deleteNode(node.id);
    if (selectedNodeId === node.id) setSelectedNodeId(null);
  }, [deleteNode, selectedNodeId]);

  // ========== Canvas 绘制 ==========

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
    const { x, y } = node;

    // --- Room 锚点（星团） ---
    if (node.nodeType === 'room') {
      const wing = node.roomWing || 'world';
      const colors = WING_COLORS[wing];
      const count = node.roomCount || 1;
      const radius = 35 + count * 5;

      // 半透明填充
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colors.rgb}, 0.04)`;
      ctx.fill();

      // 虚线环
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = `rgba(${colors.rgb}, 0.1)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // 标签
      if (globalScale > 0.35) {
        const fontSize = Math.max(10, Math.min(14, 12 / globalScale));
        ctx.font = `500 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${colors.rgb}, 0.5)`;
        ctx.fillText(node.roomLabel || node.name, x, y);
      }
      return;
    }

    // --- 知识节点（星辰） ---
    const wing = node.wing || 'world';
    const colors = WING_COLORS[wing];
    const importance = node.importance || 'normal';
    const radius = IMPORTANCE_RADIUS[importance] || 12;

    const isActive = selectedNodeId === node.id || hoveredNodeId === node.id;
    const isNeighbor = neighborIds.has(node.id) && !isActive;
    const isSearchMatch = searchHighlightIds.size > 0 && searchHighlightIds.has(node.id);
    const isDimmed = (selectedNodeId || hoveredNodeId) && !isActive && !isNeighbor;
    const isSearchDimmed = searchHighlightIds.size > 0 && !isSearchMatch;
    const alpha = (isDimmed || isSearchDimmed) ? 0.15 : 1;

    // 外层光晕
    const glowAlpha = isActive ? 0.35 : isNeighbor ? 0.2 : 0.12;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2.8);
    glow.addColorStop(0, `rgba(${colors.rgb}, ${glowAlpha * alpha})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fill();

    // 投影
    ctx.shadowColor = isActive ? `rgba(${colors.rgb}, 0.6)` : isNeighbor ? `rgba(${colors.rgb}, 0.35)` : 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = isActive ? 20 : isNeighbor ? 14 : 8;
    ctx.shadowOffsetY = 2;

    // 主体球体
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    grad.addColorStop(0, colors.light);
    grad.addColorStop(1, colors.dark);
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 边框
    ctx.strokeStyle = isActive ? colors.light : `rgba(255,255,255,${0.15 * alpha})`;
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();

    // critical 脉冲光环
    if (importance === 'critical') {
      const pulse = 0.35 + 0.3 * Math.sin(animFrame * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${colors.rgb}, ${pulse * alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // important 外圈
    if (importance === 'important') {
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${colors.rgb}, ${0.2 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 球内文字
    const label = node.name.length > 3 ? node.name.slice(0, 3) : node.name;
    let fontSize = Math.max(8, radius * 0.48);
    ctx.font = `bold ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    const maxW = radius * 1.5;
    const measured = ctx.measureText(label).width;
    if (measured > maxW) {
      fontSize = Math.max(7, fontSize * (maxW / measured));
      ctx.font = `bold ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = alpha < 1 ? `rgba(200,210,225,${alpha})` : '#f1f5f9';
    ctx.fillText(label, x, y);

    // 球外标签
    if (globalScale > 0.55 && alpha > 0.3) {
      const labelFontSize = Math.max(9, Math.min(12, 11 / globalScale));
      ctx.font = `500 ${labelFontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = y + radius + 6;
      const labelWidth = ctx.measureText(node.name).width;
      ctx.fillStyle = `rgba(7,11,20,${0.75 * alpha})`;
      ctx.beginPath();
      ctx.roundRect(x - labelWidth / 2 - 5, labelY - 2, labelWidth + 10, labelFontSize + 5, 6);
      ctx.fill();
      ctx.fillStyle = `rgba(226,232,240,${0.85 * alpha})`;
      ctx.fillText(node.name, x, labelY);
    }

    ctx.globalAlpha = 1;
  }, [selectedNodeId, hoveredNodeId, neighborIds, searchHighlightIds, animFrame]);

  const paintNodePointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
    const radius = node.nodeType === 'room' ? 35 + (node.roomCount || 1) * 5 + 4 : IMPORTANCE_RADIUS[node.importance || 'normal'] + 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = typeof link.source === 'object' ? link.source : { x: 0, y: 0 };
    const tgt = typeof link.target === 'object' ? link.target : { x: 0, y: 0 };
    if (!Number.isFinite(src.x) || !Number.isFinite(src.y) || !Number.isFinite(tgt.x) || !Number.isFinite(tgt.y)) return;

    // Room membership: 星团引力线
    if (link.linkType === 'room_membership') {
      const wing = (typeof src === 'object' ? src.wing || src.roomWing : undefined) as KnowledgeWing | undefined;
      const colors = wing ? WING_COLORS[wing] : WING_COLORS.world;
      ctx.strokeStyle = `rgba(${colors.rgb}, 0.2)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      return;
    }

    // 知识边
    const edgeType = link.edgeType as KnowledgeEdgeType;
    const style = EDGE_STYLES[edgeType] || EDGE_STYLES['属于'];
    const isHoveredLink = hoveredNodeId && ((typeof src === 'object' && src.id === hoveredNodeId) || (typeof tgt === 'object' && tgt.id === hoveredNodeId));
    const isSelectedLink = selectedNodeId && ((typeof src === 'object' && src.id === selectedNodeId) || (typeof tgt === 'object' && tgt.id === selectedNodeId));
    const isHighlighted = !!(isHoveredLink || isSelectedLink);

    let color = style.color;
    let lineWidth = 3.5;

    if (isHighlighted) {
      if (edgeType === '冲突') color = 'rgba(239,68,68,1)';
      else if (edgeType === '属于') color = 'rgba(255,255,255,0.9)';
      else if (edgeType === '细化') color = 'rgba(148,163,184,0.9)';
      else if (edgeType === '依赖') color = 'rgba(59,130,246,0.95)';
      lineWidth = 5.5;
    } else if (hoveredNodeId || selectedNodeId) {
      // Dim unrelated edges
      color = style.color.replace(/[\d.]+\)$/, '0.06)');
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(style.dash);

    if (edgeType === '冲突') ctx.lineDashOffset = -animFrame * 0.5;

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // 边标签
    if (isHighlighted || globalScale > 0.8) {
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      const fontSize = Math.max(9, 11 / globalScale);
      ctx.font = `500 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = edgeType;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(7,11,20,0.85)';
      ctx.beginPath();
      ctx.roundRect(midX - tw / 2 - 4, midY - fontSize / 2 - 2, tw + 8, fontSize + 4, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(text, midX, midY);
    }
  }, [hoveredNodeId, selectedNodeId, animFrame]);

  const paintLinkPointerArea = useCallback((link: any, color: string, ctx: CanvasRenderingContext2D) => {
    const src = typeof link.source === 'object' ? link.source : { x: 0, y: 0 };
    const tgt = typeof link.target === 'object' ? link.target : { x: 0, y: 0 };
    if (!Number.isFinite(src.x) || !Number.isFinite(src.y) || !Number.isFinite(tgt.x) || !Number.isFinite(tgt.y)) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.stroke();
  }, []);

  // 统计
  const knowledgeNodeCount = useMemo(() => graphData.nodes.filter((n) => n.nodeType === 'knowledge').length, [graphData]);
  const edgeCount = useMemo(() => graphData.links.filter((l) => l.linkType === 'knowledge_edge').length, [graphData]);

  // ==================== 渲染 ====================

  return (
    <div ref={containerRef} className={`h-full flex flex-col md:flex-row bg-[#070b14] text-gray-100 ${className}`}>
      {/* Mobile tab */}
      {selectedNodeId && isMobile && (
        <div className="md:hidden flex border-b border-gray-800 shrink-0">
          <button onClick={() => setMobileTab('graph')} className={`flex-1 py-2 text-sm text-center ${mobileTab === 'graph' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}>星图</button>
          <button onClick={() => setMobileTab('detail')} className={`flex-1 py-2 text-sm text-center ${mobileTab === 'detail' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}>详情</button>
        </div>
      )}

      {/* 星图区域 */}
      <div className={`flex-1 relative min-w-0 min-h-0 overflow-hidden ${selectedNodeId && isMobile && mobileTab === 'detail' ? 'hidden md:flex' : 'flex'} flex-col`}
        onMouseMove={handlePointerMove}>

        {/* 星云背景 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at 20% 30%, rgba(59,130,246,0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.05) 0%, transparent 45%),
            radial-gradient(ellipse at 70% 70%, rgba(16,185,129,0.05) 0%, transparent 50%),
            radial-gradient(ellipse at 30% 80%, rgba(139,92,246,0.05) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 50%, rgba(6,182,212,0.04) 0%, transparent 50%),
            linear-gradient(135deg, #070b14 0%, #0f1628 100%)`,
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* 工具栏 */}
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center', zIndex: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: 'rgba(10,15,30,0.85)', border: '1px solid rgba(148,163,184,0.15)', flex: 1, maxWidth: 240 }}>
            <Search size={14} style={{ color: '#64748b', flexShrink: 0 }} />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索记忆星辰..."
              style={{ background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: 13, width: '100%' }} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}><X size={14} /></button>}
          </div>
          <button onClick={() => setShowWingFilter(!showWingFilter)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: activeWings.size > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(10,15,30,0.85)', border: activeWings.size > 0 ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(148,163,184,0.15)', color: activeWings.size > 0 ? '#93c5fd' : '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
            <Filter size={14} />{activeWings.size > 0 ? `${activeWings.size}` : '星域'}
          </button>
          <button onClick={resetView} title="重置视图" style={{ padding: '6px 10px', borderRadius: 10, background: 'rgba(10,15,30,0.85)', border: '1px solid rgba(148,163,184,0.15)', color: '#94a3b8', cursor: 'pointer' }}><Maximize2 size={14} /></button>
          <button onClick={relaxLayout} title="重新散开" style={{ padding: '6px 10px', borderRadius: 10, background: 'rgba(10,15,30,0.85)', border: '1px solid rgba(148,163,184,0.15)', color: '#94a3b8', cursor: 'pointer' }}><RotateCcw size={14} /></button>
          <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', cursor: 'pointer', fontSize: 13 }}>
            <Plus size={14} />
          </button>
        </div>

        {/* Wing 筛选面板 */}
        {showWingFilter && (
          <div style={{ position: 'absolute', top: 50, left: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(148,163,184,0.15)', zIndex: 20, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 320 }}>
            {(Object.keys(WING_LABELS) as KnowledgeWing[]).map((wing) => {
              const colors = WING_COLORS[wing];
              const isActive = activeWings.has(wing);
              return (
                <button key={wing} onClick={() => toggleWing(wing)} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, border: `1px solid ${colors.main}${isActive ? 'cc' : '40'}`, background: isActive ? `${colors.main}25` : 'transparent', color: isActive ? colors.light : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {WING_ICONS[wing]} {WING_LABELS[wing]}
                </button>
              );
            })}
          </div>
        )}

        {/* 力导向图 Canvas */}
        <div ref={graphContainerRef} style={{ flex: 1, position: 'relative' }}>
          <GraphRenderer
            ref={fgRef as any}
            graphData={graphData}
            nodeId="id"
            nodeLabel="name"
            width={containerWidth}
            height={graphHeight}
            backgroundColor="transparent"
            linkColor={() => 'transparent'}
            linkLineDash={null}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            nodeCanvasObject={paintNode as any}
            nodeCanvasObjectMode={() => 'replace'}
            nodePointerAreaPaint={paintNodePointerArea as any}
            linkCanvasObject={paintLink as any}
            linkCanvasObjectMode={() => 'replace'}
            linkPointerAreaPaint={paintLinkPointerArea as any}
            cooldownTicks={500}
            warmupTicks={150}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            minZoom={0.25}
            maxZoom={5}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.35}
          />

          {/* 空状态 */}
          {knowledgeNodeCount === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#475569', fontSize: 14, zIndex: 10 }}>
              <div className="text-center">
                <div className="text-4xl mb-3">🌌</div>
                <p>{searchQuery ? '没有匹配的星辰' : '星空尚未点亮，点击 + 创建记忆'}</p>
              </div>
            </div>
          )}
        </div>

        {/* 统计角标 */}
        <div style={{ position: 'absolute', bottom: 12, right: 12, padding: '4px 10px', borderRadius: 8, background: 'rgba(10,15,30,0.8)', border: '1px solid rgba(148,163,184,0.1)', color: '#475569', fontSize: 11, zIndex: 10 }}>
          {knowledgeNodeCount} 星辰 · {edgeCount} 关联
        </div>

        {/* Tooltip */}
        {hoveredNodeId && (() => {
          const hoveredGraphNode = graphData.nodes.find((n) => n.id === hoveredNodeId);
          if (!hoveredGraphNode || hoveredGraphNode.nodeType === 'room') return null;
          return <NodeTooltip x={pointerPosition.x} y={pointerPosition.y} node={hoveredGraphNode} onClose={() => setHoveredNodeId(null)} />;
        })()}
      </div>

      {/* 右侧详情面板 */}
      {selectedNodeId && (
        <div className={`w-full md:w-80 shrink-0 border-l border-gray-800 overflow-hidden ${isMobile && mobileTab === 'graph' ? 'hidden md:flex' : 'flex'} flex-col`}>
          <KnowledgeNodePreview node={selectedNode} onUpdate={(id, updates) => { store.updateNodeWithEmbedding(id, updates); }} onDelete={handleDelete} onAdd={() => setShowAddModal(true)} />
        </div>
      )}

      {/* 添加模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <KnowledgeNodeEditor node={null} onSave={(draft) => { addNodeWithEmbedding(draft); setShowAddModal(false); }} onCancel={() => setShowAddModal(false)} defaultWing={defaultWingForAdd} />
        </div>
      )}
    </div>
  );
};

export default KnowledgeTreeView;
