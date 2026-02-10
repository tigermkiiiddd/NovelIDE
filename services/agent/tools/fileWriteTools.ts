
import { Type, FunctionDeclaration } from "@google/genai";

export const createFileTool: FunctionDeclaration = {
  name: 'createFile',
  description: 'Create a new markdown file with content at a specific path. [WRITE TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      thinking: { type: Type.STRING, description: 'Internal thought process: Why are you creating this file? Does it comply with the naming convention?' },
      path: { type: Type.STRING, description: 'The FULL PATH including folder and extension (e.g., "03_剧情大纲/第一章_细纲.md"). The folder must exist.' },
      content: { type: Type.STRING, description: 'The content of the file.' }
    },
    required: ['thinking', 'path', 'content']
  }
};

export const updateFileTool: FunctionDeclaration = {
  name: 'updateFile',
  description: 'Overwrite the ENTIRE content of an existing file. WARNING: You MUST call `readFile` on this file immediately before using this tool to ensure you have the latest version. [WRITE TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      thinking: { type: Type.STRING, description: 'Internal thought process: Why are you overwriting this file? Have you read the original content?' },
      path: { type: Type.STRING, description: 'The FULL PATH of the file to update (e.g., "05_正文草稿/chapter1.md").' },
      content: { type: Type.STRING, description: 'The new FULL content.' }
    },
    required: ['thinking', 'path', 'content']
  }
};

export const patchFileTool: FunctionDeclaration = {
  name: 'patchFile',
  description: 'Replace specific lines in a file. Use this for partial updates. You MUST call `readFile` first to get correct line numbers. [WRITE TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      thinking: { type: Type.STRING, description: 'Internal thought process: What specific lines are you changing and why?' },
      path: { type: Type.STRING, description: 'The FULL PATH of the file to patch.' },
      startLine: { type: Type.INTEGER, description: 'The starting line number to replace (1-based).' },
      endLine: { type: Type.INTEGER, description: 'The ending line number to replace (1-based, inclusive).' },
      newContent: { type: Type.STRING, description: 'The new content to insert at these lines.' }
    },
    required: ['thinking', 'path', 'startLine', 'endLine', 'newContent']
  }
};

export const renameFileTool: FunctionDeclaration = {
  name: 'renameFile',
  description: 'Rename a file. Currently only supports renaming the filename, not moving folders. [WRITE TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      thinking: { type: Type.STRING, description: 'Internal thought process: Why is the rename necessary?' },
      oldPath: { type: Type.STRING, description: 'The current full path (e.g. "05_正文草稿/old.md")' },
      newName: { type: Type.STRING, description: 'The new FILENAME only (e.g. "new.md")' }
    },
    required: ['thinking', 'oldPath', 'newName']
  }
};

export const deleteFileTool: FunctionDeclaration = {
  name: 'deleteFile',
  description: 'Delete a file or folder. [WRITE TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: { 
      thinking: { type: Type.STRING, description: 'Internal thought process: Why must this file be deleted? Is it safe?' },
      path: { type: Type.STRING, description: 'The full path of the file or folder to delete.' } 
    },
    required: ['thinking', 'path']
  }
};
