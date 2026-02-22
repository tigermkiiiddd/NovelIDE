
import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Code, Database, RefreshCw, Edit2, Check, ChevronDown, ChevronRight, Loader2, Wrench, Brain, AlertOctagon, FileText, MessageSquare, Layers } from 'lucide-react';
import { ChatMessage } from '../types';
import APIInputView from './APIInputView';
import { useUiStore } from '../stores/uiStore';
import { useFileStore } from '../stores/fileStore';
import { generateToolSummary } from '../utils/toolSummaryUtils';
import { findNodeByPath } from '../services/fileSystem';

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

    // 从 text 中提取 thinking 内容（普通模式只显示 thinking）
    const extractThinking = (logText: string): string | null => {
        const match = logText.match(/🧠 \*\*思考\*\*: ([^\n]+)/);
        return match ? match[1] : null;
    };

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

            {isExpanded && (
                <div className="mt-1 bg-gray-950 border border-gray-800 rounded-lg p-3 text-gray-300 font-mono text-xs overflow-x-auto animate-in slide-in-from-top-2 duration-200">
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

// --- Tool Call Block (Input Visualization) ---
const ToolCallBlock: React.FC<{ name: string, args: any, isDebugMode: boolean }> = ({ name, args, isDebugMode }) => {
    const { thinking, ...restArgs } = args || {};
    const summary = generateToolSummary(name, args);
    const files = useFileStore(state => state.files);
    const setActiveFileId = useFileStore(state => state.setActiveFileId);

    // 提取文件路径并查找节点
    const filePath = restArgs.path || restArgs.oldPath;
    const fileNode = filePath ? findNodeByPath(files, filePath) : null;
    const canOpenFile = !!fileNode;

    const handleOpenFile = () => {
        if (fileNode) {
            setActiveFileId(fileNode.id);
        }
    };

    // 普通模式：只显示摘要 + thinking
    if (!isDebugMode) {
        return (
            <div className="mt-2 text-xs font-mono bg-[#0d1117] rounded-lg border border-gray-700 overflow-hidden">
                {/* 摘要行 - 如果有文件则可点击 */}
                <div
                    className={`px-3 py-2 bg-gray-800 border-b border-gray-700 text-blue-300 flex items-center gap-2 ${
                        canOpenFile ? 'cursor-pointer active:bg-gray-600 transition-colors border-l-2 border-l-blue-400' : ''
                    }`}
                    onClick={canOpenFile ? handleOpenFile : undefined}
                >
                    <Wrench size={12} className="text-blue-400 shrink-0"/>
                    <span className="font-medium truncate flex-1">{summary.summary}</span>
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

  const startEdit = (msg: ChatMessage) => {
      setEditingId(msg.id);
      setEditText(msg.text);
  };

  const cancelEdit = () => {
      setEditingId(null);
      setEditText('');
  };

  const saveEdit = (id: string) => {
      if (onEditMessage && editText.trim()) {
          onEditMessage(id, editText);
          setEditingId(null);
      }
  };

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
            const isUser = msg.role === 'user';
            const isModel = msg.role === 'model';
            const isSystem = msg.role === 'system';
            const isLast = index === messages.length - 1;
            const prevMsg = index > 0 ? messages[index-1] : null;

            // 1. Tool Outputs (System Message - Collapsible Log)
            if (msg.isToolOutput) {
                // 普通模式下：显示错误提示框（如果包含错误）
                if (!isDebugMode) {
                    const hasError = msg.text?.includes('❌') || msg.text?.includes('[SYSTEM ERROR]');
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
            return (
                <div
                    key={msg.id}
                    className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'} relative`}
                >
                    {/* Loop Count Display for Model Messages */}
                    {isModel && msg.metadata?.loopCount && (
                        <div className="text-[10px] text-gray-500 mb-1 px-1 font-mono">
                            轮次 {msg.metadata.loopCount}
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

                        {/* TOOL CALL VISUALIZATION (Input) - Always visible in Model message if present */}
                        {isModel && toolCalls && toolCalls.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {toolCalls.map((tc: any, idx: number) => (
                                    <ToolCallBlock key={`tc-block-${idx}`} name={tc.name} args={tc.args} isDebugMode={isDebugMode} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* API Metadata Display - 仅 Debug 模式显示 */}
                    {isDebugMode && msg.metadata?.apiMetadata && (
                        <APIInputView
                            apiMetadata={msg.metadata.apiMetadata}
                            label="API 调用详情"
                        />
                    )}

                    {/* Debug Payload Display - 仅 Debug 模式显示 (LLM 输入详情) */}
                    {isDebugMode && msg.metadata?.debugPayload && (
                        <DebugPayloadView debugPayload={msg.metadata.debugPayload} />
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

export default AgentMessageList;
