import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import OpenAI from "openai";
import { AIConfig, AIProvider } from "../types";

// --- Helper: Convert Google Tool Definition to OpenAI JSON Schema ---
function mapToolsToOpenAI(googleTools: FunctionDeclaration[]): any[] {
  return googleTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters?.properties || {},
        required: tool.parameters?.required || []
      }
    }
  }));
}

// --- Service ---

export class AIService {
  private config: AIConfig;
  private googleClient: GoogleGenAI | null = null;
  private openaiClient: OpenAI | null = null;

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
    
    if (this.config.provider === AIProvider.GOOGLE) {
      if (apiKey) {
        this.googleClient = new GoogleGenAI({ apiKey });
      }
    } else {
      if (apiKey) {
        this.openaiClient = new OpenAI({
          apiKey: apiKey,
          baseURL: this.config.baseUrl || 'https://api.openai.com/v1',
          dangerouslyAllowBrowser: true 
        });
      }
    }
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
        lastError = error;
        
        // Identify Retryable Errors:
        // 1. Google 429/Resource Exhausted
        // 2. OpenAI 429
        // 3. 5xx Server Errors
        const isRateLimit = 
            error?.status === 429 || 
            error?.code === 429 || 
            (error?.message && error.message.includes('429')) ||
            (error?.message && error.message.includes('RESOURCE_EXHAUSTED'));

        const isServerError = error?.status >= 500 || error?.code >= 500;

        if (isRateLimit || isServerError) {
          console.warn(`[AIService] API Error (${error.status || error.code}). Retrying in ${initialDelay}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, initialDelay));
          initialDelay *= 2; // Exponential backoff
        } else {
          // If it's a client error (e.g., 400 Bad Request), throw immediately
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
    tools: FunctionDeclaration[]
  ): Promise<any> {
    
    // --- Google GenAI Path ---
    if (this.config.provider === AIProvider.GOOGLE) {
      if (!this.googleClient) throw new Error("Google API Key not configured.");
      
      try {
        const response = await this.withRetry(() => 
          this.googleClient!.models.generateContent({
            model: this.config.modelName || 'gemini-3-flash-preview',
            contents: [
                ...history,
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
              systemInstruction: systemInstruction,
              tools: [{ functionDeclarations: tools }],
            }
          })
        );
        return response;
      } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
      }
    }

    // --- OpenAI Compatible Path ---
    else {
      if (!this.openaiClient) throw new Error("OpenAI API Key not configured.");

      // 1. Convert History (Google -> OpenAI)
      const openAIMessages: any[] = [
        { role: 'system', content: systemInstruction }
      ];

      for (const msg of history) {
        const role = msg.role === 'model' ? 'assistant' : msg.role;
        
        if (msg.parts && msg.parts[0]?.functionResponse) {
             const textParts = msg.parts.map((p: any) => 
                p.text || (p.functionResponse ? `[Tool Result for ${p.functionResponse.name}]: ${JSON.stringify(p.functionResponse.response)}` : '')
             ).join('\n');
             openAIMessages.push({ role: 'user', content: textParts });
        } 
        else if (msg.parts && msg.parts[0]?.functionCall) {
            const textContent = msg.parts.map((p: any) => 
                p.text || (p.functionCall ? `[Assistant requested tool: ${p.functionCall.name}]` : '')
            ).join('\n');
            openAIMessages.push({ role: 'assistant', content: textContent });
        }
        else {
            const content = msg.parts.map((p: any) => p.text).join('');
            openAIMessages.push({ role, content });
        }
      }

      openAIMessages.push({ role: 'user', content: message });

      try {
        const completion: any = await this.withRetry(() => 
            this.openaiClient!.chat.completions.create({
              model: this.config.modelName || 'gpt-4o',
              messages: openAIMessages,
              tools: mapToolsToOpenAI(tools),
              tool_choice: 'auto'
            })
        );

        // SAFEGUARD: Check if choices exist
        if (!completion.choices || completion.choices.length === 0) {
            console.error("OpenAI Empty Response:", completion);
            throw new Error("OpenAI API returned an empty response (no choices).");
        }

        const choice = completion.choices[0];
        const msg = choice.message;

        const parts: any[] = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.tool_calls) {
          msg.tool_calls.forEach((tc: any) => {
            if (tc.type === 'function') {
                parts.push({
                  functionCall: {
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
          ]
        };

      } catch (error) {
         console.error("OpenAI API Error:", error);
         throw error;
      }
    }
  }
}