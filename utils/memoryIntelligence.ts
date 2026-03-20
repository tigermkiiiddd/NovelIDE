import { LongTermMemory, LongTermMemoryMetadata } from '../types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type MemoryImportance = LongTermMemory['importance'];
export type MemoryDynamicStateLabel = 'active' | 'stable' | 'cooling' | 'needs_review';

export interface MemoryDynamicState {
  activation: number;
  strength: number;
  reviewUrgency: number;
  isDueForReview: boolean;
  nextReviewAt: number;
  hoursSinceAccess: number;
  state: MemoryDynamicStateLabel;
}

export interface MemoryRecallScoreBreakdown {
  lexical: number;
  importance: number;
  activation: number;
  strength: number;
  resident: number;
  review: number;
  total: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const BASE_ACTIVATION: Record<MemoryImportance, number> = {
  critical: 0.92,
  important: 0.74,
  normal: 0.56,
};

const BASE_STRENGTH: Record<MemoryImportance, number> = {
  critical: 0.95,
  important: 0.78,
  normal: 0.62,
};

const BASE_REVIEW_INTERVAL_HOURS: Record<MemoryImportance, number> = {
  critical: 24,
  important: 72,
  normal: 168,
};

const MAX_REVIEW_INTERVAL_HOURS: Record<MemoryImportance, number> = {
  critical: 24 * 120,
  important: 24 * 90,
  normal: 24 * 60,
};

const ACTIVATION_HALF_LIFE_HOURS: Record<MemoryImportance, number> = {
  critical: 24 * 45,
  important: 24 * 21,
  normal: 24 * 10,
};

const STRENGTH_HALF_LIFE_HOURS: Record<MemoryImportance, number> = {
  critical: 24 * 240,
  important: 24 * 120,
  normal: 24 * 60,
};

const getImportanceWeight = (importance: MemoryImportance) => {
  switch (importance) {
    case 'critical':
      return 18;
    case 'important':
      return 10;
    default:
      return 4;
  }
};

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

const scoreField = (field: string, tokens: string[], exactWeight: number, tokenWeight: number) => {
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

const lexicalScore = (memory: LongTermMemory, query: string) => {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  let score = 0;

  score += scoreField(memory.name, tokens, 24, 12);
  score += memory.keywords.reduce((sum, keyword) => sum + scoreField(keyword, tokens, 20, 10), 0);
  score += memory.tags.reduce((sum, tag) => sum + scoreField(tag, tokens, 14, 7), 0);
  score += scoreField(memory.summary, tokens, 12, 5);
  score += scoreField(memory.content, tokens, 8, 3);

  return score;
};

export const calculateReviewIntervalHours = (
  importance: MemoryImportance,
  reviewCount: number,
  reinforceCount: number
) => {
  const base = BASE_REVIEW_INTERVAL_HOURS[importance];
  const steps = Math.min(6, reviewCount + reinforceCount);
  const interval = base * Math.pow(1.8, steps);
  return Math.round(Math.min(MAX_REVIEW_INTERVAL_HOURS[importance], interval));
};

export const createMemoryMetadata = (
  importance: MemoryImportance,
  isResident: boolean,
  source: 'user' | 'agent',
  origin: Partial<Pick<LongTermMemoryMetadata, 'sourceKind' | 'sourceRef' | 'evidence'>> = {},
  now = Date.now()
): LongTermMemoryMetadata => {
  const reviewIntervalHours = calculateReviewIntervalHours(importance, 0, 0);

  return {
    createdAt: now,
    updatedAt: now,
    source,
    sourceKind: origin.sourceKind ?? (source === 'user' ? 'manual' : 'dialogue'),
    sourceRef: origin.sourceRef,
    evidence: origin.evidence || [],
    lastAccessedAt: now,
    lastRecalledAt: now,
    lastReinforcedAt: now,
    recallCount: 0,
    reinforceCount: 0,
    reviewCount: 0,
    activation: clamp(BASE_ACTIVATION[importance] + (isResident ? 0.08 : 0)),
    strength: BASE_STRENGTH[importance],
    reviewIntervalHours,
    nextReviewAt: now + reviewIntervalHours * HOUR_MS,
  };
};

export const normalizeMemory = (memory: LongTermMemory, now = Date.now()): LongTermMemory => {
  const source = memory.metadata?.source ?? 'agent';
  const createdAt = memory.metadata?.createdAt ?? now;
  const reviewCount = memory.metadata?.reviewCount ?? 0;
  const reinforceCount = memory.metadata?.reinforceCount ?? 0;
  const reviewIntervalHours =
    memory.metadata?.reviewIntervalHours ??
    calculateReviewIntervalHours(memory.importance, reviewCount, reinforceCount);

  return {
    ...memory,
    metadata: {
      createdAt,
      updatedAt: memory.metadata?.updatedAt ?? createdAt,
      source,
      sourceKind: memory.metadata?.sourceKind ?? (source === 'user' ? 'manual' : 'dialogue'),
      sourceRef: memory.metadata?.sourceRef,
      evidence: memory.metadata?.evidence || [],
      lastAccessedAt: memory.metadata?.lastAccessedAt ?? createdAt,
      lastRecalledAt: memory.metadata?.lastRecalledAt ?? createdAt,
      lastReinforcedAt: memory.metadata?.lastReinforcedAt ?? createdAt,
      recallCount: memory.metadata?.recallCount ?? 0,
      reinforceCount,
      reviewCount,
      activation: clamp(
        memory.metadata?.activation ?? BASE_ACTIVATION[memory.importance] + (memory.isResident ? 0.08 : 0)
      ),
      strength: clamp(memory.metadata?.strength ?? BASE_STRENGTH[memory.importance]),
      reviewIntervalHours,
      nextReviewAt: memory.metadata?.nextReviewAt ?? createdAt + reviewIntervalHours * HOUR_MS,
    },
  };
};

export const getMemoryDynamicState = (memory: LongTermMemory, now = Date.now()): MemoryDynamicState => {
  const normalized = normalizeMemory(memory, now);

  const accessAnchor = Math.max(normalized.metadata.lastAccessedAt, normalized.metadata.createdAt);
  const reinforceAnchor = Math.max(normalized.metadata.lastReinforcedAt, normalized.metadata.createdAt);

  const hoursSinceAccess = Math.max(0, (now - accessAnchor) / HOUR_MS);
  const hoursSinceReinforced = Math.max(0, (now - reinforceAnchor) / HOUR_MS);

  const activationHalfLife =
    ACTIVATION_HALF_LIFE_HOURS[normalized.importance] *
    (1 + normalized.metadata.reinforceCount * 0.25 + normalized.metadata.recallCount * 0.04) *
    (normalized.isResident ? 1.2 : 1);

  const strengthHalfLife =
    STRENGTH_HALF_LIFE_HOURS[normalized.importance] *
    (1 + normalized.metadata.reinforceCount * 0.4 + normalized.metadata.reviewCount * 0.25);

  const activation = clamp(normalized.metadata.activation * Math.exp(-hoursSinceAccess / activationHalfLife));
  const strength = clamp(normalized.metadata.strength * Math.exp(-hoursSinceReinforced / strengthHalfLife));
  const isDueForReview = now >= normalized.metadata.nextReviewAt;

  let reviewUrgency = 0;
  if (isDueForReview) {
    const overdueHours = (now - normalized.metadata.nextReviewAt) / HOUR_MS;
    reviewUrgency = clamp(0.45 + overdueHours / Math.max(24, normalized.metadata.reviewIntervalHours));
  } else {
    const untilReview = normalized.metadata.nextReviewAt - now;
    const reviewWindow = Math.max(normalized.metadata.reviewIntervalHours * HOUR_MS, DAY_MS);
    reviewUrgency = clamp(1 - untilReview / reviewWindow);
  }

  let state: MemoryDynamicStateLabel = 'cooling';
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
    nextReviewAt: normalized.metadata.nextReviewAt,
    hoursSinceAccess,
    state,
  };
};

export const applyMemoryEvent = (
  memory: LongTermMemory,
  event: 'recall' | 'reinforce',
  now = Date.now()
): LongTermMemory => {
  const normalized = normalizeMemory(memory, now);
  const dynamic = getMemoryDynamicState(normalized, now);

  const nextReviewCount =
    event === 'reinforce' ? normalized.metadata.reviewCount + 1 : normalized.metadata.reviewCount;
  const nextReinforceCount =
    event === 'reinforce' ? normalized.metadata.reinforceCount + 1 : normalized.metadata.reinforceCount;
  const reviewIntervalHours =
    event === 'reinforce'
      ? calculateReviewIntervalHours(normalized.importance, nextReviewCount, nextReinforceCount)
      : normalized.metadata.reviewIntervalHours;

  const activationDelta = event === 'reinforce' ? 0.22 : 0.12;
  const strengthDelta = event === 'reinforce' ? 0.15 : 0.05;

  return {
    ...normalized,
    metadata: {
      ...normalized.metadata,
      updatedAt: now,
      lastAccessedAt: now,
      lastRecalledAt: event === 'recall' ? now : normalized.metadata.lastRecalledAt,
      lastReinforcedAt: event === 'reinforce' ? now : normalized.metadata.lastReinforcedAt,
      recallCount:
        normalized.metadata.recallCount + (event === 'recall' ? 1 : 0),
      reinforceCount: nextReinforceCount,
      reviewCount: nextReviewCount,
      activation: clamp(Math.max(dynamic.activation, normalized.metadata.activation) + activationDelta),
      strength: clamp(Math.max(dynamic.strength, normalized.metadata.strength) + strengthDelta),
      reviewIntervalHours,
      nextReviewAt:
        event === 'reinforce'
          ? now + reviewIntervalHours * HOUR_MS
          : normalized.metadata.nextReviewAt,
    },
  };
};

export const scoreMemoryRecall = (
  memory: LongTermMemory,
  query: string,
  now = Date.now()
): MemoryRecallScoreBreakdown => {
  const dynamic = getMemoryDynamicState(memory, now);
  const lexical = lexicalScore(memory, query);
  const importance = getImportanceWeight(memory.importance);
  const activation = dynamic.activation * 15;
  const strength = dynamic.strength * 10;
  const resident = memory.isResident ? 8 : 0;
  const review = dynamic.isDueForReview ? 4 + dynamic.reviewUrgency * 6 : dynamic.reviewUrgency * 2;
  const total = lexical + importance + activation + strength + resident + review;

  return {
    lexical,
    importance,
    activation,
    strength,
    resident,
    review,
    total,
  };
};

export const sortMemoriesForPrompt = (memories: LongTermMemory[], now = Date.now()) => {
  return [...memories].sort((left, right) => {
    const leftScore = scoreMemoryRecall(left, left.name, now).total;
    const rightScore = scoreMemoryRecall(right, right.name, now).total;
    return rightScore - leftScore;
  });
};

export const sortMemoriesForReview = (memories: LongTermMemory[], now = Date.now()) => {
  return [...memories].sort((left, right) => {
    const leftState = getMemoryDynamicState(left, now);
    const rightState = getMemoryDynamicState(right, now);

    if (leftState.isDueForReview !== rightState.isDueForReview) {
      return leftState.isDueForReview ? -1 : 1;
    }

    if (leftState.reviewUrgency !== rightState.reviewUrgency) {
      return rightState.reviewUrgency - leftState.reviewUrgency;
    }

    return left.metadata.updatedAt - right.metadata.updatedAt;
  });
};
