/**
 * @file embeddingHealthCheck.ts
 * @description Embedding 缓存健康检查服务
 */

import { KnowledgeNode } from '../../types';
import { dbAPI } from '../../services/persistence';
import { isValidEmbedding, getEmbeddingStatus } from './embeddingService';

export interface EmbeddingHealthReport {
  fileEmbeddings: {
    status: 'healthy' | 'degraded' | 'failed';
    totalFiles: number;
    totalChunks: number;
    invalidChunks: number;
    dbPersisted: boolean;
    lastSaveSuccess?: boolean;
  };
  knowledgeNodes: {
    status: 'healthy' | 'degraded' | 'failed';
    total: number;
    withEmbedding: number;
    withoutEmbedding: number;
  };
  modelCache: {
    status: 'ready' | 'loading' | 'error' | 'not_loaded';
  };
}

/**
 * 运行 embedding 缓存全面健康检查
 */
export async function runEmbeddingHealthCheck(
  projectId: string,
  nodes: KnowledgeNode[]
): Promise<EmbeddingHealthReport> {
  // 1. 检查模型缓存状态
  const modelStatus = getEmbeddingStatus();
  const modelCacheStatus = modelStatus.status === 'ready' ? 'ready'
    : modelStatus.status === 'loading' ? 'loading'
    : modelStatus.status === 'error' ? 'error'
    : 'not_loaded';

  // 2. 检查文件 chunk embeddings
  let fileReport: EmbeddingHealthReport['fileEmbeddings'] = {
    status: 'healthy',
    totalFiles: 0,
    totalChunks: 0,
    invalidChunks: 0,
    dbPersisted: false,
    lastSaveSuccess: undefined,
  };

  try {
    const saved = await dbAPI.getFileEmbeddings(projectId);
    if (saved && saved.chunks) {
      fileReport.dbPersisted = true;
      const chunks = saved.chunks;
      fileReport.totalChunks = chunks.length;

      // 按 fileId 分组统计
      const fileIds = new Set<string>();
      let invalid = 0;
      for (const c of chunks) {
        fileIds.add(c.fileId);
        if (!isValidEmbedding(c.embedding)) {
          invalid++;
        }
      }
      fileReport.totalFiles = fileIds.size;
      fileReport.invalidChunks = invalid;

      if (invalid > 0) {
        fileReport.status = 'degraded';
      }
    }
  } catch (e) {
    fileReport.status = 'failed';
    fileReport.dbPersisted = false;
  }

  // 3. 检查知识节点 embeddings
  let validNodes = 0;
  let invalidNodes = 0;
  for (const node of nodes) {
    if (isValidEmbedding(node.embedding)) {
      validNodes++;
    } else {
      invalidNodes++;
    }
  }

  const nodeStatus: EmbeddingHealthReport['knowledgeNodes'] = {
    status: invalidNodes === 0 ? 'healthy' : invalidNodes < validNodes ? 'degraded' : 'failed',
    total: nodes.length,
    withEmbedding: validNodes,
    withoutEmbedding: invalidNodes,
  };

  return {
    fileEmbeddings: fileReport,
    knowledgeNodes: nodeStatus,
    modelCache: { status: modelCacheStatus },
  };
}
