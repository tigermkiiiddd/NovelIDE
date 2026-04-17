/**
 * 自进化记忆系统类型定义
 * 用于 agent 跨项目持久化记忆、技能进化、会话摘要等
 */

// ─── 记忆条目 ───────────────────────────────────────────

/** 记忆条目类型 */
export type AgentMemoryType = 'insight' | 'pattern' | 'correction' | 'workflow' | 'preference';

/** 记忆重要程度 */
export type AgentMemoryImportance = 'low' | 'medium' | 'high' | 'critical';

/**
 * 单条 agent 记忆
 * 持久化到 IndexedDB，跨项目共享
 */
export interface AgentMemoryEntry {
  id: string;
  type: AgentMemoryType;
  content: string;           // 记忆内容
  context: string;           // 触发上下文（用户说了什么 / 做了什么）
  relatedSkills?: string[];  // 关联的技能名
  projectGenre?: string;     // 来自哪个项目类型
  importance: AgentMemoryImportance;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

// ─── 会话摘要 ───────────────────────────────────────────

/**
 * 单次会话摘要
 * 用于短期跨会话记忆，下次开新会话时注入最近 N 条
 */
export interface SessionSummary {
  sessionId: string;
  projectId: string;
  summary: string;               // 本次会话做了什么
  keyDecisions: string[];        // 关键决策
  unresolvedTopics: string[];    // 未完成的话题
  timestamp: number;
}

// ─── 自进化工具动作 ─────────────────────────────────────

/** manage_evolution 工具支持的动作 */
export type EvolutionAction =
  | 'record_insight'       // 记录一次洞察（任务完成后主动调用）
  | 'record_pattern'       // 记录最佳工作范式
  | 'record_correction'    // 记录被用户纠正的内容
  | 'recall'               // 搜索相关记忆
  | 'list'                 // 列出所有记忆（按类型 / 重要性过滤）
  | 'create_skill'         // 从积累的 insight/pattern 自动生成技能文件
  | 'optimize_skill'       // 分析现有技能，基于使用经验补全 / 修正
  | 'summarize_session';   // 生成会话摘要

/** record_insight / record_pattern / record_correction 的参数 */
export interface EvolutionRecordParams {
  type: AgentMemoryType;
  content: string;
  context: string;
  relatedSkills?: string[];
  projectGenre?: string;
  importance?: AgentMemoryImportance;
}

/** recall 搜索参数 */
export interface EvolutionRecallParams {
  query: string;
  type?: AgentMemoryType;
  importance?: AgentMemoryImportance;
  limit?: number;
}

/** list 过滤参数 */
export interface EvolutionListParams {
  type?: AgentMemoryType;
  importance?: AgentMemoryImportance;
  limit?: number;
}

/** create_skill 参数 */
export interface EvolutionCreateSkillParams {
  sourceInsightIds?: string[];
  sourcePatternIds?: string[];
  skillName: string;
  category: string;   // 技能分类目录名
  description: string;
}

/** optimize_skill 参数 */
export interface EvolutionOptimizeSkillParams {
  skillName: string;
  category?: string;
}

/** summarize_session 参数 */
export interface EvolutionSummarizeSessionParams {
  sessionId: string;
  projectId: string;
  summary: string;
  keyDecisions?: string[];
  unresolvedTopics?: string[];
}

/** manage_evolution 所有动作的联合参数 */
export type EvolutionParams =
  | EvolutionRecordParams
  | EvolutionRecallParams
  | EvolutionListParams
  | EvolutionCreateSkillParams
  | EvolutionOptimizeSkillParams
  | EvolutionSummarizeSessionParams;
