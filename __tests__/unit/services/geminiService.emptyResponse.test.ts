/**
 * 空响应边界测试：当 OpenAI 兼容接口返回 content=null 且无 tool_calls 时，
 * geminiService 应抛出 _isEmptyResponse 以便上层显示“收到空响应”。
 */

import { AIService } from '../../../services/geminiService';
import { AIProvider } from '../../../types';

jest.mock('openai', () => {
  const createMock = jest.fn();

  class OpenAI {
    public chat: any;
    static __createMock = createMock;

    constructor() {
      this.chat = {
        completions: {
          create: createMock,
        },
      };
    }
  }

  return {
    __esModule: true,
    default: OpenAI,
  };
});

describe('geminiService - empty response handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw _isEmptyResponse when content is null and tool_calls is empty', async () => {
    const service = new AIService({
      provider: AIProvider.OPENAI,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      modelName: 'gemini-2.0-flash',
      maxOutputTokens: 256,
      safetySetting: 'BLOCK_NONE',
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenAI = require('openai').default;
    const createMock = OpenAI.__createMock as jest.Mock;

    createMock.mockResolvedValue({
      id: 'resp_1',
      model: 'gemini-2.0-flash',
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: null, tool_calls: [] },
        },
      ],
    });

    let thrown: any = null;
    try {
      await service.sendMessage(
        [],
        'hello',
        'system',
        [],
        undefined
      );
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeTruthy();
    expect(thrown._isEmptyResponse).toBe(true);
    expect(thrown._metadata).toBeTruthy();
  });
});
