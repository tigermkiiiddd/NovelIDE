/**
 * @file fileSearchService.ts
 * @description 文件内容语义搜索 — 分 chunk embedding + 混合检索
 *
 * 流程：
 * 1. 文件内容按 ~500 字分 chunk（排除 .json）
 * 2. 每个 chunk 生成 embedding 并缓存（持久化到 IndexedDB）
 * 3. 搜索时：子串匹配 + 语义相似度混合排序
 */

import { FileNode, FileType } from '../../types';
import { generateEmbedding, cosineSimilarity, initEmbeddingModel } from './embeddingService';
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
    // 按 fileId 分组重建 chunkCache
    const chunksByFile = new Map<string, FileChunk[]>();
    for (const c of saved.chunks) {
      const list = chunksByFile.get(c.fileId) || [];
      list.push(c);
      chunksByFile.set(c.fileId, list);
    }
    for (const [fileId, chunks] of chunksByFile) {
      chunkCache.set(fileId, chunks);
    }
    if (saved.indexedVersions) {
      for (const [fileId, version] of Object.entries(saved.indexedVersions)) {
        indexedVersions.set(fileId, version);
      }
    }
    console.log(`[fileSearchService] 从 IndexedDB 加载 ${saved.chunks.length} 个 chunk embedding`);
  }

  currentProjectId = projectId;
}

/**
 * 保存 embedding 到 IndexedDB
 */
async function saveEmbeddingsToDB(projectId: string): Promise<void> {
  const allChunks: Array<{
    fileId: string;
    fileName: string;
    chunkIndex: number;
    text: string;
    embedding: number[];
  }> = [];

  for (const chunks of chunkCache.values()) {
    for (const c of chunks) {
      if (c.embedding) {
        allChunks.push({
          fileId: c.fileId,
          fileName: c.fileName,
          chunkIndex: c.chunkIndex,
          text: c.text,
          embedding: c.embedding,
        });
      }
    }
  }

  const versions: Record<string, number> = {};
  for (const [fileId, version] of indexedVersions) {
    versions[fileId] = version;
  }

  await dbAPI.saveFileEmbeddings(projectId, {
    version: EMBEDDING_SCHEMA_VERSION,
    chunks: allChunks,
    indexedVersions: versions,
  });

  console.log(`[fileSearchService] 已保存 ${allChunks.length} 个 chunk embedding 到 IndexedDB`);
}

/**
 * 为文件列表建立 chunk embedding 索引
 * 增量更新：只处理新增/修改的文件
 * 排除 .json 文件
 */
export async function indexFilesForSearch(files: FileNode[], projectId: string): Promise<number> {
  await loadEmbeddingsFromDB(projectId);

  const fileNodes = files.filter(
    f => f.type === FileType.FILE && !f.hidden && f.content && !isJsonFile(f.name)
  );

  let indexed = 0;
  for (const file of fileNodes) {
    const version = file.lastModified || 0;
    if (indexedVersions.get(file.id) === version && chunkCache.has(file.id)) {
      continue;
    }

    const chunks = splitIntoChunks(file.content!);

    try {
      await initEmbeddingModel();
      const fileChunks: FileChunk[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i].trim();
        if (!text) continue;

        const embedding = await generateEmbedding(text);
        fileChunks.push({
          fileId: file.id,
          filePath: '',
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
      break;
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

  if (indexed > 0) {
    await saveEmbeddingsToDB(projectId);
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
    const hasEmbeddings = [...chunkCache.values()].some(chunks => chunks.some(c => c.embedding));
    if (hasEmbeddings) {
      const queryEmb = await generateEmbedding(query);
      const scored: Array<{ fileId: string; sim: number }> = [];

      for (const [fileId, chunks] of chunkCache) {
        const file = fileMap.get(fileId);
        if (!file || isJsonFile(file.name)) continue;

        let maxSim = 0;
        for (const chunk of chunks) {
          if (!chunk.embedding) continue;
          const sim = cosineSimilarity(queryEmb, chunk.embedding);
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
