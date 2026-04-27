import {
  buildThinkingRequestFields,
  detectNativeProtocol,
  detectProvider,
  shouldReplayReasoningContent,
} from '../../../services/ai/providerAdapter';

describe('providerAdapter', () => {
  it('detects provider capability from model name instead of base URL', () => {
    expect(detectProvider('https://aggregator.example/v1', 'deepseek-v4-pro').kind).toBe('deepseek');
    expect(detectProvider('https://aggregator.example/v1', 'claude-sonnet-4.5').kind).toBe('anthropic');
    expect(detectProvider('https://aggregator.example/v1', 'gemini-3-flash-preview').kind).toBe('gemini');
    expect(detectProvider('https://aggregator.example/v1', 'qwen3-max').kind).toBe('qwen');
    expect(detectProvider('https://aggregator.example/v1', 'kimi-k2').kind).toBe('moonshot');
    expect(detectProvider('https://api.deepseek.com', 'gpt-4.1').kind).toBe('openai');
  });

  it('detects native protocol from endpoint separately from model capability', () => {
    expect(detectNativeProtocol('https://aggregator.example/v1')).toBe('openai-compatible');
    expect(detectNativeProtocol('https://api.anthropic.com/v1')).toBe('anthropic');
    expect(detectNativeProtocol('https://open.bigmodel.cn/api/paas/v4')).toBe('glm');
  });

  it('maps DeepSeek thinking settings to OpenAI-format fields', () => {
    const provider = detectProvider('https://aggregator.example/v1', 'deepseek-v4-pro');

    expect(buildThinkingRequestFields(provider, { enabled: true, budgetTokens: 8192 })).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
    expect(buildThinkingRequestFields(provider, { enabled: true, budgetTokens: 32768 })).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
    expect(buildThinkingRequestFields(provider, { enabled: false })).toEqual({
      thinking: { type: 'disabled' },
    });
  });

  it('replays reasoning content only for DeepSeek tool-call turns', () => {
    const deepSeek = detectProvider('', 'deepseek-v4-pro');
    const generic = detectProvider('', 'gpt-4.1');

    expect(shouldReplayReasoningContent(deepSeek, true)).toBe(true);
    expect(shouldReplayReasoningContent(deepSeek, false)).toBe(false);
    expect(shouldReplayReasoningContent(generic, true)).toBe(false);
  });

  it('maps common thinking fields by model family', () => {
    expect(buildThinkingRequestFields(detectProvider('', 'gpt-5'), { enabled: true, budgetTokens: 20000 })).toEqual({
      reasoning_effort: 'high',
    });
    expect(buildThinkingRequestFields(detectProvider('', 'claude-sonnet-4.5'), { enabled: true, budgetTokens: 3000 })).toEqual({
      thinking: { type: 'enabled', budget_tokens: 3000 },
    });
    expect(buildThinkingRequestFields(detectProvider('', 'qwen3-max'), { enabled: false })).toEqual({
      enable_thinking: false,
    });
    expect(buildThinkingRequestFields(detectProvider('', 'kimi-k2'), { enabled: true })).toEqual({});
  });
});
