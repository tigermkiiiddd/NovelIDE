import { buildCompressedHistoryView } from '../../../domains/agentContext/contextCompression';
import { ChatMessage } from '../../../types';

const msg = (partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage => ({
  text: '',
  timestamp: Number(partial.id.replace(/\D/g, '')) || 0,
  ...partial,
});

const userRound = (idx: number, text = `用户原话 ${idx}`): ChatMessage[] => [
  msg({ id: `u${idx}`, role: 'user', text }),
  msg({ id: `a${idx}`, role: 'model', text: `模型回复 ${idx}` }),
];

describe('contextCompression', () => {
  it('does not compress when estimated tokens are below the threshold', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', text: '写第一章' }),
      msg({ id: 'a1', role: 'model', text: '好的' }),
    ];

    const result = buildCompressedHistoryView({
      messages,
      systemInstruction: 'system',
      tools: [],
      tokenLimit: 100_000,
    });

    expect(result.compressed).toBe(false);
    expect(result.messages).toBe(messages);
  });

  it('creates a synthetic compression node without mutating original messages', () => {
    const messages = [
      ...userRound(0, '设计世界观，必须保留术法规则'),
      msg({
        id: 'c1',
        role: 'model',
        rawParts: [{ functionCall: { name: 'read', id: 'call-1', args: { path: '01_世界观/术法.md' } } }],
      }),
      msg({
        id: 'r1',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'read', id: 'call-1', response: { result: '术法规则正文'.repeat(300) } } }],
      }),
      ...userRound(1, '继续补充门派设定'),
      ...userRound(2, '最近轮次 2'),
      ...userRound(3, '最近轮次 3'),
      ...userRound(4, '最近轮次 4'),
      ...userRound(5, '最近轮次 5'),
      ...userRound(6, '最近轮次 6'),
    ];
    const before = JSON.stringify(messages);

    const result = buildCompressedHistoryView({
      messages,
      systemInstruction: 'system',
      tools: [],
      tokenLimit: 300,
    });

    expect(JSON.stringify(messages)).toBe(before);
    expect(result.compressed).toBe(true);
    expect(result.messages[0].id).toBe(`context-compression-${result.compressedUntilMessageId}`);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].rawParts).toBeUndefined();
    expect(result.messages.map(m => m.id)).not.toContain('u0');
    expect(result.messages.map(m => m.id)).not.toContain('c1');
    expect(result.messages.map(m => m.id)).toContain('u2');
    expect(result.messages.map(m => m.id)).toContain('u6');
    expect(result.messages[0].text).toContain('设计世界观，必须保留术法规则');
    expect(result.messages[0].text).toContain('继续补充门派设定');
    expect(result.messages[0].text).toContain('01_世界观/术法.md');
  });

  it('preserves the most recent five user rounds in the output history', () => {
    const messages = [
      ...userRound(0),
      ...userRound(1),
      ...userRound(2),
      ...userRound(3),
      ...userRound(4),
      ...userRound(5),
      ...userRound(6),
    ];

    const result = buildCompressedHistoryView({
      messages,
      systemInstruction: 'system',
      tools: [],
      tokenLimit: 100,
    });

    expect(result.compressed).toBe(true);
    expect(result.messages.map(m => m.id)).toEqual([
      'context-compression-a1',
      'u2',
      'a2',
      'u3',
      'a3',
      'u4',
      'a4',
      'u5',
      'a5',
      'u6',
      'a6',
    ]);
  });

  it('does not cut an unclosed tool boundary in the retained history', () => {
    const messages = [
      ...userRound(0),
      ...userRound(1),
      msg({ id: 'u2', role: 'user', text: '读取文件' }),
      msg({
        id: 'c2',
        role: 'model',
        rawParts: [{ functionCall: { name: 'read', id: 'call-2', args: { path: 'a.md' } } }],
      }),
      msg({ id: 'u3', role: 'user', text: 'next' }),
      ...userRound(4),
      ...userRound(5),
      ...userRound(6),
    ];

    const result = buildCompressedHistoryView({
      messages,
      systemInstruction: 'system',
      tools: [],
      tokenLimit: 100,
    });

    expect(result.messages.map(m => m.id)).not.toContain('c2');
    expect(result.messages.map(m => m.id)).toContain('u2');
  });

  it('extracts edited document paths into the compression node', () => {
    const messages = [
      msg({ id: 'u0', role: 'user', text: '重写第二章' }),
      msg({
        id: 'c0',
        role: 'model',
        rawParts: [{ functionCall: { name: 'edit', id: 'call-edit', args: { path: '05_正文草稿/第二章.md', edits: [] } } }],
      }),
      msg({
        id: 'r0',
        role: 'system',
        isToolOutput: true,
        rawParts: [{ functionResponse: { name: 'edit', id: 'call-edit', response: { result: 'ok' } } }],
      }),
      ...userRound(1),
      ...userRound(2),
      ...userRound(3),
      ...userRound(4),
      ...userRound(5),
    ];

    const result = buildCompressedHistoryView({
      messages,
      systemInstruction: 'system',
      tools: [],
      tokenLimit: 100,
    });

    expect(result.debug.recentDocumentRefs.some(ref =>
      ref.path === '05_正文草稿/第二章.md' && ref.action === 'edit'
    )).toBe(true);
    expect(result.messages[0].text).toContain('最近编辑文档');
    expect(result.messages[0].text).toContain('05_正文草稿/第二章.md');
  });
});
