/**
 * @file knowledgeIntelligence.ts
 * @description 知识图谱节点的记忆智能算法 - 激活度衰减、间隔重复
 */

import { KnowledgeNode, KnowledgeNodeMetadata, KnowledgeNodeDynamicState } from '../types';
import { cosineSimilarity } from '../domains/memory/embeddingService';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type NodeImportance = KnowledgeNode['importance'];

// ============================================
// 基础参数
// ============================================

const BASE_ACTIVATION: Record<NodeImportance, number> = {
  critical: 0.92,
  important: 0.74,
  normal: 0.56,
};

const BASE_STRENGTH: Record<NodeImportance, number> = {
  critical: 0.95,
  important: 0.78,
  normal: 0.62,
};

const BASE_REVIEW_INTERVAL_HOURS: Record<NodeImportance, number> = {
  critical: 24,
  important: 72,
  normal: 168,
};

const MAX_REVIEW_INTERVAL_HOURS: Record<NodeImportance, number> = {
  critical: 24 * 120,
  important: 24 * 90,
  normal: 24 * 60,
};

const ACTIVATION_HALF_LIFE_HOURS: Record<NodeImportance, number> = {
  critical: 24 * 45,
  important: 24 * 21,
  normal: 24 * 10,
};

const STRENGTH_HALF_LIFE_HOURS: Record<NodeImportance, number> = {
  critical: 24 * 240,
  important: 24 * 120,
  normal: 24 * 60,
};

const IMPORTANCE_WEIGHTS: Record<NodeImportance, number> = {
  critical: 18,
  important: 10,
  normal: 4,
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

// ============================================
// 公共函数
// ============================================

export const createKnowledgeNodeMetadata = (
  importance: NodeImportance,
  now = Date.now()
): KnowledgeNodeMetadata => {
  return {
    lastAccessedAt: now,
    lastRecalledAt: now,
    lastReinforcedAt: now,
    recallCount: 0,
    reinforceCount: 0,
    reviewCount: 0,
    activation: BASE_ACTIVATION[importance],
    strength: BASE_STRENGTH[importance],
    reviewIntervalHours: BASE_REVIEW_INTERVAL_HOURS[importance],
    nextReviewAt: now + BASE_REVIEW_INTERVAL_HOURS[importance] * HOUR_MS,
  };
};

export const getKnowledgeNodeDynamicState = (
  node: KnowledgeNode,
  now = Date.now()
): KnowledgeNodeDynamicState => {
  const metadata = node.metadata;
  if (!metadata) {
    return {
      activation: 0,
      strength: 0,
      reviewUrgency: 0,
      isDueForReview: false,
      nextReviewAt: 0,
      hoursSinceAccess: 0,
      state: 'cooling',
    };
  }

  const accessAnchor = Math.max(metadata.lastAccessedAt, node.createdAt);
  const hoursSinceAccess = Math.max(0, (now - accessAnchor) / HOUR_MS);

  // activation 自然衰减（无人工复习干预，不依赖 reviewCount/reinforceCount）
  const activation = clamp(metadata.activation * Math.exp(-hoursSinceAccess / ACTIVATION_HALF_LIFE_HOURS[node.importance]));
  const strength = clamp(metadata.strength * Math.exp(-hoursSinceAccess / STRENGTH_HALF_LIFE_HOURS[node.importance]));

  const state = activation >= 0.78 ? 'active' : strength >= 0.72 ? 'stable' : 'cooling';

  return {
    activation,
    strength,
    reviewUrgency: 0,
    isDueForReview: false,
    nextReviewAt: metadata.nextReviewAt,
    hoursSinceAccess,
    state,
  };
};

// 注：recall/reinforce 人工复习机制已移除。activation 自然衰减，由查询频率自然激活。

// ============================================
// 评分算法
// ============================================

const tokenize = (text: string): string[] => {
  const lower = text.trim().toLowerCase();
  if (!lower) return [];

  const pieces = lower
    .split(/[\s,.;:!?，。；：！？、/\\|()[\]{}"'`~]+/)
    .filter(Boolean);

  const unique = new Set<string>([lower]);
  pieces.forEach((piece) => {
    if (piece.length >= 2) unique.add(piece);
  });

  return Array.from(unique);
};

const scoreField = (field: string, tokens: string[], exactWeight: number, tokenWeight: number): number => {
  if (!field) return 0;

  const normalized = field.toLowerCase();
  let score = 0;

  tokens.forEach((token) => {
    if (!token) return;
    if (normalized === token) {
      score += exactWeight;
      return;
    }
    if (normalized.includes(token)) {
      score += tokenWeight;
    }
  });

  return score;
};

export const scoreKnowledgeNodeRecall = (
  node: KnowledgeNode,
  query: string,
  now = Date.now(),
  queryEmbedding?: number[]
): { lexical: number; semantic: number; importance: number; activation: number; strength: number; review: number; total: number } => {
  const tokens = tokenize(query);
  if (tokens.length === 0 && !queryEmbedding) return { lexical: 0, semantic: 0, importance: 0, activation: 0, strength: 0, review: 0, total: 0 };

  let lexical = 0;
  if (tokens.length > 0) {
    lexical += scoreField(node.name, tokens, 24, 12);
    lexical += (node.tags || []).reduce((sum, tag) => sum + scoreField(tag, tokens, 20, 10), 0);
    lexical += scoreField(node.summary, tokens, 12, 5);
    lexical += scoreField(node.detail || '', tokens, 8, 3);
  }

  // 语义分数：query embedding vs node embedding
  let semantic = 0;
  if (queryEmbedding && node.embedding && node.embedding.length > 0) {
    const sim = cosineSimilarity(queryEmbedding, node.embedding);
    // 归一化到 0-30 范围（与 lexical 量级对齐）
    semantic = sim * 30;
  }

  const importance = IMPORTANCE_WEIGHTS[node.importance];

  const dynamic = getKnowledgeNodeDynamicState(node, now);
  const activation = dynamic.activation * 15;
  const strength = dynamic.strength * 10;

  const total = lexical + semantic + importance + activation + strength;

  return { lexical, semantic, importance, activation, strength, review: 0, total };
};

export const sortKnowledgeNodesForPrompt = (nodes: KnowledgeNode[], now = Date.now()): KnowledgeNode[] => {
  return [...nodes].sort((left, right) => {
    const leftScore = scoreKnowledgeNodeRecall(left, left.name, now).total;
    const rightScore = scoreKnowledgeNodeRecall(right, right.name, now).total;
    return rightScore - leftScore;
  });
};
