
export enum FileType {
  FILE = 'FILE',
  FOLDER = 'FOLDER'
}

export interface FileMetadata {
  summarys?: string[];
  tags?: string[];
  [key: string]: any; // Allow other YAML fields like 'name', 'description' for skills
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  isToolOutput?: boolean; // 标记是否为工具执行结果的反馈
  skipInHistory?: boolean; // 标记是否跳过 AI 历史记录（如停止通知、中断提示等）
  isError?: boolean; // 标记工具执行是否失败
  rawParts?: any[]; // Stores the raw API parts (ContentPart[]) to preserve FunctionCalls/Responses in history
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
    responseWarnings?: any[];
    [key: string]: any;
  };
}

export interface ToolCallResult {
  functionName: string;
  args: any;
  result: any;
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

// --- Edit-level Diff for Granular Approval ---
export interface EditDiff {
  id: string;                  // Unique ID for this edit
  editIndex: number;           // Index in the original edits array
  startLine: number;           // Original line number (relative to sourceSnapshot)
  endLine: number;             // Original end line number
  originalSegment: string;     // Original content
  modifiedSegment: string;     // Modified content
  status: 'pending' | 'accepted' | 'rejected' | 'manually_edited';
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
  args: any;
  fileName: string;
  fileId?: string;  // 用于可靠关联文件的唯一ID
  originalContent: string | null; // Null for new files
  newContent: string | null;      // Null for deletions
  timestamp: number;
  description: string; // Summary for UI
  editDiffs?: EditDiff[];  // Granular edit-level diffs for patchFile operations
}

// --- Diff Session State (for Editor's patch queue system) ---
export interface FilePatch {
  id: string;
  type: 'accept' | 'reject';
  hunkId: string;
  startLineOriginal: number;
  endLineOriginal: number;
  newContent: string;
  timestamp: number;
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
  activeOpenAIBackendId: 'gemini'
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

export interface ForeshadowingItem {
  id: string;
  content: string;
  type: 'planted' | 'developed' | 'resolved';
  tags: string[];
  relatedChapters?: string[];
  notes?: string;
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

// 长期记忆类型
export type MemoryType =
  | 'setting'        // 不可违背的设定
  | 'style'           // 正文扩写风格
  | 'restriction'     // 绝对限制
  | 'experience'      // 写作经验
  | 'character_rule'  // 角色规则
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

// 时间单位
export type TimeUnit = 'hour' | 'day';

// 结构化时间（用户输入 + 存储）
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

// 时间线事件（原子单位）- 合并自 storyOutline 的 SceneNode
export interface TimelineEvent {
  id: string;
  eventIndex: number;          // 序号（备用排序）
  time: QuantizedTime;         // 结构化时间（数值 + 单位）
  title: string;
  content: string;
  storyLineId: string;         // 所属故事线（默认主线）

  // 可选属性（来自原 Timeline）
  location?: string;
  characters?: string[];
  emotion?: string;
  chapterId?: string;          // 所属章节（可选）

  // 合并自 SceneNode 的属性
  purpose?: string;            // 场景作用/目的
  relativeTime?: string;       // 相对时间描述（如"第1天 早晨"）
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
