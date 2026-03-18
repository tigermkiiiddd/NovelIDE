
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
  metadata: {
    createdAt: number;
    updatedAt: number;
    source: 'user' | 'agent';
  };
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
