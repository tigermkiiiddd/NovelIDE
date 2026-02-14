import React, { useState } from 'react';
import { Cpu, FileJson, ChevronDown, ChevronRight, Code } from 'lucide-react';

interface APIInputViewProps {
    systemInstruction: string;
    apiHistory: any[];
    label?: string;
}

const JsonView: React.FC<{ data: any; label?: string; icon?: React.ReactNode; color?: string; defaultOpen?: boolean }> = ({ data, label, icon, color = "text-gray-400", defaultOpen = false }) => {
    if (!data) return null;
    return (
        <details className="group mt-2 text-xs" open={defaultOpen}>
            <summary className={`cursor-pointer list-none flex items-center gap-2 ${color} hover:text-white transition-colors bg-gray-950/50 p-1.5 rounded border border-gray-800`}>
                {icon || <Code size={12} />}
                <span className="font-mono font-bold opacity-80">{label || 'RAW DATA'}</span>
                <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">Click to expand</span>
            </summary>
            <div className="mt-1 p-2 bg-black/50 rounded border border-gray-800 overflow-x-auto max-h-[200px] overflow-y-auto">
                <pre className="font-mono text-[10px] text-gray-400 leading-normal whitespace-pre-wrap select-all">
                    {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
                </pre>
            </div>
        </details>
    );
};

const APIInputView: React.FC<APIInputViewProps> = ({ systemInstruction, apiHistory, label = "API Input" }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="mt-2 w-full">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 w-full border rounded-lg px-3 py-2 text-xs font-mono transition-colors text-left bg-gray-800/50 border-gray-700/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300"
            >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Code size={12} className="shrink-0" />
                <span className="truncate flex-1 font-mono opacity-90">{label}</span>
                <span className="text-[10px] text-gray-500">({apiHistory.length} messages)</span>
            </button>

            {isExpanded && (
                <div className="mt-1 bg-gray-950 border border-gray-800 rounded-lg p-3 animate-in slide-in-from-top-2 duration-200">
                    {/* System Prompt */}
                    <div className="mb-3">
                        <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-2">
                            <Cpu size={10} /> System Prompt
                        </div>
                        <div className="bg-black/50 rounded border border-gray-800 p-2 max-h-[150px] overflow-y-auto">
                            <pre className="font-mono text-[10px] text-gray-400 leading-normal whitespace-pre-wrap select-all">
                                {systemInstruction}
                            </pre>
                        </div>
                    </div>

                    {/* API History */}
                    <div>
                        <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-2">
                            <FileJson size={10} /> API History (完整对话)
                        </div>
                        <JsonView data={apiHistory} label="Full API History (含 tool result)" icon={<FileJson size={12}/>} color="text-orange-300" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default APIInputView;
