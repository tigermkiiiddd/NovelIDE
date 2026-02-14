
import { useFileStore } from '../../../stores/fileStore';
import { FileType, FileNode } from '../../../types';
import { ToolDefinition } from '../types';

export const listFilesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'listFiles',
    description: 'List the entire project file structure. [DO NOT USE FOR CHITCHAT OR GREETINGS]. Only use this when the user explicitly asks about project structure, or when you need to find a file path to execute a specific task.',
    parameters: { 
      type: 'object', 
      properties: {
          thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么现在需要列出文件？你在寻找什么？' }
      },
      required: ['thinking']
    }
  }
};

export const readFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'readFile',
    description: 'Read the content of a specific file. [IMPORTANT]: The output format is "LineNum | Content". Use these line numbers for the `patchFile` tool. Default reads first 300 lines. [READ TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么要读取这个文件？你期望获取什么信息？' },
        path: { type: 'string', description: 'The FULL PATH of the file (e.g., "05_正文草稿/chapter1.md"). Do not use just the filename.' },
        startLine: { type: 'integer', description: 'Start line number (default 1).' },
        endLine: { type: 'integer', description: 'End line number. If omitted, it defaults to reading 300 lines starting from startLine. Use this to read long files in chunks.' }
      },
      required: ['thinking', 'path']
    }
  }
};

export const searchFilesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'searchFiles',
    description: 'Search for files by name or content keywords. Use this to find file paths if you are unsure. [READ TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么要搜索？选择了哪些关键词？为什么？' },
        query: { type: 'string', description: 'The search keyword (e.g., "李逍遥", "细纲").' }
      },
      required: ['thinking', 'query']
    }
  }
};
