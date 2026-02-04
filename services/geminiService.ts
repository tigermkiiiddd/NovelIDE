
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

  async sendMessage(
    history: any[], 
    message: string, 
    systemInstruction: string,
    tools: FunctionDeclaration[]
  ) {
    
    // --- Google GenAI Path ---
    if (this.config.provider === AIProvider.GOOGLE) {
      if (!this.googleClient) throw new Error("Google API Key not configured.");
      
      try {
        const response = await this.googleClient.models.generateContent({
          model: this.config.modelName || 'gemini-3-flash-preview',
          contents: [
              ...history,
              { role: 'user', parts: [{ text: message }] }
          ],
          config: {
            systemInstruction: systemInstruction,
            tools: [{ functionDeclarations: tools }],
          }
        });
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
        const completion = await this.openaiClient.chat.completions.create({
          model: this.config.modelName || 'gpt-4o',
          messages: openAIMessages,
          tools: mapToolsToOpenAI(tools),
          tool_choice: 'auto'
        });

        const choice = completion.choices[0];
        const msg = choice.message;

        const parts: any[] = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.tool_calls) {
          msg.tool_calls.forEach(tc => {
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
