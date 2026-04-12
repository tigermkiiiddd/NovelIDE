/**
 * @file fileSearchService.ts
 * @description 文件内容语义搜索 — 分 chunk embedding + 混合检索
 *
 * 流程：
 * 1. 文件内容按 ~500 字分 chunk
 * 2. 每个 chunk 生成 embedding 并缓存
 * 3. 搜索时：子串匹配 + 语义相似度混合排序
 */

import { FileNode, FileType } from '../../types';
import { generateEmbedding, cosineSimilarity, initEmbeddingModel } from './embeddingService';

// chunk 大小（中文字符）
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

interface FileChunk {
  fileId: string;
  filePath: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  embedding?: number[];
}

// 缓存：fileId → chunks
const chunkCache = new Map<string, FileChunk[]>();
// 标记哪些文件已索引（content hash 简化版：用 updatedAt）
const indexedVersions = new Map<string, number>();

/**
 * 将文本按固定长度分 chunk（带重叠）
 */
function splitIntoChunks(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text || text.length <= size) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += size - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

/**
 * 为文件列表建立 chunk embedding 索引
 * 增量更新：只处理新增/修改的文件
 */
export async function indexFilesForSearch(files: FileNode[]): Promise<number> {
  const fileNodes = files.filter(f => f.type === FileType.FILE && !f.hidden && f.content);

  let indexed = 0;
  for (const file of fileNodes) {
    // 检查是否需要重新索引
    const version = file.updatedAt || 0;
    if (indexedVersions.get(file.id) === version && chunkCache.has(file.id)) {
      continue; // 未变化，跳过
    }

    const chunks = splitIntoChunks(file.content!);

    // 尝试生成 embedding
    try {
      await initEmbeddingModel();
      const fileChunks: FileChunk[] = [];

      for (let i = 0; i < chunks.length; i++) {
        // 去掉纯空白 chunk
        const text = chunks[i].trim();
        if (!text) continue;

        const embedding = await generateEmbedding(text);
        fileChunks.push({
          fileId: file.id,
          filePath: '', // 路径在搜索时解析
          fileName: file.name,
          chunkIndex: i,
          text,
          embedding,
        });
      }

      chunkCache.set(file.id, fileChunks);
      indexedVersions.set(file.id, version);
      indexed++;
    } catch {
      // embedding 模型不可用，跳过此文件
      break;
    }
  }

  return indexed;
}

/**
 * 语义文件搜索 — 子串匹配 + 语义相似度混合
 * @returns 匹配的文件 ID 列表（去重、按相关度排序）
 */
export async function semanticFileSearch(
  query: string,
  files: FileNode[],
  topK: number = 10,
): Promise<Array<{ fileId: string; score: number; matchType: 'substring' | 'semantic' | 'both' }>> {
  const lowerQuery = query.toLowerCase();
  const fileScores = new Map<string, { substring: number; semantic: number }>();

  // 1. 子串匹配（快速）
  for (const file of files) {
    if (file.hidden || file.type !== FileType.FILE) continue;
    const nameMatch = file.name.toLowerCase().includes(lowerQuery);
    const contentMatch = file.content?.toLowerCase().includes(lowerQuery);
    if (nameMatch || contentMatch) {
      const prev = fileScores.get(file.id) || { substring: 0, semantic: 0 };
      prev.substring = nameMatch ? 1.0 : 0.6;
      fileScores.set(file.id, prev);
    }
  }

  // 2. 语义匹配
  try {
    const hasEmbeddings = [...chunkCache.values()].some(chunks => chunks.some(c => c.embedding));
    if (hasEmbeddings) {
      const queryEmb = await generateEmbedding(query);

      for (const [fileId, chunks] of chunkCache) {
        let maxSim = 0;
        for (const chunk of chunks) {
          if (!chunk.embedding) continue;
          const sim = cosineSimilarity(queryEmb, chunk.embedding);
          maxSim = Math.max(maxSim, sim);
        }

        if (maxSim > 0.35) {
          const prev = fileScores.get(fileId) || { substring: 0, semantic: 0 };
          prev.semantic = maxSim;
          fileScores.set(fileId, prev);
        }
      }
    }
  } catch {
    // embedding 不可用，只用子串结果
  }

  // 3. 混合排序
  const results = [...fileScores.entries()]
    .map(([fileId, scores]) => {
      const combined = scores.substring * 0.4 + scores.semantic * 0.6;
      const matchType = scores.substring > 0 && scores.semantic > 0
        ? 'both' as const
        : scores.substring > 0
          ? 'substring' as const
          : 'semantic' as const;
      return { fileId, score: combined, matchType };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

/**
 * 清除文件搜索缓存
 */
export function clearFileSearchCache(): void {
  chunkCache.clear();
  indexedVersions.clear();
}
