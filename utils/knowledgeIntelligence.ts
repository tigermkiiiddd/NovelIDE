/**
 * @file knowledgeIntelligence.ts
 * @description 知识图谱节点的记忆智能算法 - 激活度衰减、间隔重复
 */

import { KnowledgeNode, KnowledgeNodeMetadata, KnowledgeNodeDynamicState } from '../types';

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

export const calculateReviewIntervalHours = (
  importance: NodeImportance,
  reviewCount: number,
  reinforceCount: number
): number => {
  const base = BASE_REVIEW_INTERVAL_HOURS[importance];
  const steps = Math.min(6, reviewCount + reinforceCount);
  const interval = base * Math.pow(1.8, steps);
  return Math.round(Math.min(MAX_REVIEW_INTERVAL_HOURS[importance], interval));
};

export const createKnowledgeNodeMetadata = (
  importance: NodeImportance,
  now = Date.now()
): KnowledgeNodeMetadata => {
  const reviewIntervalHours = calculateReviewIntervalHours(importance, 0, 0);

  return {
    lastAccessedAt: now,
    lastRecalledAt: now,
    lastReinforcedAt: now,
    recallCount: 0,
    reinforceCount: 0,
    reviewCount: 0,
    activation: BASE_ACTIVATION[importance],
    strength: BASE_STRENGTH[importance],
    reviewIntervalHours,
    nextReviewAt: now + reviewIntervalHours * HOUR_MS,
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
  const reinforceAnchor = Math.max(metadata.lastReinforcedAt, node.createdAt);

  const hoursSinceAccess = Math.max(0, (now - accessAnchor) / HOUR_MS);
  const hoursSinceReinforced = Math.max(0, (now - reinforceAnchor) / HOUR_MS);

  const activationHalfLife =
    ACTIVATION_HALF_LIFE_HOURS[node.importance] *
    (1 + metadata.reinforceCount * 0.25 + metadata.recallCount * 0.04);

  const strengthHalfLife =
    STRENGTH_HALF_LIFE_HOURS[node.importance] *
    (1 + metadata.reinforceCount * 0.4 + metadata.reviewCount * 0.25);

  const activation = clamp(metadata.activation * Math.exp(-hoursSinceAccess / activationHalfLife));
  const strength = clamp(metadata.strength * Math.exp(-hoursSinceReinforced / strengthHalfLife));
  const isDueForReview = now >= metadata.nextReviewAt;

  let reviewUrgency = 0;
  if (isDueForReview) {
    const overdueHours = (now - metadata.nextReviewAt) / HOUR_MS;
    reviewUrgency = clamp(0.45 + overdueHours / Math.max(24, metadata.reviewIntervalHours));
  } else {
    const untilReview = metadata.nextReviewAt - now;
    const reviewWindow = Math.max(metadata.reviewIntervalHours * HOUR_MS, DAY_MS);
    reviewUrgency = clamp(1 - untilReview / reviewWindow);
  }

  let state: KnowledgeNodeDynamicState['state'] = 'cooling';
  if (isDueForReview && activation < 0.68) {
    state = 'needs_review';
  } else if (activation >= 0.78) {
    state = 'active';
  } else if (strength >= 0.72) {
    state = 'stable';
  }

  return {
    activation,
    strength,
    reviewUrgency,
    isDueForReview,
    nextReviewAt: metadata.nextReviewAt,
    hoursSinceAccess,
    state,
  };
};

export const applyKnowledgeNodeEvent = (
  node: KnowledgeNode,
  event: 'recall' | 'reinforce',
  now = Date.now()
): KnowledgeNode => {
  // 如果没有 metadata，先初始化
  const currentMetadata = node.metadata ?? createKnowledgeNodeMetadata(node.importance, now);
  const dynamic = getKnowledgeNodeDynamicState({ ...node, metadata: currentMetadata }, now);

  const nextReviewCount =
    event === 'reinforce' ? currentMetadata.reviewCount + 1 : currentMetadata.reviewCount;
  const nextReinforceCount =
    event === 'reinforce' ? currentMetadata.reinforceCount + 1 : currentMetadata.reinforceCount;

  const reviewIntervalHours =
    event === 'reinforce'
      ? calculateReviewIntervalHours(node.importance, nextReviewCount, nextReinforceCount)
      : currentMetadata.reviewIntervalHours;

  const activationDelta = event === 'reinforce' ? 0.22 : 0.12;
  const strengthDelta = event === 'reinforce' ? 0.15 : 0.05;

  return {
    ...node,
    updatedAt: now,
    metadata: {
      ...currentMetadata,
      lastAccessedAt: now,
      lastRecalledAt: event === 'recall' ? now : currentMetadata.lastRecalledAt,
      lastReinforcedAt: event === 'reinforce' ? now : currentMetadata.lastReinforcedAt,
      recallCount: currentMetadata.recallCount + (event === 'recall' ? 1 : 0),
      reinforceCount: nextReinforceCount,
      reviewCount: nextReviewCount,
      activation: clamp(Math.max(dynamic.activation, currentMetadata.activation) + activationDelta),
      strength: clamp(Math.max(dynamic.strength, currentMetadata.strength) + strengthDelta),
      reviewIntervalHours,
      nextReviewAt:
        event === 'reinforce'
          ? now + reviewIntervalHours * HOUR_MS
          : currentMetadata.nextReviewAt,
    },
  };
};

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
  now = Date.now()
): { lexical: number; importance: number; activation: number; strength: number; review: number; total: number } => {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { lexical: 0, importance: 0, activation: 0, strength: 0, review: 0, total: 0 };

  let lexical = 0;
  lexical += scoreField(node.name, tokens, 24, 12);
  lexical += (node.tags || []).reduce((sum, tag) => sum + scoreField(tag, tokens, 20, 10), 0);
  lexical += scoreField(node.summary, tokens, 12, 5);
  lexical += scoreField(node.detail || '', tokens, 8, 3);

  const importance = IMPORTANCE_WEIGHTS[node.importance];

  const dynamic = getKnowledgeNodeDynamicState(node, now);
  const activation = dynamic.activation * 15;
  const strength = dynamic.strength * 10;
  const review = dynamic.isDueForReview ? 4 + dynamic.reviewUrgency * 6 : dynamic.reviewUrgency * 2;

  const total = lexical + importance + activation + strength + review;

  return { lexical, importance, activation, strength, review, total };
};

export const sortKnowledgeNodesForPrompt = (nodes: KnowledgeNode[], now = Date.now()): KnowledgeNode[] => {
  return [...nodes].sort((left, right) => {
    const leftScore = scoreKnowledgeNodeRecall(left, left.name, now).total;
    const rightScore = scoreKnowledgeNodeRecall(right, right.name, now).total;
    return rightScore - leftScore;
  });
};
