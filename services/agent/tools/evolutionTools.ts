/**
 * @file evolutionTools.ts
 * @description 自进化记忆 AI 工具 — agent 跨项目持久化记忆、技能进化、会话摘要
 *
 * 工具：
 *   manage_evolution  — 写入动作（record_insight / record_pattern / record_correction /
 *                        create_skill / optimize_skill / summarize_session）
 *   query_evolution   — 读取动作（recall / list）
 *
 * 设计文档：docs/evolution-memory-design.md
 * 类型定义：types/agentMemory.ts
 * 依赖 Store：stores/agentMemoryStore.ts
 */

import { ToolDefinition } from '../types';
import {
  AgentMemoryType,
  AgentMemoryImportance,
  AgentMemoryEntry,
  SessionSummary,
  EvolutionAction,
  EvolutionRecordParams,
  EvolutionRecallParams,
  EvolutionListParams,
  EvolutionCreateSkillParams,
  EvolutionOptimizeSkillParams,
  EvolutionSummarizeSessionParams,
} from '../../../types/agentMemory';

// ============================================
// 工具定义
// ============================================

/**
 * 查询自进化记忆
 */
export const queryEvolutionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_evolution',
    description: `【查询自进化记忆】搜索或列出 agent 的跨项目持久记忆。

## 记忆类型
- **insight**: 任务完成后总结的洞察（如「悬疑小说开场需在 500 字内设钩子」）
- **pattern**: 最佳工作范式（如「角色档案先初始化再写正文效率更高」）
- **correction**: 被用户纠正的内容（如「用户不喜欢用第二人称叙述」）
- **workflow**: 工作流程经验（如「先大纲后章节的节奏」）
- **preference**: 用户偏好（如「对话描写要自然，避免书面语」）

## 查询方式
1. **recall**: 按关键词搜索记忆（匹配 content / context）
2. **list**: 按类型或重要程度过滤列出

## 使用场景
- 开始新项目时，recall 相关记忆避免重复犯错
- 写作前查看相关 preference 和 correction
- 技能创建前查看已有的 insight 和 pattern`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '思考过程(用中文):为什么要查询自进化记忆？你在考虑什么？',
        },
        action: {
          type: 'string',
          enum: ['recall', 'list'],
          description: 'recall=关键词搜索, list=按条件列出',
        },
        // recall 参数
        query: {
          type: 'string',
          description: '搜索关键词（recall 时必填，匹配 content 和 context）',
        },
        // list / recall 共用过滤
        type: {
          type: 'string',
          enum: ['insight', 'pattern', 'correction', 'workflow', 'preference'],
          description: '按记忆类型过滤',
        },
        importance: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: '按重要程度过滤',
        },
        limit: {
          type: 'number',
          description: '返回数量上限（默认 20，最大 50）',
        },
      },
      required: ['thinking', 'action'],
    },
  },
};

/**
 * 管理自进化记忆（写入操作）
 */
