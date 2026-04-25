
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, Code, Database, RefreshCw, Edit2, Check, ChevronDown, ChevronRight, Loader2, Wrench, Brain, AlertOctagon, FileText, MessageSquare, Layers, Wifi, Key, Clock, AlertTriangle, Zap, WifiOff, Ban, Cpu } from 'lucide-react';
import { ChatMessage } from '../types';
import APIInputView from './APIInputView';
import { useUiStore } from '../stores/uiStore';
import { useFileStore } from '../stores/fileStore';
import { useAgentStore } from '../stores/agentStore';
import { generateToolSummary } from '../utils/toolSummaryUtils';
import { findNodeByPath } from '../services/fileSystem';
import { AgentErrorInfo, AgentErrorCategory } from '../types/agentErrors';

// --- Error Category Icons and Colors ---
const getErrorCategoryStyle = (category: AgentErrorCategory) => {
  switch (category) {
    case AgentErrorCategory.NETWORK:
      return { icon: WifiOff, color: 'text-orange-400', bg: 'bg-orange-900/30', border: 'border-orange-700/50' };
    case AgentErrorCategory.AUTH:
      return { icon: Key, color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-700/50' };
    case AgentErrorCategory.RATE_LIMIT:
      return { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-900/30', border: 'border-yellow-700/50' };
    case AgentErrorCategory.PARSE:
      return { icon: AlertTriangle, color: 'text-purple-400', bg: 'bg-purple-900/30', border: 'border-purple-700/50' };
    case AgentErrorCategory.CONTENT:
      return { icon: Ban, color: 'text-pink-400', bg: 'bg-pink-900/30', border: 'border-pink-700/50' };
    case AgentErrorCategory.API:
    default:
      return { icon: AlertOctagon, color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-700/50' };
  }
};

// --- Error Info View Component ---
const ErrorInfoView: React.FC<{
  errorInfo: AgentErrorInfo;
  isDebugMode: boolean;
  onRetry?: () => void;
}> = ({ errorInfo, isDebugMode, onRetry }) => {
  const [showDebug, setShowDebug] = useState(false);
  const style = getErrorCategoryStyle(errorInfo.category);
  const Icon = style.icon;

  return (
    <div className={`w-full max-w-[95%] sm:max-w-[85%] ${style.bg} ${style.border} border rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`}>
      {/* Error Header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${style.border}`}>
        <div className={`p-2 rounded-lg ${style.bg}`}>
          <Icon size={18} className={style.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-sm ${style.color}`}>{errorInfo.title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{errorInfo.message}</div>
        </div>
        {errorInfo.recoverable && onRetry && (
          <button
            onClick={onRetry}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${style.color} hover:bg-white/10 rounded-lg transition-colors`}
          >
            <RefreshCw size={12} />
            重试
          </button>
        )}
      </div>

      {/* Suggestions */}
      {errorInfo.suggestions.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">解决建议</div>
          <ul className="space-y-1.5">
            {errorInfo.suggestions.map((suggestion, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                <span className={`${style.color} mt-0.5`}>{idx + 1}.</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Debug Data Toggle */}
      {isDebugMode && errorInfo.debugData && (
        <div className="border-t border-gray-800">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Code size={12} />
              Debug 详情
            </span>
            <ChevronRight size={12} className={`transition-transform ${showDebug ? 'rotate-90' : ''}`} />
          </button>

          {showDebug && (
            <div className="px-4 py-3 bg-black/30 space-y-3">
              {/* Raw Error */}
              {errorInfo.debugData.rawError && (
                <JsonView
                  data={errorInfo.debugData.rawError}
                  label="原始错误"
                  icon={<AlertOctagon size={12} />}
                  color="text-red-300"
                />
              )}

              {/* Request Info */}
              {errorInfo.debugData.request && (
                <JsonView
                  data={errorInfo.debugData.request}
                  label="请求信息"
                  icon={<Zap size={12} />}
                  color="text-blue-300"
                />
              )}

              {/* Response Info */}
              {errorInfo.debugData.response && (
                <JsonView
                  data={errorInfo.debugData.response}
                  label="响应信息"
                  icon={<Database size={12} />}
                  color="text-green-300"
                />
              )}

              {/* Stack Trace */}
              {errorInfo.debugData.stack && (
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">堆栈追踪</div>
                  <pre className="text-[9px] text-gray-500 bg-black/50 p-2 rounded border border-gray-800 overflow-x-auto whitespace-pre-wrap">
                    {errorInfo.debugData.stack}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Response Warning Badge ---
const ResponseWarningBadge: React.FC<{
  warnings: any[];
}> = ({ warnings }) => {
  if (!warnings || warnings.length === 0) return null;

  // 提取警告类型
  const hasTruncation = warnings.some((w: any) =>
    typeof w === 'string' ? w.includes('truncated') || w.includes('length') :
    w.title?.includes('截断')
  );
  const hasFilter = warnings.some((w: any) =>
    typeof w === 'string' ? w.includes('filter') || w.includes('filtered') :
    w.title?.includes('过滤')
  );

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {hasTruncation && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-yellow-900/30 border border-yellow-700/50 text-yellow-400 rounded-full">
          <AlertTriangle size={10} />
          <span>响应被截断</span>
        </div>
      )}
      {hasFilter && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-pink-900/30 border border-pink-700/50 text-pink-400 rounded-full">
          <Ban size={10} />
          <span>内容被过滤</span>
        </div>
      )}
      {!hasTruncation && !hasFilter && warnings.map((w: any, idx: number) => (
        <div key={idx} className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-orange-900/30 border border-orange-700/50 text-orange-400 rounded-full">
          <AlertTriangle size={10} />
          <span>{typeof w === 'string' ? w : w.title || '警告'}</span>
        </div>
      ))}
    </div>
  );
};

// --- Debug Payload View Component ---
interface DebugPayload {
    systemInstruction?: string;
    apiHistoryPreview?: Array<{ role: string; parts: any[] }>;
    totalHistoryLength?: number;
    slidingWindow?: {
        inContext: number;
        dropped: number;
        windowSize: number;
    };
}

const DebugPayloadView: React.FC<{ debugPayload: DebugPayload }> = ({ debugPayload }) => {
    const [activeTab, setActiveTab] = useState<'system' | 'history' | 'window'>('system');

    if (!debugPayload) return null;

    return (
        <div className="mt-2 w-full max-w-[95%] sm:max-w-[85%]">
            <details className="group" open>
                <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-mono bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/50 p-2 rounded-lg transition-colors">
                    <ChevronRight size={12} className="group-open:rotate-90 transition-transform text-purple-400" />
                    <FileText size={12} className="text-purple-400" />
                    <span className="text-purple-300 font-semibold">LLM 输入详情 (Debug)</span>
                    {debugPayload.slidingWindow && (
                        <span className="ml-auto text-[10px] text-purple-400 bg-purple-800/50 px-1.5 py-0.5 rounded">
                            📜 {debugPayload.slidingWindow.inContext}/{debugPayload.slidingWindow.windowSize}
                            {debugPayload.slidingWindow.dropped > 0 && ` (-${debugPayload.slidingWindow.dropped})`}
                        </span>
                    )}
                </summary>

                <div className="mt-2 bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
                    {/* Tab Navigation */}
                    <div className="flex border-b border-gray-800 bg-gray-900/50">
                        <button
                            onClick={() => setActiveTab('system')}
                            className={`px-3 py-2 text-[10px] font-mono uppercase tracking-wide transition-colors flex items-center gap-1 ${
                                activeTab === 'system'
                                    ? 'text-purple-300 border-b-2 border-purple-500 bg-gray-800/50'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            <FileText size={10} />
                            System Prompt
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-3 py-2 text-[10px] font-mono uppercase tracking-wide transition-colors flex items-center gap-1 ${
                                activeTab === 'history'
                                    ? 'text-blue-300 border-b-2 border-blue-500 bg-gray-800/50'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            <MessageSquare size={10} />
                            History ({debugPayload.totalHistoryLength || debugPayload.apiHistoryPreview?.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab('window')}
                            className={`px-3 py-2 text-[10px] font-mono uppercase tracking-wide transition-colors flex items-center gap-1 ${
                                activeTab === 'window'
                                    ? 'text-cyan-300 border-b-2 border-cyan-500 bg-gray-800/50'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            <Layers size={10} />
                            Sliding Window
                        </button>
                    </div>

                    {/* Tab Content - 无高度限制，完整显示 */}
                    <div className="p-3">
                        {/* System Instruction Tab */}
                        {activeTab === 'system' && debugPayload.systemInstruction && (
                            <div className="space-y-2">
                                <div className="text-[10px] text-purple-400 font-mono">
                                    Length: {debugPayload.systemInstruction.length} chars
                                </div>
                                <pre className="font-mono text-[10px] text-gray-300 whitespace-pre-wrap leading-relaxed bg-black/30 p-2 rounded border border-gray-800">
                                    {debugPayload.systemInstruction}
                                </pre>
                            </div>
                        )}

                        {/* History Tab - 完整显示每条消息 */}
                        {activeTab === 'history' && debugPayload.apiHistoryPreview && (
                            <div className="space-y-2">
                                <div className="text-[10px] text-blue-400 font-mono mb-2">
                                    发送给 LLM 的消息: {debugPayload.apiHistoryPreview.length} 条
                                    {debugPayload.totalHistoryLength !== debugPayload.apiHistoryPreview.length && (
                                        <span className="text-yellow-400 ml-2">
                                            (原始 {debugPayload.totalHistoryLength} 条，已裁剪)
                                        </span>
                                    )}
                                </div>
                                {debugPayload.apiHistoryPreview.map((msg, idx) => (
                                    <details key={idx} className="group/bg bg-black/30 rounded border border-gray-800">
                                        <summary className="cursor-pointer list-none p-2 hover:bg-gray-800/50 transition-colors flex items-center gap-2">
                                            <ChevronRight size={10} className="group-open/bg:rotate-90 transition-transform text-gray-500" />
                                            <div className={`text-[10px] font-mono font-bold ${
                                                msg.role === 'user' ? 'text-blue-400' :
                                                msg.role === 'model' || msg.role === 'assistant' ? 'text-green-400' :
                                                'text-gray-400'
                                            }`}>
                                                [{idx + 1}] {msg.role.toUpperCase()}
                                            </div>
                                            <span className="text-[9px] text-gray-500 truncate flex-1">
                                                {msg.parts?.map((p: any) => p.text?.substring(0, 50) || '(tool call)').join(' | ') || '(empty)'}...
                                            </span>
                                        </summary>
                                        <div className="p-2 pt-0">
                                            <pre className="font-mono text-[9px] text-gray-400 whitespace-pre-wrap leading-relaxed">
                                                {msg.parts?.map((p: any) => p.text || JSON.stringify(p, null, 2)).join('\n') || '(empty)'}
                                            </pre>
                                        </div>
                                    </details>
                                ))}
                            </div>
                        )}

                        {/* Sliding Window Tab */}
                        {activeTab === 'window' && debugPayload.slidingWindow && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-cyan-900/20 border border-cyan-700/50 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-mono font-bold text-cyan-300">
                                            {debugPayload.slidingWindow.inContext}
                                        </div>
                                        <div className="text-[10px] text-cyan-400 uppercase tracking-wide mt-1">
                                            In Context
                                        </div>
                                    </div>
                                    <div className={`border rounded-lg p-3 text-center ${
                                        debugPayload.slidingWindow.dropped > 0
                                            ? 'bg-yellow-900/20 border-yellow-700/50'
                                            : 'bg-gray-800/50 border-gray-700/50'
                                    }`}>
                                        <div className={`text-2xl font-mono font-bold ${
                                            debugPayload.slidingWindow.dropped > 0 ? 'text-yellow-300' : 'text-gray-400'
                                        }`}>
                                            {debugPayload.slidingWindow.dropped}
                                        </div>
                                        <div className={`text-[10px] uppercase tracking-wide mt-1 ${
                                            debugPayload.slidingWindow.dropped > 0 ? 'text-yellow-400' : 'text-gray-500'
                                        }`}>
                                            Dropped
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">
                                        Window Size (MAX_CONTEXT_MESSAGES)
                                    </div>
                                    <div className="text-xl font-mono font-bold text-gray-200">
                                        {debugPayload.slidingWindow.windowSize}
                                    </div>
                                </div>
                                <div className="text-[10px] text-gray-500 italic">
                                    💡 滑动窗口机制：只将最近 N 条消息发送给 LLM，以节省 Token 并保持上下文相关性。
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </details>
        </div>
    );
};

interface AgentMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onRegenerate?: (id: string) => void;
  onEditMessage?: (id: string, newText: string) => void;
}

// --- Internal Component: Collapsible Tool Log (Output) ---
const ToolLogMessage: React.FC<{
    text: string;
    rawParts?: any[];
    metadata?: any;
    isLast: boolean;
    isLoading: boolean;
    isDebugMode: boolean;
}> = ({ text, rawParts, metadata, isLast, isLoading, isDebugMode }) => {
    const [isExpanded, setIsExpanded] = useState(isLast && isLoading);

    useEffect(() => {
        if (isLast && isLoading) {
            setIsExpanded(true);
        }
    }, [isLast, isLoading]);

    const finishedToolNames = rawParts
        ?.filter((p: any) => p.functionResponse)
        .map((p: any) => p.functionResponse.name)
        .join(', ');

    const displayToolNames = finishedToolNames || metadata?.executingTools;
    const isRunning = isLast && isLoading;

    // 生成简洁的操作摘要（普通模式）
    const toolSummary = displayToolNames
        ? generateToolSummary(displayToolNames.split(',')[0], {})
        : null;

    // 普通模式：简化标题
    const titleText = isDebugMode
        ? (isRunning
            ? (displayToolNames ? `工具执行中: ${displayToolNames}...` : '系统执行中...')
            : (displayToolNames ? `工具执行结果: ${displayToolNames}` : '系统日志'))
        : (isRunning
            ? '执行中...'
            : (toolSummary ? toolSummary.summary : '执行完成'));

    // 从 text 中提取 thinking 内容（匹配 **思考内容**: 或 **反思内容**: 后的内容）
    const thinkingContent = (() => {
        // 匹配 "**思考内容**:" 或 "**反思内容**:" 后的内容（到 --- 或文本结束）
        const match = text.match(/\*\*(?:思考内容|反思内容)\*\*:\s*([\s\S]*?)(?:\n---|$)/);
        if (match) {
            // 清理并截取前200字符作为摘要
            const content = match[1].trim();
            return content.length > 200 ? content.slice(0, 200) + '...' : content;
        }
        return null;
    })();

    // 判断是否是 thinking 工具的输出
    const isThinkingOutput = text.includes('🧠 **【') || text.includes('🔍 **【创作反思】**');

    // 简化显示内容（普通模式只显示结果行）
    const displayText = isDebugMode
        ? text
        : (text.split('\n').find(line => line.includes('✅') || line.includes('❌')) || '');

    const toolResponses = rawParts?.filter((p: any) => p.functionResponse).map((p: any) => p.functionResponse);

    return (
        <div className="w-full max-w-[95%] sm:max-w-[85%] my-2">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`flex items-center gap-2 w-full border rounded-lg px-3 py-2 text-xs font-mono transition-colors text-left ${
                    isRunning
                        ? 'bg-blue-900/20 border-blue-500/30 text-blue-300'
                        : 'bg-gray-800/80 border-gray-700/50 text-gray-400 hover:bg-gray-800'
                }`}
            >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {isRunning ? (
                    <Loader2 size={12} className="shrink-0 animate-spin text-blue-400"/>
                ) : (
                    <Terminal size={12} className="shrink-0"/>
                )}
                <span className="truncate flex-1 font-mono opacity-90">{titleText}</span>
            </button>

            {/* Thinking 内容预览 - 普通模式下也显示 */}
            {!isExpanded && thinkingContent && (
                <div className="mt-1 px-3 py-2 text-xs text-gray-400 leading-relaxed">
                    <div className="flex items-start gap-2">
                        <Brain size={12} className="shrink-0 mt-0.5 text-blue-400 opacity-70" />
                        <span className="whitespace-pre-wrap line-clamp-3">{thinkingContent}</span>
                    </div>
                </div>
            )}

            {isExpanded && (
                <div className="mt-1 bg-gray-950 border border-gray-800 rounded-lg p-3 text-gray-300 font-mono text-xs overflow-x-auto animate-in slide-in-from-top-2 duration-200">
                    {/* Thinking Section - 始终显示 */}
                    {thinkingContent && (
                        <div className="mb-3 p-2 bg-blue-900/10 rounded text-gray-300 italic leading-relaxed">
                            <div className="flex items-start gap-2">
                                <Brain size={12} className="shrink-0 mt-0.5 text-blue-400 opacity-70" />
                                <span className="opacity-90">{thinkingContent}</span>
                            </div>
                        </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                        {displayText || <span className="text-gray-600 italic">初始化执行环境...</span>}
                    </div>
                    {/* 详细工具输出 - 仅 Debug 模式显示 */}
                    {isDebugMode && toolResponses && toolResponses.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                             <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wide">详细工具输出</div>
                             {toolResponses.map((tr: any, idx: number) => (
                                 <JsonView key={idx} data={tr.response} label={`原始输出: ${tr.name}`} icon={<Database size={12}/>} color="text-green-300"/>
                             ))}
                        </div>
                    )}

                    {/* Debug Payload - 仅 Debug 模式显示 */}
                    {isDebugMode && metadata?.apiMetadata && (
                        <APIInputView
                            apiMetadata={metadata.apiMetadata}
                            label="API 调用详情"
                        />
                    )}
                </div>
            )}
        </div>
    );
};

// --- Reasoning Block (显示模型思考过程) ---
const ReasoningBlock: React.FC<{
    reasoning: string;
    isDebugMode: boolean;
}> = ({ reasoning, isDebugMode }) => {
    const [isExpanded, setIsExpanded] = useState(!isDebugMode);

    // 截断过长内容用于预览
    const previewLength = 150;
    const isLong = reasoning.length > previewLength;
    const preview = isLong ? reasoning.slice(0, previewLength) + '...' : reasoning;

    return (
        <div className="mt-2 text-xs font-mono bg-[#0d1117] rounded-lg border border-blue-700/50 overflow-hidden">
            <div
                className="px-3 py-2 bg-blue-900/30 border-b border-blue-700/50 flex items-center gap-2 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <ChevronRight size={14} className={`text-blue-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                <Brain size={14} className="text-blue-400" />
                <span className="font-medium text-blue-300 truncate flex-1">💭 模型思考过程</span>
                <span className="text-[10px] text-blue-400 bg-blue-900/50 px-1.5 py-0.5 rounded shrink-0">
                    {isExpanded ? '收起' : '展开'}
                </span>
            </div>
            {isExpanded && (
                <div className="p-3 text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar">
                    {isLong && !isExpanded ? preview : reasoning}
                </div>
            )}
        </div>
    );
};

// --- SubAgent Output Block (格式化报告显示) ---
const SubAgentOutputBlock: React.FC<{
    text: string;
    isError?: boolean;
    isLast: boolean;
    isLoading: boolean;
}> = ({ text, isError, isLast, isLoading }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    // 提取报告摘要（第一行）
    const summaryLine = text.split('\n')[0] || '大纲处理完成';

    return (
        <div className="w-full max-w-[95%] sm:max-w-[85%] my-2">
            <div className="text-xs font-mono bg-[#0d1117] rounded-lg border border-purple-700 overflow-hidden">
                <div
                    className="px-3 py-2 bg-purple-900/30 border-b border-purple-700 flex items-center gap-2 cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <ChevronRight size={14} className={`text-purple-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <Cpu size={14} className="text-purple-400" />
                    <span className="font-medium text-purple-300 truncate flex-1">
                        {isLoading ? '📝 大纲子Agent执行中...' : (isError ? '❌ 大纲处理失败' : '✅ 大纲处理完成')}
                    </span>
                    <span className="text-[10px] text-purple-400 bg-purple-900/50 px-1.5 py-0.5 rounded">
                        {isExpanded ? '收起' : '展开'}
                    </span>
                </div>
                {isExpanded && (
                    <div className="p-3 bg-gray-950 text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {text}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Deep Thinking Card (Chat 面板可展开卡片) ---
const DeepThinkingCard: React.FC<{ args: any }> = ({ args }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activePage, setActivePage] = useState<'p1' | 'p2' | 'p3'>('p1');
    const sessions = useAgentStore(state => state.sessions);
    const currentSessionId = useAgentStore(state => state.currentSessionId);

    const session = sessions.find(s => s.id === currentSessionId);
    const pads = session?.thinkingPads || [];
    const action = args?.action;

    // create 时找到刚创建的 pad（最新的），list/view_log 时显示摘要
    const latestPad = pads.length > 0 ? pads[pads.length - 1] : null;

    const pageLabels: Record<string, string> = { p1: 'P1 约束', p2: 'P2 广度', p3: 'P3 深度' };
    const pageKeys: Record<string, 'p1_constraint' | 'p2_breadth' | 'p3_depth'> = {
        p1: 'p1_constraint', p2: 'p2_breadth', p3: 'p3_depth',
    };

    const activeContent = latestPad ? latestPad.pages[pageKeys[activePage]].content : '';

    if (action === 'list') {
        return (
            <div className="mt-1 text-xs font-mono bg-[#0d1117] rounded-lg border border-amber-700/50 overflow-hidden">
                <div className="px-3 py-2 bg-amber-900/20 text-amber-300 flex items-center gap-2">
                    <Brain size={12} className="text-amber-400" />
                    <span>思考空间列表（{pads.length}个）</span>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-1 text-xs font-mono bg-[#0d1117] rounded-lg border border-amber-700/50 overflow-hidden">
            {/* 标题栏 */}
            <div
                className="px-3 py-2 bg-amber-900/20 border-b border-amber-700/30 flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Brain size={12} className="text-amber-400 shrink-0" />
                <span className="text-amber-300 font-medium flex-1">
                    {latestPad ? latestPad.title : '深度分析'}
                </span>
                <span className="text-[10px] text-amber-400/60">
                    {pads.length > 0 ? `${pads.length}个思考空间` : ''}
                </span>
                {isExpanded
                    ? <ChevronDown size={12} className="text-amber-400/60" />
                    : <ChevronRight size={12} className="text-amber-400/60" />
                }
            </div>

            {/* 展开内容 */}
            {isExpanded && latestPad && (
                <div className="border-t border-amber-700/20">
                    {/* 页签切换 */}
                    <div className="flex border-b border-gray-800">
                        {(['p1', 'p2', 'p3'] as const).map(page => (
                            <button
                                key={page}
                                className={`flex-1 px-3 py-1.5 text-center transition-colors ${
                                    activePage === page
                                        ? 'bg-amber-900/30 text-amber-300 border-b-2 border-amber-400'
                                        : 'text-gray-500 hover:text-gray-300'
                                }`}
                                onClick={(e) => { e.stopPropagation(); setActivePage(page); }}
                            >
                                {pageLabels[page]}
                            </button>
                        ))}
                    </div>

                    {/* 内容区 */}
                    <div className="p-3 max-h-80 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-gray-300 text-xs leading-relaxed font-sans">
                            {activeContent || '（空白）'}
                        </pre>
                    </div>

                    {/* 编辑次数 */}
                    {latestPad.pages[pageKeys[activePage]].changelog.length > 0 && (
                        <div className="px-3 py-1.5 border-t border-gray-800 text-[10px] text-gray-500">
                            {latestPad.pages[pageKeys[activePage]].changelog.length} 次编辑
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Tool Call Block (Input Visualization) ---
// 判断是否是子Agent的工具（processOutlineInput 是入口）
const isSubAgentTool = (name: string) => {
    return name === 'processOutlineInput';
};

const ToolCallBlock: React.FC<{ name: string, args: any, isDebugMode: boolean }> = ({ name, args, isDebugMode }) => {
    const { thinking, ...restArgs } = args || {};
    const summary = generateToolSummary(name, args);
    const files = useFileStore(state => state.files);
    const setActiveFileId = useFileStore(state => state.setActiveFileId);
    const [isSubAgentExpanded, setIsSubAgentExpanded] = useState(false);

    // 检查是否是子Agent工具
    const isSubAgent = isSubAgentTool(name);

    // 提取文件路径并查找节点
    const filePath = restArgs.path || restArgs.oldPath;
    const fileNode = filePath ? findNodeByPath(files, filePath) : null;
    const canOpenFile = !!fileNode;

    const handleOpenFile = () => {
        if (fileNode) {
            setActiveFileId(fileNode.id);
        }
    };

    // 深度思考：专用可展开卡片
    if (name === 'deep_thinking' && !isDebugMode) {
        return <DeepThinkingCard args={restArgs} />;
    }

    // 普通模式：只显示摘要 + thinking
    if (!isDebugMode) {
        const content = (
            <>
                {/* 摘要行 - 如果有文件则可点击 */}
                <div
                    className={`px-3 py-2 bg-gray-800 border-b border-gray-700 text-blue-300 flex items-center gap-2 ${
                        canOpenFile ? 'cursor-pointer active:bg-gray-600 transition-colors border-l-2 border-l-blue-400' : ''
                    }`}
                    onClick={canOpenFile ? handleOpenFile : undefined}
                >
                    <Wrench size={12} className="text-blue-400 shrink-0"/>
                    <span className="font-medium flex-1">{summary.summary}</span>
                    {canOpenFile && (
                        <span className="text-[10px] text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded shrink-0">
                            打开
                        </span>
                    )}
                </div>

                {/* Thinking Section - 始终显示 */}
                {thinking && (
                    <div className="p-2 bg-blue-900/10 text-gray-300 italic text-xs leading-relaxed">
                        <div className="flex items-start gap-2">
                            <Brain size={12} className="shrink-0 mt-0.5 text-blue-400 opacity-70" />
                            <span className="opacity-90">{thinking}</span>
                        </div>
                    </div>
                )}
            </>
        );

        // 大纲子Agent工具使用可折叠容器
        if (isSubAgent) {
            return (
                <div className="mt-2 text-xs font-mono bg-[#0d1117] rounded-lg border border-purple-700 overflow-hidden">
                    <div
                        className="px-3 py-2 bg-purple-900/30 border-b border-purple-700 flex items-center gap-2 cursor-pointer"
                        onClick={() => setIsSubAgentExpanded(!isSubAgentExpanded)}
                    >
                        <ChevronRight size={14} className={`text-purple-400 transition-transform ${isSubAgentExpanded ? 'rotate-90' : ''}`} />
                        <Cpu size={14} className="text-purple-400" />
                        <span className="font-medium text-purple-300 truncate flex-1">
                            {name === 'processOutlineInput' ? '📝 大纲子Agent执行中...' :
                             name === 'processOutlineInput' ? '📝 大纲子Agent执行中...' :
                             `操作: ${summary.summary}`}
                        </span>
                        <span className="text-[10px] text-purple-400 bg-purple-900/50 px-1.5 py-0.5 rounded">
                            {isSubAgentExpanded ? '收起' : '展开'}
                        </span>
                    </div>
                    {isSubAgentExpanded && content}
                </div>
            );
        }

        return (
            <div className="mt-2 text-xs font-mono bg-[#0d1117] rounded-lg border border-gray-700 overflow-hidden">
                {content}
            </div>
        );
    }

    // Debug 模式：显示完整信息
    return (
        <div className="mt-2 text-xs font-mono bg-[#0d1117] rounded-lg border border-gray-700 overflow-hidden shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
            {/* Header with Debug Badge - 如果有文件则可点击 */}
            <div
                className={`px-3 py-2 bg-gray-800 border-b border-gray-700 text-blue-300 font-semibold flex items-center justify-between ${
                    canOpenFile ? 'cursor-pointer active:bg-gray-600 transition-colors border-l-2 border-l-blue-400' : ''
                }`}
                onClick={canOpenFile ? handleOpenFile : undefined}
            >
                <div className="flex items-center gap-2">
                    <Wrench size={12} className="text-blue-400"/>
                    <span>Agent 计划调用: {name}</span>
                    {canOpenFile && (
                        <span className="text-[10px] text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">
                            打开
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-orange-400 uppercase tracking-wide">DEBUG</span>
            </div>

            {/* Thinking Section */}
            {thinking && (
                <div className="p-3 bg-blue-900/10 border-b border-gray-800 text-gray-300 italic leading-relaxed">
                    <div className="flex items-start gap-2">
                        <Brain size={12} className="shrink-0 mt-0.5 text-blue-400 opacity-70" />
                        <div className="flex-1">
                            <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-1">思考</div>
                            <span className="opacity-90">{thinking}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Arguments Section - 仅 Debug 模式显示 */}
            <div className="p-3 text-gray-400 whitespace-pre-wrap overflow-x-auto select-text">
                 {Object.keys(restArgs).length > 0
                    ? JSON.stringify(restArgs, null, 2)
                    : <span className="text-gray-600 italic">(无额外参数)</span>
                 }
            </div>
        </div>
    );
};

const JsonView: React.FC<{ data: any; label?: string; icon?: React.ReactNode; color?: string; defaultOpen?: boolean }> = ({ data, label, icon, color = "text-gray-400", defaultOpen = false }) => {
    if (!data) return null;
    return (
        <details className="group mt-2 text-xs" open={defaultOpen}>
            <summary className={`cursor-pointer list-none flex items-center gap-2 ${color} hover:text-white transition-colors bg-gray-950/50 p-1.5 rounded border border-gray-800`}>
                {icon || <Code size={12} />}
                <span className="font-mono font-bold opacity-80">{label || 'RAW DATA'}</span>
                <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">Click to expand</span>
            </summary>
            <div className="mt-1 p-2 bg-black/50 rounded border border-gray-800 overflow-x-auto">
                <pre className="font-mono text-[10px] text-gray-400 leading-normal whitespace-pre-wrap select-all">
                    {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
                </pre>
            </div>
        </details>
    );
};

const AgentMessageList: React.FC<AgentMessageListProps> = ({
    messages,
    isLoading,
    onRegenerate,
    onEditMessage
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const isDebugMode = useUiStore(state => state.isDebugMode);

  useEffect(() => {
    if (!editingId) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isLoading, editingId]); 

  const startEdit = useCallback((msg: ChatMessage) => {
      setEditingId(msg.id);
      setEditText(msg.text);
  }, []);

  const cancelEdit = useCallback(() => {
      setEditingId(null);
      setEditText('');
  }, []);

  const saveEdit = useCallback((id: string) => {
      if (onEditMessage && editText.trim()) {
          onEditMessage(id, editText);
          setEditingId(null);
      }
  }, [onEditMessage, editText]);

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6 bg-gray-900/95 overscroll-contain pb-24 sm:pb-20">
        {messages.length === 0 && (
        <div className="text-center text-gray-500 mt-10 text-sm px-4">
            <p className="mb-2">👋 我是您的写作助手。</p>
            <p>请告诉我您的目标，我会先创建计划。</p>
            <button 
                onClick={() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                    if(input) {
                        input.value = "帮我规划第一章的写作";
                        input.focus();
                    }
                }}
                className="mt-6 text-xs bg-gray-800 border border-gray-700 active:bg-gray-700 px-4 py-2 rounded-full transition-colors"
            >
                试着说："帮我规划第一章的写作"
            </button>
        </div>
        )}
        
        {messages.map((msg, index) => {
            const toolCalls = msg.rawParts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
            const reasoningParts = msg.rawParts?.filter((p: any) => p.reasoning).map((p: any) => p.reasoning as string);
            const isUser = msg.role === 'user';
            const isModel = msg.role === 'model';
            const isSystem = msg.role === 'system';
            const isLast = index === messages.length - 1;
            const prevMsg = index > 0 ? messages[index-1] : null;

            // 检查是否是 SubAgent (processOutlineInput) 工具的输出
            // 注意：需要同时检查 rawParts（执行完成后）和 metadata.executingTools（执行过程中）
            const isSubAgentOutput = msg.rawParts?.some((p: any) =>
                p.functionResponse?.name === 'processOutlineInput'
            ) || msg.metadata?.executingTools === 'processOutlineInput';

            // 1. SubAgent 输出 - 使用折叠气泡显示
            if (msg.isToolOutput && isSubAgentOutput) {
                return (
                    <SubAgentOutputBlock
                        key={msg.id}
                        text={msg.text}
                        isError={msg.isError}
                        isLast={isLast}
                        isLoading={isLoading}
                    />
                );
            }

            // 2. Tool Outputs (System Message - Collapsible Log)
            if (msg.isToolOutput) {
                // 普通模式下：显示错误提示框（如果包含错误）
                if (!isDebugMode) {
                    // 直接使用 isError 字段判断，避免误判文件内容中的 ❌ 符号
                    const hasError = msg.isError === true;
                    if (!hasError) {
                        return null;  // 非错误信息才隐藏
                    }
                    // 显示简化的错误提示框
                    return (
                        <div key={msg.id} className="mx-4 my-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm animate-in fade-in duration-300">
                            <div className="flex items-center gap-2 text-red-400 font-medium mb-1">
                                <AlertOctagon size={14} />
                                <span>工具执行失败</span>
                            </div>
                            <div className="text-red-300 text-xs font-mono whitespace-pre-wrap">{msg.text}</div>
                            {/* Intelligent Regenerate: If previous message was a Model Plan, retry that. Else retry self. */}
                            {onRegenerate && (
                                <button
                                    onClick={() => onRegenerate(prevMsg?.role === 'model' ? prevMsg.id : msg.id)}
                                    className="mt-2 p-1.5 text-xs text-red-400 hover:text-white flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                                    title="重试"
                                >
                                    <RefreshCw size={12} /> <span>重试</span>
                                </button>
                            )}
                        </div>
                    );
                }
                return (
                    <div key={msg.id} className="flex flex-col items-start w-full animate-in fade-in duration-300">
                        <ToolLogMessage
                            text={msg.text}
                            rawParts={msg.rawParts}
                            metadata={msg.metadata}
                            isLast={isLast}
                            isLoading={isLoading}
                            isDebugMode={isDebugMode}
                        />
                        {/* Intelligent Regenerate: If previous message was a Model Plan, retry that. Else retry self. */}
                        {onRegenerate && (
                            <div className="ml-2 mb-2">
                                <button
                                    onClick={() => onRegenerate(prevMsg?.role === 'model' ? prevMsg.id : msg.id)}
                                    className="p-1.5 text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                                    title="重新生成计划 (Retry Action)"
                                >
                                    <RefreshCw size={12} /> <span className="text-[10px]">重试</span>
                                </button>
                            </div>
                        )}
                    </div>
                );
            }

            // 2. Edit Mode
            if (editingId === msg.id) {
                return (
                    <div key={msg.id} className="flex flex-col items-end w-full animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-full bg-gray-800 border border-blue-500/50 rounded-xl p-3 shadow-lg">
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full bg-gray-900 text-white text-base p-3 rounded resize-none focus:outline-none border border-gray-700 focus:border-blue-500/50 transition-colors"
                                rows={Math.min(10, Math.max(3, editText.split('\n').length))}
                                autoFocus
                            />
                            <div className="flex justify-end gap-3 mt-3">
                                <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-300 bg-gray-700 rounded-lg active:bg-gray-600">取消</button>
                                <button onClick={() => saveEdit(msg.id)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg active:bg-blue-500 font-medium flex items-center gap-1"><Check size={16} /> 保存重试</button>
                            </div>
                        </div>
                    </div>
                );
            }

            // 3. Standard Message (User / Model / System-Error)
            // Special handling for system error messages with errorInfo
            if (isSystem && msg.metadata?.logType === 'error' && msg.metadata?.errorInfo) {
              return (
                <div key={msg.id} className="flex flex-col items-start animate-in fade-in duration-300">
                  <ErrorInfoView
                    errorInfo={msg.metadata.errorInfo}
                    isDebugMode={isDebugMode}
                    onRetry={onRegenerate ? () => onRegenerate(msg.id) : undefined}
                  />
                </div>
              );
            }

            return (
                <div
                    key={msg.id}
                    className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'} relative`}
                >
                    {/* Loop Count + Cache Hit Rate for Model Messages */}
                    {isModel && !!msg.metadata?.loopCount && (
                        <div className="text-[10px] text-gray-500 mb-1 px-1 font-mono flex items-center gap-2">
                            <span>轮次 {String(msg.metadata.loopCount)}</span>
                            {(() => {
                                const usage = (msg.metadata?.apiMetadata as any)?.response?.usage;
                                const cacheHit = usage?.cache_hit_tokens || 0;
                                const cacheMiss = usage?.cache_miss_tokens || 0;
                                const cacheTotal = cacheHit + cacheMiss;
                                if (cacheTotal === 0) return null;
                                const rate = cacheHit / cacheTotal;
                                const rateText = `${(rate * 100).toFixed(1)}%`;
                                const colorClass = rate === 1 ? 'text-green-400' :
                                                   rate >= 0.8 ? 'text-yellow-300' :
                                                   'text-orange-300';
                                return (
                                    <span className={`${colorClass}`} title={`Cache: ${cacheHit} hit / ${cacheTotal} total`}>
                                        · {rateText}
                                    </span>
                                );
                            })()}
                        </div>
                    )}

                    <div
                    className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-[15px] sm:text-sm shadow-sm relative break-words ${
                        isUser
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : isSystem
                        ? msg.metadata?.logType === 'error'
                            ? 'bg-red-900/20 text-red-200 border border-red-800/50 rounded-lg' // Error style
                            : msg.metadata?.logType === 'success'
                            ? 'bg-green-900/20 text-green-200 border border-green-800/50 rounded-lg' // Success style
                            : 'bg-blue-900/20 text-blue-200 border border-blue-800/50 rounded-lg' // Info style
                        : 'bg-gray-700 text-gray-100 rounded-tl-none'
                    }`}
                    >
                        {/* Message Label for System Messages */}
                        {isSystem && !msg.isToolOutput && (
                             <div className={`flex items-center gap-2 mb-1 font-bold text-xs uppercase tracking-wide ${
                                 msg.metadata?.logType === 'error'
                                 ? 'text-red-400'
                                 : msg.metadata?.logType === 'success'
                                 ? 'text-green-400'
                                 : 'text-blue-400'
                             }`}>
                                 {msg.metadata?.logType === 'error' && <AlertOctagon size={12} />}
                                 {msg.metadata?.logType === 'error'
                                  ? 'System Error'
                                  : msg.metadata?.logType === 'success'
                                  ? 'Success'
                                  : 'System Log'}
                             </div>
                        )}

                        {/* Message Text */}
                        {msg.text && (
                            <div className="whitespace-pre-wrap select-text cursor-text leading-relaxed">{msg.text}</div>
                        )}

                        {/* REASONING BLOCK - 显示模型思考过程 */}
                        {isModel && reasoningParts && reasoningParts.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {reasoningParts.map((reasoning: string, idx: number) => (
                                    <ReasoningBlock key={`reasoning-${idx}`} reasoning={reasoning} isDebugMode={isDebugMode} />
                                ))}
                            </div>
                        )}

                        {/* TOOL CALL VISUALIZATION (Input) — 显示所有工具调用 */}
                        {isModel && toolCalls && toolCalls.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {toolCalls.map((tc: any, idx: number) => (
                                    <ToolCallBlock key={`tc-block-${idx}`} name={tc.name} args={tc.args} isDebugMode={isDebugMode} />
                                ))}
                            </div>
                        )}

                        {/* Response Warnings - 显示在 Model 消息下方 */}
                        {isModel && !!msg.metadata?.responseWarnings && (
                            <ResponseWarningBadge warnings={msg.metadata.responseWarnings as string[]} />
                        )}
                    </div>

                    {/* API Metadata Display - 仅 Debug 模式显示 */}
                    {isDebugMode && !!msg.metadata?.apiMetadata && (
                        <APIInputView
                            apiMetadata={msg.metadata.apiMetadata as any}
                            label="API 调用详情"
                        />
                    )}

                    {/* Debug Payload Display - 仅 Debug 模式显示 (LLM 输入详情) */}
                    {isDebugMode && !!msg.metadata?.debugPayload && (
                        <DebugPayloadView debugPayload={msg.metadata.debugPayload as DebugPayload} />
                    )}

                    {/* Action Buttons */}
                    <div className={`flex items-center gap-2 mt-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
                        {isUser && onEditMessage && (
                            <button
                                onClick={() => startEdit(msg)}
                                className="p-2 text-gray-400 bg-gray-800/50 rounded-full hover:text-white hover:bg-gray-700 active:scale-95 transition-all backdrop-blur-sm"
                                title="编辑并重新生成"
                            >
                                <Edit2 size={14} />
                            </button>
                        )}

                        {/* Regenerate allowed for: Model responses OR System Error messages */}
                        {(isModel || isSystem) && onRegenerate && (
                             <button
                                onClick={() => onRegenerate(msg.id)}
                                className="p-2 text-gray-400 bg-gray-800/50 rounded-full hover:text-white hover:bg-gray-700 active:scale-95 transition-all backdrop-blur-sm"
                                title="重新生成此回复"
                             >
                                <RefreshCw size={14} />
                             </button>
                        )}
                    </div>
                </div>
            );
        })}
        
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-gray-700 rounded-2xl rounded-tl-none px-4 py-3 shadow-lg">
                    <div className="flex space-x-1.5">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2 font-mono">Agent 思考中...</div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
    </div>
  );
};

export default React.memo(AgentMessageList);
