/**
 * @file agentMemoryDomain.ts
 * @description 自进化记忆领域逻辑 — 查询、筛选、聚合辅助函数
 *
 * 为 agentMemoryStore 提供高级查询能力，供 evolutionTools 和 prompt 注入使用。
 */

import type {
  AgentMemoryEntry,
  AgentMemoryType,
  AgentMemoryImportance,
  SessionSummary,
} from '../types/agentMemory';

// ==================== 记忆查询 ====================

/** 按类型筛选 */
export const filterByType = (
  entries: AgentMemoryEntry[],
  type: AgentMemoryType,
): AgentMemoryEntry[] => entries.filter((e) => e.type === type);

/** 按重要性筛选 */
export const filterByImportance = (
  entries: AgentMemoryEntry[],
  minImportance: AgentMemoryImportance,
): AgentMemoryEntry[] => {
  const levels: Record<AgentMemoryImportance, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const threshold = levels[minImportance];
  return entries.filter((e) => (levels[e.importance] ?? 3) <= threshold);
};

/** 按关键字搜索（content + context + tags） */
export const searchByKeyword = (
  entries: AgentMemoryEntry[],
  keyword: string,
): AgentMemoryEntry[] => {
  const kw = keyword.toLowerCase();
  return entries.filter(
    (e) =>
      e.content.toLowerCase().includes(kw) ||
      e.context?.toLowerCase().includes(kw) ||
      e.relatedSkills?.some((t) => t.toLowerCase().includes(kw)),
  );
};

/** 按关联技能搜索 */
export const filterBySkill = (
  entries: AgentMemoryEntry[],
  skillName: string,
): AgentMemoryEntry[] =>
  entries.filter((e) => e.relatedSkills?.includes(skillName));

// ==================== 排序 & 聚合 ====================

/** 按重要性排序（critical → low），同级按时间倒序 */
export const sortByImportance = (
  entries: AgentMemoryEntry[],
): AgentMemoryEntry[] => {
  const levels: Record<AgentMemoryImportance, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...entries].sort((a, b) => {
    const diff = (levels[a.importance] ?? 3) - (levels[b.importance] ?? 3);
    if (diff !== 0) return diff;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
};

/** 获取 Top N 最重要记忆（用于 prompt 注入） */
export const getTopMemories = (
  entries: AgentMemoryEntry[],
  n: number = 10,
  minImportance: AgentMemoryImportance = 'high',
): AgentMemoryEntry[] => {
  const filtered = filterByImportance(entries, minImportance);
  return sortByImportance(filtered).slice(0, n);
};

/** 按类型统计数量 */
export const countByType = (
  entries: AgentMemoryEntry[],
): Record<AgentMemoryType, number> => {
  const counts: Record<string, number> = {
    insight: 0,
    pattern: 0,
    correction: 0,
    workflow: 0,
    preference: 0,
  };
  for (const e of entries) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return counts as Record<AgentMemoryType, number>;
};

// ==================== 记忆格式化（用于 prompt） ====================

const TYPE_EMOJI: Record<AgentMemoryType, string> = {
  insight: '\u{1F4A1}',
  pattern: '\u{1F504}',
  correction: '\u{26A0}\u{FE0F}',
  workflow: '\u{1F4CB}',
  preference: '\u{2764}\u{FE0F}',
};

/** 格式化为 prompt 可注入的文本 */
export const formatMemoriesForPrompt = (
  entries: AgentMemoryEntry[],
  maxItems: number = 10,
): string => {
  if (entries.length === 0) return '(暂无自进化记忆)';

  const top = getTopMemories(entries, maxItems);
  const lines = top.map(
    (m) => `- ${TYPE_EMOJI[m.type] || '\u{1F4DD}'} [${m.type}] ${m.content}`,
  );
  return `共 ${entries.length} 条记忆，展示最重要的 ${top.length} 条：\n${lines.join('\n')}`;
};

// ==================== 会话摘要辅助 ====================

/** 获取最近 N 条会话摘要 */
export const getRecentSummaries = (
  summaries: SessionSummary[],
  n: number = 5,
): SessionSummary[] =>
  [...summaries].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, n);

/** 格式化会话摘要 */
export const formatSessionSummary = (summary: SessionSummary): string => {
  const decisions = summary.keyDecisions?.length
    ? `\n  关键决策: ${summary.keyDecisions.join('; ')}`
    : '';
  const unresolved = summary.unresolvedTopics?.length
    ? `\n  未完成: ${summary.unresolvedTopics.join('; ')}`
    : '';
  return `[${summary.sessionId}] ${summary.summary}${decisions}${unresolved}`;
};
