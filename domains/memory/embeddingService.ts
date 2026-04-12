/**
 * @file embeddingService.ts
 * @description Transformers.js embedding 封装 — 浏览器端向量生成
 *
 * 使用 @huggingface/transformers 在浏览器中运行 embedding 模型。
 * 模型首次加载时下载到浏览器缓存（IndexedDB/Cache API），后续直接使用缓存。
 *
 * 推荐模型：
 * - bge-small-zh-v1.5: 中文优化，512 维，~30MB
 * - multilingual-e5-small: 多语言，384 维，~30MB
 */

import { pipeline, Pipeline, env } from '@huggingface/transformers';

// HuggingFace 镜像配置（国内用户加速）
// 默认使用 hf-mirror.com，设为 'false' 关闭
const USE_MIRROR = (() => {
  try {
    return localStorage.getItem('EMBEDDING_USE_MIRROR') !== 'false';
  } catch { return true; }
})();

if (USE_MIRROR) {
  env.remoteHost = 'https://hf-mirror.com';
  console.log('[EmbeddingService] 使用 HuggingFace 镜像');
}

// 模型配置
const EMBEDDING_MODEL = 'Xenova/bge-small-zh-v1.5'; // 中文优化
const EMBEDDING_DIMENSIONS = 512;

// 单例缓存
let embedder: Pipeline | null = null;
let isLoading = false;
let loadProgress = 0;

export interface EmbeddingProgress {
  progress: number; // 0-100
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
}

type ProgressCallback = (progress: EmbeddingProgress) => void;

let progressCallback: ProgressCallback | null = null;

/**
 * 设置进度回调（Loading Page 使用）
 */
export function setEmbeddingProgressCallback(cb: ProgressCallback) {
  progressCallback = cb;
}

/**
 * 获取当前 embedding 状态
 */
export function getEmbeddingStatus(): EmbeddingProgress {
  if (embedder) {
    return { progress: 100, status: 'ready', message: '模型已就绪' };
  }
  if (isLoading) {
    return { progress: loadProgress, status: 'loading', message: '正在加载模型...' };
  }
  return { progress: 0, status: 'idle', message: '模型未加载' };
}

/**
 * 初始化 embedding 模型
 * 首次调用会下载模型（~30MB），后续使用浏览器缓存
 */
export async function initEmbeddingModel(): Promise<void> {
  if (embedder) return;
  if (isLoading) {
    // 等待已有的初始化完成
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  isLoading = true;
  loadProgress = 0;

  try {
    progressCallback?.({ progress: 0, status: 'loading', message: '正在初始化 embedding 模型...' });

    embedder = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      progress_callback: (progress: any) => {
        if (progress.status === 'progress' && progress.progress) {
          loadProgress = Math.round(progress.progress);
          progressCallback?.({
            progress: loadProgress,
            status: 'loading',
            message: `正在下载模型: ${loadProgress}%`,
          });
        } else if (progress.status === 'done') {
          loadProgress = 100;
          progressCallback?.({
            progress: 100,
            status: 'loading',
            message: '模型下载完成，正在初始化...',
          });
        }
      },
    });

    progressCallback?.({ progress: 100, status: 'ready', message: '模型已就绪' });
    console.log('[EmbeddingService] 模型加载完成');
  } catch (error) {
    console.error('[EmbeddingService] 模型加载失败:', error);
    progressCallback?.({ progress: 0, status: 'error', message: `模型加载失败: ${error}` });
    throw error;
  } finally {
    isLoading = false;
  }
}

/**
 * 生成文本的 embedding 向量
 * @param text 输入文本
 * @returns 归一化的 embedding 向量
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    await initEmbeddingModel();
  }

  if (!embedder) {
    throw new Error('[EmbeddingService] 模型未初始化');
  }

  const output = await embedder(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data) as number[];

  return embedding;
}

/**
 * 批量生成 embedding
 * @param texts 文本数组
 * @returns embedding 数组
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    embeddings.push(await generateEmbedding(text));
  }
  return embeddings;
}

/**
 * 计算 cosine similarity
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * 获取 embedding 维度
 */
export function getEmbeddingDimensions(): number {
  return EMBEDDING_DIMENSIONS;
}
