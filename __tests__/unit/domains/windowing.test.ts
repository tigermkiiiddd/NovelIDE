import { buildSimpleHistory } from '../../../domains/agentContext/historyBuilder';
import { getWindowedMessages } from '../../../domains/agentContext/windowing';
import { ChatMessage } from '../../../types';

const msg = (partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage => ({
  text: '',
  timestamp: Number(partial.id.replace(/\D/g, '')) || 0,
  ...partial,
});

describe('history windowing', () => {
  it('keeps full history without mutating old tool args', () => {
    const toolCall = msg({
      id: 'm1',
      role: 'model',
      rawParts: [{ functionCall: { name: 'read', id: 'call-1', args: { path: '05_正文草稿/第一章.md' } } }],
    });
    const toolResponse = msg({
      id: 'm2',
      role: 'system',
      isToolOutput: true,
      rawParts: [{ functionResponse: { name: 'read', id: 'call-1', response: { result: 'chapter content' } } }],
    });
    const messages = [
      msg({ id: 'm0', role: 'user', text: '读取第一章' }),
      toolCall,
      toolResponse,
      msg({ id: 'm3', role: 'model', text: '读完了' }),
      msg({ id: 'm4', role: 'user', text: '继续' }),
      msg({ id: 'm5', role: 'model', text: '好的' }),
    ];

    const result = buildSimpleHistory(messages, { maxMessages: 6 });
    const retainedCall = result[1].rawParts?.[0] as any;

    expect(retainedCall.functionCall.args).toEqual({ path: '05_正文草稿/第一章.md' });
    expect(result.map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('keeps complete history instead of slicing by the old fixed window', () => {
    const messages = [
      msg({ id: 'm0', role: 'user', text: 'start' }),
      msg({
        id: 'm1',
        role: 'model',
        rawParts: [{ functionCall: { name: 'read', id: 'call-1', args: { path: 'a.md' } } }],
      }),
      msg({
        id: 'm2',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'read', id: 'call-1', response: { result: 'a' } } }],
      }),
      msg({ id: 'm3', role: 'user', text: 'next' }),
    ];

    const result = getWindowedMessages(messages, 2);

    expect(result.map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3']);
  });

  it('keeps the initial user intent during a long tool loop', () => {
    const messages = [
      msg({ id: 'm0', role: 'user', text: '设计世界观' }),
      msg({
        id: 'm1',
        role: 'model',
        rawParts: [{ functionCall: { name: 'listFiles', id: 'call-1', args: {} } }],
      }),
      msg({
        id: 'm2',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'listFiles', id: 'call-1', response: { result: '01_世界观/' } } }],
      }),
      msg({
        id: 'm3',
        role: 'model',
        rawParts: [{ functionCall: { name: 'memory_status', id: 'call-2', args: {} } }],
      }),
      msg({
        id: 'm4',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'memory_status', id: 'call-2', response: { result: '14 nodes' } } }],
      }),
      msg({
        id: 'm5',
        role: 'model',
        rawParts: [{ functionCall: { name: 'memory_status', id: 'call-3', args: { mode: 'ids' } } }],
      }),
      msg({
        id: 'm6',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'memory_status', id: 'call-3', response: { result: 'node ids' } } }],
      }),
    ];

    const result = getWindowedMessages(messages, 4);

    expect(result.map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });

  it('drops a tool call when not all call ids have matching responses', () => {
    const messages = [
      msg({ id: 'm0', role: 'user', text: 'run tools' }),
      msg({
        id: 'm1',
        role: 'model',
        rawParts: [
          { functionCall: { name: 'read', id: 'call-1', args: { path: 'a.md' } } },
          { functionCall: { name: 'grep', id: 'call-2', args: { query: 'x' } } },
        ],
      }),
      msg({
        id: 'm2',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'read', id: 'call-1', response: { result: 'a' } } }],
      }),
      msg({ id: 'm3', role: 'user', text: 'next' }),
    ];

    const result = getWindowedMessages(messages, 4);

    expect(result.map(m => m.id)).toEqual(['m0', 'm3']);
  });

  it('keeps a multi-tool call when every call id has a response', () => {
    const messages = [
      msg({ id: 'm0', role: 'user', text: 'run tools' }),
      msg({
        id: 'm1',
        role: 'model',
        rawParts: [
          { functionCall: { name: 'read', id: 'call-1', args: { path: 'a.md' } } },
          { functionCall: { name: 'grep', id: 'call-2', args: { query: 'x' } } },
        ],
      }),
      msg({
        id: 'm2',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'read', id: 'call-1', response: { result: 'a' } } }],
      }),
      msg({
        id: 'm3',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'grep', id: 'call-2', response: { result: 'x' } } }],
      }),
      msg({ id: 'm4', role: 'user', text: 'next' }),
    ];

    const result = getWindowedMessages(messages, 5);

    expect(result.map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  it('filters skipInHistory messages without applying value decay', () => {
    const messages = [
      msg({ id: 'm1', role: 'user', text: 'a' }),
      msg({ id: 'm2', role: 'system', text: 'stopped', skipInHistory: true }),
      msg({ id: 'm3', role: 'model', text: 'ordinary model text remains' }),
    ];

    expect(buildSimpleHistory(messages, { maxMessages: 10 }).map(m => m.id)).toEqual(['m1', 'm3']);
  });
});
