import React, { useMemo } from 'react';
import { Layers, X } from 'lucide-react';
import { ChatMessage, ChatSession } from '../types';
import { getWindowedMessages } from '../domains/agentContext/windowing';

interface Props {
  session: ChatSession | null;
  onClose: () => void;
}

const hasFunctionCall = (message: ChatMessage) =>
  message.rawParts?.some((part: any) => part.functionCall) ?? false;

const hasFunctionResponse = (message: ChatMessage) =>
  message.rawParts?.some((part: any) => part.functionResponse) ?? false;

const toolNames = (message: ChatMessage): string => {
  const names = message.rawParts
    ?.filter((part: any) => part.functionCall || part.functionResponse)
    .map((part: any) => part.functionCall?.name || part.functionResponse?.name)
    .filter(Boolean);
  return names?.length ? names.join(', ') : '';
};

const estimateTokens = (text: string) => Math.ceil(text.length / 2);

const serializeMessage = (message: ChatMessage) => {
  const raw = message.rawParts ? JSON.stringify(message.rawParts) : '';
  return `${message.role}\n${message.text || ''}\n${raw}`;
};

const roleClass = (role: ChatMessage['role']) => {
  if (role === 'user') return 'bg-blue-500/20 text-blue-300';
  if (role === 'model') return 'bg-violet-500/20 text-violet-300';
  return 'bg-gray-500/20 text-gray-300';
};

const rowState = (message: ChatMessage, inContext: boolean) => {
  if (message.skipInHistory) return { label: 'skipInHistory', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300' };
  if (!inContext) return { label: 'filtered', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' };
  return { label: 'sent', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' };
};

const MemoryDebugPanel: React.FC<Props> = ({ session, onClose }) => {
  const data = useMemo(() => {
    const messages = session?.messages || [];
    const windowed = getWindowedMessages(messages);
    const sentIds = new Set(windowed.map(m => m.id));
    const skipped = messages.filter(m => m.skipInHistory).length;
    const toolCalls = windowed.filter(hasFunctionCall).length;
    const toolResponses = windowed.filter(hasFunctionResponse).length;
    const transcriptTokens = estimateTokens(windowed.map(serializeMessage).join('\n\n'));

    return {
      messages,
      windowed,
      sentIds,
      skipped,
      toolCalls,
      toolResponses,
      transcriptTokens,
      dropped: Math.max(0, messages.length - windowed.length),
    };
  }, [session]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <Layers className="text-orange-400" size={20} />
            <div>
              <div className="font-medium text-white">History Context Debug</div>
              <div className="text-xs text-gray-500">Full transcript history; no message-count sliding window.</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 border-b border-gray-700 bg-gray-900 px-4 py-3 md:grid-cols-6">
          <Stat label="Total" value={data.messages.length} />
          <Stat label="Sent" value={data.windowed.length} />
          <Stat label="Filtered/Skip" value={`${data.dropped}/${data.skipped}`} />
          <Stat label="Tool Pairs" value={`${data.toolCalls}/${data.toolResponses}`} />
          <Stat label="Est. Tokens" value={data.transcriptTokens} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {data.messages.map((message, index) => {
              const inWindow = data.sentIds.has(message.id);
              const state = rowState(message, inWindow);
              const names = toolNames(message);
              return (
                <div key={message.id} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">#{index + 1}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${roleClass(message.role)}`}>{message.role}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs ${state.cls}`}>{state.label}</span>
                    {names && <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs text-orange-300">{names}</span>}
                    {message.isToolOutput && <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300">tool result</span>}
                  </div>
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-950 p-3 text-xs text-gray-300">
                    {message.rawParts ? JSON.stringify(message.rawParts, null, 2) : (message.text || '(empty)')}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

export default MemoryDebugPanel;
