/**
 * @file embeddingService.ts
 * @description Transformers.js embedding 封装 — 浏览器端向量生成
 *
 * 模型持久化策略：拦截 fetch + IndexedDB
 * - @huggingface/transformers 内部用 fetch() 下载模型文件
 * - 我们在库加载前 monkey-patch window.fetch
 * - 模型 URL 命中时先查 IndexedDB，有就直接返回
 * - 没有就走原版 fetch，下载完成后存入 IndexedDB
 * - 手机上 Cache API 不可靠，IndexedDB 持久性远优于 Cache API
 */

import { pipeline, env } from '@huggingface/transformers';

// 模型配置
const EMBEDDING_MODEL = 'Xenova/bge-small-zh-v1.5';
const EMBEDDING_DIMENSIONS = 512;
const MODEL_HOST = 'huggingface.co';
const MODEL_HOST_MIRROR = 'hf-mirror.com';

// IndexedDB 配置
const IDB_NAME = 'embedding-model-cache';
const IDB_STORE = 'responses';
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
let fetchIntercepted = false;

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

// ==================== IndexedDB 操作 ====================

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

async function idbGet(url: string): Promise<Response | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(url);
      req.onsuccess = () => {
        const data = req.result;
        if (!data) return resolve(null);
        // data = { body: ArrayBuffer, headers: Record<string,string>, status: number }
        const headers = new Headers(data.headers || {});
        resolve(new Response(data.body, { status: data.status || 200, headers }));
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbPut(url: string, response: Response): Promise<void> {
  try {
    const body = await response.clone().arrayBuffer();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });

    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ body, headers, status: response.status }, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

// ==================== Fetch 拦截 ====================

/**
 * 判断 URL 是否是模型文件请求
 */
function isModelUrl(url: string): boolean {
  return url.includes(MODEL_HOST) || url.includes(MODEL_HOST_MIRROR);
}

/**
 * 拦截 fetch：模型文件请求先查 IndexedDB，命中直接返回；未命中走原版 fetch 并存入 IndexedDB
 */
function interceptFetch(): void {
  if (fetchIntercepted) return;
  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : input.url;

    // 只拦截模型文件 GET 请求
    if (!isModelUrl(url) || (init?.method && init.method !== 'GET')) {
      return originalFetch.call(this, input, init);
    }

    // 尝试从 IndexedDB 读取
    const cached = await idbGet(url);
    if (cached) {
      console.log(`[EmbeddingService] IndexedDB 命中: ${url.split('/').pop()}`);
      return cached;
    }

    // 未命中 → 原版 fetch + 存入 IndexedDB
    const response = await originalFetch.call(this, input, init);

    // 必须同步 clone，否则库消费 body 后 clone 会失败（小文件尤其明显）
    if (response.ok) {
      const clone = response.clone();
      idbPut(url, clone).then(() => {
        console.log(`[EmbeddingService] 已缓存到 IndexedDB: ${url.split('/').pop()}`);
      }).catch(() => {});
    }

    return response;
  };

  fetchIntercepted = true;
  console.log('[EmbeddingService] fetch 拦截已安装');
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
    // 安装 fetch 拦截器（在任何模型加载之前）
    interceptFetch();

    // 请求持久化存储
    try {
      if (navigator.storage?.persist) {
        const granted = await navigator.storage.persist();
        console.log('[EmbeddingService] 持久化存储:', granted ? '已授权' : '未授权');
      }
    } catch { /* ignore */ }

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

// ==================== 有效性校验与 Safe 生成 ====================

/**
 * 验证 embedding 是否有效（非空、非 undefined、长度正确、无 NaN）
 */
export function isValidEmbedding(emb: number[] | undefined | null): boolean {
  if (!emb || !Array.isArray(emb)) return false;
  if (emb.length !== EMBEDDING_DIMENSIONS) return false;
  if (emb.some(v => typeof v !== 'number' || Number.isNaN(v))) return false;
  return true;
}

/**
 * 安全生成 embedding：失败或无效时返回 null
 * 用于批量操作，避免单点失败阻断整个流程
 */
export async function generateEmbeddingSafe(text: string): Promise<number[] | null> {
  try {
    const emb = await generateEmbedding(text);
    return isValidEmbedding(emb) ? emb : null;
  } catch (error) {
    console.warn('[EmbeddingService] safe 生成失败:', (error as Error).message);
    return null;
  }
}
