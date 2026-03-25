
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
    description: `修改已有文件，基于字符串精确匹配。

【🔥 批量操作优先】
- **同一文件的多处修改应该打包到一个 patchFile 调用中**
- 每批最多 10 个 edits，超过则分多次调用
- 只有一处修改时，正常传入单个 edit 即可

【三种操作模式】

📌 **single** - 单点替换
- 精确匹配一处，多处匹配会报错
- 需要：oldContent, newContent

📌 **global** - 全局替换
- 替换所有匹配项
- 需要：oldContent, newContent

📌 **insert** - 插入内容
- after="某内容" 在其后插入，after="" 在文件末尾插入
- before="某内容" 在其前插入
- 需要：after 或 before, newContent

【示例 - 批量修改】

\`\`\`json
{
  "path": "05_正文草稿/chapter1.md",
  "edits": [
    { "mode": "single", "oldContent": "*去死吧！*", "newContent": "*去死吧，怪物！*" },
    { "mode": "single", "oldContent": "*怪物……*", "newContent": "*还能站起来……*" },
    { "mode": "single", "oldContent": "*该出发了。*", "newContent": "*时间到了。*" }
  ]
}
\`\`\`

【关键规则】
- 定位内容必须**精确匹配**原文（空格、换行、标点完全一致）
- 多处修改打包到一个调用，减少审批次数
- 每批最多10个 edits

[WRITE TOOL]`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '思考过程(用中文):(1) 我要对这个文件做几处修改？(2) 是否有多个修改需要打包？(3) 每个 oldContent 是否精确复制自原文？'
        },
        path: {
          type: 'string',
          description: 'The FULL PATH of the file to patch.'
        },
        edits: {
          type: 'array',
          description: '修改列表。多处修改打包到一个数组，单处修改正常传入即可。每批最多10个。',
          items: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                enum: ['single', 'global', 'insert'],
                description: '操作模式：single=单点替换, global=全局替换, insert=插入'
              },
              oldContent: {
                type: 'string',
                description: '[single/global] 要查找的原始内容（必须精确匹配）'
              },
              after: {
                type: 'string',
                description: '[insert] 在此内容之后插入。空字符串=文件末尾'
              },
              before: {
                type: 'string',
                description: '[insert] 在此内容之前插入'
              },
              newContent: {
                type: 'string',
                description: '新内容/插入内容'
              }
            },
            required: ['mode', 'newContent']
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
