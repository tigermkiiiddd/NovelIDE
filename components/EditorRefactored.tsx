/**
 * EditorRefactored.tsx - 重构版编辑器
 *
 * 使用 useEditor hook 的简化版编辑器组件
 * 职责：调用 hook + 渲染 UI
 *
 * 原始版本: 1905 行
 * 重构后: ~400 行
 */

import React, { useMemo, useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useEditor } from '../hooks/editor/useEditor';
import { useCharacterProfileActions } from '../hooks/useCharacterProfileActions';
import { useChapterAnalysisStore } from '../stores/chapterAnalysisStore';
import { useAgentStore } from '../stores/agentStore';
import { useProjectStore } from '../stores/projectStore';
import { getNodePath, generateId } from '../services/fileSystem';
import { AIService } from '../services/geminiService';
import { runPolishSubAgent } from '../services/subAgents/polishAgent';
import { FileNode } from '../types';
import DiffViewer from './DiffViewer';
import { ReadingLightView } from './ReadingLightView';
import { KnowledgeTreeView } from './KnowledgeTreeView';
import { CharacterProfileView } from './CharacterProfileView';
import { RelationshipManager } from './RelationshipManager';
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
  History,
  UserPlus,
  RefreshCw,
  Loader2,
  FileScan,
  Wand2,
} from 'lucide-react';

const RELATION_FILE_NAME = '人际关系.json';
const INFO_FOLDER_NAME = '00_基础信息';

interface EditorProps {
  className?: string;
}

const CHARACTER_PROFILE_PATH_PREFIX = '\u0030\u0032_\u89d2\u8272\u6863\u6848/\u89d2\u8272\u72b6\u6001\u4e0e\u8bb0\u5fc6/';
const CHARACTER_CARD_FOLDER = '\u0030\u0032_\u89d2\u8272\u6863\u6848';
const DRAFT_FOLDER = '\u0030\u0035_\u6b63\u6587\u8349\u7a3f';

