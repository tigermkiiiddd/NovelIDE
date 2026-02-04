
import React, { useEffect, useRef } from 'react';
import { Terminal, Code, Cpu, Database } from 'lucide-react';
import { ChatMessage } from '../types';

interface AgentMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isDebugMode?: boolean;
}

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
                <pre className="font-mono text-[10px] text-gray-400 leading-normal">
                    {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
                </pre>
            </div>
        </details>
    );
};

const AgentMessageList: React.FC<AgentMessageListProps> = ({ messages, isLoading, isDebugMode = false }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900/95 overscroll-contain">
        {messages.length === 0 && (
        <div className="text-center text-gray-500 mt-10 text-sm">
            <p className="mb-2">👋 我是您的写作助手。</p>
            <p>请告诉我您的目标，我会先创建计划。</p>
            <p className="mt-4 text-xs bg-gray-800 inline-block px-3 py-1 rounded-full">试着说："帮我规划第一章的写作"</p>
        </div>
        )}
        
        {messages.map((msg) => {
            // Extract Raw Tool Calls (From Model)
            const toolCalls = msg.rawParts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
            
            // Extract Raw Tool Responses (From System/Function)
            const toolResponses = msg.rawParts?.filter((p: any) => p.functionResponse).map((p: any) => p.functionResponse);

            return (
                <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                    <div
                    className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : msg.isToolOutput 
                            ? 'bg-gray-800 text-gray-400 font-mono text-xs border border-gray-700 rounded-tl-none min-w-[50%]'
                            : 'bg-gray-700 text-gray-100 rounded-tl-none'
                    }`}
                    >
                        {msg.isToolOutput && <div className="flex items-center gap-1 mb-1 text-blue-300"><Terminal size={10}/> System Action Output</div>}
                        <div className="whitespace-pre-wrap select-text cursor-text">{msg.text}</div>

                        {/* DEBUG INFO: System Prompt (Attached to User Message) */}
                        {isDebugMode && msg.metadata?.systemPrompt && (
                             <JsonView 
                                data={JSON.parse(msg.metadata.systemPrompt)} 
                                label="SYSTEM PROMPT (Context)" 
                                icon={<Cpu size={12}/>}
                                color="text-purple-400"
                             />
                        )}

                        {/* DEBUG INFO: Tool Arguments (Attached to Model Message) */}
                        {isDebugMode && toolCalls && toolCalls.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {toolCalls.map((tc: any, idx: number) => (
                                    <JsonView 
                                        key={idx}
                                        data={tc.args} 
                                        label={`TOOL CALL: ${tc.name}`} 
                                        icon={<Terminal size={12}/>}
                                        color="text-yellow-400"
                                    />
                                ))}
                            </div>
                        )}

                         {/* DEBUG INFO: Tool Results (Attached to System Message) */}
                         {isDebugMode && toolResponses && toolResponses.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {toolResponses.map((tr: any, idx: number) => (
                                    <JsonView 
                                        key={idx}
                                        data={tr.response} 
                                        label={`TOOL RESULT: ${tr.name}`} 
                                        icon={<Database size={12}/>}
                                        color="text-green-400"
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            );
        })}
        
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-gray-700 rounded-2xl rounded-tl-none px-4 py-3">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                    </div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
    </div>
  );
};

export default AgentMessageList;
