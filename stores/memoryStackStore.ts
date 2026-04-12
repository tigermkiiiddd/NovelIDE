/**
 * @file memoryStackStore.ts
 * @description 4层记忆栈状态管理 — L0-L3 分层加载策略
 *
 * L0 身份: Agent 身份 + 项目元信息 (~100 tokens, 始终加载)
 * L1 关键事实: critical 知识节点 + 世界设定摘要 + 角色设定索引 (~500 tokens, 始终加载)
 * L2 项目上下文: 当前写作上下文相关的 important 知识 (跨 Wing 语义聚合, ~800 tokens)
 * L3 深度检索: 所有 normal 知识 + 情景记忆 (仅工具查询)
 */

import { create } from 'zustand';
import { KnowledgeWing } from '../types';

// 记忆栈层定义
export type MemoryLayer = 'L0' | 'L1' | 'L2' | 'L3';

export interface MemoryStackContent {
  layer: MemoryLayer;
  content: string;
  tokenEstimate: number;
  sources: string[]; // node IDs or file paths
}

interface MemoryStackState {
  // 各层内容缓存
  layers: Record<MemoryLayer, MemoryStackContent | null>;

  // L2 上下文状态
  currentContext: string | null; // 当前写作上下文描述
  activeWings: KnowledgeWing[]; // 当前激活的 Wing
  l2TokenBudget: number; // L2 token 预算

  // 加载状态
  isLoading: boolean;
  lastLoadedAt: number | null;

  // 操作
  setLayer: (layer: MemoryLayer, content: MemoryStackContent) => void;
  clearLayer: (layer: MemoryLayer) => void;
  setContext: (context: string, activeWings: KnowledgeWing[]) => void;
  getCompiledPrompt: () => string;
  getTokenUsage: () => { layer: MemoryLayer; tokens: number }[];
  reset: () => void;
}

const INITIAL_L2_BUDGET = 800;

const initialState = {
  layers: {
    L0: null,
    L1: null,
    L2: null,
    L3: null,
  } as Record<MemoryLayer, MemoryStackContent | null>,
  currentContext: null as string | null,
  activeWings: [] as KnowledgeWing[],
  l2TokenBudget: INITIAL_L2_BUDGET,
  isLoading: false,
  lastLoadedAt: null as number | null,
};

export const useMemoryStackStore = create<MemoryStackState>((set, get) => ({
  ...initialState,

  setLayer: (layer: MemoryLayer, content: MemoryStackContent) => {
    set((state) => ({
      layers: { ...state.layers, [layer]: content },
    }));
  },

  clearLayer: (layer: MemoryLayer) => {
    set((state) => ({
      layers: { ...state.layers, [layer]: null },
    }));
  },

  setContext: (context: string, activeWings: KnowledgeWing[]) => {
    set({ currentContext: context, activeWings });
  },

  getCompiledPrompt: () => {
    const { layers } = get();
    const parts: string[] = [];

    // L0 + L1 始终包含
    if (layers.L0?.content) parts.push(layers.L0.content);
    if (layers.L1?.content) parts.push(layers.L1.content);
    // L2 按需包含（有内容时）
    if (layers.L2?.content) parts.push(layers.L2.content);
    // L3 不编译进 prompt，仅工具查询

    return parts.join('\n\n');
  },

  getTokenUsage: () => {
    const { layers } = get();
    return (['L0', 'L1', 'L2', 'L3'] as MemoryLayer[])
      .map((layer) => ({
        layer,
        tokens: layers[layer]?.tokenEstimate ?? 0,
      }));
  },

  reset: () => {
    set(initialState);
  },
}));

export default useMemoryStackStore;
