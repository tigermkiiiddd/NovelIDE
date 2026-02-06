
import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Code, Cpu, Database, RefreshCw, Edit2, X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { ChatMessage } from '../types';

interface AgentMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isDebugMode?: boolean;
  onRegenerate?: (id: string) => void;
  onEditMessage?: (id: string, newText: string) => void;
}

// --- Internal Component: Collapsible Tool Log ---
const ToolLogMessage: React.FC<{ text: string; rawParts?: any[] }> = ({ text, rawParts }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Extract tool names for header
    const toolNames = rawParts
        ?.filter((p: any) => p.functionResponse)
        .map((p: any) => p.functionResponse.name)
        .join(', ') || 'System Action';

    return (
        <div className="w-full max-w-[95%] sm:max-w-[85%] my-2">
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 w-full bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-2 text-xs font-mono text-blue-300 hover:bg-gray-800 transition-colors text-left"
            >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Terminal size={12} className="shrink-0"/>
                <span className="truncate flex-1">
                    {isExpanded ? 'Hide System Output' : `Executed: ${toolNames}`}
                </span>
            </button>
            
            {isExpanded && (
                <div className="mt-1 bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-gray-400 font-mono text-xs overflow-x-auto animate-in slide-in-from-top-2 duration-200">
                    <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
                </div>
            )}
        </div>
    );
};

const JsonView: React.FC<{ data: any; label?: string; icon?: React.ReactNode; color?: string }> = ({ data, label, icon, color = "text-gray-400" }) => {
    if (!data) return null;
    return (
        <details className="group mt-2 text-xs">
            <summary className={`cursor-pointer list-none flex items-center gap-2 ${color} hover:text-white transition-colors bg-gray-950/50 p-1.5 rounded border border-gray-800`}>
                {icon || <Code size={12} />}
                <span className="font-mono font-bold opacity-80">{label || 'RAW DATA'}</span>
                <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">Click to expand</span>
            </summary>
            <div className="mt-1 p-2 bg-black/50 rounded border border-gray-800 overflow-x-auto">
                <pre className="font-mono text-[10px] text-gray-400 leading-normal whitespace-pre-wrap">
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

  // Scroll to bottom on new messages (but not while editing)
  useEffect(() => {
    if (!editingId) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isLoading, editingId]); // Only scroll on length change, not re-renders

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
            // Extract Raw Tool Calls (From Model)
            const toolCalls = msg.rawParts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
            
            // Extract Raw Tool Responses (From System/Function)
            const toolResponses = msg.rawParts?.filter((p: any) => p.functionResponse).map((p: any) => p.functionResponse);

            const isUser = msg.role === 'user';
            const isModel = msg.role === 'model';
            
            // 1. Tool Outputs (Collapsible)
            if (msg.isToolOutput) {
                return (
                    <div key={msg.id} className="flex flex-col items-start">
                        <ToolLogMessage text={msg.text} rawParts={msg.rawParts} />
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
                                <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-300 bg-gray-700 rounded-lg active:bg-gray-600">
                                    取消
                                </button>
                                <button onClick={() => saveEdit(msg.id)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg active:bg-blue-500 font-medium flex items-center gap-1">
                                    <Check size={16} /> 保存重试
                                </button>
                            </div>
                        </div>
                    </div>
                );
            }

            // 3. Standard Message
            return (
                <div
                    key={msg.id}
                    className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'} relative`}
                >
                    <div
                    className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-[15px] sm:text-sm shadow-sm relative break-words ${
                        isUser
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : 'bg-gray-700 text-gray-100 rounded-tl-none'
                    }`}
                    >
                        <div className="whitespace-pre-wrap select-text cursor-text leading-relaxed">{msg.text}</div>

                        {/* DEBUG INFO */}
                        {isDebugMode && (
                            <>
                                {msg.metadata?.systemPrompt && (
                                    <JsonView data={msg.metadata.systemPrompt} label="SYSTEM PROMPT" icon={<Cpu size={12}/>} color="text-purple-400"/>
                                )}
                                {toolCalls && toolCalls.length > 0 && toolCalls.map((tc: any, idx: number) => (
                                    <JsonView key={idx} data={tc.args} label={`CALL: ${tc.name}`} icon={<Terminal size={12}/>} color="text-yellow-400"/>
                                ))}
                                {toolResponses && toolResponses.length > 0 && toolResponses.map((tr: any, idx: number) => (
                                    <JsonView key={idx} data={tr.response} label={`RESULT: ${tr.name}`} icon={<Database size={12}/>} color="text-green-400"/>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Action Buttons (Always visible on mobile, Hover on desktop) */}
                    <div className={`flex items-center gap-2 mt-1.5 
                        opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity 
                        ${isUser ? 'justify-end pr-1' : 'justify-start pl-1'}`
                    }>
                        {/* User Edit Button */}
                        {isUser && onEditMessage && (
                            <button 
                                onClick={() => startEdit(msg)}
                                className="p-2 text-gray-400 bg-gray-800/50 rounded-full hover:text-white hover:bg-gray-700 active:scale-95 transition-all backdrop-blur-sm"
                                title="编辑并重新生成"
                            >
                                <Edit2 size={14} />
                            </button>
                        )}
                        
                        {/* Model Regenerate Button */}
                        {isModel && onRegenerate && (
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
                </div>
            </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
    </div>
  );
};

export default AgentMessageList;
