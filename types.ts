
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
  rawParts?: any[]; // Stores the raw API parts (ContentPart[]) to preserve FunctionCalls/Responses in history
  metadata?: {
    systemPrompt?: string; // The specific system prompt used for this turn
    logType?: 'error' | 'info' | 'success'; // Distinguish between error and info messages
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
}

// --- Pending Changes for Approval ---
export interface PendingChange {
  id: string;
  toolName: string;
  args: any;
  fileName: string;
  originalContent: string | null; // Null for new files
  newContent: string | null;      // Null for deletions
  timestamp: number;
  description: string; // Summary for UI
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
  maxOutputTokens: 8192,
  safetySetting: 'BLOCK_NONE',
  openAIBackends: [
      {
          id: 'gemini',
          name: 'Google Gemini',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          apiKey: '',
          modelName: 'gemini-2.5-flash-preview-05-20'
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
