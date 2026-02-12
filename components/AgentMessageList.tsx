
import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Code, Cpu, Database, RefreshCw, Edit2, Check, ChevronDown, ChevronRight, FileJson, Server, Loader2, Wrench, ArrowRight, Brain, AlertOctagon } from 'lucide-react';
import { ChatMessage } from '../types';

interface AgentMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isDebugMode?: boolean;
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
    isDebugMode?: boolean;
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
    const titleText = isRunning 
        ? (displayToolNames ? `Executing: ${displayToolNames}...` : 'System Executing...') 
        : (displayToolNames ? `System Output: ${displayToolNames}` : 'System Logs');

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
                        {text || <span className="text-gray-600 italic">Initializing execution environment...</span>}
                    </div>
                    {isDebugMode && toolResponses && toolResponses.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                             <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wide">Detailed Tool Outputs (Debug)</div>
                             {toolResponses.map((tr: any, idx: number) => (
                                 <JsonView key={idx} data={tr.response} label={`RAW: ${tr.name}`} icon={<Database size={12}/>} color="text-green-300"/>
                             ))}
                        </div>
                    )}
                    
                    {/* Render DEBUG INFO attached to this System Message (Prompt generated AFTER this tool execution) */}
                    {isDebugMode && metadata?.debugPayload && (
                        <div className="mt-3 pt-2 border-t border-gray-800 space-y-1">
                            <div className="text-[10px] text-gray-300/70 font-mono mb-1 flex items-center gap-2">
                                <Server size={10} /> NEXT TURN INPUT (PROMPT)
                            </div>
                            <JsonView data={metadata.debugPayload.systemInstruction} label="RAW: SYSTEM PROMPT" icon={<Cpu size={12}/>} color="text-purple-300" />
                            <JsonView data={metadata.debugPayload} label="RAW: FULL API HISTORY" icon={<FileJson size={12}/>} color="text-orange-300" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Tool Call Block (Input Visualization) ---
const ToolCallBlock: React.FC<{ name: string, args: any }> = ({ name, args }) => {
    const { thinking, ...restArgs } = args;
    
    return (
        <div className="mt-2 text-xs font-mono bg-[#0d1117] rounded-lg border border-gray-700 overflow-hidden shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
            {/* Header */}
            <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 text-blue-300 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Wrench size={12} className="text-blue-400"/>
                    <span>Agent Plan: {name}</span>
                </div>
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">INPUT</span>
            </div>
            
            {/* Thinking Section */}
            {thinking && (
                <div className="p-3 bg-blue-900/10 border-b border-gray-800 text-gray-300 italic leading-relaxed">
                    <div className="flex items-start gap-2">
                        <Brain size={12} className="shrink-0 mt-0.5 text-blue-400 opacity-70" />
                        <span className="opacity-90">{thinking}</span>
                    </div>
                </div>
            )}

            {/* Arguments Section */}
            <div className="p-3 text-gray-400 whitespace-pre-wrap overflow-x-auto select-text">
                 {Object.keys(restArgs).length > 0 
                    ? JSON.stringify(restArgs, null, 2)
                    : <span className="text-gray-600 italic">(No additional arguments)</span>
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
    isDebugMode = false,
    onRegenerate,
    onEditMessage
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

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
                    <div
                    className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-[15px] sm:text-sm shadow-sm relative break-words ${
                        isUser
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : isSystem
                        ? 'bg-red-900/20 text-red-200 border border-red-800/50 rounded-lg' // Error/System style
                        : 'bg-gray-700 text-gray-100 rounded-tl-none'
                    }`}
                    >
                        {/* Error Icon for System Messages */}
                        {isSystem && !msg.isToolOutput && (
                             <div className="flex items-center gap-2 mb-1 text-red-400 font-bold text-xs uppercase tracking-wide">
                                 <AlertOctagon size={12} /> System Message / Error
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
                                    <ToolCallBlock key={`tc-block-${idx}`} name={tc.name} args={tc.args} />
                                ))}
                            </div>
                        )}

                        {/* DEBUG INFO - Updated to show Input Metadata */}
                        {isDebugMode && (
                            <div className="mt-3 pt-2 border-t border-white/20 space-y-1">
                                <div className="text-[10px] text-gray-300/70 font-mono mb-1 px-1 flex items-center gap-2">
                                    <Server size={10} /> {isUser ? "INPUT PROMPT (SENT)" : "DEBUG MODE"}
                                </div>
                                {msg.metadata?.debugPayload && (
                                    <>
                                        <JsonView data={msg.metadata.debugPayload.systemInstruction} label="RAW: SYSTEM PROMPT" icon={<Cpu size={12}/>} color="text-purple-300" />
                                        <JsonView data={msg.metadata.debugPayload} label="RAW: FULL API HISTORY" icon={<FileJson size={12}/>} color="text-orange-300" />
                                    </>
                                )}
                            </div>
                        )}
                    </div>

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
                    <div className="text-xs text-gray-500 mt-2 font-mono">Agent Thinking...</div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
    </div>
  );
};

export default AgentMessageList;
