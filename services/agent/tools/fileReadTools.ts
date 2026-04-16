
import { useFileStore } from '../../../stores/fileStore';
import { FileType, FileNode } from '../../../types';
import { ToolDefinition } from '../types';

export const globTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'glob',
    description: 'Find files by name/path pattern. Supports * and ** wildcards. Returns matching file paths with metadata.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files. Examples: "02_角色档案/*.md", "05_正文草稿/**/*.md", "*大纲*", "**/*.json". Use "*" for any filename, "**" for recursive.',
        },
        path: {
          type: 'string',
          description: 'Optional directory to search in (e.g., "02_角色档案"). Defaults to root.',
        },
        head_limit: {
          type: 'integer',
          description: 'Max results to return. Default: unlimited.',
        },
      },
      required: ['pattern'],
    },
  },
};

export const readFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read',
    description: `Read file content with line numbers. Default: first 300 lines. Use startLine/endLine to paginate.
Files under 02_角色档案/ auto-append character dynamic status.`,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full file path (e.g., "05_正文草稿/chapter1.md")' },
        startLine: { type: 'integer', description: 'Start line (1-based). Default: 1.' },
        endLine: { type: 'integer', description: 'End line. Default: startLine + 299.' },
      },
      required: ['path'],
    },
  },
};

export const grepTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep',
    description: 'Search file contents by pattern. Supports regex, glob file filtering, and multiple output modes.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern. Examples: "李逍遥", "魔法体系", "伏笔.*回收"',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (e.g., "05_正文草稿"). Default: all files.',
        },
        glob: {
          type: 'string',
          description: 'Glob filter for file names (e.g., "*.md", "02_角色档案/*"). Only search matching files.',
        },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'content: matching lines with context (default). files_with_matches: file paths only. count: match count per file.',
        },
        context: {
          type: 'integer',
          description: 'Context lines around each match (content mode only). Default: 2.',
        },
        head_limit: {
          type: 'integer',
          description: 'Max results to return. Default: unlimited. Use to prevent context explosion on broad searches.',
        },
        ignoreCase: {
          type: 'boolean',
          description: 'Case-insensitive search. Default: true.',
        },
        multiline: {
          type: 'boolean',
          description: 'Allow patterns to match across newlines (e.g., "```[\\s\\S]*?```"). Default: false.',
        },
      },
      required: ['pattern'],
    },
  },
};

// Legacy aliases for backward compat (toolRunner switch-case)
export const listFilesTool = globTool;
export const searchFilesTool = grepTool;
