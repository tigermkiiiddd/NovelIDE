import React, { useMemo, useState } from 'react';
import { Clock, Layers, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
    const s: DecayStatus[] = [];
    if (c.toolDecayConfigs.call) {
      s.push(calc('call', c.toolDecayConfigs.call.value, c.toolDecayConfigs.call.decayRounds));
    }
    if (c.toolDecayConfigs.content) {
      s.push(calc('content', c.toolDecayConfigs.content.value, c.toolDecayConfigs.content.decayRounds));
    }
    if (c.isToolResult && c.toolDecayConfigs.results) {
      s.push(calc('results', c.toolDecayConfigs.results.value, c.toolDecayConfigs.results.decayRounds));
    }
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
  byId: Map<string, MessageClassification>,
  t: any
): CompressionState => {
  const done = (state: PromptState, level: 0 | 2 | 3, detail: string, sections: Section[]): CompressionState => ({ state, level, detail, sections });
  const R = t('memoryDebug.projectedRemoved');

  if (message.role === 'user') return done('full', 0, t('memoryDebug.detailUserPermanent'), [make('text', t('memoryDebug.labelBodyText'), message.text || '(empty)', message.text || '(empty)', 'same')]);
  if (message.role === 'system' && !message.isToolOutput) {
    if (message.skipInHistory) return done('removed', 3, t('memoryDebug.detailSkipHistory'), [make('text', t('memoryDebug.labelBodyText'), message.text || '(empty)', R, 'removed')]);
    return done('full', 0, t('memoryDebug.detailSystemKeep'), [make('text', t('memoryDebug.labelBodyText'), message.text || '(empty)', message.text || '(empty)', 'same')]);
  }

  const isCall = message.role === 'model' && message.rawParts?.some((p) => 'functionCall' in p);
  if (isCall) {
    const cfg = classification.toolDecayConfigs;
    if (!maps.callToResponses.has(message.id)) return done('removed', 3, t('memoryDebug.detailOrphanCall'), [make('call', t('memoryDebug.labelCallName'), callNames(message), R, 'removed'), make('path', t('memoryDebug.labelPath'), callArgs(message, false), R, 'removed'), make('content', t('memoryDebug.labelArgs'), callArgs(message, false), R, 'removed')]);
    if (!cfg) return done('full', 0, t('memoryDebug.detailNoDecayConfig'), [make('call', t('memoryDebug.labelCallName'), callNames(message), callNames(message), 'same'), make('path', t('memoryDebug.labelPath'), callArgs(message, false), callArgs(message, false), 'same'), make('content', t('memoryDebug.labelArgs'), callArgs(message, false), callArgs(message, false), 'same')]);
    if (rounds >= cfg.content.decayRounds) return done('removed', 3, t('memoryDebug.detailContentExceeded', { threshold: cfg.content.decayRounds }), [make('call', t('memoryDebug.labelCallName'), callNames(message), R, 'removed'), make('path', t('memoryDebug.labelPath'), callArgs(message, false), R, 'removed'), make('content', t('memoryDebug.labelArgs'), callArgs(message, false), R, 'removed')]);
    if (rounds >= cfg.path.decayRounds) return done('compressed', 2, t('memoryDebug.detailPathExceeded', { threshold: cfg.path.decayRounds }), [make('call', t('memoryDebug.labelCallName'), callNames(message), callNames(message), 'same'), make('path', t('memoryDebug.labelPath'), callArgs(message, false), callArgs(message, true), 'compressed'), make('content', t('memoryDebug.labelArgs'), callArgs(message, false), callArgs(message, false), 'same')]);
    return done('full', 0, t('memoryDebug.detailToolKeep'), [make('call', t('memoryDebug.labelCallName'), callNames(message), callNames(message), 'same'), make('path', t('memoryDebug.labelPath'), callArgs(message, false), callArgs(message, false), 'same'), make('content', t('memoryDebug.labelArgs'), callArgs(message, false), callArgs(message, false), 'same')]);
  }

  const pairedCallId = maps.responseToCall.get(message.id);
  if (pairedCallId) {
    const paired = byId.get(pairedCallId);
    const pairedRounds = (roundsMap.get(pairedCallId) ?? 0) + roundOffset;
    const pairedCfg = paired?.toolDecayConfigs;
    // results and status both decayed -> remove
    const statusThreshold = pairedCfg?.status.decayRounds ?? 4;
    const resultsThreshold = pairedCfg?.results.decayRounds ?? 4;
    const statusDead = pairedRounds >= statusThreshold;
    const resultsDead = pairedRounds >= resultsThreshold;
    if (!paired || (statusDead && resultsDead)) return done('removed', 3, t('memoryDebug.detailPairedDecayed'), [make('results', t('memoryDebug.labelResult'), responseBody(message), R, 'removed'), make('status', t('memoryDebug.labelStatus'), responseBody(message), R, 'removed')]);
    if (statusDead) return done('compressed', 2, t('memoryDebug.detailStatusExceeded', { threshold: statusThreshold }), [make('results', t('memoryDebug.labelResult'), responseBody(message), responseBody(message), 'same'), make('status', t('memoryDebug.labelStatus'), responseBody(message), R, 'removed')]);
    if (resultsDead) return done('compressed', 2, t('memoryDebug.detailResultsExceeded', { threshold: resultsThreshold }), [make('results', t('memoryDebug.labelResult'), responseBody(message), R, 'removed'), make('status', t('memoryDebug.labelStatus'), responseBody(message), responseBody(message), 'same')]);
    return done('full', 0, t('memoryDebug.detailToolResultKeep'), [make('results', t('memoryDebug.labelResult'), responseBody(message), responseBody(message), 'same'), make('status', t('memoryDebug.labelStatus'), responseBody(message), responseBody(message), 'same')]);
  }

  const limit = classification.decayRounds === -1 ? Infinity : classification.decayRounds;
  if (rounds >= limit) return done('removed', 3, t('memoryDebug.detailRoundsExceeded', { rounds: classification.decayRounds }), [make('text', t('memoryDebug.labelBodyText'), message.text || '(empty)', R, 'removed')]);
  return done('full', 0, t('memoryDebug.detailMessageKeep'), [make('text', t('memoryDebug.labelBodyText'), message.text || '(empty)', message.text || '(empty)', 'same')]);
};

