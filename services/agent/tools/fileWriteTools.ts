
import { ToolDefinition } from '../types';

export const createFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createFile',
    description: 'Create a new markdown file with content at a specific path. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: 'Internal thought process: Why are you creating this file? Does it comply with the naming convention?' },
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
    description: 'Overwrite the ENTIRE content of an existing file. [CRITICAL]: You must provide the COMPLETE file content. Do not omit any parts. If you only want to change specific sections, use `patchFile` instead. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: 'Internal thought process: Why are you overwriting this file? Have you read the original content?' },
        path: { type: 'string', description: 'The FULL PATH of the file to update (e.g., "05_正文草稿/chapter1.md").' },
        content: { 
          type: 'string', 
          description: 'The ABSOLUTE FULL content of the file. PROHIBITED: Do not use placeholders like "// ... rest of code", "<!-- unchanged -->" or "...". You MUST output every single line of the file, even if unchanged. If you do not provide the full content, the user will lose data.' 
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
    description: 'Precise line-based editing tool. Use this to insert, replace, or delete lines at multiple locations in a file simultaneously without rewriting the whole file. You MUST call `readFile` first to obtain accurate line numbers. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: 'Internal thought process: What lines are you changing and why?' },
        path: { type: 'string', description: 'The FULL PATH of the file to patch.' },
        edits: {
          type: 'array',
          description: 'A list of edits to apply. They will be applied safely (bottom-up) to preserve line numbers.',
          items: {
            type: 'object',
            properties: {
              startLine: { type: 'integer', description: 'The starting line number to replace (1-based).' },
              endLine: { type: 'integer', description: 'The ending line number to replace (1-based, inclusive). To INSERT, set endLine = startLine - 1.' },
              newContent: { type: 'string', description: 'The new content lines to insert. If empty string, it deletes the target lines.' }
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
        thinking: { type: 'string', description: 'Internal thought process: Why is the rename necessary?' },
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
        thinking: { type: 'string', description: 'Internal thought process: Why must this file be deleted? Is it safe?' },
        path: { type: 'string', description: 'The full path of the file or folder to delete.' } 
      },
      required: ['thinking', 'path']
    }
  }
};
