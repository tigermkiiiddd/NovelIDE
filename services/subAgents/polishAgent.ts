import { AIService } from '../geminiService';
import { FileNode, ProjectMeta } from '../../types';
import { ToolDefinition } from '../agent/types';
import {
  listFilesTool,
  readFileTool
} from '../agent/tools/fileReadTools';
import { patchFileTool } from '../agent/tools/fileWriteTools';
import { buildProjectOverviewPrompt } from '../../utils/projectContext';
import { SKILL_TEXT_POLISH } from '../resources/skills/textPolish';
import { getNodePath } from '../../services/fileSystem';

// --- 润色报告终端工具 ---
const submitPolishReportTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_polish_report',
    description: '当全文去AI化润色完成（所有修改已通过 patchFile 提交）时，调用此工具结束任务并生成最终优化报告。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '【必须使用中文】最终反思：润色是否彻底？还有遗漏的AI痕迹吗？' },
        summary: { type: 'string', description: '润色完成摘要，必须超过30个中文字符。' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件路径' },
              type: { type: 'string', description: '修改类型：词汇替换/句式改造/删除套路/对话优化/段落调整' },
              original: { type: 'string', description: '原文' },
              revised: { type: 'string', description: '修改后' },
              reason: { type: 'string', description: '修改原因（引用Layer编号）' }
            }
          },
          description: '所有修改点的清单'
        }
      },
      required: ['thinking', 'summary', 'changes']
    }
  }
};

// 润色子代理工具集：只读 + patchFile
const POLISH_AGENT_TOOLS: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  patchFileTool,
  submitPolishReportTool
];

// --- System Prompt ---
const getPolishSystemPrompt = (
  targetFile: string,
  fileTree: string,
  projectOverview: string
) => `
${projectOverview}

# 【去AI文风润色专家】子代理

你是专精于消除 AI 生成文本痕迹的润色专家。你的任务是对小说正文进行去AI化改造，使其读起来更像人类自然写作。

## 目标文件
\`${targetFile}\`

## 技能规范
${SKILL_TEXT_POLISH}

## 工作流程（强制按序执行）

### 第一步：读取目标文件
使用 \`readFile\` 读取完整内容。分析文件规模：
- < 300 行：一次读完
- ≥ 300 行：分段读取（1-300, 301-600...）

### 第二步：逐段扫描
按以下顺序逐层检测：
1. **Layer 1 高风险词汇**：扫描 12 类禁用词
2. **Layer 2 句式改造**：检查三段式、解释性句式、同构句
3. **Layer 3-4 修饰限制**：形容词/成语密度
4. **Layer 5 对话去AI化**：对话是否有真实意图
5. **Layer 6-7 结构/标点**：段落长度、标点节奏
6. **Anti-AI 改写算法**：命中项执行改写
7. **No-Poison 检测**：五类毒点

### 第三步：生成修改（核心）
对每处发现的问题：
1. 收集 **20 个修改点**（最多），打包到一次 \`patchFile\` 调用
2. 使用 \`single\` 模式精准替换
3. 替换内容必须符合 Skill 规范

### 第四步：多轮执行
- 第一轮修改后，重新读取文件（验证修改已生效）
- 继续扫描剩余问题，生成下一批修改
- **每轮必须提交至少 20 个修改点**，直到全文扫描完毕

### 第五步：提交报告
当全文扫描完成且所有 AI 痕迹已处理，调用 \`submit_polish_report\` 提交优化报告。

## 强制规则
- **不改剧情**：大纲和设定不可改动
- **不改角色基线**：性格和关系保持不变
- **不删除伏笔**：关键伏笔必须保留
- **必须逐段检查**：禁止抽样检查
- **每批修改最多 20 个 edit**：超出则分批提交

## Chain of Thought 协议
所有工具调用必须包含 \`thinking\` 参数，记录你的内心独白：
- 为什么我要用这个工具？
- 我期望得到什么结果？
- 如果失败了，备选方案是什么？
`;

