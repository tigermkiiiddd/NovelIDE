
export enum FileType {
  FILE = 'FILE',
  FOLDER = 'FOLDER'
}

export interface FileMetadata {
  summarys?: string[];
  tags?: string[];
  name?: string;
  description?: string;
  [key: string]: unknown; // Allow other YAML fields
}

export interface FileNode {
  id: string;
  parentId: string | null;
  name: string;
  type: FileType;
  content?: string; // 仅文件有内容
  metadata?: FileMetadata; // Parsed frontmatter
  lastModified: number;
}

// --- API Content Part Types (for rawParts) ---

export interface FunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
}

export interface FunctionResponsePart {
  functionResponse: {
    name: string;
    response: unknown;
    id?: string;
  };
}

export interface TextPart {
  text: string;
}

export type ContentPart = FunctionCallPart | FunctionResponsePart | TextPart;

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  isToolOutput?: boolean; // 标记是否为工具执行结果的反馈
  skipInHistory?: boolean; // 标记是否跳过 AI 历史记录（如停止通知、中断提示等）
  isError?: boolean; // 标记工具执行是否失败
  rawParts?: ContentPart[]; // Stores the raw API parts to preserve FunctionCalls/Responses in history
  isSubAgentOutput?: boolean; // 标记是否为 subagent 的输出
  subAgentName?: string; // subagent 名称
  metadata?: {
    systemPrompt?: string; // The specific system prompt used for this turn
    logType?: 'error' | 'info' | 'success'; // Distinguish between error and info messages
    // AI 响应错误信息
    errorInfo?: import('./types/agentErrors').AgentErrorInfo;
    // AI 响应元数据
    responseMetadata?: import('./types/agentErrors').AIResponseMetadata;
    // 响应警告列表
    responseWarnings?: string[];
    [key: string]: unknown;
  };
}

export interface ToolCallResult {
  functionName: string;
  args: Record<string, unknown>;
  result: string;
}

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'done';
}

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
  genre?: string;            // 题材类型
  wordsPerChapter?: number;  // 单章字数
  targetChapters?: number;   // 目标章节数
  chaptersPerVolume?: number; // 每卷章节数
  presetId?: string;         // 使用的预设ID
  pleasureRhythm?: {         // 爽点节奏配置
    small: number;           // 小爽点间隔（章数）
    medium: number;          // 中爽点间隔（章数）
    large: number;           // 大爽点间隔（章数）
  };
  lastModified: number;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  projectId: string; // 关联的项目ID
  title: string; // 会话标题，通常取第一条消息的前几个字
  messages: ChatMessage[];
  todos: TodoItem[]; // 每个会话有独立的任务状态
  lastModified: number;
  planModeEnabled?: boolean; // 会话级 Plan 模式开关
}

// --- Plan Notebook Types ---

// Plan笔记本单行内容
export interface PlanNoteLine {
  id: string;
  text: string;
  order: number;
}

// 用户注释（挂在某一行上）
export interface PlanNoteAnnotation {
  id: string;
  lineId: string;
  content: string;
  createdAt: number;
  modifiedAt: number;
}

// Plan笔记本
export interface PlanNote {
  id: string;
  sessionId: string;          // 关联到 ChatSession
  projectId: string;
  title: string;
  lines: PlanNoteLine[];
  annotations: PlanNoteAnnotation[];
  status: 'draft' | 'reviewing' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt: number;
}

// --- Patch Mode Types (String Match) ---

// 替换模式
export type PatchMode = 'single' | 'global' | 'insert';

// 匹配位置信息
export interface MatchPosition {
  startLine: number;           // 起始行号（1-based）
  endLine: number;             // 结束行号（1-based）
  startOffset: number;         // 字符偏移量
  endOffset: number;           // 结束偏移量
}

// 字符串匹配编辑
export interface StringMatchEdit {
  mode: PatchMode;             // single=单点替换, global=全局替换, insert=插入
  oldContent?: string;         // 要查找的原文（single/global 模式必需）
  after?: string;              // 在此内容之后插入（insert 模式，空字符串=文件末尾）
  before?: string;             // 在此内容之前插入（insert 模式）
  newContent: string;          // 替换/插入的内容
}

// 批量编辑类型
export type BatchEdit = StringMatchEdit;

