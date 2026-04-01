import React, { useMemo, useState } from 'react';
import { Clock, Layers, Pause, Play, RotateCcw, X } from 'lucide-react';
import { ChatMessage, ChatSession, FunctionCallPart, FunctionResponsePart } from '../types';
import { classifyMessages, ContentValue, DecayDimension, MessageClassification, ToolType } from '../domains/agentContext/messageClassifier';

type PromptState = 'full' | 'compressed' | 'removed';
type ChangeType = 'same' | 'compressed' | 'removed';

interface Props {
  session: ChatSession | null;
  onClose: () => void;
}

interface DecayStatus {
  dimension: DecayDimension;
  value: ContentValue;
  currentRound: number;
  maxRounds: number;
  isAlive: boolean;
}

interface Section {
  key: string;
  label: string;
  original: string;
  projected: string;
  change: ChangeType;
}

interface CompressionState {
  state: PromptState;
  level: 0 | 2 | 3;
  detail: string;
  sections: Section[];
}

const text = (v: unknown) => {
  if (v === undefined) return '(empty)';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
};

const cut = (s: string, n = 320) => (s.length > n ? `${s.slice(0, n)}...` : s);
const fc = (m: ChatMessage) => (m.rawParts ?? []).filter((p): p is FunctionCallPart => 'functionCall' in p);
const fr = (m: ChatMessage) => (m.rawParts ?? []).filter((p): p is FunctionResponsePart => 'functionResponse' in p);
const callNames = (m: ChatMessage) => fc(m).map((p) => p.functionCall.name).join('\n') || '(no function call)';
const callArgs = (m: ChatMessage, clear: boolean) => fc(m).map((p) => `${p.functionCall.name}\n${text(clear ? {} : p.functionCall.args)}`).join('\n\n') || '(no args)';
const responseBody = (m: ChatMessage) => fr(m).map((p) => `${p.functionResponse.name}\n${text(p.functionResponse.response)}`).join('\n\n') || m.text || '(empty)';
const make = (key: string, label: string, original: string, projected: string, change: ChangeType): Section => ({ key, label, original: cut(original), projected: cut(projected), change });

const buildToolMaps = (messages: ChatMessage[]) => {
  const callToResponses = new Map<string, string[]>();
  const responseToCall = new Map<string, string>();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!(msg.role === 'model' && msg.rawParts?.some((p) => 'functionCall' in p))) continue;
    const ids: string[] = [];
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (!(next.role === 'system' && next.rawParts?.some((p) => 'functionResponse' in p))) break;
      ids.push(next.id);
      responseToCall.set(next.id, msg.id);
    }
    if (ids.length) callToResponses.set(msg.id, ids);
  }
  return { callToResponses, responseToCall };
};

const statusOf = (c: MessageClassification, rounds: number): DecayStatus[] => {
  const calc = (dimension: DecayDimension, value: ContentValue, maxRounds: number): DecayStatus => ({
    dimension,
    value,
    currentRound: rounds,
    maxRounds,
    isAlive: maxRounds === -1 ? true : rounds < maxRounds,
  });
  if (c.toolDecayConfigs && c.toolType) {
    const s = [
      calc('call', c.toolDecayConfigs.call.value, c.toolDecayConfigs.call.decayRounds),
      calc('content', c.toolDecayConfigs.content.value, c.toolDecayConfigs.content.decayRounds),
    ];
    if (c.isToolResult) s.push(calc('response', c.toolDecayConfigs.response.value, c.toolDecayConfigs.response.decayRounds));
    return s;
  }
  return [calc(c.decayDimension || 'content_text', c.contentValue, c.decayRounds)];
};

