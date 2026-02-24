
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
   */
  private async withRetry<T>(
    operation: () => Promise<T>, 
    retries = 3, 
    initialDelay = 2000
  ): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i < retries; i++) {
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

        if (isRateLimit || isServerError) {
          console.warn(`[AIService] API Error (${error.status || error.code}). Retrying in ${initialDelay}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, initialDelay));
          initialDelay *= 2; // Exponential backoff
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
    signal?: AbortSignal
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
      const modelName = this.config.modelName || 'gemini-2.0-flash';
      const isGemini = modelName.toLowerCase().includes('gemini');
      const baseURL = this.config.baseUrl || 'https://api.openai.com/v1';

      const requestPayload: any = {
        model: modelName,
        messages: openAIMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        max_tokens: this.config.maxOutputTokens,
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

      console.log('[AI Request]', JSON.stringify(requestMetadata, null, 2));

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
        safetyRatings: completion.choices?.[0]?.safetyRatings,
        promptFeedback: completion.promptFeedback,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }, null, 2));

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
        console.warn('[AIService] Response truncated: finish_reason=length');
      } else if (finishReason === 'content_filter') {
        warnings.push('内容被安全过滤器拦截 (finish_reason=content_filter)');
        console.warn('[AIService] Content filtered: finish_reason=content_filter');
      }

      // 检查空内容
      if (!msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) {
        warnings.push('响应无文本内容且无工具调用');
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

       console.error("[AIService] API Error:", {
         ...errorInfo,
         stack: error.stack,
       });

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