// --- Edit-level Diff for Granular Approval ---
export interface EditDiff {
  id: string;                  // Unique ID for this edit
  editIndex: number;           // Index in the original edits array
  startLine: number;           // Original line number (relative to sourceSnapshot)
  endLine: number;             // Original end line number
  originalSegment: string;     // Original content
  modifiedSegment: string;     // Modified content
  status: 'pending' | 'accepted' | 'rejected' | 'manually_edited';
  // 字符串匹配模式额外信息
  mode?: PatchMode;            // 替换模式
  matchCount?: number;         // 匹配次数
  allMatches?: MatchPosition[]; // 所有匹配位置
}

// --- Edit Increment for Line Number Tracking ---
export interface EditIncrement {
  editId: string;              // ID of the edit that was modified
  lineDelta: number;           // Line count change (positive = added, negative = removed)
  timestamp: number;
}

// --- Pending Changes for Approval ---
export interface PendingChange {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  fileName: string;
  fileId?: string;  // 用于可靠关联文件的唯一ID
  originalContent: string | null; // Null for new files
  newContent: string | null;      // Null for deletions
  timestamp: number;
  description: string; // Summary for UI
  editDiffs?: EditDiff[];  // Granular edit-level diffs for patchFile operations
  metadata?: FileMetadata; // File metadata for virtual file creation
}

// --- Diff Session State (for Editor's patch queue system) ---
export interface FilePatch {
  id: string;
  type: 'accept' | 'reject';
  hunkId: string;
  startLineOriginal: number;
  endLineOriginal: number;
  oldContent: string;  // 原始内容，用于字符串匹配
  newContent: string;
  timestamp: number;
  sourceChangeId?: string;  // 关联的 PendingChange ID
}

export interface DiffSessionState {
  sourceSnapshot: string;      // Snapshot when entering diff mode (immutable baseline)
  sourceFileName?: string;      // Track which file this snapshot belongs to
  patchQueue: FilePatch[];       // User approval operation queue
}

// --- AI Configuration Types ---

export enum AIProvider {
  OPENAI = 'openai'
}

export interface OpenAIBackend {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface AIConfig {
  provider: AIProvider;
  apiKey: string; // Active API Key (Root level for service compatibility)
  // OpenAI Specifics (Also used for compatible APIs like DeepSeek)
  baseUrl?: string; // Active Base URL
  modelName: string; // Active Model Name
  lightweightModelName?: string; // Lightweight model for auto-tasks (chapter analysis, etc.)
  maxOutputTokens?: number; // 控制单次回复的最大长度
  safetySetting?: string; // BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE (Gemini only)

  // Multi-Provider Support
  openAIBackends?: OpenAIBackend[];
  activeOpenAIBackendId?: string;

