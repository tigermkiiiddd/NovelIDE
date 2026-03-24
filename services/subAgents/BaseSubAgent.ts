import { AIService } from '../geminiService';
import { ToolDefinition } from '../agent/types';

/**
 * 子Agent配置接口
 */
export interface SubAgentConfig<TInput, TOutput, TContext = any> {
  /** 子Agent名称（用于日志） */
  name: string;

  /** 最大循环次数 */
  maxLoops: number;

  /** 滑动窗口：保留最近 N 轮工具调用对（默认 10） */
  maxHistoryPairs?: number;

  /** 工具列表 */
  tools: ToolDefinition[];

  /** 终止工具名称 */
  terminalToolName: string;

  /** 系统提示生成器（支持 context 参数） */
  getSystemPrompt: (input: TInput, context?: TContext) => string;

  /** 初始用户消息生成器 */
  getInitialMessage: (input: TInput) => string;

  /** 终止工具结果解析器 */
  parseTerminalResult: (args: any) => TOutput;

  /** 可选：自定义工具执行器（用于非终止工具） */
  executeCustomTool?: (name: string, args: any, context?: TContext) => Promise<string>;

  /** 可选：文本响应处理器（当LLM只返回文本时） */
  handleTextResponse?: (text: string, loopCount: number) => string | null;

  /** 可选：SubAgent 专用温度参数（默认 0.2，执行级 Agent 应使用低温度） */
  temperature?: number;
}

/**
 * 通用子Agent执行器
 */
export class BaseSubAgent<TInput, TOutput, TContext = any> {
  constructor(private config: SubAgentConfig<TInput, TOutput, TContext>) {}

  /**
   * 滑动窗口裁剪：保留 history[0]（原始输入）+ 最近 N 轮 pair
   * 被裁剪的 pair 生成摘要插入到 history[0] 之后
   */
  private trimHistory(history: any[], onLog?: (msg: string) => void): void {
    const maxPairs = this.config.maxHistoryPairs ?? 10;
    const pairsStart = 1; // history[0] 是原始输入，永远保留
    const pairsCount = Math.floor((history.length - pairsStart) / 2);

    if (pairsCount <= maxPairs) return;

    const pairsToRemove = pairsCount - maxPairs;
    const messagesToRemove = pairsToRemove * 2;

    // 提取被裁剪 pair 中的工具调用名称作为摘要
    const removedMessages = history.slice(pairsStart, pairsStart + messagesToRemove);
    const toolCalls: string[] = [];
    for (const msg of removedMessages) {
      if (msg.role === 'model') {
        for (const part of msg.parts || []) {
          if (part.functionCall) {
            toolCalls.push(`- ${part.functionCall.name}`);
          }
        }
      }
    }

    const summary = `[上下文窗口裁剪] 已裁剪 ${pairsToRemove} 轮历史操作：\n${toolCalls.join('\n')}\n以上操作已成功执行，请基于当前状态继续任务。`;

    // 执行裁剪：移除旧 pair，插入摘要
    history.splice(pairsStart, messagesToRemove, {
      role: 'user',
      parts: [{ text: summary }]
    });

    if (onLog) {
      onLog(`✂️ [${this.config.name}] 上下文裁剪：移除 ${pairsToRemove} 轮旧历史，保留最近 ${maxPairs} 轮`);
    }
  }

  async run(
    aiService: AIService,
    input: TInput,
    context?: TContext,
    onLog?: (msg: string) => void,
    signal?: AbortSignal
  ): Promise<TOutput> {
    const history: any[] = [];
    let loopCount = 0;

    // 构建系统提示（传递 context）
    const systemPrompt = this.config.getSystemPrompt(input, context);

    // 初始用户消息
    const initialMessage = this.config.getInitialMessage(input);
    history.push({
      role: 'user',
      parts: [{ text: initialMessage }]
    });

    if (onLog) {
      onLog(`🤖 [${this.config.name}] 开始执行任务`);
    }

    // ReAct循环
    while (loopCount < this.config.maxLoops) {
      if (signal?.aborted) {
        throw new Error(`${this.config.name} Aborted`);
      }

      loopCount++;

      // 滑动窗口裁剪（在 LLM 调用前执行）
      this.trimHistory(history, onLog);

      // 调用AI（使用 SubAgent 专用温度，默认 0.2）
      const response = await aiService.sendMessage(
        history,
        '',
        systemPrompt,
        this.config.tools,
        signal,
        undefined,  // forceToolName
        undefined,  // maxTokensOverride
        this.config.temperature ?? 0.2  // SubAgent 默认低温度
      );

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error(`${this.config.name} 无响应`);
      }

      const content = candidates[0].content;
      const parts = content.parts;

      // 记录思考过程
      const textPart = parts.find((p: any) => p.text);
      if (textPart && onLog) {
        onLog(`💭 [${this.config.name}]: ${textPart.text.substring(0, 80)}...`);
      }

      // 添加到历史
      history.push({ role: 'model', parts });

      // 处理工具调用
      const toolParts = parts.filter((p: any) => p.functionCall);

      if (toolParts.length > 0) {
        const functionResponses = [];

        for (const part of toolParts) {
          if (signal?.aborted) {
            throw new Error(`${this.config.name} Aborted`);
          }

          const { name, args, id } = part.functionCall;

          // 记录thinking
          if (args.thinking && onLog) {
            onLog(`🤔 [${this.config.name} 思考]: ${args.thinking}`);
          }

          // 检查是否为终止工具
          if (name === this.config.terminalToolName) {
            if (onLog) {
              onLog(`✅ [${this.config.name}] 任务完成`);
            }
            return this.config.parseTerminalResult(args);
          }

          // 执行自定义工具
          if (this.config.executeCustomTool) {
            const result = await this.config.executeCustomTool(name, args, context);
            functionResponses.push({
              functionResponse: {
                id: id || `call_${name}_${Date.now()}`,
                name: name,
                response: { result }
              }
            });
          }
        }

        // 将工具响应添加到历史
        if (functionResponses.length > 0) {
          history.push({
            role: 'user',
            parts: functionResponses
          });
        }
      } else {
        // LLM只返回文本，没有调用工具
        if (!textPart) {
          throw new Error(`${this.config.name} 异常：未提交结果且无文本输出`);
        }

        // 使用自定义处理器或默认催促
        const promptMessage = this.config.handleTextResponse
          ? this.config.handleTextResponse(textPart.text, loopCount)
          : `请立即调用 ${this.config.terminalToolName} 工具提交结果，不要只输出文字。`;

        if (promptMessage) {
          if (onLog) {
            onLog(`📢 [${this.config.name}] 催促调用工具...`);
          }
          history.push({
            role: 'user',
            parts: [{ text: promptMessage }]
          });
        }
      }
    }

    throw new Error(`${this.config.name} 超时：达到最大循环次数 ${this.config.maxLoops}`);
  }
}

/**
 * 便捷函数：创建并运行子Agent
 */
export async function runSubAgent<TInput, TOutput, TContext = any>(
  config: SubAgentConfig<TInput, TOutput, TContext>,
  aiService: AIService,
  input: TInput,
  context?: TContext,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<TOutput> {
  const agent = new BaseSubAgent(config);
  return agent.run(aiService, input, context, onLog, signal);
}
