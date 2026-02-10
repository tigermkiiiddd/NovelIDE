
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

// --- AI Configuration Types ---

export enum AIProvider {
  GOOGLE = 'google',
  OPENAI = 'openai'
}

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  // OpenAI Specifics (Also used for compatible APIs like DeepSeek)
  baseUrl?: string; 
  modelName: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: AIProvider.GOOGLE,
  apiKey: '', // Start empty, let user fill or pull from env if configured in code (though here strictly UI driven)
  modelName: 'gemini-3-flash-preview'
};
