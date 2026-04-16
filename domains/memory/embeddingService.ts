/**
 * @file embeddingService.ts
 * @description Transformers.js embedding 封装 — 浏览器端向量生成
 *
 * 使用 @huggingface/transformers 在浏览器中运行 embedding 模型。
 * 双层缓存：Cache API (快) + IndexedDB (持久，手机端主力)。
 * IndexedDB 存储完整 Response（含 headers），恢复时重建原样 Response。
 */

import { pipeline, env } from '@huggingface/transformers';

// 模型配置
const EMBEDDING_MODEL = 'Xenova/bge-small-zh-v1.5';
const EMBEDDING_DIMENSIONS = 512;
const CACHE_NAME = 'transformers-cache';
const IDB_NAME = 'embedding-model-backup';
const IDB_STORE = 'files';
const IDB_VERSION = 1;

// 强制从 CDN 下载，不用本地路径
env.allowLocalModels = false;

// 镜像配置
const USE_MIRROR = (() => {
  try {
    return localStorage.getItem('EMBEDDING_USE_MIRROR') === 'true';
  } catch { return false; }
})();

if (USE_MIRROR) {
  env.remoteHost = 'https://hf-mirror.com';
}

// 单例
let embedder: any = null;
let isLoading = false;

export interface EmbeddingProgress {
  progress: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  completedFiles: string[];
  currentFile: string;
}

type ProgressCallback = (progress: EmbeddingProgress) => void;
let progressCallback: ProgressCallback | null = null;

export function setEmbeddingProgressCallback(cb: ProgressCallback | null) {
  progressCallback = cb;
}

export function getEmbeddingStatus(): EmbeddingProgress {
  if (embedder) return { progress: 100, status: 'ready', message: '模型已就绪', completedFiles: [], currentFile: '' };
  if (isLoading) return { progress: 0, status: 'loading', message: '正在加载模型...', completedFiles: [], currentFile: '' };
  return { progress: 0, status: 'idle', message: '模型未加载', completedFiles: [], currentFile: '' };
}

// ==================== IndexedDB 备份 ====================
// 存储结构: { url: { body: ArrayBuffer, headers: Record<string, string>, status: number } }

interface CachedFile {
  body: ArrayBuffer;
  headers: Record<string, string>;
  status: number;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: CachedFile): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<CachedFile | undefined> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllKeys(): Promise<string[]> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 从 Response 提取 headers 为普通对象
 */
function extractHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * 用保存的 headers + body 重建 Response
 */
function rebuildResponse(cached: CachedFile): Response {
  const headers = new Headers(cached.headers);
  return new Response(cached.body, { status: cached.status, headers });
}

/**
 * 将 Cache API 中的模型文件完整备份到 IndexedDB（含 headers）
 */
async function backupCacheToIDB(): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let backedUp = 0;

    for (const req of keys) {
      if (req.url.includes('localhost')) continue;
      const response = await cache.match(req);
      if (!response) continue;

      // 克隆 response 以避免消耗 body
      const cloned = response.clone();
      const body = await cloned.arrayBuffer();
      const headers = extractHeaders(cloned);

      await idbPut(req.url, { body, headers, status: cloned.status });
      backedUp++;
    }

    if (backedUp > 0) {
      console.log(`[EmbeddingService] 已备份 ${backedUp} 个模型文件到 IndexedDB（含 headers）`);
    }
  } catch (e) {
    console.warn('[EmbeddingService] IndexedDB 备份失败:', e);
  }
}

/**
 * 从 IndexedDB 恢复模型文件到 Cache API（保留原始 headers）
 * 返回恢复的文件数量
 */
async function restoreCacheFromIDB(): Promise<number> {
  try {
    const keys = await idbGetAllKeys();
    if (keys.length === 0) return 0;

    const cache = await caches.open(CACHE_NAME);
    let restored = 0;

    for (const url of keys) {
      // Cache API 已有则跳过
      const existing = await cache.match(url);
      if (existing) continue;

      const cached = await idbGet(url);
      if (!cached) continue;

      const response = rebuildResponse(cached);
      await cache.put(url, response);
      restored++;
    }

    if (restored > 0) {
      console.log(`[EmbeddingService] 从 IndexedDB 恢复了 ${restored} 个模型文件到缓存`);
    }
    return restored;
  } catch (e) {
    console.warn('[EmbeddingService] IndexedDB 恢复失败:', e);
    return 0;
  }
}

// ==================== 模型加载 ====================

export async function initEmbeddingModel(): Promise<void> {
  if (embedder) return;

  if (isLoading) {
    while (isLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return;
  }

  isLoading = true;

  try {
    // 请求持久化存储
    try {
      if (navigator.storage?.persist) {
        const granted = await navigator.storage.persist();
        console.log('[EmbeddingService] 持久化存储:', granted ? '已授权' : '未授权');
      }
    } catch { /* ignore */ }

    // 先尝试从 IndexedDB 恢复到 Cache API
    const restored = await restoreCacheFromIDB();
    if (restored > 0) {
      progressCallback?.({ progress: 10, status: 'loading', message: `已从本地恢复 ${restored} 个文件，正在加载...`, completedFiles: [], currentFile: '' });
    } else {
      progressCallback?.({ progress: 5, status: 'loading', message: '正在准备模型下载...', completedFiles: [], currentFile: '' });
    }

    const completedFiles: string[] = [];

    embedder = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      progress_callback: (progress: any) => {
        if (!progressCallback) return;
        const file = progress.file?.split('/').pop() || '';

        if (progress.status === 'initiate') {
          progressCallback({ progress: 15, status: 'loading', message: `开始下载: ${file}`, completedFiles, currentFile: file });
        } else if (progress.status === 'progress') {
          const pct = Math.round(progress.progress || 0);
          const loaded = progress.loaded ? `${(progress.loaded / 1024 / 1024).toFixed(1)}MB` : '';
          const total = progress.total ? `${(progress.total / 1024 / 1024).toFixed(1)}MB` : '';
          progressCallback({
            progress: pct,
            status: 'loading',
            message: `下载 ${file}: ${pct}%${loaded && total ? ` (${loaded}/${total})` : ''}`,
            completedFiles,
            currentFile: file,
          });
        } else if (progress.status === 'done') {
          completedFiles.push(file);
          progressCallback({ progress: 90, status: 'loading', message: `已下载: ${file}`, completedFiles: [...completedFiles], currentFile: '' });
        } else if (progress.status === 'ready') {
          progressCallback({ progress: 95, status: 'loading', message: '正在初始化模型...', completedFiles: [...completedFiles], currentFile: '' });
        }
      },
    });

    // 模型加载成功后，await 备份确保写入完成（下次才能命中）
    await backupCacheToIDB();

    progressCallback?.({ progress: 100, status: 'ready', message: '模型已就绪', completedFiles: [], currentFile: '' });
    console.log('[EmbeddingService] 模型加载完成');
  } catch (error: any) {
    const msg = error?.message || error?.toString?.() || '未知错误';
    console.error('[EmbeddingService] 模型加载失败:', msg, error);
    progressCallback?.({ progress: 0, status: 'error', message: `模型加载失败: ${msg}`, completedFiles: [], currentFile: '' });
    throw error;
  } finally {
    isLoading = false;
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!embedder) await initEmbeddingModel();
  if (!embedder) throw new Error('[EmbeddingService] 模型未初始化');

  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  const denom = Math.sqrt(nA) * Math.sqrt(nB);
  return denom === 0 ? 0 : dot / denom;
}

export function getEmbeddingDimensions(): number {
  return EMBEDDING_DIMENSIONS;
}