  // 自动提取开关
  autoExtraction?: {
    conversation: boolean;    // 对话自动提取
    document: boolean;        // 文档保存时自动提取
    chapterAnalysis: boolean; // 章节分析
  };
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: AIProvider.OPENAI,
  apiKey: '',
  modelName: 'deepseek-chat',
  lightweightModelName: 'deepseek-coder', // 轻量任务专用模型
  maxOutputTokens: 8192,
  safetySetting: 'BLOCK_NONE',
  openAIBackends: [
      {
          id: 'gemini',
          name: 'Google Gemini',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          apiKey: '',
          modelName: 'gemini-3-flash-preview'
      },
      {
          id: 'deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          apiKey: '',
          modelName: 'deepseek-chat'
      },
      {
          id: 'moonshot',
          name: 'Moonshot (Kimi)',
          baseUrl: 'https://api.moonshot.cn/v1',
          apiKey: '',
          modelName: 'moonshot-v1-8k'
      },
      {
          id: 'openai-official',
          name: 'OpenAI Official',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          modelName: 'gpt-4o'
      }
  ],
  activeOpenAIBackendId: 'gemini',
  autoExtraction: { conversation: true, document: true, chapterAnalysis: true }
};

// --- Chapter Analysis Types ---

export interface PlotKeyPoint {
  id: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  tags: string[];
  relatedCharacters: string[];
}

export interface CharacterState {
  id: string;
  characterName: string;
  stateDescription: string;
  emotionalState?: string;
  location?: string;
  relationships?: { with: string; status: string; }[];
  changes: string[];
}

export interface CharacterStateSnapshot extends CharacterState {
  chapterPath: string;
  chapterTitle: string;
  extractedAt: number;
}

export interface CharacterMemoryEntry {
  memoryId: string;
  name: string;
  summary: string;
  content: string;
  importance: 'critical' | 'important' | 'normal';
  keywords: string[];
  tags: string[];
  sourceRef?: string;
  updatedAt: number;
}

export interface CharacterRelationship {
  characterName: string;
  status: string;
  summary?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'state' | 'memory' | 'manual';
  updatedAt: number;
}

export interface CharacterGoal {
  id: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'blocked' | 'completed' | 'latent';
  source: 'state' | 'memory' | 'manual';
  evidence?: string;
  updatedAt: number;
}

export interface CharacterProfile {
  id: string;
  characterName: string;
  aliases: string[];
  latestState?: CharacterStateSnapshot;
  stateHistory: CharacterStateSnapshot[];
  memories: CharacterMemoryEntry[];
  personaSummary?: string;
  coreTraits: string[];
  agencyNotes: string[];
  goals: CharacterGoal[];
  relationships: CharacterRelationship[];
  updatedAt: number;
}

// ============================================
// 钩子/伏笔扩展类型（伏笔升级版）
// ============================================

// 钩子/伏笔类型
export type HookType = 'crisis' | 'mystery' | 'emotion' | 'choice' | 'desire';

// 钩子强度（参考 webnovel-writer）
export type HookStrength = 'strong' | 'medium' | 'weak';

// 伏笔状态（基于 type + 章节进度计算）
export type ForeshadowingStatus = 'pending' | 'fulfilled' | 'overdue';

// 情绪奖励（钩子生命周期中的正面情绪效果）
export interface HookEmotionReward {
  planted: number;    // 埋下时 +3
  advanced: number;   // 推进时 +2
  fulfilled: number;  // 回收时 +5（按时）/ +2（逾期）
}

// 强度分数映射
export const STRENGTH_SCORES: Record<HookStrength, number> = {
  strong: 30,
  medium: 20,
  weak: 10
};

// 默认情绪奖励
export const DEFAULT_EMOTION_REWARD: HookEmotionReward = {
  planted: 3,
  advanced: 2,
  fulfilled: 5
};

// duration → 窗口/强度映射
// 根据钩子类型推荐回收跨度（跨度数 = plannedChapter - plantedChapter）
export const TYPE_SPAN_MAP: Record<HookType, { span: number; strength: HookStrength }> = {
  crisis:   { span: 3,  strength: 'weak' },
  mystery:  { span: 10, strength: 'medium' },
  emotion:  { span: 5,  strength: 'weak' },
  choice:   { span: 3,  strength: 'weak' },
  desire:   { span: 8,  strength: 'medium' },
};

// 题材配置（参考 webnovel-writer 的 13 种内置配置）
export interface GenreProfile {
  id: string;
  name: string;

  // 钩子配置
  hookConfig: {
    preferredTypes: HookType[];   // 偏好的钩子类型
    strengthBaseline: HookStrength;  // 默认强度
  };

  // 节奏配置
  pacingConfig: {
    stagnationThreshold: number;   // 停滞阈值（连续几章无进展触发警告）
    maxConsecutiveTransition: number; // 最大连续过渡章节数
  };

