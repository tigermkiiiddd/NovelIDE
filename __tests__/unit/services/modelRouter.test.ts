/**
 * modelRouter 单元测试
 * - resolveConfigForRoute: 路由解析逻辑（backend 覆盖、model 覆盖、legacy fallback）
 * - createRoutedAIService: 确保 AIService 被正确构造
 */

import { AIProvider, AIConfig, ModelRouteId } from '../../../types';
import { resolveConfigForRoute, createRoutedAIService } from '../../../services/modelRouter';

// Mock AIService 构造函数，只验证它收到的 config
jest.mock('../../../services/geminiService', () => {
  const mockInstances: any[] = [];

  class AIService {
    public config: AIConfig;
    static instances = mockInstances;

    constructor(config: AIConfig) {
      this.config = config;
      mockInstances.push(this);
    }
  }

  return { __esModule: true, AIService };
});

const makeBaseConfig = (overrides?: Partial<AIConfig>): AIConfig => ({
  provider: AIProvider.OPENAI,
  apiKey: 'active-key',
  baseUrl: 'https://api.active.com/v1',
  modelName: 'active-model',
  maxOutputTokens: 4096,
  openAIBackends: [
    {
      id: 'active',
      name: 'Active Provider',
      baseUrl: 'https://api.active.com/v1',
      apiKey: 'active-key',
      modelName: 'active-model',
    },
    {
      id: 'budget',
      name: 'Budget Provider',
      baseUrl: 'https://api.budget.com/v1',
      apiKey: 'budget-key',
      modelName: 'budget-model',
      maxOutputTokens: 2048,
    },
  ],
  activeOpenAIBackendId: 'active',
  ...overrides,
});

// ============================================================
// resolveConfigForRoute
// ============================================================

describe('resolveConfigForRoute', () => {
  it('no route config → returns baseConfig unchanged', () => {
    const config = makeBaseConfig();
    const result = resolveConfigForRoute(config, 'extraction');
    expect(result.modelName).toBe('active-model');
    expect(result.apiKey).toBe('active-key');
  });

  it('route with only modelName → overrides model, keeps rest', () => {
    const config = makeBaseConfig({
      modelRoutes: { extraction: { modelName: 'fast-model' } },
    });
    const result = resolveConfigForRoute(config, 'extraction');
    expect(result.modelName).toBe('fast-model');
    expect(result.apiKey).toBe('active-key'); // still active
    expect(result.baseUrl).toBe('https://api.active.com/v1');
  });

  it('route with backendId → switches to that backend', () => {
    const config = makeBaseConfig({
      modelRoutes: { extraction: { backendId: 'budget' } },
    });
    const result = resolveConfigForRoute(config, 'extraction');
    expect(result.apiKey).toBe('budget-key');
    expect(result.baseUrl).toBe('https://api.budget.com/v1');
    expect(result.modelName).toBe('budget-model');
  });

  it('route with backendId + modelName → backend first, then model overrides', () => {
    const config = makeBaseConfig({
      modelRoutes: {
        polish: { backendId: 'budget', modelName: 'creative-model' },
      },
    });
    const result = resolveConfigForRoute(config, 'polish');
    expect(result.apiKey).toBe('budget-key');
    expect(result.baseUrl).toBe('https://api.budget.com/v1');
    expect(result.modelName).toBe('creative-model'); // override wins
  });

  it('route with non-existent backendId → falls back to active', () => {
    const config = makeBaseConfig({
      modelRoutes: { polish: { backendId: 'nonexistent' } },
    });
    const result = resolveConfigForRoute(config, 'polish');
    // backendId not found → derived still has base config values (from spread)
    expect(result.apiKey).toBe('active-key');
    expect(result.modelName).toBe('active-model');
  });

  it('backendId route copies maxOutputTokens from target backend', () => {
    const config = makeBaseConfig({
      modelRoutes: { extraction: { backendId: 'budget' } },
    });
    const result = resolveConfigForRoute(config, 'extraction');
    expect(result.maxOutputTokens).toBe(2048); // from budget backend
  });

  it('backendId route without maxOutputTokens keeps base config value', () => {
    const config = makeBaseConfig({
      modelRoutes: { polish: { backendId: 'active' } },
    });
    // active backend has no maxOutputTokens → keep base's 4096
    const result = resolveConfigForRoute(config, 'polish');
    expect(result.maxOutputTokens).toBe(4096);
  });

  // --- Legacy fallback ---

  it('extraction route with no config + lightweightModelName → uses lightweight model', () => {
    const config = makeBaseConfig({
      lightweightModelName: 'deepseek-coder',
    });
    const result = resolveConfigForRoute(config, 'extraction');
    expect(result.modelName).toBe('deepseek-coder');
    expect(result.apiKey).toBe('active-key'); // same provider
  });

  it('polish route with no config + lightweightModelName → ignores lightweight (only extraction)', () => {
    const config = makeBaseConfig({
      lightweightModelName: 'deepseek-coder',
    });
    const result = resolveConfigForRoute(config, 'polish');
    expect(result.modelName).toBe('active-model'); // not lightweight
  });

  it('extraction route with explicit config ignores lightweightModelName', () => {
    const config = makeBaseConfig({
      lightweightModelName: 'deepseek-coder',
      modelRoutes: { extraction: { modelName: 'custom-extraction' } },
    });
    const result = resolveConfigForRoute(config, 'extraction');
    expect(result.modelName).toBe('custom-extraction');
  });

  // --- Route isolation ---

  it('different routes get different configs', () => {
    const config = makeBaseConfig({
      modelRoutes: {
        polish: { backendId: 'budget' },
        extraction: { modelName: 'fast-model' },
      },
    });
    const polish = resolveConfigForRoute(config, 'polish');
    const extraction = resolveConfigForRoute(config, 'extraction');

    expect(polish.apiKey).toBe('budget-key');
    expect(polish.modelName).toBe('budget-model');
    expect(extraction.apiKey).toBe('active-key');
    expect(extraction.modelName).toBe('fast-model');
  });

  it('does not mutate baseConfig', () => {
    const config = makeBaseConfig({
      modelRoutes: { extraction: { modelName: 'fast-model' } },
    });
    const before = JSON.stringify(config);
    resolveConfigForRoute(config, 'extraction');
    expect(JSON.stringify(config)).toBe(before);
  });
});

// ============================================================
// createRoutedAIService
// ============================================================

describe('createRoutedAIService', () => {
  beforeEach(() => {
    // Clear tracked instances
    (AIService as any).instances.length = 0;
  });

  it('creates AIService with routed config', () => {
    const config = makeBaseConfig({
      modelRoutes: { extraction: { modelName: 'fast-model' } },
    });
    const service = createRoutedAIService(config, 'extraction');
    expect(service.config.modelName).toBe('fast-model');
  });

  it('creates AIService with base config when no route', () => {
    const config = makeBaseConfig();
    const service = createRoutedAIService(config, 'polish');
    expect(service.config.modelName).toBe('active-model');
  });
});

// Need to import AIService for the mock type reference
import { AIService } from '../../../services/geminiService';
