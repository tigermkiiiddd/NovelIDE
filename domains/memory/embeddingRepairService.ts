/**
 * @file embeddingRepairService.ts
 * @description 知识节点 embedding 修复服务
 */

import { KnowledgeNode } from '../../types';
import { generateEmbeddingSafe, isValidEmbedding } from './embeddingService';

export interface EmbeddingRepairResult {
  repaired: number;
  failed: number;
  alreadyValid: number;
}

export interface EmbeddingCheckResult {
  valid: number;
  invalid: number;
  details: Array<{ id: string; name: string; reason: string }>;
}

/**
 * 检查知识节点 embedding 完整性
 */
export function checkKnowledgeNodeEmbeddings(nodes: KnowledgeNode[]): EmbeddingCheckResult {
  const result: EmbeddingCheckResult = {
    valid: 0,
    invalid: 0,
    details: [],
  };

  for (const node of nodes) {
    if (isValidEmbedding(node.embedding)) {
      result.valid++;
    } else {
      result.invalid++;
      const reason = !node.embedding
        ? '缺失 embedding'
        : !Array.isArray(node.embedding)
        ? 'embedding 不是数组'
        : node.embedding.length === 0
        ? 'embedding 为空数组'
        : 'embedding 维度不正确或包含无效值';
      result.details.push({ id: node.id, name: node.name, reason });
    }
  }

  return result;
}

/**
 * 扫描并修复知识节点中缺失的 embedding
 * @returns 修复统计
 */
export async function repairKnowledgeNodeEmbeddings(
  nodes: KnowledgeNode[],
  onProgress?: (current: number, total: number) => void
): Promise<EmbeddingRepairResult> {
  const result: EmbeddingRepairResult = {
    repaired: 0,
    failed: 0,
    alreadyValid: 0,
  };

  const toRepair = nodes.filter(n => !isValidEmbedding(n.embedding));
  const total = toRepair.length;

  for (let i = 0; i < toRepair.length; i++) {
    const node = toRepair[i];
    const text = `${node.name}。${node.summary}${node.detail ? `。${node.detail}` : ''}`;

    try {
      const embedding = await generateEmbeddingSafe(text);
      if (embedding) {
        node.embedding = embedding;
        node.updatedAt = Date.now();
        result.repaired++;
      } else {
        result.failed++;
      }
    } catch {
      result.failed++;
    }

    onProgress?.(i + 1, total);
  }

  result.alreadyValid = nodes.length - toRepair.length;
  return result;
}