  // 逾期容忍
  gracePeriod: number;             // 逾期宽限期（章数）
  debtMultiplier: number;         // 债务乘数（0.8-2.0）
}

// 内置题材配置
export const DEFAULT_GENRE_PROFILES: Record<string, GenreProfile> = {
  '爽文': {
    id: 'shuangwen',
    name: '爽文/系统流',
    hookConfig: { preferredTypes: ['desire', 'crisis'], strengthBaseline: 'medium' },
    pacingConfig: { stagnationThreshold: 3, maxConsecutiveTransition: 2 },
    gracePeriod: 2,
    debtMultiplier: 1.0
  },
  '玄幻': {
    id: 'xuanhuan',
    name: '修仙/玄幻',
    hookConfig: { preferredTypes: ['crisis', 'desire'], strengthBaseline: 'medium' },
    pacingConfig: { stagnationThreshold: 4, maxConsecutiveTransition: 3 },
    gracePeriod: 3,
    debtMultiplier: 0.9
  },
  '言情': {
    id: 'romance',
    name: '言情/甜宠',
    hookConfig: { preferredTypes: ['emotion', 'desire'], strengthBaseline: 'medium' },
    pacingConfig: { stagnationThreshold: 4, maxConsecutiveTransition: 2 },
    gracePeriod: 2,
    debtMultiplier: 1.0
  },
  '悬疑': {
    id: 'mystery',
    name: '悬疑/推理',
    hookConfig: { preferredTypes: ['mystery', 'crisis'], strengthBaseline: 'medium' },
    pacingConfig: { stagnationThreshold: 3, maxConsecutiveTransition: 2 },
    gracePeriod: 2,
    debtMultiplier: 0.8
  },
  '都市': {
    id: 'urban',
    name: '都市异能',
    hookConfig: { preferredTypes: ['crisis', 'emotion'], strengthBaseline: 'medium' },
    pacingConfig: { stagnationThreshold: 3, maxConsecutiveTransition: 2 },
    gracePeriod: 2,
    debtMultiplier: 1.0
  }
};

// 伏笔时长类型
export type ForeshadowingDuration = 'short_term' | 'mid_term' | 'long_term';

// 通用来源引用
export interface SourceRef {
  source: 'timeline' | 'chapter_analysis';
  ref: string;                    // 章节路径 或 时间线节点ID
}

export interface ForeshadowingItem {
  id: string;
  content: string;                // 30字以内
  type: 'planted' | 'developed' | 'resolved';
  tags: string[];

  // 来源（通用引用）
  source: 'timeline' | 'chapter_analysis';
  sourceRef: string;              // 章节路径 或 时间线节点ID

  // 树状结构：推进即子伏笔
  parentId?: string;              // 父伏笔ID（有=子伏笔/推进记录，无=根伏笔）

  notes?: string;
  expectedResolution?: string;    // 预期收尾方式
  createdAt: number;              // 创建时间

  // === 章节量化（直接用章节数） ===
  plantedChapter: number;         // 埋下章节（必填）
  plannedChapter?: number;        // 计划回收章节（根伏笔必填，子伏笔可选）
  resolvedChapter?: number;      // 实际回收章节（type=resolved 时填）

