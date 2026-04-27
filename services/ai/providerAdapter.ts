export type ProviderKind =
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'anthropic'
  | 'glm'
  | 'qwen'
  | 'moonshot'
  | 'openai-compatible';

export interface ProviderDescriptor {
  kind: ProviderKind;
  modelName: string;
  baseUrl: string;
}

export interface ThinkingRequestOptions {
  enabled: boolean;
  budgetTokens?: number;
}

export type NativeProtocol = 'anthropic' | 'glm' | 'openai-compatible';

export const detectNativeProtocol = (baseUrl?: string): NativeProtocol => {
  const normalizedBaseUrl = (baseUrl || '').toLowerCase();
  if (normalizedBaseUrl.includes('anthropic')) return 'anthropic';
  if (normalizedBaseUrl.includes('/paas/')) return 'glm';
  return 'openai-compatible';
};

export const detectProvider = (baseUrl?: string, modelName?: string): ProviderDescriptor => {
  const normalizedModelName = (modelName || '').toLowerCase();

  if (
    normalizedModelName.startsWith('gpt-') ||
    normalizedModelName.startsWith('o1') ||
    normalizedModelName.startsWith('o3') ||
    normalizedModelName.startsWith('o4') ||
    normalizedModelName.startsWith('o5')
  ) {
    return { kind: 'openai', baseUrl: baseUrl || '', modelName: modelName || '' };
  }

  if (
    normalizedModelName.includes('deepseek') ||
    normalizedModelName.includes('deepseek-v') ||
    normalizedModelName.includes('deepseek-r') ||
    normalizedModelName === 'deepseek-chat' ||
    normalizedModelName === 'deepseek-reasoner'
  ) {
    return { kind: 'deepseek', baseUrl: baseUrl || '', modelName: modelName || '' };
  }

  if (normalizedModelName.includes('claude')) {
    return { kind: 'anthropic', baseUrl: baseUrl || '', modelName: modelName || '' };
  }

  if (normalizedModelName.includes('glm')) {
    return { kind: 'glm', baseUrl: baseUrl || '', modelName: modelName || '' };
  }

  if (normalizedModelName.includes('gemini')) {
    return { kind: 'gemini', baseUrl: baseUrl || '', modelName: modelName || '' };
  }

  if (
    normalizedModelName.includes('qwen') ||
    normalizedModelName.includes('qwq') ||
    normalizedModelName.includes('qvq') ||
    normalizedModelName.includes('tongyi')
  ) {
    return { kind: 'qwen', baseUrl: baseUrl || '', modelName: modelName || '' };
  }

  if (
    normalizedModelName.includes('moonshot') ||
    normalizedModelName.includes('kimi') ||
    normalizedModelName.includes('k2')
  ) {
    return { kind: 'moonshot', baseUrl: baseUrl || '', modelName: modelName || '' };
  }

  return { kind: 'openai-compatible', baseUrl: baseUrl || '', modelName: modelName || '' };
};

const deepSeekEffortFromBudget = (budgetTokens?: number): 'high' | 'max' => {
  if (budgetTokens && budgetTokens >= 32768) return 'max';
  return 'high';
};

const openAIEffortFromBudget = (budgetTokens?: number): 'low' | 'medium' | 'high' => {
  if (!budgetTokens || budgetTokens < 4096) return 'low';
  if (budgetTokens < 16384) return 'medium';
  return 'high';
};

const geminiThinkingFields = (options: ThinkingRequestOptions): Record<string, unknown> => {
  const budget = options.enabled ? Math.max(0, options.budgetTokens || 4096) : 0;
  return {
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: budget,
      },
    },
  };
};

export const buildThinkingRequestFields = (
  provider: ProviderDescriptor,
  options: ThinkingRequestOptions
): Record<string, unknown> => {
  switch (provider.kind) {
    case 'deepseek':
      return {
        thinking: { type: options.enabled ? 'enabled' : 'disabled' },
        ...(options.enabled ? { reasoning_effort: deepSeekEffortFromBudget(options.budgetTokens) } : {}),
      };

    case 'openai':
      return options.enabled
        ? { reasoning_effort: openAIEffortFromBudget(options.budgetTokens) }
        : {};

    case 'anthropic':
      return options.enabled
        ? { thinking: { type: 'enabled', budget_tokens: Math.max(1024, options.budgetTokens || 4096) } }
        : {};

    case 'gemini':
      return geminiThinkingFields(options);

    case 'qwen':
      return { enable_thinking: options.enabled };

    case 'glm':
      return options.enabled
        ? { thinking: { type: 'enabled', ...(options.budgetTokens ? { budget_tokens: options.budgetTokens } : {}) } }
        : {};

    case 'moonshot':
    case 'openai-compatible':
    default:
      return {};
  }
};

export const shouldReplayReasoningContent = (
  provider: ProviderDescriptor,
  hasToolCalls: boolean
): boolean => {
  return provider.kind === 'deepseek' && hasToolCalls;
};
