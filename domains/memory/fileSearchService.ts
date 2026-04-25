/**
 * @file fileSearchService.ts
 * @description 文件内容语义搜索 — 分 chunk embedding + 混合检索
 *
 * 流程：
 * 1. 文件内容按 ~500 字分 chunk（排除 .json）
 * 2. 每个 chunk 生成 embedding 并缓存（持久化到 IndexedDB）
 * 3. 搜索时：子串匹配 + 语义相似度混合排序
 *
 * 可靠性保障：
 * - 原子性索引：只有文件的所有 chunk 都成功生成 embedding，才标记为已索引
 * - 写入验证：保存到 IndexedDB 后立即读取验证
 * - 有效性校验：所有 embedding 必须通过 isValidEmbedding 检查
 */

import { FileNode, FileType } from '../../types';
import { generateEmbedding, cosineSimilarity, initEmbeddingModel, isValidEmbedding } from './embeddingService';
import { dbAPI } from '../../services/persistence';

// chunk 大小（中文字符）
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const EMBEDDING_SCHEMA_VERSION = 1;

interface FileChunk {
  fileId: string;
  filePath: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  embedding?: number[];
}

// 内存缓存：fileId → chunks
const chunkCache = new Map<string, FileChunk[]>();
// 标记哪些文件已索引（content hash 简化版：用 updatedAt）
const indexedVersions = new Map<string, number>();
// 当前项目ID（用于隔离）
let currentProjectId: string | null = null;

function isJsonFile(name: string): boolean {
  return name.toLowerCase().endsWith('.json');
}

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
 * 从 IndexedDB 加载已持久化的 embedding
 */
async function loadEmbeddingsFromDB(projectId: string): Promise<void> {
  if (currentProjectId === projectId && chunkCache.size > 0) return;

  chunkCache.clear();
  indexedVersions.clear();

  const saved = await dbAPI.getFileEmbeddings(projectId);
  if (saved && saved.version === EMBEDDING_SCHEMA_VERSION && saved.chunks) {
    // 验证加载的 chunk embedding 有效性
    const validChunks: typeof saved.chunks = [];
    const chunksByFile = new Map<string, FileChunk[]>();

    for (const c of saved.chunks as FileChunk[]) {
      if (isValidEmbedding(c.embedding)) {
        validChunks.push(c as FileChunk & { embedding: number[] });
        const list = chunksByFile.get(c.fileId) || [];
        list.push(c as FileChunk & { embedding: number[] });
        chunksByFile.set(c.fileId, list);
      } else {
        console.warn(`[fileSearchService] 加载到无效 embedding chunk，跳过: ${c.fileName}#${c.chunkIndex}`);
      }
    }

    for (const [fileId, chunks] of chunksByFile) {
      chunkCache.set(fileId, chunks);
    }
    if (saved.indexedVersions) {
      for (const [fileId, version] of Object.entries(saved.indexedVersions)) {
        // 只保留有有效 chunk 的文件版本标记
        if (chunksByFile.has(fileId)) {
          indexedVersions.set(fileId, version);
        }
      }
    }
    console.log(`[fileSearchService] 从 IndexedDB 加载 ${validChunks.length}/${saved.chunks.length} 个有效 chunk embedding`);
  }

  currentProjectId = projectId;
}

/**
 * 保存 embedding 到 IndexedDB
 * @returns 是否保存成功且通过验证
 */