  // === 钩子扩展 ===
  hookType?: HookType;            // 钩子类型（crisis/mystery/emotion/choice/desire）
  strength?: HookStrength;         // 钩子强度
  rewardScore?: number;           // 奖励分
  actualScore?: number;           // 实际获得分（含逾期惩罚）
  emotionReward?: HookEmotionReward;
}

export interface ChapterAnalysis {
  id: string;
  chapterPath: string;
  chapterTitle: string;
  sessionId: string;
  projectId: string;
  plotSummary: PlotKeyPoint[];
  characterStates: CharacterState[];
  foreshadowing: ForeshadowingItem[];
  extractedAt: number;
  lastModified: number;
  wordCount: number;
}

// ============================================
// 章节分析 V2 - 扁平化顶层结构
// ============================================

// 章节角色状态（扁平化，含章节引用）
export interface ChapterCharacterState {
  id: string;
  characterName: string;
  chapterRef: string;              // 章节引用
  stateDescription: string;
  emotionalState?: string;
  location?: string;
  relationships?: { with: string; status: string; }[];
  changes: string[];
  createdAt: number;
}

// 章节剧情关键点（扁平化，含章节引用）
export interface ChapterPlotKeyPoint {
  id: string;
  chapterRef: string;              // 章节引用
  description: string;
  importance: 'high' | 'medium' | 'low';
  tags: string[];
  relatedCharacters: string[];
  createdAt: number;
}

// 章节分析数据 V2（扁平化顶层结构）
export interface ChapterAnalysisData {
  characterStates: ChapterCharacterState[];
  foreshadowing: ForeshadowingItem[];
  plotKeyPoints: ChapterPlotKeyPoint[];
  lastModified: number;
}

// 长期记忆类型
export type MemoryType =
  | 'setting'        // 不可违背的设定
  | 'style'           // 正文扩写风格
  | 'restriction'     // 绝对限制
  | 'experience'      // 写作经验
  | 'world_rule';    // 世界观规则

// 长期记忆条目
export interface LongTermMemoryMetadata {
  createdAt: number;
  updatedAt: number;
  source: 'user' | 'agent';
  sourceKind?: 'manual' | 'dialogue' | 'document';
  sourceRef?: string;
  evidence?: string[];
  lastAccessedAt: number;
  lastRecalledAt: number;
  lastReinforcedAt: number;
  recallCount: number;
  reinforceCount: number;
  reviewCount: number;
  activation: number;
  strength: number;
  reviewIntervalHours: number;
  nextReviewAt: number;
}

export interface LongTermMemory {
  id: string;
  name: string;           // 记忆名称
  type: MemoryType;       // 记忆类型
  tags: string[];         // 标签（知识图谱索引）
  keywords: string[];     // 关键字（注入系统提示词）
  summary: string;        // 摘要（注入系统提示词，50-100字）
  content: string;        // 完整内容
  importance: 'critical' | 'important' | 'normal'; // 重要程度
  isResident: boolean;    // 常驻标记（常驻记忆会在系统提示词中显示标题和关键词）
  relatedMemories: string[]; // 关联记忆ID（知识图谱边）
  metadata: LongTermMemoryMetadata;
}

export type LongTermMemoryDraft = Omit<LongTermMemory, 'id' | 'metadata'> & {
  metadata?: Partial<LongTermMemoryMetadata>;
};

// --- Memory Graph Types ---

// 记忆图谱边类型
export type MemoryEdgeType =
  | 'extends'      // 扩展：新记忆扩展旧记忆
  | 'refines'      // 细化：更精确的规则
  | 'conflicts'    // 冲突：需要人工确认
  | 'relates_to';  // 关联：一般关联

// 记忆图谱边
export interface MemoryEdge {
  id: string;
  from: string;            // 源节点 ID
  to: string;              // 目标节点 ID
  type: MemoryEdgeType;    // 关系类型
  createdAt: number;
}

// 图谱操作类型
export type GraphOperationAction = 'add' | 'update' | 'merge' | 'link' | 'unlink' | 'skip';

export interface GraphOperation {
  action: GraphOperationAction;
  // add 操作
  memory?: LongTermMemoryDraft;
  links?: { to: string; type: MemoryEdgeType }[];
  // update 操作
  memoryId?: string;
  changes?: Partial<LongTermMemoryDraft>;
  // merge 操作
  memoryIds?: string[];
  mergedMemory?: LongTermMemoryDraft;
  // link/unlink 操作
  from?: string;
  to?: string;
  type?: MemoryEdgeType;
  // skip 操作
  reason?: string;
}

// 记忆图谱节点（轻量级，用于展示）
export interface MemoryNode {
  id: string;
  name: string;
  type: MemoryType;
  keywords: string[];
  summary: string;
  importance: 'critical' | 'important' | 'normal';
}

// 记忆元数据统计
export interface MemoryMetadataStats {
  types: { type: MemoryType; count: number }[];
  keywords: { keyword: string; count: number }[];
  tags: { tag: string; count: number }[];
}

// ============================================
// 知识图谱类型（新版本 - 使用中文标识）
// ============================================

// 一级分类（预制，不可扩展）
export type KnowledgeCategory = '设定' | '规则' | '禁止' | '风格' | '用户偏好';

// 二级分类默认值（半预制，业务AI可扩展）
export const DEFAULT_SUB_CATEGORIES: Record<KnowledgeCategory, string[]> = {
  '设定': ['世界设定', '角色设定', '物品设定', '场景设定'],
  '规则': ['创作规则', '叙事规则', '逻辑规则'],
  '禁止': ['禁止词汇', '禁止情节', '禁止写法'],
  '风格': ['叙事风格', '对话风格', '描写风格'],
  '用户偏好': ['写作偏好', '交互偏好', '输出偏好'],
};

// 旧二级分类迁移映射（用于数据迁移）
export const SUB_CATEGORY_MIGRATION: Record<string, string> = {
  // 设定 -> 细化
  '剧情设定': '世界设定',  // 剧情相关归入世界设定
  '其他设定': '世界设定',  // 其他设定归入世界设定
  // 规则 -> 细化
  '角色规则': '逻辑规则',  // 角色相关规则归入逻辑规则
  '其他规则': '创作规则',  // 其他规则归入创作规则
  // 禁止 -> 细化
  '其他禁止': '禁止写法',  // 其他禁止归入禁止写法
  // 风格 -> 细化
  '其他风格': '描写风格',  // 其他风格归入描写风格
};

// 知识关系类型（中文）
export type KnowledgeEdgeType = '属于' | '细化' | '依赖' | '冲突';

// 知识节点元数据（支持记忆智能算法）
export interface KnowledgeNodeMetadata {
  // 访问统计
  lastAccessedAt: number;
  lastRecalledAt: number;
  lastReinforcedAt: number;
  recallCount: number;
  reinforceCount: number;
  reviewCount: number;
  // 激活度/强度（0-1）
  activation: number;
  strength: number;
  // 间隔重复
  reviewIntervalHours: number;
  nextReviewAt: number;
}

// 知识节点动态状态（运行时计算）
export interface KnowledgeNodeDynamicState {
  activation: number;
  strength: number;
  reviewUrgency: number;
  isDueForReview: boolean;
  nextReviewAt: number;
  hoursSinceAccess: number;
  state: 'active' | 'stable' | 'cooling' | 'needs_review';
}

// 知识节点
export interface KnowledgeNode {
  id: string;
  // 三级分类
  category: KnowledgeCategory;      // 一级（预制）
  subCategory: string;              // 二级（半预制，中文）
  topic?: string;                   // 三级（动态，可选）
  // 内容（中文，简洁原则）
  name: string;                     // 简短名称（≤20字）
  summary: string;                  // 一句话概括（≤50字）
  detail?: string;                  // 详细说明（≤200字，可选）
  // Tag系统
  tags: string[];                   // 标签（跨分类索引）
  // 元数据
  importance: 'critical' | 'important' | 'normal';
  // 层级关系
  parentId?: string;                // 父节点ID（用于树状结构）
  // 来源追踪
  source?: {
    type: '对话' | '文档' | '用户';
    ref?: string;
  };
  // 记忆智能元数据（可选，支持激活度/间隔重复算法）
  metadata?: KnowledgeNodeMetadata;
  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// 知识关系边
export interface KnowledgeEdge {
  id: string;
  from: string;                     // 源节点ID
  to: string;                       // 目标节点ID
  type: KnowledgeEdgeType;          // 关系类型
  note?: string;                    // 关系说明
  createdAt: number;
}

// 知识节点草稿（用于创建/更新）
export type KnowledgeNodeDraft = Omit<KnowledgeNode, 'id' | 'createdAt' | 'updatedAt'>;

// 知识图谱统计
export interface KnowledgeGraphStats {
  totalNodes: number;
  totalEdges: number;
  byCategory: { category: KnowledgeCategory; count: number }[];
  bySubCategory: { subCategory: string; count: number }[];
  topTags: { tag: string; count: number }[];
}

// --- Story Outline Types ---

export type OutlineStatus = 'draft' | 'outline' | 'writing' | 'completed';

// 场景节点（章节内的细分场景）
export interface SceneNode {
  id: string;
  nodeNumber: number;               // 节点序号
  title: string;                    // 场景标题
  content: string;                  // 场景内容/要点
  location: string;                 // 场景地点
  characters: string[];             // 出场角色
  emotion: string;                  // 情绪氛围
  purpose: string;                  // 场景作用
  relativeTime?: string;            // 相对时间（如"第1天 早晨"）
}

// 章节大纲
export interface ChapterOutline {
  id: string;
  chapterNumber: number;
  title: string;
  pov: string;                      // POV角色
  summary: string;                  // 章节一句话概要
  driver: string;                   // 谁在推动
  conflict: string;                 // 冲突来源
  hook: string;                     // 章末悬念
  status: OutlineStatus;
  scenes: SceneNode[];              // 场景节点列表
}

// 卷大纲
export interface VolumeOutline {
  id: string;
  volumeNumber: number;
  title: string;
  description: string;               // 卷核心冲突
  chapters: ChapterOutline[];
}

// 故事大纲
export interface StoryOutline {
  id: string;
  projectId: string;
  volumes: VolumeOutline[];
  lastModified: number;
}

// --- World Timeline Types (Event-First Architecture) ---

// 故事时间戳（绝对时间）
export interface StoryTimeStamp {
  day: number;        // 第几天（从1开始）
  hour: number;       // 小时（0-23，支持小数如 8.5）
}

// 时间单位（用于持续时间）
export type TimeUnit = 'hour' | 'day';

// 结构化时间（持续时间）
export interface QuantizedTime {
  value: number;        // 数值
  unit: TimeUnit;       // 单位：hour 或 day
}

// 故事线
export interface StoryLine {
  id: string;
  name: string;
  color: string;
  isMain: boolean;
}

// ============================================
// 情绪类型定义（节点情绪曲线）
// ============================================

// 情绪分类型（-10 到 +10）
export type EmotionScore = number;  // -10 ~ +10

// 情绪类型（中文枚举，覆盖常见情绪）
export type EmotionCategory =
  | '期待' | '害怕' | '不安' | '兴奋' | '悲伤' | '愤怒'
  | '温馨' | '紧张' | '轻松' | '压抑' | '感动' | '心疼'
  | '惊讶' | '讽刺' | '释然' | '愉悦' | '失落';

// 单个情绪项（类型+分数）
export interface EmotionItem {
  type: EmotionCategory;
  score: number;  // -5 ~ +5（单个情绪的强度）
}

// 情绪数组（节点可叠加多个情绪）
export type EmotionList = EmotionItem[];

// 节点情绪曲线数据点
export interface NodeEmotionCurvePoint {
  eventId: string;
  chapterIndex: number;
  eventIndex: number;
  emotions: EmotionItem[];           // 节点的情绪数组（类型+分数组）
  totalScore: EmotionScore;          // 汇总分 = emotions.reduce((sum, e) => sum + e.score, 0)
  timestamp: StoryTimeStamp;
}

// 钩子情绪奖励曲线数据点
export interface HookEmotionCurvePoint {
  foreshadowingId: string;
  eventId: string;
  chapterIndex: number;
  eventIndex: number;
  action: 'planted' | 'advanced' | 'fulfilled';
  bonus: number;                 // 情绪奖励值
  timestamp: StoryTimeStamp;
  isOverdue: boolean;            // 回收时是否逾期
}

// 伏笔统计
export interface ForeshadowingStats {
  total: number;
  pending: number;
  fulfilled: number;
  overdue: number;
  totalRewardScore: number;      // 总奖励分
  fulfilledRewardScore: number;  // 已回收奖励分
  overdueRate: number;           // 逾期率
  // 按钩子类型统计
  byHookType: Record<HookType, { total: number; fulfilled: number; pending: number }>;
  // 按强度统计
  byStrength: Record<HookStrength, { total: number; fulfilled: number; pending: number }>;
}

// 时间线事件（原子单位）
export interface TimelineEvent {
  id: string;
  eventIndex: number;          // 序号（用于显示，按时间戳自动排序）
  timestamp: StoryTimeStamp;   // 开始时间（绝对时间戳）
  duration: QuantizedTime;     // 持续时间
  title: string;
  content: string;
  storyLineId: string;         // 所属故事线（默认主线）