// --- 核心循环 ---
export async function runPolishSubAgent(
  aiService: AIService,
  targetFilePath: string,
  files: FileNode[],
  fileActions: any, // Read-only subset
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> {

  const history: any[] = [];
  const MAX_LOOPS = 15; // 足够多轮处理完整篇
  let loopCount = 0;
  const allChanges: Array<{
    path: string;
    type: string;
    original: string;
    revised: string;
    reason: string;
  }> = [];

  // 1. Initialize Context
  const fileTree = fileActions.listFiles();
  const systemPrompt = getPolishSystemPrompt(targetFilePath, fileTree, '');

  // 找到目标文件的 FileNode
  const targetNode = findFileNodeByPath(files, targetFilePath);

  function findFileNodeByPath(allFiles: FileNode[], path: string): FileNode | undefined {
    const parts = path.split('/').filter(p => p);
    if (parts.length === 0) return undefined;

    let currentParentId = 'root';
    let currentNode: FileNode | undefined;

    for (const partName of parts) {
      currentNode = allFiles.find(f => f.parentId === currentParentId && f.name === partName);
      if (!currentNode) return undefined;
      currentParentId = currentNode.id;
    }

    return currentNode;
  }

  if (!targetNode) {
    return `# 去AI文风润色失败\n\n未找到目标文件: ${targetFilePath}`;
  }

  // 初始触发
  history.push({
    role: 'user',
    parts: [{
      text: `【主 Agent 任务派发】\n\n请对文件 **${targetFilePath}** 进行去AI文风润色。\n\n要求：
1. 读取完整文件内容
2. 按 SKILL_TEXT_POLISH 规范逐段扫描
3. 每批最多 20 个修改点，使用 patchFile 提交
4. 多轮执行直到全文润色完毕
5. 最终调用 submit_polish_report 提交报告`
    }]
  });

  if (onLog) onLog(`✨ [Polish Agent] 开始润色: "${targetFilePath}"`);

  while (loopCount < MAX_LOOPS) {
    if (signal?.aborted) {
      throw new Error("Polish Agent Aborted");
    }

    loopCount++;

    // 2. Call AI
    const response = await aiService.sendMessage(
      history,
      '',
      systemPrompt,
      POLISH_AGENT_TOOLS,
      signal
    );

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      return "# Polish Agent 无响应\n\nAI 服务未返回响应，请重试。";
    }

    const content = candidates[0].content;
    const parts = content.parts;

    // Log Agent Thought/Text
    const textPart = parts.find((p: any) => p.text);
    if (textPart && onLog) {
      const logText = textPart.text.length > 80
        ? textPart.text.substring(0, 80) + '...'
        : textPart.text;
      onLog(`💭 [Polish Agent]: ${logText}`);
    }

    // Add to history
    history.push({ role: 'model', parts: parts });

    // 3. Handle Tools
    const toolParts = parts.filter((p: any) => p.functionCall);

    if (toolParts.length === 0) {
      // 没有工具调用，可能是思考结束
      if (textPart && textPart.text.includes('润色完成')) {
        break;
      }
      continue;
    }

    const functionResponses = [];

    for (const part of toolParts) {
      if (signal?.aborted) throw new Error("Polish Agent Aborted");

      const { name, args, id } = part.functionCall;

      // Log thinking
      if (args.thinking && onLog) {
        onLog(`🤔 [思考]: ${args.thinking.substring(0, 100)}...`);
      }

      // 终端工具：提交报告
      if (name === 'submit_polish_report') {
        if (onLog) onLog(`✅ [Polish Agent] 润色完成，生成报告...`);

        const report = {
          summary: args.summary || '润色完成',
          changes: args.changes || []
        };

        const reportMarkdown = `
# ✨ 去AI文风润色报告

> **目标文件**: ${targetFilePath}
> **修改总数**: ${args.changes?.length || 0} 处

## 执行摘要
${args.summary}

## 修改清单
${(args.changes || []).map((c: any, i: number) => `
### ${i + 1}. [${c.type}] ${c.path}
- **原文**: ${c.original}
- **修改为**: ${c.revised}
- **原因**: ${c.reason}
`).join('\n')}

## 验证检查
- [ ] 全文高风险词汇已替换
- [ ] 三段式句式已改造
- [ ] 对话已去AI化
- [ ] 标点节奏已调整
- [ ] 剧情未受影响
`;
        return reportMarkdown;
      }

      // 执行工具
      let result = '';
      try {
        if (onLog) {
          const displayArgs = { ...args };
          delete displayArgs.thinking;
          if (args.edits) {
            displayArgs.edits = `[${args.edits.length} 个修改]`;
          }
          onLog(`🛠️ [Polish Agent] 执行: ${name}`);
        }

        switch (name) {
          case 'listFiles':
            result = fileActions.listFiles();
            break;
          case 'readFile':
            result = await fileActions.readFile(args.path, args.startLine, args.endLine);
            break;
          case 'patchFile':
            // patchFile 会返回 APPROVAL_REQUIRED，我们记录这些修改点
            const patchResult = await fileActions.patchFile(args.path, args.edits);
            result = patchResult;

            // 记录修改点到 allChanges
            if (args.edits && args.edits.length > 0) {
              for (const edit of args.edits) {
                if (edit.oldContent && edit.newContent) {
                  allChanges.push({
                    path: args.path,
                    type: '润色修改',
                    original: edit.oldContent,
                    revised: edit.newContent,
                    reason: '按 SKILL_TEXT_POLISH 规范修改'
                  });
                }
              }
              if (onLog) onLog(`📝 [Polish Agent] 已提交 ${args.edits.length} 处修改，待审批...`);
            }
            break;
          default:
            result = `Error: Unknown tool ${name}`;
        }
      } catch (e: any) {
        result = `Tool Error: ${e.message}`;
        if (onLog) onLog(`❌ [Polish Agent] 工具执行失败: ${e.message}`);
      }

      functionResponses.push({
        functionResponse: { name, id, response: { result } }
      });
    }

    // Add Tool Results to History
    history.push({ role: 'function', parts: functionResponses });
  }

  // 超时但已有修改，返回已有结果
  if (allChanges.length > 0) {
    return `# ✨ 去AI文风润色报告（超时）

> **目标文件**: ${targetFilePath}
> **修改总数**: ${allChanges.length} 处
> ⚠️ 注意：任务超时，已完成部分修改

## 执行摘要
润色任务超时，已完成 ${allChanges.length} 处修改，请人工审核 DiffViewer 中的变更。

## 已完成的修改
${allChanges.map((c, i) => `
### ${i + 1}. [${c.type}]
- **原文**: ${c.original}
- **修改为**: ${c.revised}
`).join('\n')}
`;
  }

  return `# 去AI文风润色任务超时

润色任务未能在规定轮次内完成，请重试或手动润色。`;
}