const roleLabel = (role: string, t: any) => role === 'user' ? t('memoryDebug.roleUser') : role === 'model' ? t('memoryDebug.roleAI') : t('memoryDebug.roleSystem');
const toolLabel = (type: ToolType) => ({ readFile: 'readFile', createFile: 'createFile', writeFile: 'writeFile', patchFile: 'patchFile', updateFile: 'updateFile', deleteFile: 'deleteFile', listFiles: 'listFiles', manageTodos: 'manageTodos', managePlanNote: 'planNote', updateProjectMeta: 'meta', unknown: 'unknown' }[type] || 'unknown');
const promptLabel = (state: PromptState, t: any) => state === 'full' ? t('memoryDebug.stateFull') : state === 'compressed' ? t('memoryDebug.stateCompressed') : t('memoryDebug.stateRemoved');
const promptClass = (state: PromptState) => state === 'full' ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : state === 'compressed' ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border border-rose-500/30 bg-rose-500/10 text-rose-300';
const sectionClass = (change: ChangeType) => change === 'compressed' ? 'border-amber-500/30 bg-amber-500/10' : change === 'removed' ? 'border-rose-500/30 bg-rose-500/10' : 'border-gray-700 bg-gray-900/50';
const projectedClass = (change: ChangeType) => change === 'compressed' ? 'border-amber-500/30 bg-amber-500/10' : change === 'removed' ? 'border-rose-500/30 bg-rose-500/10' : 'border-emerald-500/20 bg-emerald-500/5';
const sectionLabel = (change: ChangeType, t: any) => change === 'compressed' ? t('memoryDebug.sectionCompressed') : change === 'removed' ? t('memoryDebug.sectionRemoved') : t('memoryDebug.sectionUnchanged');
const dimLabel = (d: DecayDimension, t: any) => d === 'call' ? t('memoryDebug.dimCall') : d === 'path' ? t('memoryDebug.dimPath') : d === 'content' ? t('memoryDebug.dimContent') : d === 'status' ? t('memoryDebug.dimStatus') : d === 'results' ? t('memoryDebug.dimResults') : d === 'content_text' ? t('memoryDebug.dimContentText') : d;
const valueLabel = (v: ContentValue, t: any) => v === ContentValue.HIGH ? t('memoryDebug.valueHigh') : v === ContentValue.MEDIUM ? t('memoryDebug.valueMedium') : t('memoryDebug.valueLow');
const valueColor = (v: ContentValue) => v === ContentValue.HIGH ? 'text-emerald-300' : v === ContentValue.MEDIUM ? 'text-sky-300' : 'text-amber-300';
const barColor = (s: DecayStatus) => !s.isAlive ? 'bg-rose-500' : s.value === ContentValue.HIGH ? 'bg-emerald-400' : s.value === ContentValue.MEDIUM ? 'bg-sky-400' : 'bg-amber-400';

