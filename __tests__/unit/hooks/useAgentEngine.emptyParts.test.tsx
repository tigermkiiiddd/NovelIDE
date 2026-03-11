/**
 * 空 parts 边界测试：useAgentEngine 在收到 candidates[0].content.parts=[] 时
 * 应抛出 contentError('empty') 并最终通过 addMessage() 输出 system 错误消息。
 */

import { renderHook, act } from '@testing-library/react';
import { useAgentEngine } from '../../../hooks/agent/useAgentEngine';

// mock useAgentStore：提供 getState().sessions 以及 addMessage 收集
const addMessageMock = jest.fn();

jest.mock('../../../stores/agentStore', () => {
  return {
    __esModule: true,
    useAgentStore: {
      getState: () => ({
        sessions: [
          {
            id: 'session-1',
            projectId: 'project-1',
            title: 't',
            messages: [{ id: 'm1', role: 'user', text: 'hi', timestamp: Date.now() }],
            todos: [],
            lastModified: Date.now(),
          },
        ],
      }),
    },
  };
});

jest.mock('../../../stores/planStore', () => ({
  __esModule: true,
  usePlanStore: {
    getState: () => ({
      planNotes: [],
    }),
  },
}));

// 避免引入真实 prompt 构建的复杂依赖
jest.mock('../../../services/resources/skills/coreProtocol', () => ({
  __esModule: true,
  constructSystemPrompt: () => 'system',
}));

jest.mock('../../../domains/agentContext/historyBuilder', () => ({
  __esModule: true,
  buildSimpleHistory: (messages: any[]) => messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
}));

describe('useAgentEngine - empty parts handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add a visible system error message when parts is empty', async () => {
    const context: any = {
      currentSessionId: 'session-1',
      addMessage: addMessageMock,
      editMessageContent: jest.fn(),
      updateMessageMetadata: jest.fn(),
      setLoading: jest.fn(),
      aiServiceInstance: {
        sendMessage: jest.fn().mockResolvedValue({
          candidates: [{ content: { parts: [] } }],
          _metadata: {},
          _aiMetadata: { finishReason: 'stop', warnings: [] },
        }),
      },
    };

    const toolsHook: any = {
      runTool: jest.fn(),
      resetErrorTracker: jest.fn(),
    };

    const { result } = renderHook(() =>
      useAgentEngine({
        context,
        toolsHook,
        files: [],
        project: undefined,
        activeFile: null,
        planMode: false,
        currentPlanNote: null,
      })
    );

    await act(async () => {
      await result.current.processTurn();
    });

    // 至少有一条 system 消息包含“收到空响应”标题
    const systemMessages = addMessageMock.mock.calls
      .map(args => args[0])
      .filter(m => m.role === 'system');

    expect(systemMessages.length).toBeGreaterThan(0);
    expect(systemMessages.some(m => String(m.text).includes('收到空响应'))).toBe(true);
  });
});