const compressionOf = (
  message: ChatMessage,
  classification: MessageClassification,
  rounds: number,
  roundsMap: Map<string, number>,
  roundOffset: number,
  maps: ReturnType<typeof buildToolMaps>,
  byId: Map<string, MessageClassification>
): CompressionState => {
  const done = (state: PromptState, level: 0 | 2 | 3, detail: string, sections: Section[]): CompressionState => ({ state, level, detail, sections });

  if (message.role === 'user') return done('full', 0, '用户消息永久保留。', [make('text', '正文', message.text || '(empty)', message.text || '(empty)', 'same')]);
  if (message.role === 'system' && !message.isToolOutput) {
    if (message.skipInHistory) return done('removed', 3, 'skipInHistory: 不进入 prompt。', [make('text', '正文', message.text || '(empty)', '已移除', 'removed')]);
    return done('full', 0, '普通系统消息保持原样。', [make('text', '正文', message.text || '(empty)', message.text || '(empty)', 'same')]);
  }

  const isCall = message.role === 'model' && message.rawParts?.some((p) => 'functionCall' in p);
  if (isCall) {
    const cfg = classification.toolDecayConfigs;
    if (!maps.callToResponses.has(message.id)) return done('removed', 3, '孤立 tool call 会被丢弃。', [make('call', '调用名', callNames(message), '已移除', 'removed'), make('args', '参数', callArgs(message, false), '已移除', 'removed')]);
    if (!cfg) return done('full', 0, '未命中工具衰减配置。', [make('call', '调用名', callNames(message), callNames(message), 'same'), make('args', '参数', callArgs(message, false), callArgs(message, false), 'same')]);
    if (rounds >= cfg.response.decayRounds) return done('removed', 3, `超过 response 阈值 ${cfg.response.decayRounds} 轮，整组移除。`, [make('call', '调用名', callNames(message), '已移除', 'removed'), make('args', '参数', callArgs(message, false), '已移除', 'removed')]);
    if (rounds >= cfg.content.decayRounds) return done('compressed', 2, `超过 content 阈值 ${cfg.content.decayRounds} 轮，参数清空。`, [make('call', '调用名', callNames(message), callNames(message), 'same'), make('args', '参数', callArgs(message, false), callArgs(message, true), 'compressed')]);
    return done('full', 0, '工具调用当前完整保留。', [make('call', '调用名', callNames(message), callNames(message), 'same'), make('args', '参数', callArgs(message, false), callArgs(message, false), 'same')]);
  }

  const pairedCallId = maps.responseToCall.get(message.id);
  if (pairedCallId) {
    const paired = byId.get(pairedCallId);
    const pairedRounds = (roundsMap.get(pairedCallId) ?? 0) + roundOffset;
    const responseDecay = paired?.toolDecayConfigs?.response.decayRounds;
    if (!paired || responseDecay === undefined) return done('removed', 3, '配对 tool call 缺失。', [make('response', '结果', responseBody(message), '已移除', 'removed')]);
    if (pairedRounds >= responseDecay) return done('removed', 3, `所属工具调用超过 response 阈值 ${responseDecay} 轮，本结果移除。`, [make('response', '结果', responseBody(message), '已移除', 'removed')]);
    return done('full', 0, '工具结果当前完整保留。', [make('response', '结果', responseBody(message), responseBody(message), 'same')]);
  }

  const limit = classification.decayRounds === -1 ? Infinity : classification.decayRounds;
  if (rounds >= limit) return done('removed', 3, `超过 ${classification.decayRounds} 轮后移除。`, [make('text', '正文', message.text || '(empty)', '已移除', 'removed')]);
  return done('full', 0, '普通消息当前完整保留。', [make('text', '正文', message.text || '(empty)', message.text || '(empty)', 'same')]);
};