const MemoryDebugPanel: React.FC<Props> = ({ session, onClose }) => {
  const { t } = useTranslation();
  const [roundOffset, setRoundOffset] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 从后往前计算每条消息之后经过了多少轮（与 buildSimpleHistory 保持一致）
  const roundsMap = useMemo(() => {
    if (!session) return new Map<string, number>();
    let roundCounter = 0;
    const map = new Map<string, number>();
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      map.set(m.id, roundCounter);
      if (m.role === 'user' || m.role === 'model') {
        roundCounter++;
      }
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
        compressionState: compressionOf(message, classification, rounds, roundsMap, roundOffset, maps, byId, t),
      };
    });
  }, [session, roundsMap, roundOffset, t]);

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
            <span className="font-medium text-white">{t('memoryDebug.title')}</span>
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
              <span className="text-gray-300">{t('memoryDebug.simulateRounds')}</span>
              <input type="number" value={roundOffset} onChange={(e) => setRoundOffset(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-16 rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-center text-white" />
              <button onClick={() => setRoundOffset((v) => v + 1)} className="rounded bg-gray-700 px-2 py-0.5 text-white hover:bg-gray-600">+1</button>
              <button onClick={() => setRoundOffset((v) => v + 5)} className="rounded bg-gray-700 px-2 py-0.5 text-white hover:bg-gray-600">+5</button>
            </div>
            <div className="ml-auto text-gray-400">{t('memoryDebug.diffHint')}</div>
          </div>

          {stats && (
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"><div className="text-xs text-emerald-300">{t('memoryDebug.stateFull')}</div><div className="text-2xl font-semibold text-white">{stats.full}</div></div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3"><div className="text-xs text-amber-300">{t('memoryDebug.stateCompressed')}</div><div className="text-2xl font-semibold text-white">{stats.compressed}</div></div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3"><div className="text-xs text-rose-300">{t('memoryDebug.stateRemoved')}</div><div className="text-2xl font-semibold text-white">{stats.removed}</div></div>
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-3"><div className="text-xs text-gray-400">{t('memoryDebug.changedFields')}</div><div className="text-2xl font-semibold text-white">{stats.changed}</div></div>
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-3"><div className="text-xs text-gray-400">{t('memoryDebug.totalMessages')}</div><div className="text-2xl font-semibold text-white">{stats.total}</div></div>
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
                    <span className={`rounded px-2 py-0.5 text-xs ${item.message.role === 'user' ? 'bg-blue-500/20 text-blue-300' : item.message.role === 'model' ? 'bg-violet-500/20 text-violet-300' : 'bg-gray-500/20 text-gray-300'}`}>{roleLabel(item.message.role, t)}</span>
                    {item.classification.toolType && item.classification.toolType !== ToolType.UNKNOWN && <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs text-orange-300">{toolLabel(item.classification.toolType)}</span>}
                    {item.message.isToolOutput && <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300">result</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs ${promptClass(item.compressionState.state)}`}>{promptLabel(item.compressionState.state, t)}</span>
                    <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-100">L{item.compressionState.level}</span>
                    <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-200">{t('memoryDebug.changedCount', { count: item.compressionState.sections.filter((s) => s.change !== 'same').length })}</span>
                    <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-300">{t('memoryDebug.roundsPassed', { count: item.roundsSinceAdded })}</span>
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
                        <span className="rounded-full bg-black/20 px-2 py-1 text-xs text-gray-200">{sectionLabel(section.change, t)}</span>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-gray-700 bg-gray-950/70 p-3">
                          <div className="mb-2 text-xs text-gray-400">{t('memoryDebug.originalContent')}</div>
                          <pre className="whitespace-pre-wrap break-words text-xs text-gray-200">{section.original}</pre>
                        </div>
                        <div className={`rounded-lg border p-3 ${projectedClass(section.change)}`}>
                          <div className="mb-2 text-xs text-gray-300">{t('memoryDebug.afterPrompt')}</div>
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
                          <span className="text-sm text-white">{dimLabel(s.dimension, t)}</span>
                          <span className={`text-xs ${valueColor(s.value)}`}>{valueLabel(s.value, t)}</span>
                        </div>
                        <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                          <span>{s.maxRounds === -1 ? t('memoryDebug.permanent') : s.isAlive ? t('memoryDebug.retaining') : t('memoryDebug.expired')}</span>
                          <span>{s.maxRounds === -1 ? t('memoryDebug.permanentKeep') : `${s.currentRound}/${s.maxRounds} ${t('memoryDebug.rounds')}`}</span>
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
