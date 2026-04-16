/**
 * @file embeddingService.ts
 * @description Transformers.js embedding 封装 — 浏览器端向量生成
 *
 * 使用 @huggingface/transformers 在浏览器中运行 embedding 模型。
 * 模型文件通过 Cache API 下载，并自动备份到 IndexedDB。
 * 手机上 Cache API 易被清除，IndexedDB 作为持久化备份。
 */

import { pipeline, env } from '@huggingface/transformers';

// 模型配置
const EMBEDDING_MODEL = 'Xenova/bge-small-zh-v1.5';
const EMBEDDING_DIMENSIONS = 512;
const CACHE_NAME = 'transformers-cache';
const IDB_DB = 'embedding-model-store';
const IDB_STORE = 'files';

// 强制从 CDN 下载，不用本地路径
env.allowLocalModels = false;

// 镜像配置：默认用 huggingface.co（有 CORS），镜像无 CORS 会失败
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
  completedFiles: string[];   // 已下载完成的文件
  currentFile: string;        // 当前正在下载的文件
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

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
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

async function idbPut(key: string, value: ArrayBuffer): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<ArrayBuffer | undefined> {
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
 * 将 Cache API 中的模型文件备份到 IndexedDB
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
      const buffer = await response.arrayBuffer();
      await idbPut(req.url, buffer);
      backedUp++;
    }
    if (backedUp > 0) {
      console.log(`[EmbeddingService] 已备份 ${backedUp} 个模型文件到 IndexedDB`);
    }
  } catch (e) {
    console.warn('[EmbeddingService] IndexedDB 备份失败:', e);
  }
}

/**
 * 从 IndexedDB 恢复模型文件到 Cache API
 * 返回 true 表示恢复了文件（模型可能可以直接加载）
 */
async function restoreCacheFromIDB(): Promise<boolean> {
  try {
    const keys = await idbGetAllKeys();
    if (keys.length === 0) return false;

    const cache = await caches.open(CACHE_NAME);
    let restored = 0;
    for (const url of keys) {
      // 如果 Cache API 中已有该文件，跳过
      const existing = await cache.match(url);
      if (existing) continue;

      const buffer = await idbGet(url);
      if (!buffer) continue;

      await cache.put(url, new Response(buffer));
      restored++;
    }

    if (restored > 0) {
      console.log(`[EmbeddingService] 从 IndexedDB 恢复了 ${restored} 个模型文件到缓存`);
    }
    return restored > 0;
  } catch (e) {
    console.warn('[EmbeddingService] IndexedDB 恢复失败:', e);
    return false;
  }
}

// ==================== 模型加载 ====================

/**
 * 初始化 embedding 模型
 */
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
    await restoreCacheFromIDB();

    progressCallback?.({ progress: 5, status: 'loading', message: '正在准备模型...', completedFiles: [], currentFile: '' });

    const completedFiles: string[] = [];

    embedder = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      progress_callback: (progress: any) => {
        if (!progressCallback) return;
        const file = progress.file?.split('/').pop() || '';

        if (progress.status === 'initiate') {
          progressCallback({ progress: 10, status: 'loading', message: `开始下载: ${file}`, completedFiles, currentFile: file });
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

    // 模型加载成功后，备份到 IndexedDB（后台执行，不阻塞）
    backupCacheToIDB();

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