const EditorRefactored: React.FC<EditorProps> = ({ className }) => {
  const editor = useEditor({ className });
  const profileActions = useCharacterProfileActions();
  const currentProjectId = useProjectStore(state => state.currentProjectId);

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

  // ==================== File Path Detection (must be before any early returns) ====================
  const filePath = useMemo(() => {
    if (!activeFile) return '';
    return getNodePath(activeFile, editor.fileStore.files).replace(/\\/g, '/');
  }, [activeFile, editor.fileStore.files]);

  // 判断是否是角色卡 Markdown 文档
  const isCharacterCard = useMemo(() => {
    if (!filePath) return false;
    return filePath.startsWith(CHARACTER_CARD_FOLDER + '/') &&
           filePath.endsWith('.md') &&
           !filePath.includes('/角色状态与记忆/');
  }, [filePath]);

  // 判断是否是正文草稿
  const isDraftFile = useMemo(() => {
    if (!filePath) return false;
    return filePath.startsWith(DRAFT_FOLDER + '/') && filePath.endsWith('.md');
  }, [filePath]);

  // 提取章节引用
  const chapterRef = useMemo(() => {
    if (!isDraftFile || !activeFile) return '';
    return activeFile.name.replace(/\.md$/i, '');
  }, [isDraftFile, activeFile]);

  // 处理初始化角色档案（如果已存在则重新初始化）
  const handleInitializeProfile = useCallback(async () => {
    if (!activeFile || !isCharacterCard) return;

    // 直接使用强制重新初始化，会自动处理已存在的情况
    const success = await profileActions.forceReinitialize(
      filePath,
      activeFile.content || ''
    );

    if (success) {
      console.log('角色档案初始化成功');
    }
  }, [activeFile, isCharacterCard, filePath, profileActions]);

  // 处理更新相关角色
  const handleUpdateCharacters = useCallback(async () => {
    if (!activeFile || !isDraftFile) return;

    const success = await profileActions.updateFromChapter(
      filePath,
      activeFile.content || '',
      chapterRef
    );

    if (success) {
      console.log('角色档案更新成功');
    }
  }, [activeFile, isDraftFile, filePath, chapterRef, profileActions]);

  // 处理手动章节分析
  const [isAnalyzingChapter, setIsAnalyzingChapter] = useState(false);
  const handleAnalyzeChapter = useCallback(async () => {
    if (!activeFile || !isDraftFile || !filePath) return;

    setIsAnalyzingChapter(true);
    try {
      const chapterAnalysisStore = useChapterAnalysisStore.getState();
      const agentStore = useAgentStore.getState();
      const projectStore = useProjectStore.getState();

      await chapterAnalysisStore.triggerExtraction(
        filePath,
        agentStore.currentSessionId || 'manual',
        projectStore.getCurrentProject()?.id || ''
      );
      console.log('章节分析完成');
    } catch (error) {
      console.error('章节分析失败:', error);
    } finally {
      setIsAnalyzingChapter(false);
    }
  }, [activeFile, isDraftFile, filePath]);

  // 处理去AI文风润色
  const [isPolishing, setIsPolishing] = useState(false);

  const handlePolish = useCallback(async () => {
    if (!activeFile || !isDraftFile || !filePath) return;

    setIsPolishing(true);
    try {
      const { aiConfig } = useAgentStore.getState();
      const aiService = new AIService(aiConfig);

      const result = await runPolishSubAgent(
        aiService,
        { targetFile: filePath, fileContent: '' },
        undefined, // context
        (msg) => {
          console.log(msg);
          useAgentStore.getState().addMessage({
            id: generateId(),
            role: 'system',
            text: `🎨 ${msg}`,
            timestamp: Date.now(),
            metadata: { logType: 'info' }
          });
        }
      );

      console.log('去AI文风润色完成:', result);
    } catch (error) {
      console.error('去AI文风润色失败:', error);
    } finally {
      setIsPolishing(false);
    }
  }, [activeFile, isDraftFile, filePath]);

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
  // 只在非 diff 模式下处理特殊文件视图
  if (activeFile && internalMode !== 'diff') {
    const filePath = getNodePath(activeFile, editor.fileStore.files).replace(/\\/g, '/');

    // 章节分析.json -> ReadingLightView
    if (filePath === '00_基础信息/章节分析.json') {
      return (
        <div className={`h-full ${className}`}>
          <ReadingLightView />
        </div>
      );
    }

    // 长期记忆.json -> KnowledgeTreeView
    if (filePath === '00_基础信息/长期记忆.json') {
      return (
        <div className={`h-full ${className}`}>
          <KnowledgeTreeView className="h-full" />
        </div>
      );
    }

    // 人际关系.json -> RelationshipManager
    if (filePath === `${INFO_FOLDER_NAME}/${RELATION_FILE_NAME}`) {
      return (
        <div className={`h-full ${className}`}>
          <RelationshipManager key={currentProjectId || 'no-project'} />
        </div>
      );
    }

    // 角色资料 JSON -> CharacterProfileView
    if (filePath.startsWith(CHARACTER_PROFILE_PATH_PREFIX) && activeFile.name.endsWith('.json')) {
      return (
        <div className={`h-full ${className}`}>
          <CharacterProfileView filePath={filePath} content={activeFile.content} />
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

          {/* Initialize Character Profile - Only for character card files */}
          {isCharacterCard && (
            <button
              onClick={handleInitializeProfile}
              disabled={profileActions.isInitializing}
              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-l border-gray-700 ml-1 text-emerald-400 hover:text-white hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
              title="初始化角色档案"
            >
              {profileActions.isInitializing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <UserPlus size={14} />
              )}
            </button>
          )}

          {/* Update Characters - Only for draft files */}
          {isDraftFile && (
            <button
              onClick={handleUpdateCharacters}
              disabled={profileActions.isUpdating}
              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-l border-gray-700 ml-1 text-amber-400 hover:text-white hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
              title="更新相关角色档案"
            >
              {profileActions.isUpdating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          )}

          {/* Analyze Chapter - Only for draft files */}
          {isDraftFile && (
            <button
              onClick={handleAnalyzeChapter}
              disabled={isAnalyzingChapter}
              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-l border-gray-700 ml-1 text-cyan-400 hover:text-white hover:bg-cyan-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
              title="分析章节"
            >
              {isAnalyzingChapter ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileScan size={14} />
              )}
            </button>
          )}

          {/* Polish (去AI文风) - Only for draft files */}
          {isDraftFile && (
            <button
              onClick={handlePolish}
              disabled={isPolishing}
              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-l border-gray-700 ml-1 text-emerald-400 hover:text-white hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
              title="去AI文风"
            >
              {isPolishing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Wand2 size={14} />
              )}
            </button>
          )}

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
        {internalMode === 'diff' && mergedPendingChange ? (
          <DiffViewer
            originalContent={(() => {
              // 对于虚拟文件（createFile 预览），使用空字符串作为原始内容
              if (activeFile?.metadata?.virtualFilePath) {
                console.log('[EditorRefactored] Virtual file detected in originalContent IIFE, returning empty string');
                return '';
              }

              // 只使用 mergedPendingChange（当前文件的 changes）
              // 不再使用 activePendingChange（可能指向其他文件）
              if (mergedPendingChange?.originalContent !== undefined && mergedPendingChange?.originalContent !== null) {
                console.log('[EditorRefactored] Using mergedPendingChange.originalContent, length:', mergedPendingChange.originalContent.length);
                // 如果有 diffSession 且文件名匹配，优先使用 sourceSnapshot
                if (diffSession?.sourceSnapshot && diffSession?.sourceFileName === activeFile?.name) {
                  console.log('[EditorRefactored] Using diffSession.sourceSnapshot instead');
                  return diffSession.sourceSnapshot;
                }
                return mergedPendingChange.originalContent;
              }

              // Fallback: 使用 activeFile.content
              if (activeFile) {
                console.log('[EditorRefactored] Fallback to activeFile.content, length:', activeFile.content?.length || 0);
                if (diffSession?.sourceSnapshot && diffSession?.sourceFileName === activeFile.name) {
                  return diffSession.sourceSnapshot;
                }
                return activeFile.content || '';
              }

              console.log('[EditorRefactored] No activeFile, returning empty string');
              return '';
            })()}
            modifiedContent={mergedPendingChange?.newContent || ''}
            computedContent={computedContent}
            pendingChange={mergedPendingChange}
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
