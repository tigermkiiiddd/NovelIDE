
import { ToolDefinition } from '../types';

export const writeFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write',
    description: `Create or overwrite a file. If the file exists, it is replaced entirely.

All markdown files MUST start with YAML frontmatter:
\`\`\`
---
summarys: ["一句话摘要"]
tags: ["标签1", "标签2"]
---
\`\`\`

Files in 05_正文草稿/ must also include a characters field:
\`\`\`
---
summarys: ["本章剧情摘要"]
tags: ["正文", "第X卷", "第X章"]
characters: ["角色A", "角色B"]
---
\`\`\``,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full file path (e.g., "05_正文草稿/chapter1.md"). Folder must exist.' },
        content: { type: 'string', description: 'Complete file content including frontmatter. Must not use "..." or omit existing content when overwriting.' },
      },
      required: ['path', 'content'],
    },
  },
};

export const patchFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit',
    description: 'Perform string replacements on an existing file. Supports batch edits (up to 10 per call). File must exist.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full file path.' },
        edits: {
          type: 'array',
          description: 'Array of edits. Multiple edits on the same file should be batched into one call.',
          items: {
            type: 'object',
            properties: {
              oldContent: { type: 'string', description: 'Exact text to find (must be unique in file unless using global mode).' },
              newContent: { type: 'string', description: 'Replacement text.' },
              mode: {
                type: 'string',
                enum: ['single', 'global', 'insert'],
                description: 'single: replace one match (fails if multiple). global: replace all matches. insert: insert newContent after/before a marker.',
              },
              after: { type: 'string', description: '[insert mode] Insert after this text. Empty string = end of file.' },
              before: { type: 'string', description: '[insert mode] Insert before this text.' },
            },
            required: ['mode', 'newContent'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
};

export const renameFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'renameFile',
    description: 'Rename a file (filename only, no folder moves).',
    parameters: {
      type: 'object',
      properties: {
        oldPath: { type: 'string', description: 'Current full path (e.g., "05_正文草稿/old.md")' },
        newName: { type: 'string', description: 'New filename only (e.g., "new.md")' },
      },
      required: ['oldPath', 'newName'],
    },
  },
};

export const deleteFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'deleteFile',
    description: 'Delete a file or folder.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full path of file or folder to delete.' },
      },
      required: ['path'],
    },
  },
};

// Legacy aliases
export const createFileTool = writeFileTool;
export const updateFileTool = writeFileTool;
