
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
          thinking: { type: 'string', description: 'Internal thought process: Why do you need to list files now? What are you looking for?' }
      },
      required: ['thinking']
    }
  }
};

export const readFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'readFile',
    description: 'Read the content of a specific file. [IMPORTANT]: The output format is "LineNum | Content". Use these line numbers for the `patchFile` tool. Default reads first 200 lines. [READ TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: 'Internal thought process: Why are you reading this specific file? What information do you expect to find?' },
        path: { type: 'string', description: 'The FULL PATH of the file (e.g., "05_正文草稿/chapter1.md"). Do not use just the filename.' },
        startLine: { type: 'integer', description: 'Start line number (default 1).' },
        endLine: { type: 'integer', description: 'End line number (default 200). Use this to read long files in chunks.' }
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
        thinking: { type: 'string', description: 'Internal thought process: Why are you searching? What keywords did you choose and why?' },
        query: { type: 'string', description: 'The search keyword (e.g., "李逍遥", "细纲").' }
      },
      required: ['thinking', 'query']
    }
  }
};
