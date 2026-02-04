
import React, { useMemo } from 'react';
import { Check, X, GitCompare, CheckCheck, XCircle } from 'lucide-react';
import { DiffHunk, computeLineDiff, groupDiffIntoHunks } from '../utils/diffUtils';
import { PendingChange } from '../types';

interface DiffViewerProps {
  originalContent: string;
  modifiedContent: string;
  pendingChange: PendingChange;
  onAcceptHunk: (hunk: DiffHunk) => void;
  onRejectHunk: (hunk: DiffHunk) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

const DiffViewer: React.FC<DiffViewerProps> = ({
  originalContent,
  modifiedContent,
  pendingChange,
  onAcceptHunk,
  onRejectHunk,
  onAcceptAll,
  onRejectAll
}) => {
  const diffHunks = useMemo(() => {
    const rawLines = computeLineDiff(originalContent, modifiedContent);
    return groupDiffIntoHunks(rawLines, 3);
  }, [originalContent, modifiedContent]);

  if (diffHunks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 opacity-70">
        <CheckCheck size={48} className="text-green-500/50"/>
        <p>所有变更已处理或文件无实际差异。</p>
        <button 
            onClick={onAcceptAll} 
            className="px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded hover:bg-green-600/30 transition-colors"
        >
            完成并退出
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Diff Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-yellow-900/10 border-yellow-900/30">
        <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-1 bg-yellow-900/20 rounded text-yellow-400 border border-yellow-900/30 animate-pulse">
                <GitCompare size={16} />
            </div>
            <div className="flex flex-col min-w-0">
                <span className="font-medium truncate font-mono text-xs sm:text-sm flex items-center gap-2 text-yellow-100">
                    {pendingChange.fileName}
                </span>
                <span className="text-[10px] text-yellow-500/80 truncate max-w-[200px]">
                    {pendingChange.description}
                </span>
            </div>
        </div>

        <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
            <button onClick={onRejectAll} className="flex items-center gap-1 px-3 py-1 text-xs text-red-400 hover:bg-red-900/20 rounded-l transition-colors border-r border-gray-700">
                <XCircle size={14} /> <span className="hidden sm:inline">拒绝全部</span>
            </button>
            <button onClick={onAcceptAll} className="flex items-center gap-1 px-3 py-1 text-xs text-green-400 hover:bg-green-900/20 rounded-r transition-colors font-medium">
                <CheckCheck size={14} /> <span className="hidden sm:inline">批准全部</span>
            </button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto font-mono text-xs sm:text-sm leading-6 pb-20">
        <div className="flex flex-col gap-0 p-4 max-w-5xl mx-auto">
            {diffHunks.map((hunk) => (
                <div key={hunk.id}>
                    {hunk.type === 'change' ? (
                        <div className="border border-yellow-900/50 rounded-lg overflow-hidden bg-[#161b22] my-4 shadow-lg shadow-black/20">
                            {/* Change Hunk Header */}
                            <div className="bg-[#1c2128] px-3 py-2 flex justify-between items-center border-b border-gray-800">
                                <span className="text-xs text-yellow-200/80 font-mono flex items-center gap-2">
                                    <GitCompare size={12}/>
                                    @@ L{hunk.startLineOriginal} → L{hunk.startLineNew} @@
                                </span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => onRejectHunk(hunk)}
                                        className="px-2 py-1 text-[10px] bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded border border-red-900/30 flex items-center gap-1 transition-colors"
                                    >
                                        <X size={10} /> 拒绝
                                    </button>
                                    <button 
                                        onClick={() => onAcceptHunk(hunk)}
                                        className="px-2 py-1 text-[10px] bg-green-900/20 text-green-400 hover:bg-green-900/40 rounded border border-green-900/30 flex items-center gap-1 transition-colors"
                                    >
                                        <Check size={10} /> 批准
                                    </button>
                                </div>
                            </div>
                            
                            {/* Change Content */}
                            <div className="overflow-x-auto">
                                {hunk.lines.map((line, idx) => (
                                    <div key={idx} className={`flex ${
                                        line.type === 'add' ? 'bg-green-500/10' : 
                                        line.type === 'remove' ? 'bg-red-500/10' : 
                                        'bg-transparent opacity-60'
                                    }`}>
                                        <div className="w-16 shrink-0 flex text-gray-600 select-none border-r border-gray-800/50 bg-[#0d1117] text-[10px] font-mono">
                                            <div className="w-1/2 text-right pr-2 py-0.5">{line.type !== 'add' ? line.lineNumOriginal : ''}</div>
                                            <div className="w-1/2 text-right pr-2 py-0.5">{line.type !== 'remove' ? line.lineNumNew : ''}</div>
                                        </div>
                                        <div className="flex-1 px-4 py-0.5 whitespace-pre-wrap break-all relative font-mono text-gray-300">
                                            {line.type === 'add' && <span className="absolute left-1 top-0.5 text-green-500 select-none">+</span>}
                                            {line.type === 'remove' && <span className="absolute left-1 top-0.5 text-red-500 select-none">-</span>}
                                            
                                            <span className={`
                                                ${line.type === 'add' ? 'text-green-200' : ''}
                                                ${line.type === 'remove' ? 'text-red-300 line-through decoration-red-900/50' : ''}
                                            `}>
                                                {line.content || ' '}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Unchanged Hunk (Context) */
                        <div className="opacity-50 hover:opacity-100 transition-opacity">
                            {hunk.lines.map((line, idx) => (
                                <div key={idx} className="flex hover:bg-gray-800/30">
                                    <div className="w-16 shrink-0 flex text-gray-700 select-none border-r border-transparent pr-2 text-[10px] font-mono">
                                        <div className="w-1/2 text-right py-0.5">{line.lineNumOriginal}</div>
                                        <div className="w-1/2 text-right py-0.5 opacity-50">{line.lineNumNew}</div>
                                    </div>
                                    <div className="flex-1 px-4 py-0.5 whitespace-pre-wrap break-all font-mono text-gray-500">
                                        {line.content || ' '}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;