export const manageEvolutionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_evolution',
    description: `【管理自进化记忆】记录洞察、工作范式、被纠正内容，或从积累的经验中创建/优化技能。

## ⚠️ 自进化铁律
- 记忆是跨项目持久的，不要记录项目特定的临时信息
- 只记录**真正有价值的经验**，不要记录琐碎细节
- correction 必须如实记录用户的原始反馈，不要改写

## 写入动作

### record_insight（记录洞察）
任务完成后主动调用。记录从任务中学到的通用经验。
示例：「长篇对话需要每 5 轮插入动作描写保持节奏」

### record_pattern（记录最佳范式）
发现高效的工作流程时记录。
示例：「先创建时间线事件再写章节草稿，一致性更好」

### record_correction（记录纠正）
被用户纠正时必须调用。原文记录用户反馈。
示例：「用户说：不要在叙事中混入作者评论」

### create_skill（创建技能）
当同一类 insight/pattern 积累 3 条以上时，可固化为正式技能文件。
需要指定技能名称、分类和描述。系统会从相关记忆中提取方法论生成技能。

### optimize_skill（优化技能）
基于使用经验，分析现有技能的不足并建议改进。
系统会搜索与该技能相关的所有记忆（correction/insight），生成优化建议。

### summarize_session（会话摘要）
会话结束时生成摘要，用于下次开新会话时保持上下文连续性。
记录本次会话做了什么、关键决策和未完成的话题。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '思考过程(用中文):为什么要执行这个动作？你观察到了什么规律或收到了什么反馈？',
        },
        action: {
          type: 'string',
          enum: [
            'record_insight',
            'record_pattern',
            'record_correction',
            'create_skill',
            'optimize_skill',
            'summarize_session',
          ],
          description: '要执行的动作',
        },
        // ─── record_insight / record_pattern / record_correction ───
        content: {
          type: 'string',
          description: '记忆内容（record_* 时必填）。简洁明确的一句话。',
        },
        context: {
          type: 'string',
          description: '触发上下文：用户说了什么 / 做了什么 / 什么任务场景',
        },
        memoryType: {
          type: 'string',
          enum: ['insight', 'pattern', 'correction', 'workflow', 'preference'],
          description: '记忆类型（record_* 时使用，默认跟随 action）',
        },
        importance: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: '重要程度（默认 medium）。被用户纠正用 high，关键发现用 high',
        },
        relatedSkills: {
          type: 'array',
          items: { type: 'string' },
          description: '关联的技能名称列表',
        },
        // ─── create_skill ───
        skillName: {
          type: 'string',
          description: '技能名称（create_skill 时必填，如「悬疑节奏控制」）',
        },
        skillCategory: {
          type: 'string',
          description: '技能分类目录（create_skill 时必填：创作/规划/设计/审核/补丁）',
        },
        skillDescription: {
          type: 'string',
          description: '技能描述（create_skill 时必填）',
        },
        sourceInsightIds: {
          type: 'array',
          items: { type: 'string' },
          description: '来源洞察 ID 列表（create_skill 时可选，不填则自动搜索相关记忆）',
        },
        // ─── optimize_skill ───
        targetSkillName: {
          type: 'string',
          description: '要优化的技能名称（optimize_skill 时必填）',
        },
        targetSkillCategory: {
          type: 'string',
          description: '技能分类目录（optimize_skill 时可选）',
        },
        // ─── summarize_session ───
        sessionId: {
          type: 'string',
          description: '会话 ID（summarize_session 时必填）',
        },
        projectId: {
          type: 'string',
          description: '项目 ID（summarize_session 时必填）',
        },
        summary: {
          type: 'string',
          description: '会话摘要（summarize_session 时必填）',
        },
        keyDecisions: {
          type: 'array',
          items: { type: 'string' },
          description: '关键决策列表（summarize_session 时可选）',
        },
        unresolvedTopics: {
          type: 'array',
          items: { type: 'string' },
          description: '未完成的话题列表（summarize_session 时可选）',
        },
      },
      required: ['thinking', 'action'],
    },
  },
};

// ============================================
// 执行函数
// ============================================

/**
 * 安全获取 agentMemoryStore。
 * Store 尚未创建时返回 null，工具函数会返回友好错误。
 */
const getStore = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../stores/agentMemoryStore') as {
      useAgentMemoryStore: { getState: () => any };
    };
    return mod.useAgentMemoryStore.getState();
  } catch {
    return null;
  }
};

// ─── query_evolution 执行 ────────────────────────────────

export const executeQueryEvolution = (args: {
  action: 'recall' | 'list';
  query?: string;
  type?: AgentMemoryType;
  importance?: AgentMemoryImportance;
  limit?: number;
}): string => {
  const store = getStore();
  if (!store) {
    return JSON.stringify({
      success: false,
      error: '自进化记忆系统尚未初始化（agentMemoryStore 未创建）',
    });
  }

  const limit = Math.min(args.limit || 20, 50);

  switch (args.action) {
    case 'recall': {
      if (!args.query?.trim()) {
        return JSON.stringify({ success: false, error: 'recall 需要提供 query 参数' });
      }
      let results = store.searchEntries(args.query);
      if (args.type) results = results.filter((m: any) => m.type === args.type);
      if (args.importance) results = results.filter((m: any) => m.importance === args.importance);
      results = results.slice(0, limit);

      if (results.length === 0) {
        return JSON.stringify({
          success: true,
          count: 0,
          results: [],
          hint: `未找到与「${args.query}」相关的记忆`,
        });
      }

      return JSON.stringify({
        success: true,
        count: results.length,
        results: results.map(formatMemoryEntry),
      });
    }

    case 'list': {
      let results = args.type ? store.getEntriesByType(args.type) : [...store.entries];
      if (args.importance) results = results.filter((m: any) => m.importance === args.importance);
      results = results.slice(0, limit);

      return JSON.stringify({
        success: true,
        count: results.length,
        results: results.map(formatMemoryEntry),
        stats: {
          totalMemories: store.entries.length,
          byType: countByType(store.entries),
        },
      });
    }

    default:
      return JSON.stringify({ success: false, error: `未知查询动作: ${args.action}` });
  }
};

// ─── manage_evolution 执行 ────────────────────────────────

export const executeManageEvolution = async (args: {
  action: EvolutionAction;
  // record fields
  content?: string;
  context?: string;
  memoryType?: AgentMemoryType;
  importance?: AgentMemoryImportance;
  relatedSkills?: string[];
  // create_skill fields
  skillName?: string;
  skillCategory?: string;
  skillDescription?: string;
  sourceInsightIds?: string[];
  // optimize_skill fields
  targetSkillName?: string;
  targetSkillCategory?: string;
  // summarize_session fields
  sessionId?: string;
  projectId?: string;
  summary?: string;
  keyDecisions?: string[];
  unresolvedTopics?: string[];
}): Promise<string> => {
  const store = getStore();
  if (!store) {
    return JSON.stringify({
      success: false,
      error: '自进化记忆系统尚未初始化（agentMemoryStore 未创建）',
    });
  }

  switch (args.action) {
    // ─── 记录类动作 ────────────────────────────────────
    case 'record_insight':
    case 'record_pattern':
    case 'record_correction': {
      if (!args.content?.trim()) {
        return JSON.stringify({ success: false, error: 'content 不能为空' });
      }

      const typeMap: Record<string, AgentMemoryType> = {
        record_insight: 'insight',
        record_pattern: 'pattern',
        record_correction: 'correction',
      };
      const memoryType = args.memoryType || typeMap[args.action] || 'insight';
      const importance = args.importance || (
        args.action === 'record_correction' ? 'high' : 'medium'
      );

      // 检查是否有重复内容（防止重复记录）
      const duplicate = store.entries.find(
        (m: AgentMemoryEntry) =>
          m.type === memoryType &&
          m.content.trim().toLowerCase() === args.content!.trim().toLowerCase(),
      );
      if (duplicate) {
        // 已有相同记忆，更新访问信息
        store.touchEntry(duplicate.id);
        return JSON.stringify({
          success: true,
          message: `该经验已记录过（ID: ${duplicate.id}），已更新访问信息`,
          id: duplicate.id,
          duplicate: true,
        });
      }

      const newEntry = store.addEntry({
        type: memoryType as any,
        content: args.content.trim(),
        context: args.context?.trim() || '',
        relatedSkills: args.relatedSkills,
        importance,
      });

      const actionLabels: Record<string, string> = {
        record_insight: '洞察',
        record_pattern: '工作范式',
        record_correction: '纠正记录',
      };

      return JSON.stringify({
        success: true,
        message: `${actionLabels[args.action]}已记录`,
        id: newEntry.id,
        type: newEntry.type,
        importance: newEntry.importance,
      });
    }

    // ─── 创建技能 ──────────────────────────────────────
    case 'create_skill': {
      if (!args.skillName?.trim()) {
        return JSON.stringify({ success: false, error: 'skillName 不能为空' });
      }
      if (!args.skillCategory?.trim()) {
        return JSON.stringify({ success: false, error: 'skillCategory 不能为空（创作/规划/设计/审核/补丁）' });
      }
      if (!args.skillDescription?.trim()) {
        return JSON.stringify({ success: false, error: 'skillDescription 不能为空' });
      }

      // 收集相关记忆作为素材
      let sourceMemories: AgentMemoryEntry[] = [];

      if (args.sourceInsightIds && args.sourceInsightIds.length > 0) {
        // 使用指定的 ID
        sourceMemories = store.entries.filter(
          (m: AgentMemoryEntry) => args.sourceInsightIds!.includes(m.id),
        );
      } else {
        // 自动搜索与技能名称/描述相关的 insight 和 pattern
        const keywords = [
          args.skillName,
          args.skillDescription,
          ...args.skillDescription.split(/[，,、\s]+/).filter((w: string) => w.length >= 2),
        ];
        for (const kw of keywords) {
          const found = store.searchEntries(kw).slice(0, 10);
          for (const m of found) {
            if ((m.type === 'insight' || m.type === 'pattern') && !sourceMemories.find((x: AgentMemoryEntry) => x.id === m.id)) {
              sourceMemories.push(m);
            }
          }
        }
        // 最多取 10 条最相关的
        sourceMemories = sourceMemories.slice(0, 10);
      }

      if (sourceMemories.length === 0) {
        return JSON.stringify({
          success: false,
          error: '未找到相关的 insight/pattern 记忆来生成技能。请先积累足够的经验记录。',
          hint: '建议先通过 record_insight/record_pattern 积累 3 条以上相关经验',
        });
      }

      // 标记源记忆的访问
      sourceMemories.forEach((m: AgentMemoryEntry) => store.touchEntry(m.id));

      // 生成技能文件内容模板
      const skillContent = generateSkillContent(
        args.skillName,
        args.skillDescription,
        args.skillCategory,
        sourceMemories,
      );

      return JSON.stringify({
        success: true,
        message: `技能「${args.skillName}」的内容模板已生成`,
        skill: {
          name: args.skillName,
          category: args.skillCategory,
          description: args.skillDescription,
          sourceMemoryCount: sourceMemories.length,
          sourceMemoryIds: sourceMemories.map((m: AgentMemoryEntry) => m.id),
          content: skillContent,
        },
        hint: '此技能内容需要通过 writeFile 工具写入到 98_技能配置/skills/ 目录下才能生效',
      });
    }

    // ─── 优化技能 ──────────────────────────────────────
    case 'optimize_skill': {
      if (!args.targetSkillName?.trim()) {
        return JSON.stringify({ success: false, error: 'targetSkillName 不能为空' });
      }

      // 搜索与该技能相关的所有记忆（特别是 correction 和 insight）
      const relatedMemories = store.searchEntries(args.targetSkillName).slice(0, 20);

      const corrections = relatedMemories.filter(
        (m: AgentMemoryEntry) => m.type === 'correction',
      );
      const insights = relatedMemories.filter(
        (m: AgentMemoryEntry) => m.type === 'insight' || m.type === 'pattern',
      );

      if (corrections.length === 0 && insights.length === 0) {
        return JSON.stringify({
          success: true,
          message: `未找到与「${args.targetSkillName}」相关的改进经验`,
          hint: '建议先通过 record_correction 或 record_insight 记录使用该技能时发现的问题',
        });
      }

      // 标记相关记忆的访问
      relatedMemories.forEach((m: AgentMemoryEntry) => store.touchEntry(m.id));

      // 生成优化建议
      const optimization = generateSkillOptimization(
        args.targetSkillName,
        corrections,
        insights,
      );

      return JSON.stringify({
        success: true,
        message: `已基于 ${corrections.length} 条纠正和 ${insights.length} 条洞察生成优化建议`,
        optimization,
        hint: '请根据建议修改对应的技能文件（通过 patchFile 或 writeFile）',
      });
    }

    // ─── 会话摘要 ──────────────────────────────────────
    case 'summarize_session': {
      if (!args.sessionId?.trim()) {
        return JSON.stringify({ success: false, error: 'sessionId 不能为空' });
      }
      if (!args.summary?.trim()) {
        return JSON.stringify({ success: false, error: 'summary 不能为空' });
      }

      const sessionSummary: SessionSummary = {
        sessionId: args.sessionId,
        projectId: args.projectId || '',
        summary: args.summary.trim(),
        keyDecisions: args.keyDecisions || [],
        unresolvedTopics: args.unresolvedTopics || [],
        timestamp: Date.now(),
      };

      // 默认保留最近 20 条会话摘要
      store.addSessionSummary(sessionSummary);

      return JSON.stringify({
        success: true,
        message: '会话摘要已保存',
        sessionId: args.sessionId,
        totalSessions: store.recentSessions.length,
      });
    }

    default:
      return JSON.stringify({ success: false, error: `未知动作: ${args.action}` });
  }
};

// ============================================
// 辅助函数
// ============================================

/** 格式化记忆条目为返回给 AI 的简洁对象 */
const formatMemoryEntry = (entry: AgentMemoryEntry) => ({
  id: entry.id,
  type: entry.type,
  content: entry.content,
  context: entry.context || undefined,
  importance: entry.importance,
  relatedSkills: entry.relatedSkills || undefined,
  projectGenre: entry.projectGenre || undefined,
  createdAt: entry.createdAt,
  accessedAt: entry.accessedAt,
  accessCount: entry.accessCount,
});

/** 按类型统计记忆数量 */
const countByType = (memories: AgentMemoryEntry[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const m of memories) {
    counts[m.type] = (counts[m.type] || 0) + 1;
  }
  return counts;
};

/** 从相关记忆生成技能文件内容 */
const generateSkillContent = (
  name: string,
  description: string,
  category: string,
  sources: AgentMemoryEntry[],
): string => {
  const lines: string[] = [];
  lines.push(`---`);
  lines.push(`name: ${name}`);
  lines.push(`description: ${description}`);
  lines.push(`tags: [技能, ${category}]`);
  lines.push(`auto_evolved: true`);
  lines.push(`---`);
  lines.push('');
  lines.push(`# ${name}`);
  lines.push('');
  lines.push(`> ${description}`);
  lines.push('');
  lines.push(`## 方法论`);
  lines.push('');

  // 从洞察中提取规则
  const insights = sources.filter(s => s.type === 'insight');
  if (insights.length > 0) {
    lines.push('### 核心洞察');
    lines.push('');
    insights.forEach((insight, i) => {
      lines.push(`${i + 1}. ${insight.content}`);
      if (insight.context) {
        lines.push(`   - 场景：${insight.context}`);
      }
    });
    lines.push('');
  }

  // 从范式中提取流程
  const patterns = sources.filter(s => s.type === 'pattern');
  if (patterns.length > 0) {
    lines.push('### 最佳实践');
    lines.push('');
    patterns.forEach((pattern, i) => {
      lines.push(`${i + 1}. ${pattern.content}`);
      if (pattern.context) {
        lines.push(`   - 适用场景：${pattern.context}`);
      }
    });
    lines.push('');
  }

  lines.push('## 使用指南');
  lines.push('');
  lines.push('此技能由 agent 自进化系统自动生成。');
  lines.push('在使用过程中如有改进建议，请通过 manage_evolution(action="optimize_skill") 反馈。');
  lines.push('');

  return lines.join('\n');
};

