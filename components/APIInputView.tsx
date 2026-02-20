import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Code, Send, Clock, Zap, Hash, Settings, Database } from 'lucide-react';

interface APIMetadata {
    request?: {
        endpoint: string;
        model: string;
        max_tokens: number;
        messageCount: number;
        hasTools: boolean;
        toolCount: number;
        safetySettings?: any[];
        timestamp: string;
    };
    response?: {
        requestId: string;
        model: string;
        usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
        };
        finishReason?: string;
        safetyRatings?: any;
        promptFeedback?: any;
        duration: string;
        timestamp: string;
    };
}

interface APIInputViewProps {
    apiMetadata?: APIMetadata;
    messageCount?: number;
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

const MetadataRow: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color?: string }> = ({ icon, label, value, color = "text-gray-300" }) => (
    <div className="flex items-center gap-2 py-1">
        <span className="text-gray-500 shrink-0">{icon}</span>
        <span className="text-gray-500 text-[10px] uppercase tracking-wide w-24 shrink-0">{label}</span>
        <span className={`font-mono text-xs ${color} truncate`}>{value}</span>
    </div>
);

const APIInputView: React.FC<APIInputViewProps> = ({ apiMetadata, messageCount = 0, label = "API Metadata" }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Format usage display
    const formatUsage = (usage?: APIMetadata['response']['usage']) => {
        if (!usage) return 'N/A';
        const prompt = usage.prompt_tokens || 0;
        const completion = usage.completion_tokens || 0;
        const total = usage.total_tokens || 0;
        return `${total} (prompt: ${prompt}, completion: ${completion})`;
    };

    return (
        <div className="mt-2 w-full">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 w-full border rounded-lg px-3 py-2 text-xs font-mono transition-colors text-left bg-gray-800/50 border-gray-700/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300"
            >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Code size={12} className="shrink-0" />
                <span className="truncate flex-1 font-mono opacity-90">{label}</span>
                {apiMetadata?.response?.usage && (
                    <span className="text-[10px] text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded shrink-0">
                        {apiMetadata.response.usage.total_tokens} tokens
                    </span>
                )}
            </button>

            {isExpanded && (
                <div className="mt-1 bg-gray-950 border border-gray-800 rounded-lg p-3 animate-in slide-in-from-top-2 duration-200 space-y-3">
                    {/* Request Section */}
                    {apiMetadata?.request && (
                        <div>
                            <div className="text-[10px] text-blue-400 mb-2 uppercase tracking-wide flex items-center gap-2 font-bold">
                                <Send size={10} /> REQUEST
                            </div>
                            <div className="bg-black/30 rounded border border-gray-800 p-2 space-y-0.5">
                                <MetadataRow
                                    icon={<Hash size={10} />}
                                    label="Endpoint"
                                    value={apiMetadata.request.endpoint}
                                    color="text-blue-300"
                                />
                                <MetadataRow
                                    icon={<Zap size={10} />}
                                    label="Model"
                                    value={apiMetadata.request.model}
                                    color="text-yellow-300"
                                />
                                <MetadataRow
                                    icon={<Settings size={10} />}
                                    label="Max Tokens"
                                    value={apiMetadata.request.max_tokens || 'default'}
                                />
                                <MetadataRow
                                    icon={<Database size={10} />}
                                    label="Messages"
                                    value={apiMetadata.request.messageCount}
                                />
                                <MetadataRow
                                    icon={<Clock size={10} />}
                                    label="Timestamp"
                                    value={apiMetadata.request.timestamp}
                                    color="text-gray-500"
                                />
                                {apiMetadata.request.hasTools && (
                                    <MetadataRow
                                        icon={<Settings size={10} />}
                                        label="Tools"
                                        value={`${apiMetadata.request.toolCount} available`}
                                        color="text-orange-300"
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Response Section */}
                    {apiMetadata?.response && (
                        <div>
                            <div className="text-[10px] text-green-400 mb-2 uppercase tracking-wide flex items-center gap-2 font-bold">
                                <Database size={10} /> RESPONSE
                            </div>
                            <div className="bg-black/30 rounded border border-gray-800 p-2 space-y-0.5">
                                <MetadataRow
                                    icon={<Hash size={10} />}
                                    label="Request ID"
                                    value={apiMetadata.response.requestId || 'N/A'}
                                    color="text-purple-300 text-[10px]"
                                />
                                <MetadataRow
                                    icon={<Zap size={10} />}
                                    label="Model"
                                    value={apiMetadata.response.model}
                                    color="text-yellow-300"
                                />
                                <MetadataRow
                                    icon={<Database size={10} />}
                                    label="Tokens"
                                    value={formatUsage(apiMetadata.response.usage)}
                                    color="text-green-300"
                                />
                                <MetadataRow
                                    icon={<Clock size={10} />}
                                    label="Duration"
                                    value={apiMetadata.response.duration}
                                    color="text-cyan-300"
                                />
                                <MetadataRow
                                    icon={<Settings size={10} />}
                                    label="Finish"
                                    value={apiMetadata.response.finishReason || 'N/A'}
                                />
                                <MetadataRow
                                    icon={<Clock size={10} />}
                                    label="Timestamp"
                                    value={apiMetadata.response.timestamp}
                                    color="text-gray-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* Raw JSON Views */}
                    {apiMetadata?.request?.safetySettings && (
                        <JsonView
                            data={apiMetadata.request.safetySettings}
                            label="Safety Settings"
                            icon={<Settings size={12}/>}
                            color="text-orange-300"
                        />
                    )}
                    {apiMetadata?.response?.safetyRatings && (
                        <JsonView
                            data={apiMetadata.response.safetyRatings}
                            label="Safety Ratings"
                            icon={<Settings size={12}/>}
                            color="text-orange-300"
                        />
                    )}

                    {/* Fallback if no metadata */}
                    {!apiMetadata && (
                        <div className="text-gray-500 text-xs italic">
                            No API metadata available
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default APIInputView;