async function saveEmbeddingsToDB(projectId: string): Promise<boolean> {
  const allChunks: Array<{
    fileId: string;
    fileName: string;
    chunkIndex: number;
    text: string;
    embedding: number[];
  }> = [];

  for (const chunks of chunkCache.values()) {
    for (const c of chunks) {
      if (isValidEmbedding(c.embedding)) {
        allChunks.push({
          fileId: c.fileId,
          fileName: c.fileName,
          chunkIndex: c.chunkIndex,
          text: c.text,
          embedding: c.embedding!,
        });
      }
    }
  }

  const versions: Record<string, number> = {};
  for (const [fileId, version] of indexedVersions) {
    versions[fileId] = version;
  }

  try {
    await dbAPI.saveFileEmbeddings(projectId, {
      version: EMBEDDING_SCHEMA_VERSION,
      chunks: allChunks,
      indexedVersions: versions,
    });

    // 验证写入：重新读取确认
    const verify = await dbAPI.getFileEmbeddings(projectId);
    if (!verify || verify.version !== EMBEDDING_SCHEMA_VERSION) {
      console.error('[fileSearchService] 写入验证失败：版本不匹配');
      return false;
    }
    const savedCount = verify.chunks?.length || 0;
    if (savedCount !== allChunks.length) {
      console.error(`[fileSearchService] 写入验证失败：期望 ${allChunks.length} 个 chunk，实际 ${savedCount} 个`);
      return false;
    }

    console.log(`[fileSearchService] 已验证保存 ${savedCount} 个 chunk embedding 到 IndexedDB`);
    return true;
  } catch (e) {
    console.error('[fileSearchService] IndexedDB 保存异常:', e);
    return false;
  }
}

/**
 * 验证缓存中所有 chunk 的 embedding 是否有效
 * @returns 是否有无效 chunk 被清理
 */
function validateAndCleanChunkCache(): { changed: boolean; invalidCount: number } {
  let changed = false;
  let invalidCount = 0;

  for (const [fileId, chunks] of chunkCache) {
    const invalidChunks = chunks.filter(c => !isValidEmbedding(c.embedding));
    if (invalidChunks.length > 0) {
      console.warn(`[fileSearchService] 发现 ${invalidChunks.length} 个无效 chunk，清除文件 ${fileId} 的缓存`);
      chunkCache.delete(fileId);
      indexedVersions.delete(fileId);
      changed = true;
      invalidCount += invalidChunks.length;
    }
  }

  return { changed, invalidCount };
}

/**
 * 统计 chunkCache 中的总 chunk 数
 */
function countTotalChunks(cache: Map<string, FileChunk[]>): number {
  let count = 0;
  for (const chunks of cache.values()) {
    count += chunks.length;
  }
  return count;
}

/**
 * 为文件列表建立 chunk embedding 索引
 * 增量更新：只处理新增/修改的文件
 * 排除 .json 文件
 *
 * 可靠性保证：
 * - 原子性：只有文件的所有 chunk 都成功生成 embedding，才标记为已索引
 * - 写入验证：保存到 IndexedDB 后立即读取验证
 * - 失败清理：部分失败时清除该文件的不完整缓存
 */
export async function indexFilesForSearch(files: FileNode[], projectId: string): Promise<number> {
  await loadEmbeddingsFromDB(projectId);

  const fileNodes = files.filter(
    f => f.type === FileType.FILE && !f.hidden && f.content && !isJsonFile(f.name)
  );

  let indexed = 0;
  for (const file of fileNodes) {
    const version = file.lastModified || 0;

    // 检查是否需要重新索引
    if (indexedVersions.get(file.id) === version && chunkCache.has(file.id)) {
      // 额外验证：检查缓存中的 chunk 是否全部有效
      const cached = chunkCache.get(file.id)!;
      const allValid = cached.every(c => isValidEmbedding(c.embedding));
      if (allValid) continue;
      // 有无效 chunk，需要重新索引
      console.warn(`[fileSearchService] 文件 ${file.name} 的缓存包含无效 embedding，重新索引`);
      chunkCache.delete(file.id);
      indexedVersions.delete(file.id);
    }

    const chunks = splitIntoChunks(file.content!);
    const fileChunks: FileChunk[] = [];
    let allSuccess = true;

    try {
      await initEmbeddingModel();

      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i].trim();
        if (!text) continue;

        const embedding = await generateEmbedding(text);
        if (!isValidEmbedding(embedding)) {
          console.warn(`[fileSearchService] 生成无效 embedding: ${file.name}#${i}`);
          allSuccess = false;
          break;
        }

        fileChunks.push({
          fileId: file.id,
          filePath: '',
          fileName: file.name,
          chunkIndex: i,
          text,
          embedding,
        });
      }
    } catch (e) {
      console.warn(`[fileSearchService] 文件索引中断: ${file.name}`, e);
      allSuccess = false;
    }

    if (allSuccess && fileChunks.length > 0) {
      chunkCache.set(file.id, fileChunks);
      indexedVersions.set(file.id, version);
      indexed++;
    } else {
      // 索引失败：清除该文件的不完整缓存（如果有）
      chunkCache.delete(file.id);
      indexedVersions.delete(file.id);
      console.warn(`[fileSearchService] 文件索引失败/不完整，已清除缓存: ${file.name}`);
    }
  }

  // 清理已删除文件的缓存
  const activeIds = new Set(fileNodes.map(f => f.id));
  for (const fileId of chunkCache.keys()) {
    if (!activeIds.has(fileId)) {
      chunkCache.delete(fileId);
      indexedVersions.delete(fileId);
    }
  }

  // 保存前验证
  const validation = validateAndCleanChunkCache();

  if (indexed > 0 || validation.changed) {
    const saveSuccess = await saveEmbeddingsToDB(projectId);
    if (!saveSuccess) {
      console.error('[fileSearchService] IndexedDB 持久化失败，内存缓存将在页面刷新后丢失');
    }
  }

  return indexed;
}

