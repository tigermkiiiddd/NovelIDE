
import { ToolDefinition } from '../types';

export const createFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createFile',
    description: 'Create a new markdown file with content at a specific path. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么要创建这个文件？是否符合命名规范？' },
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
        thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么用 updateFile 而不是 patchFile？确认你有完整内容。' },
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
    description: 'Advanced batch editing tool. Supports performing MULTIPLE range replacements in a SINGLE call (e.g., "Replace lines 1-20 with A, AND lines 50-60 with B"). Always prefer this over updateFile for partial edits. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '【必须使用中文】思考过程：要修改哪些行？为什么？确认范围不重叠。' },
        path: { type: 'string', description: 'The FULL PATH of the file to patch.' },
        edits: {
          type: 'array',
          description: 'List of edits to apply. MUST NOT OVERLAP. The system automatically applies them bottom-up to preserve line numbers.',
          items: {
            type: 'object',
            properties: {
              startLine: { type: 'integer', description: 'Start line (1-based).' },
              endLine: { type: 'integer', description: 'End line (1-based, inclusive). To INSERT lines BEFORE startLine, set endLine = startLine - 1.' },
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
        thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么需要重命名？' },
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
        thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么必须删除这个文件？安全吗？' },
        path: { type: 'string', description: 'The full path of the file or folder to delete.' } 
      },
      required: ['thinking', 'path']
    }
  }
};
