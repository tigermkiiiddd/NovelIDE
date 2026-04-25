/**
 * 去AI文风润色 SubAgent
 */

import { AIService } from '../geminiService';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import { ToolDefinition } from '../agent/types';
import { readFileTool } from '../agent/tools/fileReadTools';
import { patchFileTool } from '../agent/tools/fileWriteTools';
import { SKILL_TEXT_POLISH } from '../resources/skills/textPolish';
import { useAgentStore } from '../../stores/agentStore';
import { useKnowledgeGraphStore } from '../../stores/knowledgeGraphStore';
import { useFileStore } from '../../stores/fileStore';
import { generateId, findNodeByPath } from '../../services/fileSystem';

// --- 润色报告终端工具 ---
const submitPolishReportTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'polish_submitReport',
    description: '当全文去AI化润色完成时，调用此工具结束任务并生成最终优化报告。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '【必须使用中文】最终反思：润色是否彻底？' },
        summary: { type: 'string', description: '润色完成摘要，必须超过30个中文字符。' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件路径' },
              type: { type: 'string', description: '修改类型' },
              original: { type: 'string', description: '原文' },
              revised: { type: 'string', description: '修改后' },
              reason: { type: 'string', description: '修改原因' }
            }
          },
          description: '所有修改点的清单'
        }
      },
      required: ['thinking', 'summary', 'changes']
    }
  }
};

// 专用于润色的简化 patchFileTool
const polishPatchFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'patchFile',
    description: `对已有文件进行多处修改。将多处修改打包到一个调用中。

【修改模式】
- single：单点替换，oldContent 在文件中只能匹配一处
- global：全局替换，替换所有匹配项
- insert：在指定位置后插入内容

【使用规则】
- 每次调用最多 20 个 edits
- **oldContent 必须从文件内容中精确复制（逐字复制，包括空格、换行、标点）**
- **newContent 必须是改写后的内容，必须和 oldContent 不同！**
- 禁止 newContent 和 oldContent 相同（原文换原文没有意义）
- 修改时优先使用 single 模式，避免误替换
- 如果 oldContent 在文件中不存在，该 edit 会被忽略

【示例】
{
  "path": "05_正文草稿/chapter1.md",
  "edits": [
    { "mode": "single", "oldContent": "我觉得这个*非常*重要", "newContent": "这个*非常重要*" },
    { "mode": "single", "oldContent": "他说道：\"好的。\"", "newContent": "他点头：\"好。\"" }
  ]
}`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径'
        },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                enum: ['single', 'global', 'insert'],
                description: '修改模式'
              },
              oldContent: {
                type: 'string',
                description: '要替换的原文字符串（仅 single/global 模式）'
              },
              newContent: {
                type: 'string',
                description: '替换后的内容'
              },
              after: {
                type: 'string',
                description: '在此内容之后插入（仅 insert 模式）'
              }
            },
            required: ['mode']
          },
          description: '修改操作列表，每次最多 20 个'
        }
      },
      required: ['path', 'edits']
    }
  }
};

// 工具集：只给 readFile + patchFile + submit
const polishTools: ToolDefinition[] = [
  readFileTool,
  polishPatchFileTool,
  submitPolishReportTool
];

export interface PolishInput {
  targetFile: string;
  fileContent: string;
}

export interface PolishContext {
  styleMemories?: string;
}

export interface PolishOutput {
  success: boolean;
  report: string;
  changes: Array<{
    path: string;
    type: string;
    original: string;
    revised: string;
    reason: string;
  }>;
}

