
import OpenAI from "openai";
import { AIConfig } from "../types";
import { ToolDefinition } from "./agent/types";
import { AIResponseMetadata } from "../types/agentErrors";

// --- Constants ---
// Helper to generate settings based on config threshold
const getSafetySettings = (threshold: string = 'BLOCK_NONE') => [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold }
];

export class AIService {
  private config: AIConfig;
  private client: OpenAI | null = null;

  constructor(config: AIConfig) {
    this.config = config;
    this.initClient();
  }

  public updateConfig(newConfig: AIConfig) {
    this.config = newConfig;
    this.initClient();
  }

  private initClient() {
    const apiKey = this.config.apiKey || process.env.API_KEY || '';
    if (!apiKey) return;

    const baseURL = this.config.baseUrl || 'https://api.openai.com/v1';

    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
      dangerouslyAllowBrowser: true
    });
  }

  /**
   * Exponential Backoff Retry Wrapper
   * 对于网络错误自动增加重试次数
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    retries = 3,
    initialDelay = 2000
  ): Promise<T> {
    let lastError: any;
    let currentRetries = retries;

    for (let i = 0; i < currentRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        // Don't retry if aborted
        if (error?.name === 'AbortError') throw error;

        lastError = error;

        // Identify Retryable Errors: 429 (Rate Limit) or 5xx (Server)
        const isRateLimit =
            error?.status === 429 ||
            error?.code === 429 ||
            (error?.message && error.message.includes('429'));

        const isServerError = error?.status >= 500 || error?.code >= 500;

        // Network-level errors (HTTP/2 protocol errors, fetch failures)
        const isNetworkError =
            error?.message?.includes('Failed to fetch') ||
            error?.message?.includes('ERR_HTTP2') ||
            error?.message?.includes('NetworkError') ||
            error?.message?.includes('network') ||
            error?.message?.includes('protocol error') ||
            error?.message?.includes('stream reset');

        // 网络错误增加额外重试次数（最多5次）
        if (isNetworkError && currentRetries < 5) {
          currentRetries = 5;
          console.warn(`[AIService] 检测到网络错误，增加重试次数至 ${currentRetries}`);
        }

        if (isRateLimit || isServerError || isNetworkError) {
          console.warn(`[AIService] API Error (${error.status || error.code || 'network'}): ${error?.message?.substring(0, 100)}. Retrying in ${initialDelay}ms... (Attempt ${i + 1}/${currentRetries})`);
          await new Promise(resolve => setTimeout(resolve, initialDelay));
          initialDelay *= 2; // Exponential backoff
          // 最大延迟 30 秒
          if (initialDelay > 30000) initialDelay = 30000;
        } else {
          throw error;
        }
      }
    }

    console.error("[AIService] Max retries exceeded.");
    throw lastError;
  }

  async sendMessage(
    history: any[],
    message: string,
    systemInstruction: string,
    tools: ToolDefinition[],
    signal?: AbortSignal,
    forceToolName?: string,  // 强制调用指定工具名称
    maxTokensOverride?: number,  // 覆盖默认的 max_tokens（用于限制纯文字回复长度）
    temperatureOverride?: number,  // 覆盖默认的 temperature（用于 SubAgent 低温度执行）
    modelOverride?: string  // 覆盖默认模型（用于轻量任务）
  ): Promise<any> {
    
    if (!this.client) throw new Error("API Key not configured.");
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // 1. Prepare Messages for OpenAI
    const openAIMessages: any[] = [
      { role: 'system', content: systemInstruction }
    ];

    // Convert internal history format (Google-ish) to OpenAI format
    for (const msg of history) {
      // Handle User Messages
      if (msg.role === 'user') {
          // If it's a Tool Response (Function Output) simulating a User message
          if (msg.parts && msg.parts[0]?.functionResponse) {
              msg.parts.forEach((p: any) => {
                  if (p.functionResponse) {
                      // Ensure name exists (fallback for legacy messages)
                      const toolName = p.functionResponse.name || 'unknown_tool';
                      const toolId = p.functionResponse.id || `call_${toolName}_${Date.now()}`;

                      openAIMessages.push({
                          role: 'tool',
                          tool_call_id: toolId,
                          name: toolName,  // Some proxies need this
                          content: JSON.stringify(p.functionResponse.response)
                      });
                  }
              });
          } else {
              // Standard User Text
              const textContent = msg.parts ? msg.parts.map((p: any) => p.text).join('') : (msg.text || '');
              openAIMessages.push({ role: 'user', content: textContent });
          }
      }
      // Handle Model/Assistant Messages
      else if (msg.role === 'model' || msg.role === 'assistant') {
          // If it has Tool Calls
          const toolCalls = msg.parts?.filter((p: any) => p.functionCall).map((p: any) => ({
             // IMPORTANT: Use existing ID if present to ensure history consistency
             id: p.functionCall.id || `call_${Math.random().toString(36).substr(2, 9)}`, 
             type: 'function',
             function: {
                 name: p.functionCall.name,
                 arguments: JSON.stringify(p.functionCall.args)
             }
          }));

          const textContent = msg.parts?.find((p: any) => p.text)?.text || '';

          const assistantMsg: any = { role: 'assistant' };
          if (textContent) assistantMsg.content = textContent;
          if (toolCalls && toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;

          openAIMessages.push(assistantMsg);
      }
    }

    // Add current message if exists (usually empty string in agent loop)
    if (message) {
        openAIMessages.push({ role: 'user', content: message });
    }

    try {
      // 2. Prepare Request Options (with Gemini Safety Settings Injection)
      const modelName = modelOverride || this.config.modelName || 'gemini-2.0-flash';
      const isGemini = modelName.toLowerCase().includes('gemini');
      const baseURL = this.config.baseUrl || 'https://api.openai.com/v1';

      const requestPayload: any = {
        model: modelName,
        messages: openAIMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: forceToolName
          ? { type: 'function', function: { name: forceToolName } }  // 强制调用指定工具
          : (tools.length > 0 ? 'auto' : undefined),
        max_tokens: maxTokensOverride ?? this.config.maxOutputTokens,
        temperature: temperatureOverride ?? (this.config as any).temperature ?? 0.7,  // SubAgent 可覆盖温度，默认 0.7
      };

      // Support Safety Settings for Gemini models (even in OpenAI compatible mode)
      // This allows 'safetySetting' to work for OneAPI/NewAPI/Google-OpenAI-Compatible-Endpoint
      if (isGemini) {
        const threshold = this.config.safetySetting || 'BLOCK_NONE';
        const settings = getSafetySettings(threshold);
        // Inject as top-level property 'safetySettings' (Standard for Google REST & Proxies)
        requestPayload.safetySettings = settings;
      }

      // Build request metadata for debug display
      const requestStartTime = Date.now();
      const requestMetadata = {
        endpoint: `${baseURL}/chat/completions`,
        model: modelName,
        max_tokens: this.config.maxOutputTokens,
        messageCount: openAIMessages.length,
        hasTools: tools.length > 0,
        toolCount: tools.length,
        safetySettings: requestPayload.safetySettings,
        timestamp: new Date().toISOString(),
      };

      // 构建完整 URL - baseURL 可能是: https://api.openai.com/v1, https://xinyun.ai/v1, https://api.moonshot.cn/v1 等
      const fullURL = baseURL.includes('/v1')
        ? `${baseURL}/chat/completions`
        : baseURL.includes('/chat/completions')
          ? baseURL
          : `${baseURL}/v1/chat/completions`;

      console.log('[AI Request - 完整请求]', JSON.stringify({
        baseURL: baseURL,
        fullURL: fullURL,
        payload: {
          ...requestPayload,
          messages: openAIMessages.map((m: any) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content?.substring(0, 500) : '[多部分内容]',
            toolCalls: m.toolCalls?.map((tc: any) => tc.function?.name),
            toolCallId: m.toolCallId
          })),
          tools: tools.map((t: any) => ({
            type: t.type,
            function: {
              name: t.function?.name,
              description: t.function?.description?.substring(0, 100)
            }
          }))
        },
        timestamp: new Date().toISOString(),
      }, null, 2));

      const completion: any = await this.withRetry(() =>
          this.client!.chat.completions.create(requestPayload, { signal })
      );

      const requestEndTime = Date.now();
      const duration = requestEndTime - requestStartTime;

      // 收集警告信息
      const warnings: string[] = [];

      // Build response metadata for debug display
      const finishReason = completion.choices?.[0]?.finish_reason;
      const responseMetadata: AIResponseMetadata = {
        requestId: completion.id,
        model: completion.model,
        usage: {
          prompt_tokens: completion.usage?.prompt_tokens,
          completion_tokens: completion.usage?.completion_tokens,
          total_tokens: completion.usage?.total_tokens,
        },
        finishReason: finishReason,
        duration,
        warnings,
      };

      console.log('[AI Response]', JSON.stringify({
        requestId: completion.id,
        model: completion.model,
        usage: completion.usage,
        finishReason,
        choicesCount: completion.choices?.length ?? 0,
        // 打印第一个 choice 的完整内容以便调试
        firstChoice: completion.choices?.[0] ? {
          index: completion.choices[0].index,
          finishReason: completion.choices[0].finishReason,
          message: completion.choices[0].message ? {
            role: completion.choices[0].message.role,
            content: completion.choices[0].message.content,
            toolCallsCount: completion.choices[0].message.tool_calls?.length ?? 0,
          } : null,
        } : null,
        safetyRatings: completion.choices?.[0]?.safetyRatings,
        promptFeedback: completion.promptFeedback,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }, null, 2));

      // 调试：如果 completion_tokens 为 0，打印完整响应
      if ((completion.usage?.completion_tokens ?? 0) === 0) {
        console.error('[AI Response] ⚠️ completion_tokens=0，完整响应:', JSON.stringify(completion, null, 2));
      }

      if (!completion.choices || completion.choices.length === 0) {
          // 检查是否是限流导致的空响应
          const usage = completion.usage || {};
          const isEmptyGeneration = usage.completion_tokens === 0;

          let errorHint = 'API 返回空响应';
          if (isEmptyGeneration) {
            errorHint = 'API 限流或服务暂时不可用 (completion_tokens=0)';
            warnings.push('空响应可能由限流导致');
          }

          const error = new Error(`${errorHint}\n\n原始响应：\n${JSON.stringify(completion, null, 2)}`);
          // @ts-ignore - 添加元数据到错误对象
          error._metadata = responseMetadata;
          // @ts-ignore - 标记错误类型
          error._isEmptyResponse = true;
          throw error;
      }

      const choice = completion.choices[0];
      const msg = choice.message;

      // 检查 finish_reason 并添加警告
      if (finishReason === 'length') {
        warnings.push('响应被截断 (finish_reason=length)');
        console.warn('[AIService] Response truncated - Full Response:', JSON.stringify({
          requestId: completion.id,
          model: completion.model,
          usage: completion.usage,
          finishReason,
          fullChoice: completion.choices?.[0],
          timestamp: new Date().toISOString(),
        }, null, 2));
      } else if (finishReason === 'content_filter') {
        warnings.push('内容被安全过滤器拦截 (finish_reason=content_filter)');
        // 记录完整的原始响应以便调试
        console.error('[AIService] Content filtered - Full Response:', JSON.stringify({
          requestId: completion.id,
          model: completion.model,
          usage: completion.usage,
          finishReason,
          safetyRatings: completion.choices?.[0]?.safetyRatings,
          promptFeedback: completion.promptFeedback,
          fullChoice: completion.choices?.[0],
          timestamp: new Date().toISOString(),
        }, null, 2));
      }

      // 检查空内容
      if (!msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) {
        warnings.push('响应无文本内容且无工具调用');

        const usage = completion.usage || {};
        const isEmptyGeneration = usage.completion_tokens === 0;

        let errorHint = 'API 返回空消息（无文本且无工具调用）';
        if (isEmptyGeneration) {
          errorHint = 'API 限流或服务暂时不可用 (completion_tokens=0)';
          warnings.push('空响应可能由限流导致');
        }

        const error = new Error(`${errorHint}\n\n原始响应：\n${JSON.stringify(completion, null, 2)}`);
        // @ts-ignore - 添加元数据到错误对象
        error._metadata = responseMetadata;
        // @ts-ignore - 标记错误类型
        error._isEmptyResponse = true;
        throw error;
      }

      // 3. Convert OpenAI Response back to Internal Format (parts based)
      const parts: any[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.tool_calls) {
        msg.tool_calls.forEach((tc: any) => {
          if (tc.type === 'function') {
              // CRITICAL: Generate and PERSIST the ID here if the API didn't return one (rare but possible with some proxies)
              // This ensures the next turn (Tool Response) uses the exact same ID.
              const callId = tc.id || `call_${Math.random().toString(36).substr(2, 9)}`;
              
              parts.push({
                functionCall: {
                  id: callId,
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments) 
                }
              });
          }
        });
      }

      return {
        candidates: [
          {
            content: {
              parts: parts
            }
          }
        ],
        // Attach metadata for debug display and error handling
        _metadata: {
          request: requestMetadata,
          response: {
            ...responseMetadata,
            safetyRatings: completion.choices?.[0]?.safetyRatings,
            promptFeedback: completion.promptFeedback,
            rawCompletion: completion,
          },
        },
        // 直接暴露 AIResponseMetadata 给上层使用
        _aiMetadata: responseMetadata,
      };

    } catch (error: any) {
       if (error instanceof DOMException && error.name === 'AbortError') throw error;
       // @ts-ignore
       if (error?.name === 'AbortError') throw error;

       // 增强错误信息
       const errorInfo = {
         message: error.message,
         status: error.status || error.response?.status,
         code: error.code,
         requestId: error.requestId || error.response?.headers?.['x-request-id'],
       };

       console.error("[AIService] API Error:", JSON.stringify({
         ...errorInfo,
         stack: error.stack,
       }, null, 2));

       // 将请求信息附加到错误对象，便于调试
       error._requestInfo = {
         endpoint: `${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`,
         model: this.config.modelName,
         timestamp: new Date().toISOString(),
       };

       throw error;
    }
  }
}