/** 从纠正和洞察生成技能优化建议 */
const generateSkillOptimization = (
  skillName: string,
  corrections: AgentMemoryEntry[],
  insights: AgentMemoryEntry[],
): {
  skillName: string;
  corrections: Array<{ content: string; context: string; id: string }>;
  suggestions: string[];
  newInsights: Array<{ content: string; id: string }>;
} => {
  const suggestions: string[] = [];

  // 从纠正中生成建议
  for (const c of corrections) {
    suggestions.push(`[纠正] ${c.content}（场景：${c.context || '未知'}）`);
  }

  // 从新洞察中生成建议
  for (const i of insights) {
    if (i.type === 'insight') {
      suggestions.push(`[新洞察] ${i.content}（可补充到技能方法论中）`);
    } else if (i.type === 'pattern') {
      suggestions.push(`[新范式] ${i.content}（可补充到最佳实践中）`);
    }
  }

  return {
    skillName,
    corrections: corrections.map(c => ({
      content: c.content,
      context: c.context,
      id: c.id,
    })),
    suggestions,
    newInsights: insights.map(i => ({
      content: i.content,
      id: i.id,
    })),
  };
};

// ============================================
// 工具列表导出
// ============================================

export const evolutionTools: ToolDefinition[] = [
  queryEvolutionTool,
  manageEvolutionTool,
];
