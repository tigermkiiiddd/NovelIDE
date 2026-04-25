/**
 * @file usageStatsStore.ts
 * @description LLM API 调用流量统计 Store
 */

import { create } from 'zustand';
import { UsageRecord, UsageStatsSummary, UsageCallType } from '../types/usageStats';
import { dbAPI } from '../services/persistence';

// 保留最近 90 天的记录
const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

interface UsageStatsState {
  records: UsageRecord[];
  isLoaded: boolean;

  // Actions
  addRecord: (record: UsageRecord) => void;
  loadRecords: () => Promise<void>;
  clearRecords: () => void;
  getSummary: () => UsageStatsSummary;
  getRecentRecords: (limit?: number) => UsageRecord[];
  getRecordsByDateRange: (start: number, end: number) => UsageRecord[];
}

// 简单的 debounce 工具函数
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const persistRecords = async (records: UsageRecord[]) => {
  await dbAPI.saveUsageStats({ records, lastUpdated: Date.now() });
};

const debouncedPersist = debounce(persistRecords, 1000);

function cleanupOldRecords(records: UsageRecord[]): UsageRecord[] {
  const cutoff = Date.now() - RETENTION_MS;
  return records.filter(r => r.timestamp >= cutoff);
}

function computeSummary(records: UsageRecord[]): UsageStatsSummary {
  const byModel: Record<string, { calls: number; tokens: number }> = {};
  const byType: Record<string, { calls: number; tokens: number }> = {};
  const byDay: Record<string, { calls: number; tokens: number }> = {};

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalDuration = 0;

  for (const r of records) {
    totalPromptTokens += r.promptTokens;
    totalCompletionTokens += r.completionTokens;
    totalDuration += r.durationMs;

    // byModel
    const modelKey = r.model || 'unknown';
    if (!byModel[modelKey]) byModel[modelKey] = { calls: 0, tokens: 0 };
    byModel[modelKey].calls++;
    byModel[modelKey].tokens += r.totalTokens;

    // byType
    const typeKey = r.callType || 'unknown';
    if (!byType[typeKey]) byType[typeKey] = { calls: 0, tokens: 0 };
    byType[typeKey].calls++;
    byType[typeKey].tokens += r.totalTokens;

    // byDay
    const day = new Date(r.timestamp).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { calls: 0, tokens: 0 };
    byDay[day].calls++;
    byDay[day].tokens += r.totalTokens;
  }

  return {
    totalCalls: records.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    avgDurationMs: records.length > 0 ? Math.round(totalDuration / records.length) : 0,
    byModel,
    byType,
    byDay,
  };
}

export const useUsageStatsStore = create<UsageStatsState>((set, get) => ({
  records: [],
  isLoaded: false,

  addRecord: (record: UsageRecord) => {
    set((state) => {
      const newRecords = cleanupOldRecords([record, ...state.records]);
      debouncedPersist(newRecords);
      return { records: newRecords };
    });
  },

  loadRecords: async () => {
    try {
      const data = await dbAPI.getUsageStats();
      if (data && Array.isArray(data.records)) {
        const cleaned = cleanupOldRecords(data.records as UsageRecord[]);
        set({ records: cleaned, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (e) {
      console.error('[UsageStatsStore] 加载记录失败:', e);
      set({ isLoaded: true });
    }
  },

  clearRecords: () => {
    set({ records: [] });
    dbAPI.clearUsageStats();
  },

  getSummary: () => computeSummary(get().records),

  getRecentRecords: (limit = 20) => {
    return get().records.slice(0, limit);
  },

  getRecordsByDateRange: (start: number, end: number) => {
    return get().records.filter(r => r.timestamp >= start && r.timestamp <= end);
  },
}));

// 导出辅助函数供非 React 上下文使用
export { computeSummary, cleanupOldRecords };