  // 可选属性
  location?: string;
  characters?: string[];
  emotion?: string;            // 现有：情绪氛围（文本，如"紧张、温馨"）
  emotions?: EmotionItem[];     // 新增：情绪数组（类型+分数，可叠加多个）
  chapterId?: string;          // 所属章节（可选）
  foreshadowingIds?: string[]; // 关联的伏笔ID列表
  purpose?: string;            // 场景作用/目的
}

// 章节分组（事件的容器）- 合并自 storyOutline 的 ChapterOutline
export interface ChapterGroup {
  id: string;
  chapterIndex: number;        // 章节序号
  title: string;
  summary?: string;            // 章节概要
  eventIds: string[];          // 包含的事件ID列表（按顺序）

  // 合并自 ChapterOutline 的属性
  pov?: string;                // POV角色
  driver?: string;             // 谁在推动
  conflict?: string;           // 冲突来源
  hook?: string;               // 章末悬念
  status?: OutlineStatus;      // 章节状态

  // 计算属性
  timeRange?: string;          // 基于事件自动计算
  volumeId?: string;           // 所属卷
}

// 卷分组（章节的容器）
export interface VolumeGroup {
  id: string;
  volumeIndex: number;         // 卷序号
  title: string;
  description?: string;
  chapterIds: string[];        // 包含的章节ID列表

