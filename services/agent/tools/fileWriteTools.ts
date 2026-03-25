
import { ToolDefinition } from '../types';

export const createFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createFile',
    description: `Create a new markdown file with content at a specific path. [WRITE TOOL]

⚠️ CRITICAL: All markdown files MUST start with YAML frontmatter metadata.

General format (all files):
\`\`\`
---
summarys: ["一句话摘要"]
tags: ["标签1", "标签2"]
---
\`\`\`

Draft format (05_正文草稿/ files ONLY) — must add characters field:
\`\`\`
---
summarys: ["本章剧情摘要"]
tags: ["正文", "第X卷", "第X章"]
characters: ["角色A", "角色B"]
---
\`\`\`

Skipping the frontmatter is NOT allowed.`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么要创建这个文件？是否符合命名规范？是否包含了必需的 metadata 头部？' },
        path: { type: 'string', description: 'The FULL PATH including folder and extension (e.g., "03_剧情大纲/第一章_细纲.md"). The folder must exist.' },
        content: { type: 'string', description: 'The COMPLETE content of the file. MUST start with YAML frontmatter metadata (---\\nsummarys: [...]\\ntags: [...]\\n---) followed by the actual content.' }
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
    description: `✅ RECOMMENDED: 修改已有文件时优先使用此工具，基于字符串精确匹配。

【🔥 批量操作】
edits 数组支持一次修改多处位置！
- **10条以内的修改**：打包到一个 patchFile 调用中
- **超过10条修改**：分批次调用，每批约10条

【两种替换模式】

📌 **单点替换** (mode: "single")
- 精确匹配某段原文，替换为新内容
- 如果找到多处匹配会报错，要求提供更精确的原文
- 适用于：修改特定段落、剧情

📌 **全局替换** (mode: "global")
- 将文件中所有 oldContent 替换为 newContent
- 适用于：批量改名、统一术语

【使用流程】
1. 先 readFile 获取文件内容
2. 复制需要修改的原文到 oldContent（必须精确，包括空格和换行）
3. 编写 newContent 作为替换内容
4. 将修改打包到 edits 数组中（10条以内一批）

【示例】

批量修改多处：
\`\`\`json
{
  "path": "05_正文草稿/chapter1.md",
  "edits": [
    { "mode": "single", "oldContent": "第一段原文", "newContent": "新内容1" },
    { "mode": "single", "oldContent": "第二段原文", "newContent": "新内容2" },
    { "mode": "global", "oldContent": "张三", "newContent": "李四" }
  ]
}
\`\`\`

全局替换（批量改名）：
\`\`\`json
{
  "path": "05_正文草稿/chapter1.md",
  "edits": [{
    "mode": "global",
    "oldContent": "林月如",
    "newContent": "林月心"
  }]
}
\`\`\`

【关键规则 - CRITICAL】
- oldContent 必须**精确匹配**原文，包括空格、标点、换行
- 单点模式下如果匹配到多处，需要提供更多上下文使其唯一
- 10条以内的修改打包到一个调用，超过则分批

[WRITE TOOL]`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '思考过程(用中文):(1) 我读取了哪些内容？(2) oldContent 是否精确复制自原文？(3) 选择 single 还是 global 模式？(4) 是否合理分批（10条以内一批）？'
        },
        path: {
          type: 'string',
          description: 'The FULL PATH of the file to patch.'
        },
        edits: {
          type: 'array',
          description: '要应用的修改列表。10条以内打包到一个调用，超过则分批。',
          items: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                enum: ['single', 'global'],
                description: '替换模式：single=精确匹配单处，global=替换所有匹配'
              },
              oldContent: {
                type: 'string',
                description: '要查找的原始内容（必须精确匹配，包括空格和换行）'
              },
              newContent: {
                type: 'string',
                description: '替换后的新内容。如为空字符串则删除该内容。'
              }
            },
            required: ['mode', 'oldContent', 'newContent']
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
