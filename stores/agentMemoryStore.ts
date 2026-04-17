/**
 * @file agentMemoryStore.ts
 * @description Agent 自进化记忆状态管理 — 跨项目持久化
 *
 * 职责：
 * 1. 管理 Agent 的个人记忆（insight / pattern / correction / workflow / preference）
 * 2. 管理短期跨会话记忆（recentSessions）
 * 3. 持久化到 IndexedDB（跨项目共享，不绑 project ID）
 * 4. 提供搜索 / CRUD / 自动过期清理能力
 *
 * 设计参考：docs/evolution-memory-design.md
 */

import { create } from 'zustand';
import { initDB } from '../services/persistence';

// ============================================
// 类型定义
// ============================================

/** Agent 记忆条目类型 */
export type AgentMemoryType = 'insight' | 'pattern' | 'correction' | 'workflow' | 'preference';

/** Agent 记忆重要程度 */
export type AgentMemoryImportance = 'low' | 'medium' | 'high' | 'critical';

/** Agent 记忆条目 */
export interface AgentMemoryEntry {
  id: string;
  type: AgentMemoryType;
  content: string;           // 记忆内容
  context: string;           // 触发上下文（用户说了什么/做了什么）
  relatedSkills?: string[];  // 关联的技能名
  projectGenre?: string;     // 来自哪个项目类型
  importance: AgentMemoryImportance;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

/** 会话摘要（短期跨会话记忆） */
export interface SessionSummary {
  sessionId: string;
  projectId: string;
  summary: string;              // 本次会话做了什么
  keyDecisions: string[];       // 关键决策
  unresolvedTopics: string[];   // 未完成的话题
  timestamp: number;
}

// ============================================
// 持久化层（专用 IndexedDB store，不绑项目）
// ============================================

const AGENT_MEMORY_STORE = 'agentMemories';
const SESSION_SUMMARY_STORE = 'agentSessionSummaries';
const GLOBAL_SETTINGS_STORE = 'settings'; // 复用已有 settings store

/** 保存所有记忆条目到 IndexedDB */
const persistEntries = async (entries: AgentMemoryEntry[]) => {
  try {
    const db = await initDB();
    const tx = db.transaction(AGENT_MEMORY_STORE as any, 'readwrite');
    const store = tx.objectStore(AGENT_MEMORY_STORE);

    // 清空旧数据后写入
    await store.clear();
    for (const entry of entries) {
      await store.put(entry as any);
    }
    await tx.done;
  } catch (error) {
    // 如果 store 不存在（DB 版本未升级），降级到 settings store
    console.warn('[AgentMemoryStore] 专用表写入失败，降级到 settings:', error);
    try {
      const db = await initDB();
      await db.put(GLOBAL_SETTINGS_STORE, entries, 'agent-memories');
    } catch (fallbackError) {
      console.error('[AgentMemoryStore] 降级持久化也失败:', fallbackError);
    }
  }
};

/** 从 IndexedDB 加载所有记忆条目 */
const loadEntries = async (): Promise<AgentMemoryEntry[]> => {
  try {
    const db = await initDB();
    // 尝试从专用表读取
    if (db.objectStoreNames?.contains(AGENT_MEMORY_STORE)) {
      const all = await db.getAll(AGENT_MEMORY_STORE);
      if (all && all.length > 0) return all as unknown as AgentMemoryEntry[];
    }
  } catch {
    // 降级
  }

  try {
    const db = await initDB();
    const data = await db.get(GLOBAL_SETTINGS_STORE, 'agent-memories');
    if (Array.isArray(data) && data.length > 0) return data as AgentMemoryEntry[];
  } catch (error) {
    console.error('[AgentMemoryStore] 加载记忆失败:', error);
  }

  return [];
};

/** 保存会话摘要列表到 IndexedDB */
const persistSessionSummaries = async (summaries: SessionSummary[]) => {
  try {
    const db = await initDB();
    if (db.objectStoreNames?.contains(SESSION_SUMMARY_STORE)) {
      const tx = db.transaction(SESSION_SUMMARY_STORE as any, 'readwrite');
      const store = tx.objectStore(SESSION_SUMMARY_STORE);
      await store.clear();
      for (const s of summaries) {
        await store.put(s);
      }
      await tx.done;
      return;
    }
  } catch {
    // 降级
  }

  try {
    const db = await initDB();
    await db.put(GLOBAL_SETTINGS_STORE, summaries, 'agent-session-summaries');
  } catch (error) {
    console.error('[AgentMemoryStore] 会话摘要持久化失败:', error);
  }
};

/** 从 IndexedDB 加载会话摘要 */
const loadSessionSummaries = async (): Promise<SessionSummary[]> => {
  try {
    const db = await initDB();
    if (db.objectStoreNames?.contains(SESSION_SUMMARY_STORE)) {
      const all = await db.getAll(SESSION_SUMMARY_STORE);
      if (all && all.length > 0) return all as unknown as SessionSummary[];
    }
  } catch {
    // 降级
  }

  try {
    const db = await initDB();
    const data = await db.get(GLOBAL_SETTINGS_STORE, 'agent-session-summaries');
    if (Array.isArray(data)) return data as SessionSummary[];
  } catch {
    // ignore
  }

  return [];
};

// ============================================
// 辅助函数
// ============================================

const generateId = () =>
  `am-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** 自动过期清理阈值（30天未访问的 low/medium 条目） */
const EXPIRY_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** 保留最近会话摘要数量 */
const MAX_SESSION_SUMMARIES = 10;

/** 按重要性排序权重 */
const IMPORTANCE_WEIGHT: Record<AgentMemoryImportance, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ============================================
// Store 接口
// ============================================

export interface AgentMemoryState {
  // 数据
  entries: AgentMemoryEntry[];
  recentSessions: SessionSummary[];

  // 加载状态
  isLoaded: boolean;
  isLoading: boolean;

  // CRUD 操作
  addEntry: (entry: Omit<AgentMemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>) => AgentMemoryEntry;
  updateEntry: (id: string, updates: Partial<Pick<AgentMemoryEntry, 'content' | 'context' | 'importance' | 'relatedSkills' | 'projectGenre'>>) => void;
  deleteEntry: (id: string) => void;

  // 会话摘要
  addSessionSummary: (summary: Omit<SessionSummary, 'timestamp'>) => void;
  getRecentSessionSummaries: (limit?: number) => SessionSummary[];

  // 查询
  searchEntries: (query: string) => AgentMemoryEntry[];
  getEntriesByType: (type: AgentMemoryType) => AgentMemoryEntry[];
  getEntriesByImportance: (importance: AgentMemoryImportance) => AgentMemoryEntry[];
  getEntryById: (id: string) => AgentMemoryEntry | undefined;
  touchEntry: (id: string) => void; // 标记已访问

  // 编译为 prompt 片段
  getCompiledMemories: (maxEntries?: number) => string;

  // 生命周期
  load: () => Promise<void>;
  persist: () => Promise<void>;
  cleanup: () => number; // 返回清理的条目数
  reset: () => void;
}

// ============================================
// Store 创建
// ============================================

const initialState = {
  entries: [] as AgentMemoryEntry[],
  recentSessions: [] as SessionSummary[],
  isLoaded: false,
  isLoading: false,
};

export const useAgentMemoryStore = create<AgentMemoryState>((set, get) => ({
  ...initialState,

  // ============================================
  // CRUD
  // ============================================

  addEntry: (partial) => {
    const now = Date.now();
    const entry: AgentMemoryEntry = {
      ...partial,
      id: generateId(),
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
    };

    set((state) => ({
      entries: [entry, ...state.entries],
    }));

    // 异步持久化
    setTimeout(() => get().persist(), 0);

    return entry;
  },

  updateEntry: (id, updates) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, ...updates, accessedAt: Date.now() } : e
      ),
    }));
    setTimeout(() => get().persist(), 0);
  },

  deleteEntry: (id) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
    }));
    setTimeout(() => get().persist(), 0);
  },

  // ============================================
  // 会话摘要
  // ============================================

  addSessionSummary: (partial) => {
    const summary: SessionSummary = {
      ...partial,
      timestamp: Date.now(),
    };

    set((state) => {
      const updated = [summary, ...state.recentSessions].slice(0, MAX_SESSION_SUMMARIES);
      return { recentSessions: updated };
    });

    setTimeout(() => {
      persistSessionSummaries(get().recentSessions).catch((err) =>
        console.error('[AgentMemoryStore] 会话摘要保存失败:', err)
      );
    }, 0);
  },

  getRecentSessionSummaries: (limit = 5) => {
    return get().recentSessions.slice(0, limit);
  },

  // ============================================
  // 查询
  // ============================================

  searchEntries: (query: string) => {
    if (!query.trim()) return get().entries;

    const q = query.toLowerCase();
    return get().entries.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        e.context.toLowerCase().includes(q) ||
        e.relatedSkills?.some((s) => s.toLowerCase().includes(q)) ||
        e.projectGenre?.toLowerCase().includes(q)
    );
  },

  getEntriesByType: (type) => get().entries.filter((e) => e.type === type),

  getEntriesByImportance: (importance) =>
    get().entries.filter((e) => e.importance === importance),

  getEntryById: (id) => get().entries.find((e) => e.id === id),

  touchEntry: (id) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? { ...e, accessedAt: Date.now(), accessCount: e.accessCount + 1 }
          : e
      ),
    }));
  },

  // ============================================
  // Prompt 编译
  // ============================================

  getCompiledMemories: (maxEntries = 20) => {
    const { entries } = get();
    if (entries.length === 0) return '';

    // 按重要程度排序，同级别按最近访问排序
    const sorted = [...entries]
      .sort((a, b) => {
        const weightDiff = IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance];
        if (weightDiff !== 0) return weightDiff;
        return b.accessedAt - a.accessedAt;
      })
      .slice(0, maxEntries);

    const lines = sorted.map((e) => {
      const typeLabel = {
        insight: '💡 洞察',
        pattern: '🔄 范式',
        correction: '⚠️ 纠正',
        workflow: '📋 流程',
        preference: '👤 偏好',
      }[e.type];

      return `[${typeLabel}] ${e.content}${e.context ? ` (来源: ${e.context.slice(0, 80)})` : ''}`;
    });

    return `## 自进化记忆\n\n${lines.join('\n')}`;
  },

  // ============================================
  // 生命周期
  // ============================================

  load: async () => {
    if (get().isLoading || get().isLoaded) return;
    set({ isLoading: true });

    try {
      const [entries, summaries] = await Promise.all([
        loadEntries(),
        loadSessionSummaries(),
      ]);

      set({
        entries,
        recentSessions: summaries.slice(0, MAX_SESSION_SUMMARIES),
        isLoaded: true,
        isLoading: false,
      });

      console.log(`[AgentMemoryStore] 加载完成: ${entries.length} 条记忆, ${summaries.length} 条会话摘要`);
    } catch (error) {
      console.error('[AgentMemoryStore] 加载失败:', error);
      set({ isLoaded: true, isLoading: false });
    }
  },

  persist: async () => {
    const { entries } = get();
    try {
      await persistEntries(entries);
    } catch (error) {
      console.error('[AgentMemoryStore] 持久化失败:', error);
    }
  },

  cleanup: () => {
    const now = Date.now();
    let removedCount = 0;

    set((state) => {
      const remaining = state.entries.filter((e) => {
        // critical / high 永不过期
        if (e.importance === 'critical' || e.importance === 'high') return true;
        // low / medium 30天未访问则过期
        if (now - e.accessedAt > EXPIRY_THRESHOLD_MS) {
          removedCount++;
          return false;
        }
        return true;
      });

      return { entries: remaining };
    });

    if (removedCount > 0) {
      setTimeout(() => get().persist(), 0);
      console.log(`[AgentMemoryStore] 清理了 ${removedCount} 条过期记忆`);
    }

    return removedCount;
  },

  reset: () => {
    set(initialState);
  },
}));

export default useAgentMemoryStore;