const polishSubAgentConfig: SubAgentConfig<PolishInput, PolishOutput, PolishContext> = {
  name: 'PolishSubAgent',
  maxLoops: 20,
  tools: polishTools,
  terminalToolName: 'polish_submitReport',
  temperature: 0.6,

  getSystemPrompt: (input: PolishInput, context?: PolishContext) => `
# 【去AI文风润色专家】子代理

你是专精于消除 AI 生成文本痕迹的润色专家。

## 目标文件
\`${input.targetFile}\`

## 文件内容（已加载）
\`\`\`
${input.fileContent}
\`\`\`

## 技能规范
${SKILL_TEXT_POLISH}

## 相关文风记忆
${context?.styleMemories || '（无相关记忆）'}

## 工作流程

### 逐段扫描
按以下顺序逐层检测：
1. **Layer 1 高风险词汇**：扫描 12 类禁用词
2. **Layer 2 句式改造**：检查三段式、解释性句式、同构句
3. **Layer 3-4 修饰限制**：形容词/成语密度
4. **Layer 5 对话去AI化**：对话是否有真实意图
5. **Layer 6-7 结构/标点**：段落长度、标点节奏
6. **Anti-AI 改写算法**：命中项执行改写

### 调用 patchFile
收集 **20 个修改点**（最多），打包到一次 \`patchFile\` 调用。

**关键要求：oldContent 和 newContent 必须不同！**
- oldContent：从原文中精确复制
- newContent：改写后的版本，必须和 oldContent 有实质差异

### 提交报告
调用 \`polish_submitReport\` 提交优化报告。

## 强制规则
- **不改剧情**：大纲和设定不可改动
- **不改角色基线**：性格和关系保持不变
- **不删除伏笔**：关键伏笔必须保留
- **必须逐段检查**：禁止抽样检查
- **每批修改最多 20 个 edit**
`,

  getInitialMessage: (input: PolishInput) => `
请对文件 **${input.targetFile}** 进行去AI文风润色。

文件内容已在 system prompt 中提供，请直接按 SKILL_TEXT_POLISH 规范扫描并调用 patchFile 提交修改。
`,

  parseTerminalResult: (args: any): PolishOutput => ({
    success: true,
    report: args.summary || '润色完成',
    changes: args.changes || []
  }),

  executeCustomTool: async (name: string, args: any, context?: PolishContext) => {
    if (name === 'polish_submitReport') {
      return JSON.stringify(args);
    }

    if (name === 'readFile') {
      const files = useFileStore.getState().files;
      const node = findNodeByPath(files, args.path);
      if (!node || !node.content) {
        return `Error: File not found: ${args.path}`;
      }
      let content = node.content;
      if (args.startLine || args.endLine) {
        const lines = content.split('\n');
        const start = (args.startLine || 1) - 1;
        const end = args.endLine || lines.length;
        content = lines.slice(start, end).join('\n');
      }
      return content;
    }

    if (name === 'patchFile') {
      console.log('[polishAgent] patchFile called with:', {
        path: args.path,
        editsCount: args.edits?.length,
        editsPreview: JSON.stringify(args.edits)?.substring(0, 500)
      });

      const files = useFileStore.getState().files;
      console.log('[polishAgent] fileStore state:', {
        filesCount: files.length,
        path: args.path
      });

      const node = findNodeByPath(files, args.path);
      console.log('[polishAgent] findNodeByPath result:', {
        found: !!node,
        hasContent: !!node?.content,
        contentLength: node?.content?.length
      });

      if (!node || !node.content) {
        return JSON.stringify({ type: 'ERROR', message: `File not found: ${args.path}` });
      }

      // 获取影子内容（pendingChanges 中待审批的最新修改）
      const pendingChanges = useAgentStore.getState().pendingChanges;
      const relevantPending = pendingChanges.filter(c => c.fileName === args.path && c.newContent !== null);
      const latestPending = relevantPending[relevantPending.length - 1];
      const originalContent = latestPending?.newContent || node.content || '';
      let modifiedContent = originalContent;
      let matchedCount = 0;

      // 过滤掉 oldContent === newContent 的无效修改
      const validEdits = (args.edits || []).filter((edit: { mode: string; oldContent?: string; newContent?: string }) => {
        if (edit.mode === 'insert') return true;
        return edit.oldContent !== edit.newContent;
      });

      if (validEdits.length === 0) {
        return JSON.stringify({
          type: 'NO_MATCH',
          message: `所有 edit 的 oldContent 与 newContent 相同，无实际修改`
        });
      }

      console.log('[polishAgent] patchFile 原始调用:', {
        path: args.path,
        totalEdits: (args.edits || []).length,
        validEdits: validEdits.length,
        originalContentLength: originalContent.length
      });

      for (const edit of validEdits) {
        if (edit.mode === 'single' && edit.oldContent !== undefined) {
          if (modifiedContent.includes(edit.oldContent)) {
            modifiedContent = modifiedContent.replace(edit.oldContent, edit.newContent || '');
            matchedCount++;
          }
        } else if (edit.mode === 'global' && edit.oldContent !== undefined) {
          const count = (modifiedContent.match(new RegExp(edit.oldContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
          modifiedContent = modifiedContent.split(edit.oldContent).join(edit.newContent || '');
          matchedCount += count;
        } else if (edit.mode === 'insert') {
          if (edit.after !== undefined) {
            const idx = modifiedContent.indexOf(edit.after);
            if (idx !== -1) {
              modifiedContent = modifiedContent.slice(0, idx + edit.after.length) +
                (edit.newContent || '') +
                modifiedContent.slice(idx + edit.after.length);
              matchedCount++;
            }
          }
        }
      }

      console.log('[polishAgent] patchFile 执行结果:', {
        totalEdits: (args.edits || []).length,
        matchedCount,
        contentChanged: modifiedContent !== originalContent
      });

      if (matchedCount === 0) {
        return JSON.stringify({
          type: 'NO_MATCH',
          message: `没有检测到可用的修改，${(args.edits || []).length} 个 edit 的 oldContent 全部匹配失败`
        });
      }

      // 添加到 pendingChanges，触发 DiffViewer
      const pendingChange = {
        id: generateId(),
        fileName: args.path,
        toolName: 'patchFile',
        args: { edits: args.edits },
        originalContent,
        newContent: modifiedContent,
        timestamp: Date.now(),
        description: `去AI文风润色：${matchedCount} 处修改`
      };
      useAgentStore.getState().addPendingChange(pendingChange);

      return JSON.stringify({
        type: 'APPROVAL_REQUIRED',
        message: `已提交 ${(args.edits || []).length} 处修改`
      });
    }

    return JSON.stringify({ type: 'ERROR', message: `Unknown tool: ${name}` });
  },

  handleTextResponse: (text: string, loopCount: number): string | null => {
    if (loopCount < 3) return '请调用 patchFile 或 polish_submitReport 工具。';
    return null;
  }
};

export async function runPolishSubAgent(
  aiService: AIService,
  input: PolishInput,
  context?: PolishContext,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<PolishOutput> {
  // 自动加载目标文件内容
  const files = useFileStore.getState().files;
  const node = findNodeByPath(files, input.targetFile);
  const fileContent = node?.content || '';

  const fullInput: PolishInput = {
    targetFile: input.targetFile,
    fileContent
  };

  // 获取文风记忆
  const knowledgeNodes = useKnowledgeGraphStore.getState().nodes;
  const styleMemories = knowledgeNodes
    .filter(n => n.category === '风格' || n.tags?.some((t: string) => t.includes('文风')))
    .map(n => `- [${n.category || '记忆'}] ${n.detail || n.summary || n.name}`)
    .join('\n');

  const finalContext: PolishContext = {
    styleMemories: styleMemories || undefined
  };

  const agent = new BaseSubAgent(polishSubAgentConfig);
  return agent.run(aiService, fullInput, finalContext, onLog, signal);
}
