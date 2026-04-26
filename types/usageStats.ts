/**
 * @file usageStats.ts
 * @description LLM API 调用流量统计类型定义
 */

export type UsageCallType = 'main' | 'polish' | 'outline' | 'extraction' | 'subAgent' | 'unknown';

export interface UsageRecord {
  id: string;
  timestamp: number;
  projectId?: string;
  sessionId?: string;
  callType: UsageCallType;
  model: string;
  provider: 'openai-compatible' | 'anthropic' | 'glm';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  durationMs: number;
  status: 'success' | 'error' | 'aborted';
  errorCategory?: string;
}

export interface UsageStatsSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCacheHitTokens: number;
  totalCacheMissTokens: number;
  cacheHitRate: number;
  avgDurationMs: number;
  byModel: Record<string, { calls: number; tokens: number }>;
  byType: Record<string, { calls: number; tokens: number }>;
  byDay: Record<string, { calls: number; tokens: number }>;
}
