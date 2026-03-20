/**
 * Editor.tsx - 重构版
 *
 * 使用 hooks 组合的轻量级编辑器组件
 * 职责：组合 hooks + 渲染 UI
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Hooks
import {
  useEditorState,
  useEditorSearch,
  useEditorDiff,
  useEditorSync
} from '../hooks/editor';

// Stores
import { useFileStore } from '../stores/fileStore';
import { useUiStore } from '../stores/uiStore';
import { useAgentStore } from '../stores/agentStore';
import { useVersionStore } from '../stores/versionStore';

// Components
import { EditorToolbar, EditorGutter, EmptyState } from './editor';
import DiffViewer from './DiffViewer';
import VersionHistory from './VersionHistory';

// Utils
import { formatWordCount } from '../utils/wordCount';
import { getNodePath } from '../services/fileSystem';
import { getLineAndColFromIndex } from '../utils/searchUtils';
import { computeLineDelta, detectEditedRegion, rebuildEditLineNumbers } from '../utils/editIncrement';

// Types
import { EditDiff, EditIncrement } from '../types';

interface EditorProps {
  className?: string;
}

const Editor: React.FC<EditorProps> = ({ className }) => {
  // ==================== Stores ====================
  const fileStore = useFileStore();
  const { files, activeFileId } = fileStore;
  const activeFile = files.find(f => f.id === activeFileId);

  const {
    isSplitView,
    toggleSplitView,
    showLineNumbers,
    toggleLineNumbers,
    wordWrap,
    toggleWordWrap
  } = useUiStore(useShallow(state => ({
    isSplitView: state.isSplitView,
    toggleSplitView: state.toggleSplitView,
    showLineNumbers: state.showLineNumbers,
    toggleLineNumbers: state.toggleLineNumbers,
    wordWrap: state.wordWrap,
    toggleWordWrap: state.toggleWordWrap
  })));

  // ==================== State Hook ====================
  const editorState = useEditorState();

  const {
    mode,
    setMode,
    content,
    setContent,
    isDirty,
    setIsDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    cursorStats,
    setCursorStats,
    editIncrements,
    setEditIncrements,
    processedEditIds,
    setProcessedEditIds,
    textareaRef,
    gutterRef,
    highlightRef,
    isApplyingBatchRef,
    isUndoRedoRef,
    computedContentFileIdRef,
    resetHistory
  } = editorState;

  // ==================== Search Hook ====================
  const search = useEditorSearch({
    content,
    cursorStats,
    textareaRef,
    onCursorChange: (line, col) => setCursorStats({ line, col })
  });

  // ==================== Diff Hook ====================
  const diff = useEditorDiff({
    activeFileId,
    processedEditIds,
    setProcessedEditIds,
    onApplyEdits: (edits) => {
      // 应用编辑到内容
      // 这里需要根据具体编辑类型处理
      console.log('[Editor] Applying edits:', edits);
    }
  });

  // ==================== Sync Hook ====================
  const sync = useEditorSync({
    content,
    setContent,
    isDirty,
    setIsDirty,
    resetHistory,
    activeFileId,
    isApplyingBatchRef,
    isUndoRedoRef,
    computedContentFileIdRef
  });

  // ==================== Version History ====================
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // ==================== Computed Values ====================
  const wordCount = useMemo(() => {
    return content.replace(/\s/g, '').length;
  }, [content]);

  const fileName = activeFile?.name || '';

  // ==================== Event Handlers ====================

  // 内容变化
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setIsDirty(true);
    computedContentFileIdRef.current = activeFileId;
  }, [setContent, setIsDirty, computedContentFileIdRef, activeFileId]);

  // 光标变化
  const handleCursorChange = useCallback(() => {
    if (!textareaRef.current) return;

    const pos = textareaRef.current.selectionStart;
    const { line, col } = getLineAndColFromIndex(content, pos);
    setCursorStats({ line, col });
  }, [content, textareaRef, setCursorStats]);

  // 滚动同步
  const handleScroll = useCallback(() => {
    if (!textareaRef.current || !gutterRef.current || !highlightRef.current) return;

    const scrollTop = textareaRef.current.scrollTop;
    gutterRef.current.scrollTop = scrollTop;
    highlightRef.current.scrollTop = scrollTop;
  }, [textareaRef, gutterRef, highlightRef]);

  // ==================== Diff 相关 ====================

  // 编辑增量计算
  useEffect(() => {
    if (mode !== 'edit' || diff.activeEditDiffs.length === 0) {
      setEditIncrements([]);
      return;
    }

    const increments: EditIncrement[] = [];
    let lineDelta = 0;

    for (const edit of diff.activeEditDiffs) {
      if (processedEditIds.includes(edit.id)) continue;

      const increment = detectEditedRegion(edit, lineDelta);
      if (increment) {
        increments.push({
          ...increment,
          editId: edit.id,
          status: edit.status
        });
        lineDelta += computeLineDelta(edit);
      }
    }

    setEditIncrements(increments);
  }, [mode, diff.activeEditDiffs, processedEditIds, setEditIncrements]);

  // ==================== Render ====================

  // 空状态
  if (!activeFile) {
    return (
      <div className={`flex-1 flex flex-col bg-[#0d1117] ${className}`}>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col bg-[#0d1117] overflow-hidden ${className}`}>
      {/* Toolbar */}
      <EditorToolbar
        mode={mode}
        fileName={fileName}
        isDirty={isDirty}
        isSplitView={isSplitView}
        wordCount={wordCount}
        cursorStats={cursorStats}
        canUndo={canUndo}
        canRedo={canRedo}
        searchOpen={search.searchOpen}
        searchTerm={search.searchTerm}
        searchCaseSensitive={search.searchCaseSensitive}
        currentMatchIndex={search.currentMatchIndex}
        totalMatches={search.totalMatches}
        onToggleWordWrap={toggleWordWrap}
        onToggleLineNumbers={toggleLineNumbers}
        onSetMode={setMode}
        onUndo={undo}
        onRedo={redo}
        onToggleSplit={toggleSplitView}
        onToggleSearch={search.toggleSearch}
        onSearchChange={search.setSearchTerm}
        onSearchNext={search.searchNext}
        onSearchPrev={search.searchPrev}
        onToggleCaseSensitive={search.toggleCaseSensitive}
        onOpenVersionHistory={() => setShowVersionHistory(true)}
      />

      {/* Search Bar */}
      {search.searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
          <input
            type="text"
            value={search.searchTerm}
            onChange={(e) => search.setSearchTerm(e.target.value)}
            placeholder="搜索..."
            className="flex-1 bg-gray-700 text-gray-200 px-3 py-1 rounded text-sm"
            autoFocus
          />
          <span className="text-sm text-gray-400">
            {search.totalMatches > 0
              ? `${search.currentMatchIndex + 1} / ${search.totalMatches}`
              : '无结果'}
          </span>
          <button
            onClick={search.searchPrev}
            disabled={search.totalMatches === 0}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
          >
            ↑
          </button>
          <button
            onClick={search.searchNext}
            disabled={search.totalMatches === 0}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
          >
            ↓
          </button>
          <button
            onClick={search.toggleCaseSensitive}
            className={`p-1 ${search.searchCaseSensitive ? 'text-blue-400' : 'text-gray-400'} hover:text-white`}
            title="大小写敏感"
          >
            Aa
          </button>
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Diff Mode */}
        {mode === 'diff' && diff.mergedPendingChange ? (
          <DiffViewer
            originalContent={diff.mergedPendingChange.originalContent}
            newContent={diff.mergedPendingChange.newContent}
            fileName={fileName}
            onAccept={() => {
              // 接受所有变更
              console.log('[Editor] Accept all changes');
            }}
            onReject={() => {
              // 拒绝所有变更
              console.log('[Editor] Reject all changes');
            }}
          />
        ) : (
          /* Edit/Preview Mode */
          <div className="flex-1 flex overflow-hidden">
            {/* Gutter */}
            {showLineNumbers && (
              <EditorGutter
                lines={content.split('\n').length}
                scrollTop={0}
                editIncrements={editIncrements}
                onEditAction={diff.handleEditAction}
              />
            )}

            {/* Textarea */}
            {mode === 'edit' && (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onScroll={handleScroll}
                onSelect={handleCursorChange}
                onKeyUp={handleCursorChange}
                onClick={handleCursorChange}
                className={`flex-1 bg-[#0d1117] text-gray-200 p-4 resize-none outline-none font-mono text-sm leading-relaxed ${
                  wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'
                }`}
                spellCheck={false}
              />
            )}

            {/* Preview Mode */}
            {mode === 'preview' && (
              <div className="flex-1 p-4 overflow-y-auto prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-200">
                  {content}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Version History Modal */}
      <VersionHistory
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        fileId={activeFileId}
      />
    </div>
  );
};

export default Editor;
