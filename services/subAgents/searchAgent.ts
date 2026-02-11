import { AIService } from '../geminiService';
import { FileNode } from '../../types';
import { FunctionDeclaration, Type } from "@google/genai";
import { generateId } from '../fileSystem';
import { 
  listFilesTool, 
  readFileTool, 
  searchFilesTool 
} from '../agent/tools/fileReadTools';

// --- Sub-Agent 专用工具：提交报告 ---
const submitReportTool: FunctionDeclaration = {
  name: 'submit_report',
  description: '当且仅当你收集了足够的信息，或者确认无法找到更多信息时，调用此工具结束任务。此工具会将你的调查结果转换成一份详细的 Markdown 格式报告提交给主 Agent。[TERMINAL TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      thinking: { type: Type.STRING, description: 'Final reflection: Are you confident in your findings? Is anything missing?' },
      summary: { type: Type.STRING, description: '对搜索结果的浓缩简介 (Executive Summary)。必须超过30个中文字符，详细概括关键发现，不能只有一句话。' },
      findings: { 
        type: Type.ARRAY, 
        items: {
          type: Type.OBJECT,
          properties: {
            path: { type: Type.STRING, description: '相关文件的完整路径' },
            relevance: { type: Type.STRING, description: '该文件为何相关？详细说明其在剧情或设定中的作用。' },
            content_snippet: { type: Type.STRING, description: '提取的核心信息摘要或原文引用（保留关键细节）。' }
          }
        },
        description: '详细的发现列表，每一个发现都应包含具体的文件路径和证据。' 
      },
      reasoning: { type: Type.STRING, description: '你的综合分析与判断理由：将碎片化的线索串联起来，解释为什么这些信息满足了主 Agent 的需求。' }
    },
    required: ['thinking', 'summary', 'findings', 'reasoning']
  }
};

// Sub-Agent 只能使用只读工具 + 提交工具
const SEARCH_AGENT_TOOLS = [
  listFilesTool,
  searchFilesTool,
  readFileTool,
  submitReportTool
];

// --- Sub-Agent System Prompt ---
const getSystemPrompt = (contextFiles: string) => `
你是一个专用的【信息检索与分析专家 (Sub-Agent)】。
你的上级是主 Agent，你负责在一个小说 IDE 环境中自主执行复杂的搜索和调研任务。

## 你的核心能力
1. **自主规划**：你不是只会执行一次搜索。你需要制定计划，比如先看文件列表，再关键词搜索，再读取具体文件内容。
2. **多轮行动 (Emergent Behavior)**：如果第一次搜索没结果，你需要尝试同义词、或者根据文件目录结构去猜测可能的位置。不要轻易放弃。
3. **深度阅读**：找到文件后，必须读取内容来验证相关性。

## Chain of Thought (Thinking) 协议
**CRITICAL**: 你所有的工具调用都包含一个 \`thinking\` 参数。
你必须利用这个参数来记录你的“内心独白”。在执行工具前，告诉自己：
- 为什么我要用这个工具？
- 我期望得到什么结果？
- 如果失败了，我的备选方案是什么？

## 环境上下文
${contextFiles}

## 任务流程
1. **分析需求**：理解主 Agent 的自然语言描述。
2. **循环探索**：
   - 使用 \`listFiles\` 了解项目结构。
   - 使用 \`searchFiles\` 查找线索。
   - 使用 \`readFile\` 深入验证。
   - *思考*：还需要查什么？信息够了吗？
3. **提交报告**：当你认为信息充足，使用 \`submit_report\` 提交。

## 最终产出要求 (Critical)
你最终提交的不是一句话，而是一份**详尽的调查报告 (Markdown Report)**。
- **证据链**：每一个结论都必须有文件内容作为支撑。
- **详细度**：\`summary\` 必须详实（>30字），\`findings\` 中的 \`relevance\` 和 \`content_snippet\` 必须具体。
- **格式**：即使没有找到直接答案，也要详细列出你尝试过的路径和分析，帮助主 Agent 排除错误方向。
`;

// --- Core Loop ---

