
import { ToolDefinition } from '../types';

export const createFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createFile',
    description: 'Create a new markdown file with content at a specific path. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么要创建这个文件？是否符合命名规范？' },
        path: { type: 'string', description: 'The FULL PATH including folder and extension (e.g., "03_剧情大纲/第一章_细纲.md"). The folder must exist.' },
        content: { type: 'string', description: 'The content of the file.' }
      },
      required: ['thinking', 'path', 'content']
    }
  }
};

export const updateFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'updateFile',
    description: '⚠️ DANGER: Overwrite the ENTIRE content of an existing file. [CRITICAL WARNING]: This tool REPLACES the file completely. If you provide partial content, the original content will be LOST FOREVER. STRICTLY FORBIDDEN to use placeholders like "// ... existing code", "<!-- unchanged -->" or "...". You MUST provide the FULL file content. If you only want to edit a part, use `patchFile` instead. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么用 updateFile 而不是 patchFile？确认你有完整内容。' },
        path: { type: 'string', description: 'The FULL PATH of the file to update (e.g., "05_正文草稿/chapter1.md").' },
        content: { 
          type: 'string', 
          description: 'The COMPLETE, BYTE-FOR-BYTE content of the file. DO NOT OMIT ANYTHING. DO NOT USE "...". If you omit lines, they are deleted. If the file is large, prefer `patchFile`.' 
        }
      },
      required: ['thinking', 'path', 'content']
    }
  }
};

export const patchFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'patchFile',
    description: `Precise batch editing tool for EXACT replacement. [CRITICAL REQUIREMENTS]:
1. You MUST readFile first to get accurate line numbers (format: "LineNum | Content").
2. ONLY replace the specific lines that need to change. DO NOT modify unrelated content.
3. startLine must be the FIRST line of the OLD content to replace.
4. endLine must be the LAST line of the OLD content to replace.
5. If you set wrong line numbers, old content will remain and cause duplication.

Example: To replace lines 24-30 (7 lines of old table) with new content:
✅ CORRECT: startLine=24, endLine=30, newContent="new multi-line content"
❌ WRONG: startLine=27, endLine=27 (only replaces line 27, lines 24-26 remain duplicated)
❌ WRONG: Replacing lines 20-35 when only lines 24-30 need changes (modifies unrelated content)

[WRITE TOOL]`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):(1) 我读取了哪些行？(2) 精确标注旧内容的起止行号 (3) 是否只替换需要修改的部分，没有扩大范围？' },
        path: { type: 'string', description: 'The FULL PATH of the file to patch.' },
        edits: {
          type: 'array',
          description: 'List of edits to apply. MUST NOT OVERLAP. The system automatically applies them bottom-up to preserve line numbers.',
          items: {
            type: 'object',
            properties: {
              startLine: { type: 'integer', description: 'First line of OLD content to replace (1-based, from readFile output).' },
              endLine: { type: 'integer', description: 'Last line of OLD content to replace (1-based, inclusive). Must cover the ENTIRE old section to avoid duplication.' },
              newContent: { type: 'string', description: 'New content. If empty string, the range is deleted.' }
            },
            required: ['startLine', 'endLine', 'newContent']
          }
        }
      },
      required: ['thinking', 'path', 'edits']
    }
  }
};

export const renameFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'renameFile',
    description: 'Rename a file. Currently only supports renaming the filename, not moving folders. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么需要重命名？' },
        oldPath: { type: 'string', description: 'The current full path (e.g. "05_正文草稿/old.md")' },
        newName: { type: 'string', description: 'The new FILENAME only (e.g. "new.md")' }
      },
      required: ['thinking', 'oldPath', 'newName']
    }
  }
};

export const deleteFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'deleteFile',
    description: 'Delete a file or folder. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: { 
        thinking: { type: 'string', description: '思考过程(用中文):为什么必须删除这个文件？安全吗？' },
        path: { type: 'string', description: 'The full path of the file or folder to delete.' } 
      },
      required: ['thinking', 'path']
    }
  }
};
