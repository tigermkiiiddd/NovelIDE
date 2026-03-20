/**
 * EditorRefactored.tsx - 重构版编辑器
 *
 * 使用 useEditor hook 的简化版编辑器组件
 * 职责：调用 hook + 渲染 UI
 *
 * 原始版本: 1905 行
 * 重构后: ~400 行
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useEditor } from '../hooks/editor/useEditor';
import { getNodePath } from '../services/fileSystem';
import { FileNode } from '../types';
import DiffViewer from './DiffViewer';
import { ReadingLightView } from './ReadingLightView';
import { JsonViewer } from './JsonViewer';
import { LongTermMemoryView } from './LongTermMemoryView';
import { CharacterProfileView } from './CharacterProfileView';
import EditHighlightOverlay from './editor/EditHighlightOverlay';
import VersionHistory from './VersionHistory';
import {
  FileText,
  Edit3,
  Eye,
  Columns,
  WrapText,
  AlignJustify,
  ListOrdered,
  RotateCcw,
  RotateCw,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Tag,
  BookOpen,
  Check,
  History
} from 'lucide-react';

interface EditorProps {
  className?: string;
}

const CHARACTER_PROFILE_PATH_PREFIX = '\u0030\u0032_\u89d2\u8272\u6863\u6848/\u89d2\u8272\u72b6\u6001\u4e0e\u8bb0\u5fc6/';

const EditorRefactored: React.FC<EditorProps> = ({ className }) => {
  const editor = useEditor({ className });

  const {
    activeFile,
    activeFileId,
    isSplitView,
    toggleSplitView,
    showLineNumbers,
    toggleLineNumbers,
    wordWrap,
    toggleWordWrap,
    internalMode,
    setInternalMode,
    content,
    computedContent,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    cursorStats,
    wordCount,
    previewMetadata,
    previewBody,
    textareaRef,
    gutterRef,
    highlightRef,
    overlayScrollTop,
    isMobile,
    showVersionHistory,
    setShowVersionHistory,
    search,
    diff,
    lineHeights,
    lines,
    handleChange,
    handleSelect,
    handleScroll,
    handleKeyDown,
    handleSetMode,
    handleToggleSplit
  } = editor;

  // Extract diff properties
  const {
    diffSession,
    mergedPendingChange,
    activePendingChange,
    activeEditDiffs,
    pendingEditCount,
    editIncrements,
    processedEditIds,
    processedHunkIds,
    handleAcceptHunk,
    handleRejectHunk,
    handleAcceptAll,
    handleRejectAll,
    handleDismiss,
    handleEditAction,
    handleAcceptAllEdits,
    handleRejectAllEdits
  } = diff;

  // ==================== Search Highlight ====================
  const highlightedContent = useMemo(() => {
    if (!search.searchOpen || !search.searchTerm || search.searchResults.length === 0) {
      return null;
    }

    const result: React.ReactNode[] = [];
    let lastIndex = 0;

    search.searchResults.forEach((match, idx) => {
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        result.push(<span key={`text-${idx}`}>{textBefore}</span>);
      }

      const matchText = content.slice(match.index, match.index + match.length);
      const isCurrentMatch = idx === search.currentMatchIndex;
      result.push(
        <mark
          key={`match-${idx}`}
          className={`${isCurrentMatch ? 'bg-yellow-400 text-gray-900' : 'bg-yellow-600/30'} rounded-sm`}
        >
          {matchText}
        </mark>
      );

      lastIndex = match.index + match.length;
    });

    if (lastIndex < content.length) {
      result.push(<span key="text-end">{content.slice(lastIndex)}</span>);
    }

    return result;
  }, [search.searchOpen, search.searchTerm, search.searchResults, search.currentMatchIndex, content]);

  // ==================== Render Editor ====================
  const renderEditor = () => (
    <div className="flex h-full w-full relative overflow-hidden">
      {/* Gutter */}
      {showLineNumbers && (
        <div
          ref={gutterRef}
          className="shrink-0 w-10 sm:w-12 bg-[#0d1117] border-r border-gray-800 text-right pr-2 pt-4 sm:pt-6 text-gray-600 select-none overflow-hidden font-mono text-sm sm:text-base"
          aria-hidden="true"
        >
          {lines.map((ln, index) => {
            const height = wordWrap && lineHeights[index] ? lineHeights[index] : undefined;
            return (
              <div
                key={ln}
                style={height ? { height: `${height}px`, lineHeight: `${height}px` } : {}}
                className={wordWrap ? 'leading-none' : 'leading-relaxed'}
              >
                {ln}
              </div>
            );
          })}
          <div className="h-20" />
        </div>
      )}

      {/* Search Highlight Layer */}
      {highlightedContent && (
        <div
          ref={highlightRef}
          className={`
            absolute inset-0 pointer-events-none overflow-hidden
            font-mono text-sm sm:text-base leading-relaxed
            pt-4 sm:pt-6 pb-20
            ${showLineNumbers ? 'pl-2' : 'pl-4 sm:pl-6'}
            ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre'}
            text-transparent
          `}
          aria-hidden="true"
        >
          {highlightedContent}
        </div>
      )}

      {/* Edit Mode Diff Highlight Overlay */}
      {internalMode === 'edit' && activeEditDiffs.length > 0 && pendingEditCount > 0 && (
        <EditHighlightOverlay
          editDiffs={activeEditDiffs}
          increments={editIncrements}
          processedEditIds={processedEditIds}
          onEditClick={handleEditAction}
          lineHeights={lineHeights}
          scrollTop={overlayScrollTop}
          paddingTop={24}
          defaultLineHeight={24}
          showLineNumbers={showLineNumbers}
        />
      )}

      <textarea
        ref={textareaRef}
        className={`
          flex-1 h-full w-full bg-[#0d1117] text-gray-300 resize-none focus:outline-none
          font-mono text-sm sm:text-base leading-relaxed
          pt-4 sm:pt-6 pb-20
          ${showLineNumbers ? 'pl-2' : 'pl-4 sm:pl-6'}
          ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}
          ${highlightedContent ? 'caret-gray-300' : ''}
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

  // ==================== Render Preview ====================
  const renderPreview = () => (
    <div className="w-full h-full p-6 sm:p-8 bg-[#0d1117] overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        {/* Metadata Visualization Panel */}
        {(previewMetadata.tags || previewMetadata.summarys) && (
          <div className="mb-8 p-6 bg-gray-800/40 rounded-xl border border-gray-700/50 backdrop-blur-sm">
            {previewMetadata.tags && previewMetadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {previewMetadata.tags.map((tag: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 text-xs font-medium text-blue-200 bg-blue-900/30 border border-blue-800/50 rounded-full flex items-center gap-1.5">
                    <Tag size={10} /> {tag}
                  </span>
                ))}
              </div>
            )}
            {previewMetadata.summarys && previewMetadata.summarys.length > 0 && (
              <div className="space-y-2">
                {previewMetadata.summarys.map((sum: string, i: number) => (
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

  // ==================== Special File Views ====================
  if (activeFile) {
    const filePath = getNodePath(activeFile, editor.fileStore.files).replace(/\\/g, '/');

    // 章节分析.json -> ReadingLightView
    if (filePath === '00_基础信息/章节分析.json') {
      return (
        <div className={`h-full ${className}`}>
          <ReadingLightView />
        </div>
      );
    }

    // 长期记忆.json -> LongTermMemoryView
    if (filePath === '00_基础信息/长期记忆.json') {
      return (
        <div className={`h-full ${className}`}>
          <LongTermMemoryView />
        </div>
      );
    }

    // 其他 JSON 文件 -> JsonViewer
    if (filePath.startsWith(CHARACTER_PROFILE_PATH_PREFIX) && activeFile.name.endsWith('.json')) {
      return (
        <div className={`h-full ${className}`}>
          <CharacterProfileView filePath={filePath} content={activeFile.content} />
        </div>
      );
    }

    if (activeFile.name.endsWith('.json') && activeFile.content) {
      return (
        <div className={`h-full ${className}`}>
          <JsonViewer content={activeFile.content} />
        </div>
      );
    }
  }

  // Empty state
  if (!activeFile && internalMode !== 'diff') {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-gray-500 bg-[#0d1117] ${className}`}>
        <FileText size={48} className="mb-4 opacity-20" />
        <p className="text-sm">选择一个文件开始写作</p>
      </div>
    );
  }

  // ==================== Main Render ====================
  return (
    <div className={`flex flex-col h-full bg-[#0d1117] ${className}`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-2 sm:px-4 py-2 border-b shrink-0 transition-colors ${
        internalMode === 'diff' ? 'hidden' : 'bg-[#161b22] border-gray-800'
      }`}>
        {/* File Info */}
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <FileText size={14} className="text-blue-400 shrink-0" />
          <span className="truncate font-mono text-xs sm:text-sm text-gray-200">
            {activeFile?.name || 'Untitled'}
          </span>
          {isDirty && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" title="Unsaved changes" />}
          <span className="text-[10px] text-gray-500 font-mono hidden sm:inline">
            {wordCount} 字
          </span>
          <span className="text-[10px] text-gray-600 font-mono hidden md:inline">
            Ln {cursorStats.line}, Col {cursorStats.col}
          </span>
        </div>

        {/* Pending Edits Indicator */}
        {internalMode === 'edit' && pendingEditCount > 0 && (
          <div className="flex items-center gap-1 mx-2 px-2 py-1 bg-yellow-900/20 border border-yellow-900/40 rounded-lg">
            <span className="text-[10px] text-yellow-400 font-medium whitespace-nowrap">
              {pendingEditCount} 个待审变更
            </span>
            <button
              onClick={handleRejectAllEdits}
              className="flex items-center justify-center w-6 h-5 text-[10px] text-red-400 hover:bg-red-900/30 rounded transition-colors"
              title="拒绝全部"
            >
              <X size={12} />
            </button>
            <button
              onClick={handleAcceptAllEdits}
              className="flex items-center justify-center w-6 h-5 text-[10px] text-green-400 hover:bg-green-900/30 rounded transition-colors"
              title="批准全部"
            >
              <Check size={12} />
            </button>
          </div>
        )}

        {/* Toolbar Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50 shrink-0">
          {/* Search */}
          <button
            onClick={search.toggleSearch}
            className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-r border-gray-700 mr-0.5 sm:mr-1 ${
              search.searchOpen ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="搜索 (Ctrl+F)"
          >
            <Search size={14} />
          </button>

          {/* View Settings */}
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

          <button onClick={undo} disabled={!canUndo} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all ${canUndo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'}`} title="Undo (Ctrl+Z)">
            <RotateCcw size={14} />
          </button>
          <button onClick={redo} disabled={!canRedo} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-r border-gray-700 mr-0.5 sm:mr-1 ${canRedo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'}`} title="Redo (Ctrl+Shift+Z)">
            <RotateCw size={14} />
          </button>

          <button onClick={() => handleSetMode('edit')} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all ${internalMode === 'edit' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title="Edit Mode">
            <Edit3 size={14} />
          </button>
          <button onClick={() => handleSetMode('preview')} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all ${internalMode === 'preview' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title="Preview Mode">
            <Eye size={14} />
          </button>

          {/* Split View */}
          <button onClick={handleToggleSplit} className={`hidden sm:flex items-center justify-center w-8 h-7 rounded transition-all border-l border-gray-700 ml-1 ${isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title={isSplitView ? "关闭分屏" : "开启分屏对比"}>
            <Columns size={14} />
          </button>

          {/* Version History */}
          <button
            onClick={() => setShowVersionHistory(true)}
            disabled={!activeFileId}
            className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-l border-gray-700 ml-1 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="版本历史"
          >
            <History size={14} />
          </button>
        </div>
      </div>

      {/* Search Panel */}
      {search.searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 animate-in slide-in-from-top-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={search.searchTerm}
              onChange={(e) => search.setSearchTerm(e.target.value)}
              placeholder="搜索..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.shiftKey ? search.searchPrev() : search.searchNext();
                } else if (e.key === 'Escape') {
                  search.setSearchOpen(false);
                }
              }}
            />
            {search.searchTerm && (
              <button
                onClick={() => search.setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={search.searchPrev}
              disabled={!search.searchTerm || search.searchResults.length === 0}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="上一个 (Shift+Enter)"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={search.searchNext}
              disabled={!search.searchTerm || search.searchResults.length === 0}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="下一个 (Enter)"
            >
              <ChevronDown size={16} />
            </button>

            {search.searchResults.length > 0 && (
              <span className="text-xs text-gray-400 min-w-[60px] text-center">
                {search.currentMatchIndex + 1} / {search.searchResults.length}
              </span>
            )}
          </div>

          <button
            onClick={search.toggleCaseSensitive}
            className={`px-2 py-1.5 text-xs rounded border transition-colors ${
              search.searchCaseSensitive
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
            title="区分大小写"
          >
            Aa
          </button>

          <button
            onClick={search.toggleSearch}
            className="p-1.5 text-gray-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative bg-[#0d1117]">
        {internalMode === 'diff' && (mergedPendingChange || activePendingChange) ? (
          <DiffViewer
            originalContent={(() => {
              const targetChange = mergedPendingChange || activePendingChange;

              if (activeFile && diffSession?.sourceSnapshot) {
                if (diffSession.sourceFileName === activeFile.name) {
                  return diffSession.sourceSnapshot;
                } else {
                  return activeFile.content || '';
                }
              } else if (activeFile) {
                return activeFile.content || '';
              } else {
                return targetChange?.originalContent || '';
              }
            })()}
            modifiedContent={(mergedPendingChange || activePendingChange)?.newContent || ''}
            computedContent={computedContent}
            pendingChange={mergedPendingChange || activePendingChange!}
            processedHunkIds={processedHunkIds}
            onAcceptHunk={handleAcceptHunk}
            onRejectHunk={handleRejectHunk}
            onAcceptAll={handleAcceptAll}
            onRejectAll={handleRejectAll}
            onDismiss={handleDismiss}
          />
        ) : (
          <div className={`h-full relative ${isSplitView && !isMobile ? 'flex' : 'flex'}`}>
            {(internalMode === 'edit' || (isSplitView && !isMobile)) && (
              <div className={`${
                isSplitView && !isMobile
                  ? 'w-1/2 border-r border-gray-800 h-full'
                  : 'w-full h-full'
              } transition-all`}>
                {renderEditor()}
              </div>
            )}
            {(internalMode === 'preview' || (isSplitView && !isMobile)) && (
              <div className={`${
                isSplitView && !isMobile
                  ? 'w-1/2 h-full'
                  : 'w-full h-full'
              } transition-all`}>
                {renderPreview()}
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

export default EditorRefactored;