const roleLabel = (role: string) => role === 'user' ? '用户' : role === 'model' ? 'AI' : '系统';
const toolLabel = (type: ToolType) => ({ readFile: 'readFile', createFile: 'createFile', writeFile: 'writeFile', patchFile: 'patchFile', updateFile: 'updateFile', deleteFile: 'deleteFile', listFiles: 'listFiles', manageTodos: 'manageTodos', call_search_agent: 'search', managePlanNote: 'planNote', updateProjectMeta: 'meta', unknown: 'unknown' }[type] || 'unknown');
const promptLabel = (state: PromptState) => state === 'full' ? '完整保留' : state === 'compressed' ? '已压缩' : '已移除';
const promptClass = (state: PromptState) => state === 'full' ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : state === 'compressed' ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border border-rose-500/30 bg-rose-500/10 text-rose-300';
const sectionClass = (change: ChangeType) => change === 'compressed' ? 'border-amber-500/30 bg-amber-500/10' : change === 'removed' ? 'border-rose-500/30 bg-rose-500/10' : 'border-gray-700 bg-gray-900/50';
const projectedClass = (change: ChangeType) => change === 'compressed' ? 'border-amber-500/30 bg-amber-500/10' : change === 'removed' ? 'border-rose-500/30 bg-rose-500/10' : 'border-emerald-500/20 bg-emerald-500/5';
const sectionLabel = (change: ChangeType) => change === 'compressed' ? '这一块被压缩了' : change === 'removed' ? '这一块被移除了' : '未变化';
const dimLabel = (d: DecayDimension) => d === 'call' ? '调用名' : d === 'content' ? '参数' : d === 'response' ? '结果' : '正文';
const valueLabel = (v: ContentValue) => v === ContentValue.HIGH ? '高' : v === ContentValue.MEDIUM ? '中' : '低';
const valueColor = (v: ContentValue) => v === ContentValue.HIGH ? 'text-emerald-300' : v === ContentValue.MEDIUM ? 'text-sky-300' : 'text-amber-300';
const barColor = (s: DecayStatus) => !s.isAlive ? 'bg-rose-500' : s.value === ContentValue.HIGH ? 'bg-emerald-400' : s.value === ContentValue.MEDIUM ? 'bg-sky-400' : 'bg-amber-400';

