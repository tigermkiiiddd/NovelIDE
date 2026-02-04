
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useFileStore } from '../stores/fileStore';
import { useAgentStore } from '../stores/agentStore';
import { useAgent } from '../hooks/useAgent'; // To get approve/reject logic
import { computeLineDiff, groupDiffIntoHunks, DiffHunk, applyPatchInMemory, rejectHunkInNewContent } from '../utils/diffUtils';
import { Check, X, FileText, AlertTriangle, Eye, Edit3, GitCompare, Save, Undo, ChevronDown, ChevronRight, CheckCheck, XCircle } from 'lucide-react';
import { FileNode } from '../types';
import { getNodePath } from '../services/fileSystem';

interface EditorProps {
  className?: string;
}

const Editor: React.FC<EditorProps> = ({ 
  className,
}) => {
  // 1. Core Stores
  const { files, activeFileId, saveFileContent } = useFileStore();
  const activeFile = files.find(f => f.id === activeFileId);
  
  // 2. Agent Store (for pending changes)
  const { pendingChanges, updatePendingChange, removePendingChange } = useAgentStore();
  
  // 3. Approval Hooks (we need approve/reject logic, accessed via direct store for simplicity or custom hook)
  // We'll reimplement approval logic simply here to avoid circular dep or hook complexity
  const { approveChange, rejectChange } = useAgent(files, undefined, activeFile, {} as any); 

  // 4. Local State
  const [internalMode, setInternalMode] = useState<'edit' | 'preview' | 'diff'>('edit');
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 5. Detect Pending Change for Active File
  const activePendingChange = useMemo(() => {
      if (!activeFile) return null;
      // Match by path since tools use paths
      const currentPath = getNodePath(activeFile, files);
      return pendingChanges.find(c => c.fileName === currentPath);
  }, [activeFile, files, pendingChanges]);

  // Auto-switch to Diff Mode if there's a pending change
  useEffect(() => {
      if (activePendingChange) {
          setInternalMode('diff');
      } else if (internalMode === 'diff') {
          // If diff cleared, go back to edit
          setInternalMode('edit');
      }
  }, [activePendingChange, internalMode]); // Check deps carefully

  // Sync content from store
  useEffect(() => {
    if (activeFile && activeFile.content !== undefined) {
      if (activeFile.content !== content) {
          setContent(activeFile.content);
      }
    } else if (!activeFile) {
      setContent('');
    }
  }, [activeFile]); // dependency on content removed to avoid loop

  // --- Diff Logic ---
  const diffHunks = useMemo(() => {
    if (internalMode === 'diff' && activePendingChange) {
      const original = activeFile?.content || '';
      const modified = activePendingChange.newContent || '';
      const rawLines = computeLineDiff(original, modified);
      return groupDiffIntoHunks(rawLines);
    }
    return [];
  }, [internalMode, activePendingChange, activeFile]);

  // --- Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setContent(newText);
    setIsDirty(true);
    
    if (activeFile) {
        saveFileContent(activeFile.id, newText);
    }
  };

  useEffect(() => {
      if (isDirty) {
          const timer = setTimeout(() => setIsDirty(false), 1000);
          return () => clearTimeout(timer);
      }
  }, [isDirty]);

  // --- Partial Approval Logic ---

  const handleAcceptHunk = (hunk: DiffHunk) => {
      if (!activeFile || !activePendingChange) return;

      // Logic: Apply this hunk's changes to the FILE immediately (Save it)
      // Since hunk represents New Content differences, applying it means:
      // Taking the activeFile.content and applying the patch this hunk represents.
      // BUT, simplistic way: 
      // 1. Get current file content.
      // 2. We need to construct what the file looks like with ONLY this hunk applied.
      // 3. This is complex because hunks depend on each other for context.
      
      // ALTERNATIVE STRATEGY:
      // "Accepting a hunk" means "Keeping it in the proposal".
      // "Rejecting a hunk" means "Reverting it in the proposal to match original".
      // Then, when user clicks "Accept All", we apply the final proposal.
      // BUT user wants "Line by line approval". 
      
      // Let's do Immediate Apply strategy (Risky but standard for "Accept"):
      // 1. We construct the NEW string by taking `activeFile.content` (current) 
      //    and applying the change.
      //    Since `activePendingChange.newContent` is the GOAL state, and hunks are diffs between CURRENT and GOAL.
      //    If we accept a hunk, we want to update CURRENT to include that hunk.
      
      //    Actually, it's easier to update the `activePendingChange` to REMOVE this hunk (mark as processed) 
      //    AND update the file content.
      
      //    Wait, if we update the file content, the Diff will natively disappear for that hunk because 
      //    Original == Modified for that section.
      
      //    So, how to Apply just one hunk?
      //    We can use `applyPatchInMemory` but we need start/end lines relative to Original.
      //    `hunk.startLineOriginal` and `hunk.endLineOriginal` are from the diff.
      
      //    Hunk Lines contain the content to insert.
      //    If Hunk has 'add', we insert. If 'remove', we delete.
      
      const linesToKeep = hunk.lines.filter(l => l.type !== 'remove').map(l => l.content);
      
      // We replace lines [startLineOriginal, endLineOriginal] in activeFile.content with `linesToKeep`.
      const newFileContent = applyPatchInMemory(
          activeFile.content || '', 
          hunk.startLineOriginal, // 1-based
          hunk.endLineOriginal,   // 1-based
          linesToKeep.join('\n')
      );
      
      // 1. Save to File Store (Updates Original)
      saveFileContent(activeFile.id, newFileContent);
      
      // 2. We DO NOT update pendingChange.newContent yet, because pendingChange.newContent 
      //    represents the "Final Goal". As we update Original, the diff between Original 
      //    and Goal gets smaller! 
      //    Except: If we update Original, line numbers shift! 
      //    This invalidates the remaining hunks if we don't recompute.
      //    luckily, React re-renders, `activeFile` changes, `diffHunks` re-computes diff 
      //    between `newFileContent` and `pendingChange.newContent`.
      
      //    So, "Accept Hunk" -> Update File -> Re-render Diff. The hunk should vanish (become equal).
  };

  const handleRejectHunk = (hunk: DiffHunk) => {
      if (!activeFile || !activePendingChange) return;

      // Logic: We want to modify `pendingChange.newContent` so that this specific hunk 
      // looks like the Original (effectively removing the change request).
      
      // We need a robust way to patch `pendingChange.newContent`.
      // We can use `rejectHunkInNewContent` from utils.
      
      const revertedNewContent = rejectHunkInNewContent(
          activePendingChange.newContent || '',
          activeFile.content || '',
          hunk
      );
      
      // Update the pending change in store
      updatePendingChange(activePendingChange.id, { newContent: revertedNewContent });
      
      // Re-render will happen, Diff will be recomputed, hunk should vanish.
  };
  
  const handleAcceptAll = () => {
      if (activePendingChange) approveChange(activePendingChange);
  };

  const handleRejectAll = () => {
      if (activePendingChange) rejectChange(activePendingChange);
  };

  const displayFileName = activeFile?.name || 'Untitled';

  if (!activeFile && internalMode !== 'diff') {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-gray-500 bg-[#0d1117] ${className}`}>
        <FileText size={48} className="mb-4 opacity-20" />
        <p className="text-sm">选择一个文件开始写作</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-[#0d1117] ${className}`}>
      
      {/* EDITOR TOOLBAR */}
      <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 transition-colors ${
          internalMode === 'diff' 
            ? 'bg-yellow-900/10 border-yellow-900/30' 
            : 'bg-[#161b22] border-gray-800'
      }`}>
        <div className="flex items-center gap-3 overflow-hidden">
            {internalMode === 'diff' ? (
                <div className="p-1 bg-yellow-900/20 rounded text-yellow-400 border border-yellow-900/30 animate-pulse">
                    <GitCompare size={16} />
                </div>
            ) : (
                <FileText size={16} className="text-blue-400" />
            )}
            
            <div className="flex flex-col min-w-0">
                <span className={`font-medium truncate font-mono text-xs sm:text-sm flex items-center gap-2 ${internalMode === 'diff' ? 'text-yellow-100' : 'text-gray-200'}`}>
                    {displayFileName}
                    {isDirty && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="Unsaved changes" />}
                </span>
                {internalMode === 'diff' && activePendingChange && (
                    <span className="text-[10px] text-yellow-500/80 truncate max-w-[200px]">
                        {activePendingChange.description}
                    </span>
                )}
            </div>
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
          {internalMode === 'diff' ? (
              <div className="flex items-center">
                  <button onClick={handleRejectAll} className="flex items-center gap-1 px-3 py-1 text-xs text-red-400 hover:bg-red-900/20 rounded-l transition-colors border-r border-gray-700">
                      <XCircle size={14} /> 拒绝全部
                  </button>
                  <button onClick={handleAcceptAll} className="flex items-center gap-1 px-3 py-1 text-xs text-green-400 hover:bg-green-900/20 rounded-r transition-colors font-medium">
                      <CheckCheck size={14} /> 批准全部
                  </button>
              </div>
          ) : (
              <>
                <button
                    onClick={() => setInternalMode('edit')}
                    className={`flex items-center justify-center w-8 h-7 rounded transition-all ${
                    internalMode === 'edit' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title="Edit Mode"
                >
                    <Edit3 size={14} />
                </button>
                <button
                    onClick={() => setInternalMode('preview')}
                    className={`flex items-center justify-center w-8 h-7 rounded transition-all ${
                    internalMode === 'preview' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title="Preview Mode"
                >
                    <Eye size={14} />
                </button>
              </>
          )}
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative bg-[#0d1117]" ref={scrollRef}>
        
        {internalMode === 'edit' && (
          <textarea
            ref={textareaRef}
            className="w-full h-full p-4 sm:p-6 bg-[#0d1117] text-gray-300 resize-none focus:outline-none font-mono text-sm sm:text-base leading-relaxed"
            value={content}
            onChange={handleChange}
            placeholder="在此处开始您的创作..."
            spellCheck={false}
          />
        )}

        {internalMode === 'preview' && (
          <div className="w-full h-full p-6 sm:p-8 bg-[#0d1117] text-gray-300 overflow-y-auto prose prose-invert prose-sm sm:prose-base max-w-3xl mx-auto">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {internalMode === 'diff' && (
             <div className="flex-1 overflow-auto h-full font-mono text-xs sm:text-sm leading-6 pb-20">
                {diffHunks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 opacity-70">
                        <CheckCheck size={48} className="text-green-500/50"/>
                        <p>所有变更已处理或文件无实际差异。</p>
                        <button 
                            onClick={handleAcceptAll} 
                            className="px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded hover:bg-green-600/30 transition-colors"
                        >
                            完成并退出
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {diffHunks.map((hunk) => (
                            <div key={hunk.id} className="border-b border-gray-800 last:border-0">
                                {/* Hunk Header / Actions */}
                                <div className="bg-[#1c2128] px-2 py-1 flex justify-between items-center sticky top-0 z-10 border-y border-black/20 shadow-sm">
                                    <span className="text-[10px] text-gray-500 font-mono pl-2">
                                        @@ -{hunk.startLineOriginal},{hunk.endLineOriginal - hunk.startLineOriginal + 1} +{hunk.startLineNew},{hunk.endLineNew - hunk.startLineNew + 1} @@
                                    </span>
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={() => handleRejectHunk(hunk)}
                                            className="p-1 px-2 text-[10px] bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded border border-red-900/30 flex items-center gap-1"
                                            title="拒绝此段变更 (Revert)"
                                        >
                                            <X size={10} /> 拒绝
                                        </button>
                                        <button 
                                            onClick={() => handleAcceptHunk(hunk)}
                                            className="p-1 px-2 text-[10px] bg-green-900/20 text-green-400 hover:bg-green-900/40 rounded border border-green-900/30 flex items-center gap-1"
                                            title="批准此段变更 (Apply)"
                                        >
                                            <Check size={10} /> 批准
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Hunk Content */}
                                <div>
                                    {hunk.lines.map((line, idx) => (
                                        <div key={idx} className={`flex group ${
                                            line.type === 'add' ? 'bg-green-900/10' : 
                                            line.type === 'remove' ? 'bg-red-900/10' : 'bg-[#0d1117] opacity-60'
                                        }`}>
                                            <div className="w-10 sm:w-12 shrink-0 flex text-gray-600 select-none border-r border-gray-800/50 bg-[#161b22] text-[10px] sm:text-xs font-mono opacity-60">
                                                <div className="w-1/2 text-right pr-1 py-0.5">{line.type !== 'add' ? line.lineNumOriginal : ''}</div>
                                                <div className="w-1/2 text-right pr-1 py-0.5">{line.type !== 'remove' ? line.lineNumNew : ''}</div>
                                            </div>
                                            <div className="flex-1 px-2 sm:px-4 py-0.5 whitespace-pre-wrap break-all relative">
                                                {line.type === 'add' && <span className="absolute left-0 sm:left-1 top-0.5 text-green-500/50 select-none font-bold text-[10px]">+</span>}
                                                {line.type === 'remove' && <span className="absolute left-0 sm:left-1 top-0.5 text-red-500/50 select-none font-bold text-[10px]">-</span>}
                                                <span className={`
                                                    ${line.type === 'add' ? 'text-green-200' : ''}
                                                    ${line.type === 'remove' ? 'text-red-300/60 line-through decoration-red-900/50' : 'text-gray-400'}
                                                `}>
                                                    {line.content || ' '}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
             </div>
        )}
      </div>
    </div>
  );
};

export default Editor;
