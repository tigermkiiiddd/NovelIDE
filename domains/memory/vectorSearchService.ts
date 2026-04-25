/**
 * @file vectorSearchService.ts
 * @description 向量检索 + 混合排序
 *
 * 检索流程：
 * 1. 用户消息 → 生成 query embedding
 * 2. 向量相似度搜索（cosine similarity）过滤候选
 * 3. Fuse.js 模糊搜索补充
 * 4. 复合排序: semantic(0.5) + fuzzy(0.3) + importance(0.2)
 * 5. 按层策略返回结果
 */

import { KnowledgeNode } from '../../types';
import {
  generateEmbedding,
  cosineSimilarity,
  initEmbeddingModel,
  generateEmbeddingSafe,
  isValidEmbedding,
} from './embeddingService';
import Fuse from 'fuse.js';

// 排序权重
const WEIGHTS = {
  semantic: 0.5,
  fuzzy: 0.3,
  importance: 0.2,
};

// 重要性分数映射
const IMPORTANCE_SCORES: Record<string, number> = {
  critical: 1.0,
  important: 0.6,
  normal: 0.3,
};

export interface SearchResult {
  node: KnowledgeNode;
  score: number;
  semanticScore: number;
  fuzzyScore: number;
  importanceScore: number;
}

/**
 * 语义搜索（基于 embedding）
 */
export async function semanticSearch(
  query: string,
  nodes: KnowledgeNode[],
  topK: number = 10,
  minSimilarity: number = 0.3,
): Promise<SearchResult[]> {
  // 确保 embedding 模型已初始化
  await initEmbeddingModel();

  // 生成 query embedding
  const queryEmbedding = await generateEmbedding(query);

  // 计算每个节点的语义分数
  const results: SearchResult[] = [];

  for (const node of nodes) {
    if (!node.embedding) continue;

    const semanticScore = cosineSimilarity(queryEmbedding, node.embedding);
    if (semanticScore < minSimilarity) continue;

    const importanceScore = IMPORTANCE_SCORES[node.importance] || 0.3;

    results.push({
      node,
      score: 0, // 综合分数后续计算
      semanticScore,
      fuzzyScore: 0,
      importanceScore,
    });
  }

  // 如果有结果，进行 Fuse.js 补充搜索
  if (results.length > 0 || nodes.length > 0) {
    const fuse = new Fuse(nodes, {
      keys: [
        { name: 'tags', weight: 0.4 },
        { name: 'name', weight: 0.3 },
        { name: 'summary', weight: 0.2 },
        { name: 'detail', weight: 0.1 },
      ],
      includeScore: true,
      threshold: 0.6,
      ignoreLocation: true,
    });

    const fuseResults = fuse.search(query);

    // 合并 Fuse 结果
    const nodeToResult = new Map<string, SearchResult>();
    for (const r of results) {
      nodeToResult.set(r.node.id, r);
    }

    for (const fuseResult of fuseResults) {
      const node = fuseResult.item;
      const fuzzyScore = fuseResult.score ? 1 - fuseResult.score : 0;

      if (nodeToResult.has(node.id)) {
        // 已有语义结果，补充 fuzzy 分数
        nodeToResult.get(node.id)!.fuzzyScore = fuzzyScore;
      } else if (fuzzyScore > 0.4) {
        // 只有 fuzzy 结果，加入候选
        const importanceScore = IMPORTANCE_SCORES[node.importance] || 0.3;
        nodeToResult.set(node.id, {
          node,
          score: 0,
          semanticScore: 0,
          fuzzyScore,
          importanceScore,
        });
      }
    }

    // 计算综合分数
    const allResults = Array.from(nodeToResult.values());
    for (const r of allResults) {
      r.score =
        WEIGHTS.semantic * r.semanticScore +
        WEIGHTS.fuzzy * r.fuzzyScore +
        WEIGHTS.importance * r.importanceScore;
    }

    return allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  return results.slice(0, topK);
}

/**
 * 语义去重检测
 * 检查新内容和已有节点是否重复
 * @returns 重复节点的 ID，或 null
 */
export async function findSemanticDuplicate(
  newContent: string,
  existingNodes: KnowledgeNode[],
  threshold: number = 0.65,
): Promise<string | null> {
  await initEmbeddingModel();

  const newEmbedding = await generateEmbedding(newContent);

  for (const node of existingNodes) {
    if (!node.embedding) continue;

    const similarity = cosineSimilarity(newEmbedding, node.embedding);
    if (similarity >= threshold) {
      return node.id;
    }
  }

  return null;
}

/**
 * 为节点批量生成 embedding
 */
export async function batchGenerateEmbeddings(
  nodes: KnowledgeNode[],
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, number[]>> {
  await initEmbeddingModel();

  const results = new Map<string, number[]>();
  const total = nodes.length;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // 用 name + summary 作为 embedding 输入
    const text = `${node.name}。${node.summary}${node.detail ? `。${node.detail}` : ''}`;
    const embedding = await generateEmbeddingSafe(text);
    if (embedding) {
      results.set(node.id, embedding);
    }

    onProgress?.(i + 1, total);
  }

  return results;
}
