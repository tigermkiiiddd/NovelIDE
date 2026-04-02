
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
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
  private anthropicClient: Anthropic | null = null;
  private sdkBaseURL: string = '';  // SDK 实际使用的 baseURL
  private isGLMProtocol: boolean = false;  // 是否为 GLM v4 协议

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

    let baseURL = this.config.baseUrl || '';

    // 根据 baseUrl 特征判断协议类型
    const isAnthropicProtocol = baseURL.toLowerCase().includes('anthropic');
    const isGLMProtocol = baseURL.includes('/paas/');

    if (isAnthropicProtocol) {
      // Anthropic 原生协议（GLM Coding Plan 等）
      this.anthropicClient = new Anthropic({
        apiKey,
        baseURL: baseURL.replace(/\/+$/, ''),
        dangerouslyAllowBrowser: true,
      });
      this.client = null;
    } else {
      // OpenAI-compatible 协议
      baseURL = baseURL || 'https://api.openai.com/v1';
      baseURL = baseURL.replace(/\/+$/, '');
      if (baseURL.includes('/chat/completions')) {
        baseURL = baseURL.replace(/\/chat\/completions.*$/, '');
      }
      // 自动补全版本号
      if (!baseURL.match(/\/v\d+$/)) {
        baseURL = `${baseURL}/v1`;
      }
      this.sdkBaseURL = baseURL;
      this.isGLMProtocol = isGLMProtocol;
      this.client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
      this.anthropicClient = null;
    }
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
    
    // 根据 baseUrl 特征判断协议
    const baseURL = this.config.baseUrl || '';
    const isAnthropicProtocol = baseURL.toLowerCase().includes('anthropic');

    if (isAnthropicProtocol) {
      return this.sendMessageAnthropic(history, message, systemInstruction, tools, signal,
        maxTokensOverride, temperatureOverride, modelOverride);
    }

    if (this.isGLMProtocol) {
      return this.sendMessageGLM(history, message, systemInstruction, tools, signal,
        maxTokensOverride, temperatureOverride, modelOverride);
    }

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

      const requestPayload: any = {
        model: modelName,
        messages: openAIMessages,
        stream: true,  // 使用流式接收，兼容所有代理
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
        endpoint: `${this.sdkBaseURL}/chat/completions`,
        model: modelName,
        max_tokens: this.config.maxOutputTokens,
        messageCount: openAIMessages.length,
        hasTools: tools.length > 0,
        toolCount: tools.length,
        safetySettings: requestPayload.safetySettings,
        timestamp: new Date().toISOString(),
      };

      console.log('[AI Request - 完整请求]', JSON.stringify({
        sdkBaseURL: this.sdkBaseURL,
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

      // 使用流式请求，收集所有 chunk 后拼装为完整响应
      const stream: any = await this.withRetry(() =>
          this.client!.chat.completions.create(requestPayload, { signal })
      );

      // 收集流式 chunk
      let content = '';
      const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
      let finishReason: string | null = null;
      let model = '';
      let id = '';
      let usage: any = null;

      for await (const chunk of stream) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        id = chunk.id || id;
        model = chunk.model || model;
        if (chunk.usage) usage = chunk.usage;

        const choice = chunk.choices?.[0];
        if (choice) {
          finishReason = choice.finish_reason || finishReason;
          // 收集文本内容
          const delta = choice.delta;
          if (delta?.content) {
            content += delta.content;
          }
          // 收集 tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
                  name: tc.function?.name || '',
                  arguments: '',
                });
              }
              const entry = toolCallsMap.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) entry.arguments += tc.function.arguments;
            }
          }
        }
      }

      // 拼装为标准非流式响应格式，后续代码无需改动
      const completion: any = {
        id,
        object: 'chat.completion',
        model,
        choices: [{
          index: 0,
          finish_reason: finishReason || 'stop',
          message: {
            role: 'assistant',
            content: content || null,
            tool_calls: toolCallsMap.size > 0
              ? Array.from(toolCallsMap.entries()).map(([idx, tc]) => ({
                  index: idx,
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: tc.arguments },
                }))
              : undefined,
          },
        }],
        usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      const requestEndTime = Date.now();
      const duration = requestEndTime - requestStartTime;

      // 收集警告信息
      const warnings: string[] = [];

      // Build response metadata for debug display
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

              // 尝试解析 arguments，处理截断情况
              let parsedArgs: any;
              try {
                parsedArgs = JSON.parse(tc.function.arguments);
              } catch (parseError) {
                // finish_reason=length 导致 tool_call arguments 被截断
                console.error(`[AIService] Tool call arguments JSON parse failed (finish_reason=${finishReason}). Tool: ${tc.function.name}. Error: ${(parseError as Error).message}`);
                warnings.push(`工具调用「${tc.function.name}」参数被截断，无法解析`);
                // 如果没有文本内容，用截断提示替代
                if (!msg.content) {
                  parts.push({ text: `[响应被截断] 工具调用「${tc.function.name}」的参数因达到 token 上限而被截断，请调整请求内容后重试。` });
                }
                return; // 跳过这个 tool_call
              }

              parts.push({
                functionCall: {
                  id: callId,
                  name: tc.function.name,
                  args: parsedArgs
                }
              });
          }
        });
      }

      // 兜底：parts 为空时添加截断提示（所有 tool_calls 都被跳过且无 content）
      if (parts.length === 0) {
        parts.push({ text: `[响应被截断] 因达到 token 上限，响应内容不完整。请缩减内容或调整 max_tokens 后重试。` });
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
         endpoint: `${this.sdkBaseURL}/chat/completions`,
         model: this.config.modelName,
         timestamp: new Date().toISOString(),
       };

       throw error;
    }
  }

  /**
   * Anthropic 原生协议（GLM Coding Plan 等）
   */
  private async sendMessageAnthropic(
    history: any[],
    message: string,
    systemInstruction: string,
    tools: ToolDefinition[],
    signal?: AbortSignal,
    maxTokensOverride?: number,
    temperatureOverride?: number,
    modelOverride?: string
  ): Promise<any> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // 1. 构建 Anthropic 格式 messages
    const anthropicMessages: any[] = [];
    for (const msg of history) {
      if (msg.role === 'user') {
        if (msg.parts && msg.parts[0]?.functionResponse) {
          msg.parts.forEach((p: any) => {
            if (p.functionResponse) {
              const toolName = p.functionResponse.name || 'unknown_tool';
              const toolId = p.functionResponse.id || `call_${toolName}_${Date.now()}`;
              anthropicMessages.push({
                role: 'user',
                content: [
                  { type: 'tool_result', tool_use_id: toolId, content: JSON.stringify(p.functionResponse.response) }
                ]
              });
            }
          });
        } else {
          const textContent = msg.parts ? msg.parts.map((p: any) => p.text).join('') : (msg.text || '');
          anthropicMessages.push({ role: 'user', content: textContent });
        }
      } else if (msg.role === 'model' || msg.role === 'assistant') {
        const textContent = msg.parts?.find((p: any) => p.text)?.text || '';
        const toolCalls = msg.parts?.filter((p: any) => p.functionCall).map((p: any) => ({
          id: p.functionCall.id || `call_${Math.random().toString(36).substr(2, 9)}`,
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) }
        }));
        if (textContent || toolCalls.length > 0) {
          const msgContent: any[] = [];
          if (textContent) msgContent.push({ type: 'text', text: textContent });
          toolCalls.forEach((tc: any) => {
            msgContent.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) });
          });
          anthropicMessages.push({ role: 'assistant', content: msgContent });
        }
      }
    }
    if (message) {
      anthropicMessages.push({ role: 'user', content: message });
    }

    // 2. 构建请求
    const modelName = modelOverride || this.config.modelName || 'glm-4';
    const requestPayload: any = {
      model: modelName,
      messages: anthropicMessages,
      max_tokens: maxTokensOverride ?? this.config.maxOutputTokens ?? 8192,
      stream: true,
    };
    if (systemInstruction) {
      requestPayload.system = systemInstruction;
    }
    if (tools.length > 0) {
      requestPayload.tools = tools;
    }

    console.log('[Anthropic Request]', JSON.stringify({
      endpoint: `${this.config.baseUrl}/messages`,
      payload: requestPayload,
    }, null, 2));

    // 3. 原生 fetch 流式请求（跳过 SDK 避免兼容问题）
    const apiKey = this.config.apiKey || '';
    const response = await this.withRetry(async () => {
      const res = await fetch(`${this.config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(requestPayload),
        signal,
      });
      if (!res.ok) {
        const body = await res.text();
        const error = new Error(`Anthropic API ${res.status}: ${body}`);
        (error as any).status = res.status;
        throw error;
      }
      return res;
    });

    let content = '';
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason: string | null = null;
    let usage: any = null;

    // 4. 解析 SSE 流
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const event = JSON.parse(data);
            if (event.type === 'message_delta' && event.usage) usage = event.usage;
            if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') content += event.delta.text;
              if (event.delta.type === 'tool_use_delta') {
                const idx = event.delta.tool_use_index ?? 0;
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, {
                    id: event.delta.id || `call_${Math.random().toString(36).substr(2, 9)}`,
                    name: event.delta.name || '',
                    arguments: '',
                  });
                }
                toolCallsMap.get(idx)!.arguments += event.delta.input ?? '';
              }
            }
            if (event.type === 'message_delta') {
              finishReason = event.delta.stop_reason || null;
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log('[Anthropic Response]', JSON.stringify({
      contentLength: content.length,
      toolCallsCount: toolCallsMap.size,
      finishReason,
      usage,
    }, null, 2));

    // 4. 转回内部 parts 格式
    const parts: any[] = [];
    if (content) parts.push({ text: content });
    if (toolCallsMap.size > 0) {
      toolCallsMap.forEach((tc) => {
        let parsedArgs: any;
        try {
          parsedArgs = JSON.parse(tc.arguments);
        } catch {
          parts.push({ text: `[响应被截断] 工具调用「${tc.name}」参数无法解析。` });
          return;
        }
        parts.push({ functionCall: { id: tc.id, name: tc.name, args: parsedArgs } });
      });
    }
    if (parts.length === 0) {
      parts.push({ text: `[无响应内容]` });
    }

    return {
      candidates: [{ content: { parts } }],
      _metadata: {
        request: { endpoint: `${this.config.baseUrl}`, model: modelName },
        response: { finishReason, usage },
      },
    };
  }

  /**
   * GLM v4 协议（OpenAI-compatible 但流式格式不同）
   * 使用 raw fetch + SSE 解析，跳过 OpenAI SDK 的流式解析
   */
  private async sendMessageGLM(
    history: any[],
    message: string,
    systemInstruction: string,
    tools: ToolDefinition[],
    signal?: AbortSignal,
    maxTokensOverride?: number,
    temperatureOverride?: number,
    modelOverride?: string
  ): Promise<any> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // 1. 构建 messages（system 在 messages 数组内）
    const glmMessages: any[] = [];
    if (systemInstruction) {
      glmMessages.push({ role: 'system', content: systemInstruction });
    }
    for (const msg of history) {
      if (msg.role === 'user') {
        if (msg.parts && msg.parts[0]?.functionResponse) {
          msg.parts.forEach((p: any) => {
            if (p.functionResponse) {
              const toolName = p.functionResponse.name || 'unknown_tool';
              const toolId = p.functionResponse.id || `call_${toolName}_${Date.now()}`;
              glmMessages.push({
                role: 'tool',
                tool_call_id: toolId,
                content: JSON.stringify(p.functionResponse.response),
              });
            }
          });
        } else {
          const textContent = msg.parts ? msg.parts.map((p: any) => p.text).join('') : (msg.text || '');
          glmMessages.push({ role: 'user', content: textContent });
        }
      } else if (msg.role === 'model' || msg.role === 'assistant') {
        const textContent = msg.parts?.find((p: any) => p.text)?.text || '';
        const toolCalls = msg.parts?.filter((p: any) => p.functionCall).map((p: any) => ({
          id: p.functionCall.id || `call_${Math.random().toString(36).substr(2, 9)}`,
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) },
        }));
        if (textContent || toolCalls.length > 0) {
          const msgContent: any[] = [];
          if (textContent) msgContent.push({ role: 'assistant', content: textContent });
          toolCalls.forEach((tc: any) => {
            msgContent.push({ role: 'assistant', content: '', tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } }] });
          });
          // GLM 简化版 assistant 消息
          glmMessages.push({ role: 'assistant', content: textContent });
        }
      }
    }
    if (message) {
      glmMessages.push({ role: 'user', content: message });
    }

    // 2. 构建请求
    const modelName = modelOverride || this.config.modelName || 'glm-5';
    const requestPayload: any = {
      model: modelName,
      messages: glmMessages,
      stream: true,
      max_tokens: maxTokensOverride ?? this.config.maxOutputTokens ?? 8192,
      temperature: temperatureOverride ?? 0.7,
    };
    if (tools.length > 0) {
      requestPayload.tools = tools;
      requestPayload.tool_choice = 'auto';
      requestPayload.tool_stream = true;  // GLM 工具流式输出
    }

    console.log('[GLM Request]', JSON.stringify({
      endpoint: `${this.sdkBaseURL}/chat/completions`,
      payload: requestPayload,
    }, null, 2));

    // 3. 原生 fetch 流式请求
    const apiKey = this.config.apiKey || '';
    const response = await this.withRetry(async () => {
      const res = await fetch(`${this.sdkBaseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestPayload),
        signal,
      });
      if (!res.ok) {
        const body = await res.text();
        const error = new Error(`GLM API ${res.status}: ${body}`);
        (error as any).status = res.status;
        throw error;
      }
      return res;
    });

    let content = '';
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason: string | null = null;
    let usage: any = null;

    // 4. 解析 GLM SSE 格式: data: {"choices":[{"delta":{"content":"..."}}]}
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            const choice = chunk.choices?.[0];
            if (!choice) continue;

            // 文本内容（reasoning_content 和 content 都要处理）
            if (choice.delta?.content) {
              content += choice.delta.content;
            }
            if (choice.delta?.reasoning_content) {
              content += choice.delta.reasoning_content;
            }

            // tool_calls 支持（GLM function calling）
            if (choice.delta?.tool_calls) {
              choice.delta.tool_calls.forEach((tc: any, idx: number) => {
                const id = tc.id || `call_${Math.random().toString(36).substr(2, 9)}`;
                const name = tc.function?.Name || tc.function?.name || tc.name || '';
                const rawArgs = tc.function?.arguments ?? tc.arguments ?? '';
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, { id, name, arguments: rawArgs });
                } else {
                  const existing = toolCallsMap.get(idx)!;
                  // 只追加不完整的 arguments（streaming 断开时补全 }）
                  if (rawArgs && !existing.arguments.endsWith('}')) {
                    existing.arguments += rawArgs;
                  }
                  if (id && id !== existing.id) existing.id = id;
                  if (name && !existing.name) existing.name = name;
                }
              });
            }

            // 完成原因和 usage
            if (choice.finish_reason && choice.finish_reason !== 'null') {
              finishReason = choice.finish_reason;
            }
            if (chunk.usage) usage = chunk.usage;
          } catch { /* ignore parse errors */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log('[GLM Response]', JSON.stringify({
      contentLength: content.length,
      toolCallsCount: toolCallsMap.size,
      finishReason,
      usage,
    }, null, 2));

    // 5. 转回内部 parts 格式
    const parts: any[] = [];
    if (content) parts.push({ text: content });
    if (toolCallsMap.size > 0) {
      toolCallsMap.forEach((tc) => {
        if (!tc.name || !tc.arguments) return;
        let parsedArgs: any;
        try {
          parsedArgs = JSON.parse(tc.arguments);
        } catch (e) {
          console.error('[GLM] tool_args parse failed:', tc.name, 'raw:', tc.arguments);
          parts.push({ text: `[响应被截断] 工具调用「${tc.name}」参数无法解析。` });
          return;
        }
        parts.push({ functionCall: { id: tc.id, name: tc.name, args: parsedArgs } });
      });
    }
    if (parts.length === 0) {
      parts.push({ text: `[无响应内容]` });
    }

    return {
      candidates: [{ content: { parts } }],
      _metadata: {
        request: { endpoint: `${this.sdkBaseURL}/chat/completions`, model: modelName },
        response: { finishReason, usage },
      },
    };
  }
}
