import { ChatMessage } from '../types';
import { ToolDefinition } from '../services/agent/types';
import { UsageRecord } from '../types/usageStats';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const estimateTextTokens = (text: string): number => {
  if (!text) return 0;

  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const ascii = (text.match(/[\x00-\x7f]/g) || []).length;
  const other = Math.max(0, text.length - cjk - ascii);

  // Initial heuristic: CJK is close to 1 char/token, English prose is ~4 chars/token,
  // JSON/tool-like ASCII is denser than prose, so use a conservative middle value.
  return Math.ceil(cjk * 0.95 + ascii / 3.2 + other * 0.8);
};

const stringifyRawParts = (parts: unknown): string => {
  try {
    return JSON.stringify(parts);
  } catch {
    return String(parts ?? '');
  }
};

export const estimateMessagesTokens = (messages: ChatMessage[]): number => {
  return messages.reduce((total, message) => {
    const content = `${message.role}\n${message.text || ''}\n${message.rawParts ? stringifyRawParts(message.rawParts) : ''}`;
    return total + estimateTextTokens(content) + 6;
  }, 0);
};

export const estimateToolSchemaTokens = (tools: ToolDefinition[]): number => {
  if (tools.length === 0) return 0;
  return estimateTextTokens(stringifyRawParts(tools)) + tools.length * 8;
};

export const estimatePromptTokens = (input: {
  systemInstruction: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}): number => {
  const systemTokens = estimateTextTokens(input.systemInstruction);
  const messageTokens = estimateMessagesTokens(input.messages);
  const toolTokens = estimateToolSchemaTokens(input.tools || []);
  const providerOverhead = 24 + input.messages.length * 4 + (input.tools?.length || 0) * 3;
  return Math.ceil(systemTokens + messageTokens + toolTokens + providerOverhead);
};

export const getPromptCalibrationFactor = (
  records: UsageRecord[],
  model?: string,
  provider?: string,
  limit = 12,
): number => {
  const modelKey = model?.toLowerCase().trim();
  const providerKey = provider?.toLowerCase().trim();

  const candidates = records
    .filter(record =>
      record.status === 'success' &&
      record.promptTokens > 0 &&
      (record.estimatedPromptTokens || 0) > 0 &&
      (!modelKey || record.model?.toLowerCase() === modelKey) &&
      (!providerKey || record.provider?.toLowerCase() === providerKey)
    )
    .slice(0, limit);

  if (candidates.length === 0) return 1;

  let weightedRatio = 0;
  let totalWeight = 0;

  candidates.forEach((record, index) => {
    const estimated = record.estimatedPromptTokens || 0;
    const ratio = clamp(record.promptTokens / estimated, 0.45, 2.8);
    // Recent usage matters more: newest record is weight 1, then decays.
    const recencyWeight = Math.pow(0.72, index);
    // Bigger prompts are more reliable than tiny calls.
    const sizeWeight = clamp(Math.log10(record.promptTokens + 10) / 4, 0.35, 1);
    const weight = recencyWeight * sizeWeight;
    weightedRatio += ratio * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? clamp(weightedRatio / totalWeight, 0.55, 2.2) : 1;
};

export const resolveTokenLimit = (modelName?: string, baseUrl?: string, configuredLimit?: number): number => {
  if (Number.isFinite(configuredLimit) && Number(configuredLimit) > 0) {
    return Math.round(Number(configuredLimit));
  }

  const model = modelName?.toLowerCase() || '';
  const url = baseUrl?.toLowerCase() || '';

  if (model.includes('gemini-1.5') || model.includes('gemini-2') || url.includes('generativelanguage.googleapis.com')) {
    return 1_000_000;
  }
  if (model.includes('gpt-4.1') || model.includes('gpt-5')) return 1_000_000;
  if (model.includes('claude-3') || model.includes('claude-sonnet') || model.includes('claude-opus')) return 200_000;
  if (model.includes('deepseek')) return 128_000;
  if (model.includes('moonshot') || model.includes('kimi')) return 128_000;
  if (model.includes('glm-4')) return 128_000;
  if (model.includes('32k')) return 32_000;
  if (model.includes('16k')) return 16_000;
  if (model.includes('8k')) return 8_000;

  return 256_000;
};
