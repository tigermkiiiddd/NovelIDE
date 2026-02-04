
import { Type, FunctionDeclaration } from "@google/genai";
import { useFileStore } from '../../../stores/fileStore';
import { FileType, FileNode } from '../../../types';

export const listFilesTool: FunctionDeclaration = {
  name: 'listFiles',
  description: 'List the entire project file structure. NOW INCLUDES METADATA: Each file will show its [Tags] and [Summary] if available. Use this to quickly scan project content without reading every file. [READ TOOL]',
  parameters: { type: Type.OBJECT, properties: {} }
};

export const readFileTool: FunctionDeclaration = {
  name: 'readFile',
  description: 'Read the content of a specific file. Returns content with line numbers. Default reads first 200 lines. [READ TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      path: { type: Type.STRING, description: 'The FULL PATH of the file (e.g., "05_正文草稿/chapter1.md"). Do not use just the filename.' },
      startLine: { type: Type.INTEGER, description: 'Start line number (default 1).' },
      endLine: { type: Type.INTEGER, description: 'End line number (default 200). Use this to read long files in chunks.' }
    },
    required: ['path']
  }
};

export const searchFilesTool: FunctionDeclaration = {
  name: 'searchFiles',
  description: 'Search for files by name or content keywords. Use this to find file paths if you are unsure. [READ TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search keyword (e.g., "李逍遥", "细纲").' }
    },
    required: ['query']
  }
};