export interface FileSearchResult {
  fileId: string;
  fileName: string;
  score: number;
  matchType: 'substring' | 'semantic' | 'both';
}

/**
 * 混合文件搜索 — 子串匹配 + 语义相似度
 * 返回分区域结果：先子串匹配，再语义匹配
 */
export async function semanticFileSearch(
  query: string,
  files: FileNode[],
  topK: number = 10,
): Promise<{ substring: FileSearchResult[]; semantic: FileSearchResult[] }> {
  const lowerQuery = query.toLowerCase();
  const fileMap = new Map<string, FileNode>();
  for (const f of files) fileMap.set(f.id, f);

  // === 区域 A: 子串匹配 ===
  const substringResults: FileSearchResult[] = [];
  for (const file of files) {
    if (file.hidden || file.type !== FileType.FILE || isJsonFile(file.name)) continue;
    const nameMatch = file.name.toLowerCase().includes(lowerQuery);
    const contentMatch = file.content?.toLowerCase().includes(lowerQuery);
    if (nameMatch || contentMatch) {
      substringResults.push({
        fileId: file.id,
        fileName: file.name,
        score: nameMatch ? 1.0 : 0.6,
        matchType: 'substring',
      });
    }
  }

  // === 区域 B: 语义匹配 ===
  const semanticResults: FileSearchResult[] = [];
  try {
    const hasEmbeddings = [...chunkCache.values()].some(chunks => chunks.some(c => isValidEmbedding(c.embedding)));
    if (hasEmbeddings) {
      const queryEmb = await generateEmbedding(query);
      const scored: Array<{ fileId: string; sim: number }> = [];

      for (const [fileId, chunks] of chunkCache) {
        const file = fileMap.get(fileId);
        if (!file || isJsonFile(file.name)) continue;

        let maxSim = 0;
        for (const chunk of chunks) {
          if (!isValidEmbedding(chunk.embedding)) continue;
          const sim = cosineSimilarity(queryEmb, chunk.embedding!);
          maxSim = Math.max(maxSim, sim);
        }

        if (maxSim > 0.35) {
          scored.push({ fileId, sim: maxSim });
        }
      }

      scored.sort((a, b) => b.sim - a.sim);
      for (const s of scored.slice(0, topK)) {
        const file = fileMap.get(s.fileId);
        if (file) {
          semanticResults.push({
            fileId: s.fileId,
            fileName: file.name,
            score: s.sim,
            matchType: 'semantic',
          });
        }
      }
    }
  } catch {
    // embedding 不可用
  }

  return { substring: substringResults, semantic: semanticResults };
}

/**
 * 清除文件搜索缓存
 */
export function clearFileSearchCache(): void {
  chunkCache.clear();
  indexedVersions.clear();
  currentProjectId = null;
}

/**
 * 获取当前缓存统计（用于管理面板）
 */
export function getFileSearchCacheStats(): {
  fileCount: number;
  chunkCount: number;
  projectId: string | null;
} {
  return {
    fileCount: chunkCache.size,
    chunkCount: countTotalChunks(chunkCache),
    projectId: currentProjectId,
  };
}