  // 计算属性
  timeRange?: string;          // 基于章节自动计算
}

// 世界线大纲（顶层）
export interface WorldTimeline {
  id: string;
  projectId: string;
  timeStart: string;           // 起始时间（如"第0天"）

  // 三层数据
  events: TimelineEvent[];     // 所有事件（按 eventIndex 排序）
  chapters: ChapterGroup[];    // 所有章节（按 chapterIndex 排序）
  volumes: VolumeGroup[];      // 所有卷（按 volumeIndex 排序）

  // 故事线
  storyLines: StoryLine[];

  // 计算属性
  totalTimeRange?: string;     // 基于事件自动计算

  lastModified: number;
}

// ============================================
// 角色档案 V2 类型（分类体系）
// ============================================

// 大分类类型
export type CharacterCategoryType = '覆盖' | '累加';

// 预设大分类名称
export type CharacterCategoryName = '状态' | '属性' | '目标' | '技能' | '关系' | '经历' | '记忆';

// 技能结构化值
export interface SkillValue {
  quality: '未掌握' | '入门' | '熟练' | '精通' | '大师';
  description: string;      // 技能描述
  unlockCondition: string;   // 解锁/提升条件
}

// 属性结构化值
export interface AttributeValue {
  level: string;            // 等级 S/A/B/C/D 或数值
  description: string;      // 描述
}

// 结构化值联合类型
export type StructuredValue = SkillValue | AttributeValue;

// 值类型：可以是字符串或结构化对象
export type EntryValue = string | StructuredValue;

// 覆盖型条目
export interface OverwriteEntry {
  value: EntryValue;
  chapterRef: string;          // 来源章节
  updatedAt: number;
}

// 累加型条目
export interface AccumulateEntry {
  value: EntryValue;
  chapterRef: string;
  updatedAt: number;
  archived?: boolean;          // 归档标记
}

// 分类结构
export interface CharacterCategory {
  type: CharacterCategoryType;
  subCategories: {
    [subCategoryName: string]: OverwriteEntry | AccumulateEntry[];
  };
}

// 角色档案 V2
export interface CharacterProfileV2 {
  characterId: string;
  characterName: string;
  baseProfilePath?: string;    // 关联的基础设定文档路径