export async function runSearchSubAgent(
  aiService: AIService,
  requestDescription: string,
  files: FileNode[],
  fileActions: any, // Read-only subset
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> {
  
  const history: any[] = [];
  const MAX_LOOPS = 8; // 给予子 Agent 足够的探索轮次
  let loopCount = 0;
  
  // 1. Initialize Context
  const systemPrompt = getSystemPrompt(`当前项目文件结构(简化):\n${fileActions.listFiles()}`);
  
  // Initial Trigger
  history.push({ role: 'user', parts: [{ text: `【主 Agent 任务派发】\n\n需求描述：${requestDescription}\n\n请开始你的调查工作。请先制定搜索策略，然后一步步执行。` }] });

  if(onLog) onLog(`🔍 [Sub-Agent] 接到任务: "${requestDescription.substring(0, 30)}..."`);

  while (loopCount < MAX_LOOPS) {
    if (signal?.aborted) {
        throw new Error("Search Agent Aborted");
    }

    loopCount++;
    
    // 2. Call AI
    const response = await aiService.sendMessage(
        history,
        '',
        systemPrompt,
        SEARCH_AGENT_TOOLS,
        signal
    );

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) throw new Error("Search Agent 无响应");

    const content = candidates[0].content;
    const parts = content.parts;
    
    // Log Agent Thought/Text
    const textPart = parts.find((p: any) => p.text);
    if (textPart && onLog) {
        onLog(`🔍 [Sub-Agent 思考]: ${textPart.text.substring(0, 50)}...`);
    }

    // Add to history
    history.push({ role: 'model', parts: parts });

    // 3. Handle Tools
    const toolParts = parts.filter((p: any) => p.functionCall);
    
    if (toolParts.length > 0) {
        const functionResponses = [];

        for (const part of toolParts) {
            if (signal?.aborted) throw new Error("Search Agent Aborted");

            const { name, args, id } = part.functionCall;
            
            // Log thinking process
            if (args.thinking && onLog) {
                 onLog(`🤔 [Sub-Agent 思考]: ${args.thinking}`);
            }

            // Check for Terminal Tool
            if (name === 'submit_report') {
                if(onLog) onLog(`✅ [Sub-Agent] 任务完成，正在生成报告...`);
                
                // Format the output for the Main Agent as a structured Markdown Report
                const report = `
# 🕵️‍♂️ 子智能体调查报告 (Sub-Agent Report)

> **任务目标**: ${requestDescription}

## 1. 核心结论 (Executive Summary)
${args.summary}

## 2. 关键发现与证据 (Findings & Evidence)
${args.findings.map((f: any) => `
### 📄 文件: \`${f.path}\`
- **相关性分析**: ${f.relevance}
- **核心原文摘录**:
  > ${f.content_snippet ? f.content_snippet.replace(/\n/g, '\n  > ') : '(无引用)'}
`).join('\n')}

## 3. 逻辑推导 (Reasoning)
${args.reasoning}
`;
                return report.trim();
            }

            // Execute Read Tools
            let result = '';
            try {
                if(onLog) {
                    const displayArgs = { ...args };
                    delete displayArgs.thinking;
                    const argsLog = Object.keys(displayArgs).length > 0 
                        ? ` ${JSON.stringify(displayArgs, null, 2)}` 
                        : '';
                    onLog(`🛠️ [Sub-Agent] 执行工具: ${name}${argsLog}`);
                }
                
                switch (name) {
                    case 'listFiles':
                        result = fileActions.listFiles();
                        break;
                    case 'searchFiles':
                        result = fileActions.searchFiles(args.query);
                        break;
                    case 'readFile':
                        result = fileActions.readFile(args.path, args.startLine, args.endLine);
                        break;
                    default:
                        result = `Error: Unknown tool ${name}`;
                }
            } catch (e: any) {
                result = `Tool Error: ${e.message}`;
            }

            functionResponses.push({ 
                functionResponse: { name, id, response: { result } } 
            });
        }
        
        // Add Tool Results to History
        history.push({ role: 'function', parts: functionResponses }); 
        
    } else {
        if (textPart) {
             // Let it loop
        } else {
             return "Sub-Agent 异常结束：未提交报告。";
        }
    }
  }

  return "Sub-Agent 任务超时：达到了最大循环次数，未能生成最终报告。";
}