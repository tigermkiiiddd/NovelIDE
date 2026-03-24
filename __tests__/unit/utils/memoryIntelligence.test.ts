import { LongTermMemory } from '../../../types';
import {
  applyMemoryEvent,
  createMemoryMetadata,
  getMemoryDynamicState,
  normalizeMemory,
  scoreMemoryRecall,
} from '../../../utils/memoryIntelligence';

const NOW = new Date('2026-03-20T12:00:00Z').getTime();

const createMemory = (overrides: Partial<LongTermMemory> = {}): LongTermMemory => {
  const importance = overrides.importance || 'important';
  const isResident = overrides.isResident ?? false;
  const metadata =
    overrides.metadata ||
    createMemoryMetadata(importance, isResident, 'user', NOW - 24 * 60 * 60 * 1000);

  return {
    id: overrides.id || 'memory-1',
    name: overrides.name || '主角原则',
    type: overrides.type || 'setting',
    tags: overrides.tags || ['主角'],
    keywords: overrides.keywords || ['底线', '原则'],
    summary: overrides.summary || '主角不会主动背叛同伴。',
    content: overrides.content || '核心规则：主角绝不为了利益主动背叛同伴。',
    importance,
    isResident,
    relatedMemories: overrides.relatedMemories || [],
    metadata,
  };
};

describe('memoryIntelligence', () => {
  it('normalizes legacy memories into adaptive metadata', () => {
    const legacyMemory = {
      ...createMemory(),
      metadata: {
        createdAt: NOW - 48 * 60 * 60 * 1000,
        updatedAt: NOW - 48 * 60 * 60 * 1000,
        source: 'user' as const,
      },
    } as LongTermMemory;

    const normalized = normalizeMemory(legacyMemory, NOW);

    expect(normalized.metadata.lastAccessedAt).toBeGreaterThan(0);
    expect(normalized.metadata.reviewIntervalHours).toBeGreaterThan(0);
    expect(normalized.metadata.activation).toBeGreaterThan(0);
    expect(normalized.metadata.strength).toBeGreaterThan(0);
  });

  it('creates metadata with explicit source origin', () => {
    const metadata = createMemoryMetadata(
      'critical',
      true,
      'agent',
      { sourceKind: 'dialogue', sourceRef: 'msg-1', evidence: ['以后都用第一人称'] },
      NOW
    );

    expect(metadata.sourceKind).toBe('dialogue');
    expect(metadata.sourceRef).toBe('msg-1');
    expect(metadata.evidence).toEqual(['以后都用第一人称']);
  });

  it('reinforcing a memory increases its review interval and counters', () => {
    const base = createMemory({
      metadata: createMemoryMetadata('important', false, 'user', NOW - 24 * 60 * 60 * 1000),
    });

    const reinforced = applyMemoryEvent(base, 'reinforce', NOW);

    expect(reinforced.metadata.reinforceCount).toBe(base.metadata.reinforceCount + 1);
    expect(reinforced.metadata.reviewCount).toBe(base.metadata.reviewCount + 1);
    expect(reinforced.metadata.reviewIntervalHours).toBeGreaterThan(base.metadata.reviewIntervalHours);
    expect(reinforced.metadata.nextReviewAt).toBeGreaterThan(NOW);
  });

  it('scores active memories above stale ones for the same query', () => {
    const active = createMemory({
      id: 'active',
      isResident: true,
      metadata: {
        ...createMemoryMetadata('important', true, 'user', NOW - 24 * 60 * 60 * 1000),
        activation: 0.95,
        strength: 0.9,
        lastAccessedAt: NOW - 2 * 60 * 60 * 1000,
        lastReinforcedAt: NOW - 12 * 60 * 60 * 1000,
      },
    });

    const stale = createMemory({
      id: 'stale',
      isResident: false,
      metadata: {
        ...createMemoryMetadata('important', false, 'user', NOW - 24 * 60 * 60 * 1000),
        activation: 0.5,
        strength: 0.6,
        lastAccessedAt: NOW - 25 * 24 * 60 * 60 * 1000,
        lastReinforcedAt: NOW - 40 * 24 * 60 * 60 * 1000,
        nextReviewAt: NOW - 5 * 24 * 60 * 60 * 1000,
      },
    });

    const activeScore = scoreMemoryRecall(active, '主角底线', NOW);
    const staleScore = scoreMemoryRecall(stale, '主角底线', NOW);
    const staleState = getMemoryDynamicState(stale, NOW);

    expect(activeScore.total).toBeGreaterThan(staleScore.total);
    expect(staleState.state).toBe('needs_review');
  });
});
