/**
 * @file embeddingAdminStore.ts
 * @description Embedding 管理功能 Store
 */

import { create } from 'zustand';
import { KnowledgeNode } from '../types';
import {
  runRecallTest,
  getEmbeddingCacheStats,
  clearModelCache,
  getModelCacheEntryCount,
  RecallTestResult,
  EmbeddingCacheStats,
} from '../domains/memory/embeddingAdminService';

interface EmbeddingAdminState {
  // 召回测试状态
  isTesting: boolean;
  lastResult: RecallTestResult | null;
  testError: string | null;

  // 缓存状态
  cacheStats: EmbeddingCacheStats | null;
  isLoadingStats: boolean;

  // 模型缓存
  modelCacheEntryCount: number;

  // Actions
  runTest: (query: string, nodes: KnowledgeNode[], topK?: number, minSimilarity?: number) => Promise<void>;
  refreshStats: (projectId: string, nodes: KnowledgeNode[]) => Promise<void>;
  clearModelCacheAction: () => Promise<void>;
}

export const useEmbeddingAdminStore = create<EmbeddingAdminState>((set, get) => ({
  isTesting: false,
  lastResult: null,
  testError: null,
  cacheStats: null,
  isLoadingStats: false,
  modelCacheEntryCount: 0,

  runTest: async (query, nodes, topK = 10, minSimilarity = 0.3) => {
    if (!query.trim()) return;
    set({ isTesting: true, testError: null });
    try {
      const result = await runRecallTest(query, nodes, topK, minSimilarity);
      set({ lastResult: result, isTesting: false });
    } catch (e: any) {
      set({ testError: e?.message || '测试失败', isTesting: false });
    }
  },

  refreshStats: async (projectId, nodes) => {
    set({ isLoadingStats: true });
    try {
      const [stats, modelCount] = await Promise.all([
        getEmbeddingCacheStats(projectId, nodes),
        getModelCacheEntryCount(),
      ]);
      stats.modelCache.estimatedEntries = modelCount;
      set({ cacheStats: stats, modelCacheEntryCount: modelCount, isLoadingStats: false });
    } catch (e: any) {
      console.error('[EmbeddingAdminStore] 刷新统计失败:', e);
      set({ isLoadingStats: false });
    }
  },

  clearModelCacheAction: async () => {
    await clearModelCache();
    set({ modelCacheEntryCount: 0 });
  },
}));
