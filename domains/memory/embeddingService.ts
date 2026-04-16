/**
 * @file embeddingService.ts
 * @description Transformers.js embedding 封装 — 浏览器端向量生成
 *
 * 使用 @huggingface/transformers 在浏览器中运行 embedding 模型。
 * 模型首次加载时下载到浏览器缓存（Cache API），后续直接使用缓存。
 */

import { pipeline, env } from '@huggingface/transformers';

// 模型配置
const EMBEDDING_MODEL = 'Xenova/bge-small-zh-v1.5';
const EMBEDDING_DIMENSIONS = 512;

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

/**
 * 清理坏的缓存（URL 指向 localhost 的）
 */
async function cleanBadCache(): Promise<void> {
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    for (const req of keys) {
      // 删除指向 localhost 的缓存条目（应该指向 CDN）
      if (req.url.includes('localhost')) {
        await cache.delete(req);
      }
    }
  } catch { /* ignore */ }
}

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
    // 清理坏缓存
    await cleanBadCache();

    progressCallback?.({ progress: 5, status: 'loading', message: '正在准备模型下载...', completedFiles: [], currentFile: '' });

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

    progressCallback?.({ progress: 100, status: 'ready', message: '模型已就绪' });
    console.log('[EmbeddingService] 模型加载完成');
  } catch (error: any) {
    const msg = error?.message || error?.toString?.() || '未知错误';
    console.error('[EmbeddingService] 模型加载失败:', msg, error);
    progressCallback?.({ progress: 0, status: 'error', message: `模型加载失败: ${msg}` });
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