const MemoryDebugPanel: React.FC<Props> = ({ session, onClose }) => {
  const [roundOffset, setRoundOffset] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const roundsMap = useMemo(() => {
    if (!session) return new Map<string, number>();
    let n = 0;
    const map = new Map<string, number>();
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      map.set(m.id, n);
      if (m.role === 'user' || m.role === 'model') n++;
    }
    return map;
  }, [session]);

  const items = useMemo(() => {
    if (!session) return [];
    const maps = buildToolMaps(session.messages);
    const cls = classifyMessages(session.messages);
    const byId = new Map(cls.map((c) => [c.messageId, c] as const));
    return session.messages.map((message, i) => {
      const classification = cls[i];
      const rounds = (roundsMap.get(message.id) ?? 0) + roundOffset;
      return {
        message,
        classification,
        roundsSinceAdded: rounds,
        decayStatuses: statusOf(classification, rounds),
        compressionState: compressionOf(message, classification, rounds, roundsMap, roundOffset, maps, byId),
      };
    });
  }, [session, roundsMap, roundOffset]);

  const stats = useMemo(() => {
    if (!session) return null;
    return {
      total: session.messages.length,
      full: items.filter((i) => i.compressionState.state === 'full').length,
      compressed: items.filter((i) => i.compressionState.state === 'compressed').length,
      removed: items.filter((i) => i.compressionState.state === 'removed').length,
      changed: items.reduce((n, i) => n + i.compressionState.sections.filter((s) => s.change !== 'same').length, 0),
    };
  }, [session, items]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <Layers className="text-orange-400" size={20} />
            <span className="font-medium text-white">记忆压缩 Debug Panel</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAutoRefresh((v) => !v)} className={`rounded-lg p-2 ${autoRefresh ? 'bg-green-600/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
              {autoRefresh ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button onClick={() => setRoundOffset(0)} className="rounded-lg bg-gray-700 p-2 text-gray-400 hover:text-white">
              <RotateCcw size={16} />
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-700">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="border-b border-gray-700 bg-gray-900 px-4 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-blue-400" />
              <span className="text-gray-300">模拟轮次</span>
              <input type="number" value={roundOffset} onChange={(e) => setRoundOffset(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-16 rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-center text-white" />
              <button onClick={() => setRoundOffset((v) => v + 1)} className="rounded bg-gray-700 px-2 py-0.5 text-white hover:bg-gray-600">+1</button>
              <button onClick={() => setRoundOffset((v) => v + 5)} className="rounded bg-gray-700 px-2 py-0.5 text-white hover:bg-gray-600">+5</button>
            </div>
            <div className="ml-auto text-gray-400">直接看原始内容和进入 prompt 后的内容差异。</div>
          </div>

          {stats && (
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"><div className="text-xs text-emerald-300">完整保留</div><div className="text-2xl font-semibold text-white">{stats.full}</div></div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3"><div className="text-xs text-amber-300">已压缩</div><div className="text-2xl font-semibold text-white">{stats.compressed}</div></div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3"><div className="text-xs text-rose-300">已移除</div><div className="text-2xl font-semibold text-white">{stats.removed}</div></div>
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-3"><div className="text-xs text-gray-400">变化字段数</div><div className="text-2xl font-semibold text-white">{stats.changed}</div></div>
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-3"><div className="text-xs text-gray-400">总消息数</div><div className="text-2xl font-semibold text-white">{stats.total}</div></div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.message.id} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">#{index + 1}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${item.message.role === 'user' ? 'bg-blue-500/20 text-blue-300' : item.message.role === 'model' ? 'bg-violet-500/20 text-violet-300' : 'bg-gray-500/20 text-gray-300'}`}>{roleLabel(item.message.role)}</span>
                    {item.classification.toolType && item.classification.toolType !== ToolType.UNKNOWN && <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs text-orange-300">{toolLabel(item.classification.toolType)}</span>}
                    {item.message.isToolOutput && <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300">result</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs ${promptClass(item.compressionState.state)}`}>{promptLabel(item.compressionState.state)}</span>
                    <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-100">L{item.compressionState.level}</span>
                    <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-200">变化 {item.compressionState.sections.filter((s) => s.change !== 'same').length} 处</span>
                    <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-300">已过 {item.roundsSinceAdded} 轮</span>
                  </div>
                </div>

                <div className="mb-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3 text-sm text-gray-300">
                  {item.compressionState.detail}
                </div>

                <div className="space-y-3">
                  {item.compressionState.sections.map((section) => (
                    <div key={section.key} className={`rounded-lg border p-3 ${sectionClass(section.change)}`}>
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-white">{section.label}</span>
                        <span className="rounded-full bg-black/20 px-2 py-1 text-xs text-gray-200">{sectionLabel(section.change)}</span>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-gray-700 bg-gray-950/70 p-3">
                          <div className="mb-2 text-xs text-gray-400">原始内容</div>
                          <pre className="whitespace-pre-wrap break-words text-xs text-gray-200">{section.original}</pre>
                        </div>
                        <div className={`rounded-lg border p-3 ${projectedClass(section.change)}`}>
                          <div className="mb-2 text-xs text-gray-300">进入 prompt 后</div>
                          <pre className="whitespace-pre-wrap break-words text-xs text-white">{section.projected}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {item.decayStatuses.map((s) => {
                    const width = s.maxRounds === -1 ? 100 : s.isAlive ? Math.max(0, ((s.maxRounds - s.currentRound) / s.maxRounds) * 100) : 0;
                    return (
                      <div key={s.dimension} className="rounded-lg border border-gray-700 bg-gray-900/60 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm text-white">{dimLabel(s.dimension)}</span>
                          <span className={`text-xs ${valueColor(s.value)}`}>{valueLabel(s.value)}</span>
                        </div>
                        <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                          <span>{s.maxRounds === -1 ? '永久' : s.isAlive ? '保留中' : '已过期'}</span>
                          <span>{s.maxRounds === -1 ? '永久保留' : `${s.currentRound}/${s.maxRounds} 轮`}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-700">
                          <div className={`h-full ${barColor(s)}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryDebugPanel;
