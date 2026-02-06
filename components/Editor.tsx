
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useFileStore } from '../stores/fileStore';
import { useAgentStore } from '../stores/agentStore';
import { useUiStore } from '../stores/uiStore';
import { DiffHunk, applyPatchInMemory, rejectHunkInNewContent } from '../utils/diffUtils';
import { executeApprovedChange } from '../services/agent/toolRunner';
import { FileText, Eye, Edit3, RotateCcw, RotateCw, Tag, BookOpen, Columns, PanelRightClose, ListOrdered, WrapText, AlignJustify } from 'lucide-react';
import { getNodePath, findNodeByPath } from '../services/fileSystem';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { parseFrontmatter } from '../utils/frontmatter';
import DiffViewer from './DiffViewer';
import { useShallow } from 'zustand/react/shallow';

interface EditorProps {
  className?: string;
}

const Editor: React.FC<EditorProps> = ({ 
  className,
}) => {
  // 1. Core Stores
  const fileStore = useFileStore();
  const { files, activeFileId, saveFileContent, createFile } = fileStore;
  const activeFile = files.find(f => f.id === activeFileId);
  
  // 2. Agent Store (for pending changes)
  const { pendingChanges, updatePendingChange, removePendingChange, addMessage, reviewingChangeId } = useAgentStore();

  // 3. UI Store (Persisted View State)
  const { 
    isSplitView, toggleSplitView,
    showLineNumbers, toggleLineNumbers,
    wordWrap, toggleWordWrap
  } = useUiStore(useShallow(state => ({
    isSplitView: state.isSplitView,
    toggleSplitView: state.toggleSplitView,
    showLineNumbers: state.showLineNumbers,
    toggleLineNumbers: state.toggleLineNumbers,
    wordWrap: state.wordWrap,
    toggleWordWrap: state.toggleWordWrap
  })));

  // 4. Local State & Undo/Redo
  const { 
    state: content, 
    set: setContent, 
    undo, 
    redo, 
    canUndo, 
    canRedo, 
    reset: resetHistory 
  } = useUndoRedo<string>('', 800);

  const [internalMode, setInternalMode] = useState<'edit' | 'preview' | 'diff'>('edit');
  const [isDirty, setIsDirty] = useState(false);
  const [cursorStats, setCursorStats] = useState({ line: 1, col: 1 });
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  
  // 5. Detect Pending Change for Active File OR Explicit Review
  const activePendingChange = useMemo(() => {
      if (reviewingChangeId) {
          return pendingChanges.find(c => c.id === reviewingChangeId) || null;
      }
      if (!activeFile) return null;
      const currentPath = getNodePath(activeFile, files);
      return pendingChanges.find(c => c.fileName === currentPath);
  }, [activeFile, files, pendingChanges, reviewingChangeId]);

  // Auto-switch to Diff Mode
  useEffect(() => {
      if (activePendingChange) {
          setInternalMode('diff');
      } else if (internalMode === 'diff') {
          setInternalMode('edit');
      }
  }, [activePendingChange, internalMode]); 

  // Sync content from store
  const prevFileIdRef = useRef<string | null>(null);
  useEffect(() => {
      if (activeFileId !== prevFileIdRef.current) {
          if (activeFile) {
              resetHistory(activeFile.content || '');
          } else {
              resetHistory('');
          }
          prevFileIdRef.current = activeFileId;
          // Reset cursor stats on file change
          setCursorStats({ line: 1, col: 1 });
      }
  }, [activeFileId, activeFile, resetHistory]);

  // --- Preview Logic ---
  const { previewMetadata, previewBody } = useMemo(() => {
      if (internalMode !== 'preview' && !isSplitView) return { previewMetadata: {}, previewBody: '' };
      
      const meta = parseFrontmatter(content);
      const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
      const body = content.replace(frontMatterRegex, '');
      
      return { previewMetadata: meta, previewBody: body };
  }, [content, internalMode, isSplitView]);

  // --- Word Count ---
  const wordCount = useMemo(() => {
      return content ? content.replace(/\s/g, '').length : 0;
  }, [content]);

  // --- Line Numbers Calculation ---
  const lines = useMemo(() => {
      if (!content) return [1];
      return new Array(content.split('\n').length).fill(0).map((_, i) => i + 1);
  }, [content]);

  // --- Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setContent(newText);
    setIsDirty(true);
    if (activeFile) {
        saveFileContent(activeFile.id, newText);
    }
    updateCursorStats(e.target);
  };

  const updateCursorStats = (target: HTMLTextAreaElement) => {
      const val = target.value;
      const sel = target.selectionStart;
      const textBeforeCursor = val.slice(0, sel);
      const lineCount = textBeforeCursor.split('\n').length;
      const lastNewLinePos = textBeforeCursor.lastIndexOf('\n');
      const colCount = sel - lastNewLinePos;
      setCursorStats({ line: lineCount, col: colCount });
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      updateCursorStats(e.currentTarget);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (gutterRef.current) {
          gutterRef.current.scrollTop = e.currentTarget.scrollTop;
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) { if (canRedo) redo(); } 
          else { if (canUndo) undo(); }
          return;
      }
      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const val = textarea.value;
          const newVal = val.substring(0, start) + "  " + val.substring(end);
          setContent(newVal);
          setTimeout(() => { 
              if(textareaRef.current) {
                  textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2; 
                  updateCursorStats(textareaRef.current);
              }
          }, 0);
          return;
      }
      if (e.key === 'Enter') {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const val = textarea.value;
          const lineStartPos = val.lastIndexOf('\n', start - 1) + 1;
          const lineContent = val.substring(lineStartPos, start);
          const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s/);

          if (listMatch) {
              const fullPrefix = listMatch[0]; 
              const whitespace = listMatch[1]; 
              const marker = listMatch[2];     
              const textAfterPrefix = lineContent.substring(fullPrefix.length);
              
              if (!textAfterPrefix.trim()) {
                  e.preventDefault();
                  const newVal = val.substring(0, lineStartPos) + val.substring(end);
                  setContent(newVal);
                  setTimeout(() => { if(textareaRef.current) textareaRef.current.selectionStart = textareaRef.current.selectionEnd = lineStartPos; }, 0);
              } else {
                  e.preventDefault();
                  let nextPrefix = fullPrefix;
                  const numberMatch = marker.match(/^(\d+)\.$/);
                  if (numberMatch) {
                      const nextNum = parseInt(numberMatch[1], 10) + 1;
                      nextPrefix = `${whitespace}${nextNum}. `;
                  }
                  const insertion = `\n${nextPrefix}`;
                  const newVal = val.substring(0, start) + insertion + val.substring(end);
                  setContent(newVal);
                  setTimeout(() => { if(textareaRef.current) textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + insertion.length; }, 0);
              }
          }
      }
  };

  const handleToggleSplit = () => {
      toggleSplitView();
      if (!isSplitView) setInternalMode('edit');
  };

  const handleSetMode = (mode: 'edit' | 'preview') => {
      setInternalMode(mode);
      if (isSplitView) toggleSplitView();
  };

  useEffect(() => {
      if (isDirty) {
          const timer = setTimeout(() => setIsDirty(false), 1000);
          return () => clearTimeout(timer);
      }
  }, [isDirty]);

  // --- Approval Logic Proxies (Truncated for brevity, logic unchanged) ---
  const handleAcceptHunk = (hunk: DiffHunk) => {
      if (!activePendingChange) return;
      let targetFile = activeFile;
      if (!targetFile && activePendingChange.fileName) targetFile = findNodeByPath(files, activePendingChange.fileName);
      const baseContent = targetFile ? (targetFile.content || '') : (activePendingChange.originalContent || '');
      const linesToKeep = hunk.lines.filter(l => l.type !== 'remove').map(l => l.content);
      const newFileContent = applyPatchInMemory(baseContent, hunk.startLineOriginal === 0 ? 1 : hunk.startLineOriginal, hunk.endLineOriginal === 0 ? 0 : hunk.endLineOriginal, linesToKeep.join('\n'));
      if (targetFile) saveFileContent(targetFile.id, newFileContent);
      else if (activePendingChange.toolName === 'createFile') createFile(activePendingChange.fileName, newFileContent);
      setContent(newFileContent); 
  };
  const handleRejectHunk = (hunk: DiffHunk) => {
      if (!activePendingChange) return;
      let targetFile = activeFile;
      if (!targetFile && activePendingChange.fileName) targetFile = findNodeByPath(files, activePendingChange.fileName);
      const baseContent = targetFile ? (targetFile.content || '') : (activePendingChange.originalContent || '');
      const revertedNewContent = rejectHunkInNewContent(activePendingChange.newContent || '', baseContent, hunk);
      updatePendingChange(activePendingChange.id, { newContent: revertedNewContent });
  };
  const handleAcceptAll = () => { if (activePendingChange) { const actions = { createFile: fileStore.createFile, updateFile: fileStore.updateFile, patchFile: fileStore.patchFile, deleteFile: fileStore.deleteFile, renameFile: fileStore.renameFile, readFile: fileStore.readFile, searchFiles: fileStore.searchFiles, listFiles: fileStore.listFiles, updateProjectMeta: () => 'Not supported', setTodos: () => {}, trackFileAccess: () => {} }; const result = executeApprovedChange(activePendingChange, actions as any); addMessage({ id: Math.random().toString(), role: 'system', text: `✅ 变更已批准: ${activePendingChange.fileName}\n${result}`, timestamp: Date.now() }); removePendingChange(activePendingChange.id); } };
  const handleRejectAll = () => { if (activePendingChange) { removePendingChange(activePendingChange.id); addMessage({ id: Math.random().toString(), role: 'system', text: `❌ 变更已拒绝: ${activePendingChange.fileName}`, timestamp: Date.now() }); } };
  const handleDismiss = () => { if (activePendingChange) { removePendingChange(activePendingChange.id); addMessage({ id: Math.random().toString(), role: 'system', text: `✅ 变更已手动完成: ${activePendingChange.fileName}`, timestamp: Date.now() }); } };

  // --- Render Components ---
  const renderEditor = () => (
      <div className="flex h-full w-full relative overflow-hidden">
          {/* Gutter - Only visible if line numbers enabled */}
          {showLineNumbers && (
              <div 
                  ref={gutterRef}
                  className="shrink-0 w-10 sm:w-12 bg-[#0d1117] border-r border-gray-800 text-right pr-2 pt-4 sm:pt-6 text-gray-600 select-none overflow-hidden font-mono text-sm sm:text-base leading-relaxed"
                  aria-hidden="true"
              >
                  {lines.map((ln) => (
                      <div key={ln}>{ln}</div>
                  ))}
                  {/* Extra padding at bottom to match textarea scrolling */}
                  <div className="h-20" />
              </div>
          )}
          
          <textarea
            ref={textareaRef}
            className={`
                flex-1 h-full w-full bg-[#0d1117] text-gray-300 resize-none focus:outline-none 
                font-mono text-sm sm:text-base leading-relaxed 
                pt-4 sm:pt-6 pb-20
                ${showLineNumbers ? 'pl-2' : 'pl-4 sm:pl-6'} 
                ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}
            `}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onSelect={handleSelect}
            onClick={handleSelect}
            onKeyUp={handleSelect}
            placeholder="在此处开始您的创作..."
            spellCheck={false}
          />
      </div>
  );

  const renderPreview = () => (
      <div className="w-full h-full p-6 sm:p-8 bg-[#0d1117] overflow-y-auto">
        <div className="max-w-3xl mx-auto">
            {/* Metadata Visualization Panel */}
            {(previewMetadata.tags || previewMetadata.summarys) && (
                <div className="mb-8 p-6 bg-gray-800/40 rounded-xl border border-gray-700/50 backdrop-blur-sm">
                    {previewMetadata.tags && previewMetadata.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {previewMetadata.tags.map((tag, i) => (
                                <span key={i} className="px-2.5 py-1 text-xs font-medium text-blue-200 bg-blue-900/30 border border-blue-800/50 rounded-full flex items-center gap-1.5">
                                    <Tag size={10} /> {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    {previewMetadata.summarys && previewMetadata.summarys.length > 0 && (
                        <div className="space-y-2">
                            {previewMetadata.summarys.map((sum, i) => (
                                <div key={i} className="flex gap-3 text-sm text-gray-300 bg-gray-900/50 p-3 rounded-lg border-l-2 border-yellow-500/50">
                                    <BookOpen size={16} className="text-yellow-500/80 shrink-0 mt-0.5" />
                                    <p className="leading-relaxed italic opacity-90">{sum}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <article className="prose prose-invert prose-base prose-blue prose-headings:text-gray-100 prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-gray-300 prose-strong:text-white">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{previewBody}</ReactMarkdown>
            </article>
        </div>
      </div>
  );

  // Fallback: If no file selected AND NOT in diff mode.
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
          internalMode === 'diff' ? 'hidden' : 'bg-[#161b22] border-gray-800'
      }`}>
        <div className="flex items-center gap-3 overflow-hidden">
            <FileText size={16} className="text-blue-400" />
            <div className="flex flex-col min-w-0">
                <span className={`font-medium truncate font-mono text-xs sm:text-sm flex items-center gap-2 text-gray-200`}>
                    {activeFile?.name || 'Untitled'}
                    {isDirty && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="Unsaved changes" />}
                </span>
                {activeFile && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono leading-none">
                        <span>{wordCount} 字</span>
                        <span className="text-gray-700">|</span>
                        <span>Ln {cursorStats.line}, Col {cursorStats.col}</span>
                    </div>
                )}
            </div>
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
            {/* View Settings Toggles */}
            <button 
                onClick={toggleWordWrap} 
                className={`hidden sm:flex items-center justify-center w-8 h-7 rounded transition-all ${wordWrap ? 'bg-gray-700 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`} 
                title={wordWrap ? "自动换行: 开启" : "自动换行: 关闭"}
            >
                {wordWrap ? <WrapText size={14} /> : <AlignJustify size={14} />}
            </button>
            <button 
                onClick={toggleLineNumbers} 
                className={`hidden sm:flex items-center justify-center w-8 h-7 rounded transition-all border-r border-gray-700 mr-1 ${showLineNumbers ? 'bg-gray-700 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`} 
                title="显示行号"
            >
                <ListOrdered size={14} />
            </button>

            <button onClick={undo} disabled={!canUndo} className={`flex items-center justify-center w-8 h-7 rounded transition-all ${canUndo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'}`} title="Undo (Ctrl+Z)"><RotateCcw size={14} /></button>
            <button onClick={redo} disabled={!canRedo} className={`flex items-center justify-center w-8 h-7 rounded transition-all border-r border-gray-700 mr-1 ${canRedo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'}`} title="Redo (Ctrl+Shift+Z)"><RotateCw size={14} /></button>
            <button onClick={() => handleSetMode('edit')} className={`flex items-center justify-center w-8 h-7 rounded transition-all ${internalMode === 'edit' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title="Edit Mode"><Edit3 size={14} /></button>
            <button onClick={() => handleSetMode('preview')} className={`flex items-center justify-center w-8 h-7 rounded transition-all ${internalMode === 'preview' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title="Preview Mode"><Eye size={14} /></button>
            <button onClick={handleToggleSplit} className={`hidden md:flex items-center justify-center w-8 h-7 rounded transition-all border-l border-gray-700 ml-1 ${isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title={isSplitView ? "关闭分屏" : "开启分屏对比"}>{isSplitView ? <PanelRightClose size={14} /> : <Columns size={14} />}</button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative bg-[#0d1117]">
        {internalMode === 'diff' && activePendingChange ? (
             <DiffViewer 
                originalContent={activeFile ? (activeFile.content || '') : (activePendingChange.originalContent || '')}
                modifiedContent={activePendingChange.newContent || ''}
                pendingChange={activePendingChange}
                onAcceptHunk={handleAcceptHunk}
                onRejectHunk={handleRejectHunk}
                onAcceptAll={handleAcceptAll}
                onRejectAll={handleRejectAll}
                onDismiss={handleDismiss}
             />
        ) : (
            <div className="flex h-full relative">
                {(internalMode === 'edit' || isSplitView) && (
                    <div className={`${isSplitView ? 'w-1/2 border-r border-gray-800' : 'w-full'} h-full transition-all`}>
                        {renderEditor()}
                    </div>
                )}
                {(internalMode === 'preview' || isSplitView) && (
                    <div className={`${isSplitView ? 'w-1/2' : 'w-full'} h-full transition-all`}>
                        {renderPreview()}
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default Editor;
