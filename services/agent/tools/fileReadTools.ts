
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
          thinking: { type: 'string', description: '思考过程(用中文):为什么现在需要列出文件？你在寻找什么？' }
      },
      required: ['thinking']
    }
  }
};

export const readFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'readFile',
    description: `Read the content of a specific file. [READ TOOL]

【🔥 读取策略】
- **默认读取 300 行** - 大多数文件都不超过 300 行，直接调用即可读完全部内容
- **只有超长文件才需要分块** - 如果文件 > 300 行，才使用 startLine/endLine 分块读取
- **不要零碎读取！** - 每次只读几十行是浪费调用，应该一次读取更多

【输出格式】"LineNum | Content"，行号用于 patchFile 工具

【示例】
- 文件 < 300 行 → \`readFile({ path: "01_世界观/xxx.md" })\` 一次读完
- 文件 > 300 行 → 先读 1-300，再读 301-600...

⚠️ 角色文件自动注入：当读取 02_角色档案 目录下的角色文件时，系统会自动在文件内容后追加【角色动态状态】`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):(1) 这个文件大概多长？(2) 是否需要分块读取？(3) 我期望获取什么信息？' },
        path: { type: 'string', description: 'The FULL PATH of the file (e.g., "05_正文草稿/chapter1.md"). Do not use just the filename.' },
        startLine: { type: 'integer', description: 'Start line number (default 1). Only use for files > 300 lines.' },
        endLine: { type: 'integer', description: 'End line number. Defaults to startLine + 299 (reading 300 lines). Only use for files > 300 lines.' }
      },
      required: ['thinking', 'path']
    }
  }
};

export const searchFilesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'searchFiles',
    description: `Search for files by name or content keywords. [READ TOOL]

【尽职调查原则】如果搜索返回多个文件，你**必须逐一阅读所有文件**，不能只读一个就下结论。
- 搜索返回 N 个文件 → 必须阅读所有 N 个文件
- 阅读时发现引用其他文件 → 继续追查
- 只有阅读完所有相关文件后，才能形成结论`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么要搜索？选择了哪些关键词？你打算如何处理多个搜索结果？' },
        query: { type: 'string', description: 'The search keyword (e.g., "李逍遥", "细纲").' }
      },
      required: ['thinking', 'query']
    }
  }
};
