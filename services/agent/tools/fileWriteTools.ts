
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
    description: `⚠️ DANGER: Overwrite the ENTIRE content of an existing file.

【仅限以下场景使用】
- 创建新文件（用 createFile 更好）
- 完全重写整个文件
- 文件内容极短（<10行）不值得精准定位

【禁止场景】
- ❌ 只修改部分内容 → 用 patchFile
- ❌ 使用省略号 "...", "// ...", "<!-- unchanged -->" → 这些会导致数据丢失

[CRITICAL WARNING]: This tool REPLACES the file completely. You MUST provide the FULL file content.
[WRITE TOOL]`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么必须用 updateFile 而不是 patchFile？确认你有完整内容且无省略。' },
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
    description: `✅ RECOMMENDED: 修改已有文件时优先使用此工具，精准高效。

【适用场景】
- 修改文件中的部分内容
- 更新特定段落/章节
- 添加或删除若干行

【使用流程】
1. 先 readFile 获取行号（格式: "LineNum | Content"）
2. 精确定位需要修改的起止行
3. 只替换需要改变的部分

【关键规则 - CRITICAL】
- startLine 必须是旧内容的第一行
- endLine 必须是旧内容的最后一行
- 行号错误会导致重复或丢失内容
- 只替换需要修改的部分，不要扩大范围

示例：替换第24-30行（7行旧表格）
✅ 正确: startLine=24, endLine=30, newContent="新的多行内容"
❌ 错误: startLine=27, endLine=27 (只替换27行，24-26行会保留并重复)
❌ 错误: startLine=20, endLine=35 (只需改24-30行，却修改了20-35行，影响了无关内容)

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
