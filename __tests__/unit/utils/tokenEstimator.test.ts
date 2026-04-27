import {
  estimateTextTokens,
  getPromptCalibrationFactor,
  resolveTokenLimit,
} from '../../../utils/tokenEstimator';
import { UsageRecord } from '../../../types/usageStats';

const record = (partial: Partial<UsageRecord>): UsageRecord => ({
  id: Math.random().toString(36),
  timestamp: Date.now(),
  callType: 'main',
  model: 'test-model',
  provider: 'openai-compatible',
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  durationMs: 1,
  status: 'success',
  ...partial,
});

describe('tokenEstimator', () => {
  it('uses different initial coefficients for CJK and English text', () => {
    const cjk = estimateTextTokens('这是一个用于估算上下文长度的中文句子。');
    const english = estimateTextTokens('This is an English sentence used to estimate context length.');

    expect(cjk).toBeGreaterThan(english / 2);
    expect(english).toBeLessThan('This is an English sentence used to estimate context length.'.length);
  });

  it('weights recent real usage when computing calibration', () => {
    const calibration = getPromptCalibrationFactor([
      record({ promptTokens: 1500, estimatedPromptTokens: 1000 }),
      record({ promptTokens: 800, estimatedPromptTokens: 1000 }),
    ], 'test-model', 'openai-compatible');

    expect(calibration).toBeGreaterThan(1);
    expect(calibration).toBeLessThan(1.5);
  });

  it('resolves model-specific token limits before falling back', () => {
    expect(resolveTokenLimit('gemini-2.5-pro', '')).toBe(1_000_000);
    expect(resolveTokenLimit('claude-3-5-sonnet', '')).toBe(200_000);
    expect(resolveTokenLimit('unknown-model', '')).toBe(256_000);
    expect(resolveTokenLimit('unknown-model', '', 256_000)).toBe(256_000);
  });
});
