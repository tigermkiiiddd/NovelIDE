/**
 * @file embeddingAdminService.ts
 * @description Embedding 管理功能服务层
 * - 语义召回测试
 * - 缓存状态统计
 */

import { KnowledgeNode } from '../../types';
import {
  generateEmbedding,
  cosineSimilarity,
  initEmbeddingModel,
  isValidEmbedding,
  getEmbeddingStatus,
} from './embeddingService';
import { semanticSearch, SearchResult } from './vectorSearchService';
import { dbAPI } from '../../services/persistence';
import { getFileSearchCacheStats } from './fileSearchService';

export interface RecallTestResult {
  query: string;
  queryEmbedding: number[];
  durationMs: number;
  results: Array<{
    nodeId: string;
    nodeName: string;
    nodeSummary: string;
    semanticScore: number;
    fuzzyScore: number;
    importanceScore: number;
    totalScore: number;
    hasEmbedding: boolean;
  }>;
}

export interface EmbeddingCacheStats {
  modelCache: {
    dbName: string;
    storeName: string;
    estimatedEntries: number;
    status: 'unknown' | 'ready' | 'loading' | 'error' | 'not_loaded';
  };
  fileEmbeddings: {
    projectId: string | null;
    chunkCount: number;
    fileCount: number;
    schemaVersion: number;
  };
  knowledgeNodes: {
    total: number;
    withEmbedding: number;
    withoutEmbedding: number;
    byWing: Record<string, { with: number; without: number }>;
  };
}

/**
 * 运行语义召回测试
 */
export async function runRecallTest(
  query: string,
  nodes: KnowledgeNode[],
  topK: number = 10,
  minSimilarity: number = 0.3,
): Promise<RecallTestResult> {
  const start = Date.now();
  await initEmbeddingModel();

  const queryEmbedding = await generateEmbedding(query);
  const rawResults = await semanticSearch(query, nodes, topK, minSimilarity);

  const durationMs = Date.now() - start;

  return {
    query,
    queryEmbedding,
    durationMs,
    results: rawResults.map((r: SearchResult) => ({
      nodeId: r.node.id,
      nodeName: r.node.name,
      nodeSummary: r.node.summary,
      semanticScore: r.semanticScore,
      fuzzyScore: r.fuzzyScore,
      importanceScore: r.importanceScore,
      totalScore: r.score,
      hasEmbedding: isValidEmbedding(r.node.embedding),
    })),
  };
}

/**
 * 获取 embedding 缓存统计信息
 */
export async function getEmbeddingCacheStats(
  projectId: string,
  nodes: KnowledgeNode[]
): Promise<EmbeddingCacheStats> {
  // 1. 模型缓存状态
  const modelStatus = getEmbeddingStatus();
  const modelCacheStatus = modelStatus.status === 'ready' ? 'ready'
    : modelStatus.status === 'loading' ? 'loading'
    : modelStatus.status === 'error' ? 'error'
    : 'not_loaded';

  // 2. 文件 chunk embeddings
  const fileStats = getFileSearchCacheStats();

  // 3. 知识节点 embeddings
  let withEmb = 0;
  let withoutEmb = 0;
  const byWing: Record<string, { with: number; without: number }> = {};

  for (const node of nodes) {
    const wing = node.wing || '未分配';
    if (!byWing[wing]) byWing[wing] = { with: 0, without: 0 };

    if (isValidEmbedding(node.embedding)) {
      withEmb++;
      byWing[wing].with++;
    } else {
      withoutEmb++;
      byWing[wing].without++;
    }
  }

  return {
    modelCache: {
      dbName: 'embedding-model-cache',
      storeName: 'responses',
      estimatedEntries: 0, // 无法直接获取，需要遍历 IndexedDB
      status: modelCacheStatus,
    },
    fileEmbeddings: {
      projectId: fileStats.projectId,
      chunkCount: fileStats.chunkCount,
      fileCount: fileStats.fileCount,
      schemaVersion: 1,
    },
    knowledgeNodes: {
      total: nodes.length,
      withEmbedding: withEmb,
      withoutEmbedding: withoutEmb,
      byWing,
    },
  };
}

/**
 * 清除模型文件缓存（IndexedDB embedding-model-cache）
 * 注意：这会触发下次使用时重新下载模型
 */
export async function clearModelCache(): Promise<void> {
  try {
    // 删除 IndexedDB
    const req = indexedDB.deleteDatabase('embedding-model-cache');
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        console.warn('[EmbeddingAdmin] 删除模型缓存被阻塞，请关闭其他标签页');
        resolve();
      };
    });
    console.log('[EmbeddingAdmin] 模型缓存已清除');
  } catch (e) {
    console.error('[EmbeddingAdmin] 清除模型缓存失败:', e);
    throw e;
  }
}

/**
 * 获取模型缓存条目数（异步遍历 IndexedDB）
 */
export async function getModelCacheEntryCount(): Promise<number> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('embedding-model-cache');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction('responses', 'readonly');
    const store = tx.objectStore('responses');
    const count = await new Promise<number>((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    db.close();
    return count;
  } catch {
    return 0;
  }
}