  categories: {
    [categoryName: string]: CharacterCategory;
  };

  createdAt: number;
  updatedAt: number;
}

// 预设大分类配置
export const CHARACTER_CATEGORIES: Record<CharacterCategoryName, CharacterCategoryType> = {
  '状态': '覆盖',
  '属性': '覆盖',
  '目标': '覆盖',
  '技能': '覆盖',
  '关系': '累加',
  '经历': '累加',
  '记忆': '累加',
};

// AI 更新条目请求
export interface CharacterProfileUpdateRequest {
  characterName: string;
  chapterRef: string;
  updates: {
    category: CharacterCategoryName;
    subCategory: string;
    value: EntryValue;  // 支持字符串或结构化值
    action: 'update' | 'add';  // update=更新现有, add=新增条目
  }[];
}

// 初始化角色档案请求
export interface CharacterProfileInitRequest {
  characterName: string;
  baseProfilePath?: string;
  initialSubCategories?: {
    [categoryName in CharacterCategoryName]?: string[];
  };
  initialValues?: {
    category: CharacterCategoryName;
    subCategory: string;
    value: EntryValue;  // 支持字符串或结构化值
  }[];
}

// --- Entity Version Types ---

// 版本来源类型
export type EntityVersionSource = 'user' | 'agent' | 'auto' | 'manual';

// 角色档案版本
export interface CharacterProfileVersion {
  id: string;
  entityId: string;              // characterId
  entityName: string;            // characterName
  snapshot: CharacterProfileV2;  // 完整快照
  timestamp: number;
  source: EntityVersionSource;
  description?: string;
  changedCategories?: CharacterCategoryName[];
}

// 章节分析版本
export interface ChapterAnalysisVersion {
  id: string;
  entityId: string;              // analysis.id
  entityName: string;            // chapterTitle
  chapterPath: string;
  snapshot: ChapterAnalysis;     // 完整快照
  timestamp: number;
  source: EntityVersionSource;
  description?: string;
}
