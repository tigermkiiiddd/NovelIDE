/**
 * useEditor - 编辑器主 Hook
 *
 * 组合所有子 hooks，提供统一的编辑器状态管理
 * 职责：组合子 hooks + 协调
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Stores
import { useFileStore } from '../../stores/fileStore';
import { useAgentStore } from '../../stores/agentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChapterAnalysisStore } from '../../stores/chapterAnalysisStore';
import { useUiStore } from '../../stores/uiStore';
import { useDiffStore } from '../../stores/diffStore';
import { useVersionStore } from '../../stores/versionStore';

// Utils
import { getNodePath } from '../../services/fileSystem';
import { parseFrontmatter } from '../../utils/frontmatter';

// Hooks
import { useEditorSearch, type EditorSearchState } from './useEditorSearch';
import { useEditorLineHeights } from './useEditorLineHeights';
import { useEditorDiff, type EditorDiffHookResult } from './useEditorDiff';
import { useEditorSync } from './useEditorSync';
import { useUndoRedo } from '../useUndoRedo';

// Types
import { FileNode, EditIncrement } from '../../types';
import { DiffHunk } from '../../utils/diffUtils';

export type EditorMode = 'edit' | 'preview' | 'diff';

export interface UseEditorOptions {
  className?: string;
}

export interface EditorHookResult {
  // ==================== Stores ====================
  fileStore: {
    files: FileNode[];
    activeFileId: string | null;
    saveFileContent: (id: string, content: string) => void;
    createFile: (path: string, content: string) => string;
    deleteFile: (id: string) => void;
  };
  activeFile: FileNode | undefined;
  activeFileId: string | null;

  // ==================== UI Store ====================
  isSplitView: boolean;
  toggleSplitView: () => void;
  showLineNumbers: boolean;
  toggleLineNumbers: () => void;
  wordWrap: boolean;
  toggleWordWrap: () => void;

  // ==================== Mode ====================
  internalMode: EditorMode;
  setInternalMode: (mode: EditorMode) => void;

  // ==================== Content ====================
  content: string;
  setContent: (content: string) => void;
  computedContent: string;
  isDirty: boolean;

  // ==================== Undo/Redo ====================
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // ==================== Cursor ====================
  cursorStats: { line: number; col: number };
  setCursorStats: (stats: { line: number; col: number }) => void;

  // ==================== Search ====================
  search: EditorSearchState;

  // ==================== Diff ====================
  diff: EditorDiffHookResult;

  // ==================== Line Heights ====================
  lineHeights: number[];
  lines: number[];

  // ==================== Word Count & Preview ====================
  wordCount: number;
  previewMetadata: Record<string, any>;
  previewBody: string;

  // ==================== Refs ====================
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  gutterRef: React.RefObject<HTMLDivElement>;
  highlightRef: React.RefObject<HTMLDivElement>;
  overlayScrollTop: number;
  setOverlayScrollTop: (top: number) => void;

  // ==================== Mobile ====================
  isMobile: boolean;

  // ==================== Version History ====================
  showVersionHistory: boolean;
  setShowVersionHistory: (show: boolean) => void;

  // ==================== Event Handlers ====================
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  handleScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleSetMode: (mode: 'edit' | 'preview') => void;
  handleToggleSplit: () => void;
}

export const useEditor = (options: UseEditorOptions = {}): EditorHookResult => {
  // ==================== Stores ====================
  const fileStore = useFileStore();
  const { files, activeFileId, saveFileContent, createFile, deleteFile, virtualFile } = fileStore;
  // 支持虚拟文件（用于 createFile 预览）
  const isVirtualFile = virtualFile?.id === activeFileId;
  const activeFile = files.find(f => f.id === activeFileId) || (isVirtualFile ? virtualFile : undefined);

  // Debug log for virtual file
  useEffect(() => {
    console.log('[useEditor] File state:', {
      activeFileId,
      virtualFileId: virtualFile?.id,
      isVirtualFile,
      activeFileId: activeFile?.id,
      activeFileName: activeFile?.name,
      virtualFilePath: activeFile?.metadata?.virtualFilePath
    });
  }, [activeFileId, virtualFile?.id, isVirtualFile, activeFile?.id]);

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

  const versionStore = useVersionStore();

  // ==================== Local State ====================
  const [internalMode, setInternalMode] = useState<EditorMode>('edit');
  const [isDirty, setIsDirty] = useState(false);
  const [cursorStats, setCursorStats] = useState({ line: 1, col: 1 });
  const [overlayScrollTop, setOverlayScrollTop] = useState(0);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // ==================== Refs ====================
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // ==================== Undo/Redo ====================
  const {
    state: content,
    set: setContent,
    undo: originalUndo,
    redo: originalRedo,
    canUndo,
    canRedo,
    reset: resetHistory
  } = useUndoRedo<string>('', 800);

  const isUndoRedoRef = useRef(false);

  const undo = useCallback(() => {
    isUndoRedoRef.current = true;
    originalUndo();
  }, [originalUndo]);

  const redo = useCallback(() => {
    isUndoRedoRef.current = true;
    originalRedo();
  }, [originalRedo]);

  // ==================== Mobile Detection ====================
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ==================== Sub Hooks ====================
  // Wrapper for cursor stats update
  const handleCursorChange = useCallback((line: number, col: number) => {
    setCursorStats({ line, col });
  }, [setCursorStats]);

  const search = useEditorSearch({ content, cursorStats, textareaRef, onCursorChange: handleCursorChange });

  const lineHeights = useEditorLineHeights(content, wordWrap, textareaRef);

  const lines = useMemo(() => {
    if (!content) return [1];
    return new Array(content.split('\n').length).fill(0).map((_, i) => i + 1);
  }, [content]);

  const diff = useEditorDiff({
    activeFile,
    activeFileId,
    files,
    content,
    setContent,
    saveFileContent,
    setIsDirty,
    internalMode,
    setInternalMode,
    isUndoRedoRef,
    resetHistory
  });

  // ==================== Word Count & Preview ====================
  const wordCount = useMemo(() => {
    return content ? content.replace(/\s/g, '').length : 0;
  }, [content]);

  const { previewMetadata, previewBody } = useMemo(() => {
    if (internalMode !== 'preview' && !isSplitView) return { previewMetadata: {}, previewBody: '' };

    const meta = parseFrontmatter(content);
    const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const body = content.replace(frontMatterRegex, '');

    return { previewMetadata: meta, previewBody: body };
  }, [content, internalMode, isSplitView]);

  // ==================== Version History Load ====================
  useEffect(() => {
    const currentProject = useProjectStore.getState().getCurrentProject();
    if (currentProject?.id) {
      versionStore.loadVersions(currentProject.id);
    }
  }, []);

  // ==================== Dirty state cleanup ====================
  useEffect(() => {
    if (isDirty) {
      const timer = setTimeout(() => setIsDirty(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isDirty]);

  // ==================== Event Handlers ====================
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setContent(newText);
    setIsDirty(true);
    if (activeFile) {
      saveFileContent(activeFile.id, newText);
    }
    // Update cursor stats
    const val = e.target.value;
    const sel = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, sel);
    const lineCount = textBeforeCursor.split('\n').length;
    const lastNewLinePos = textBeforeCursor.lastIndexOf('\n');
    const colCount = sel - lastNewLinePos;
    setCursorStats({ line: lineCount, col: colCount });
  }, [setContent, activeFile, saveFileContent]);

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const val = target.value;
    const sel = target.selectionStart;
    const textBeforeCursor = val.slice(0, sel);
    const lineCount = textBeforeCursor.split('\n').length;
    const lastNewLinePos = textBeforeCursor.lastIndexOf('\n');
    const colCount = sel - lastNewLinePos;
    setCursorStats({ line: lineCount, col: colCount });
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    setOverlayScrollTop(e.currentTarget.scrollTop);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;

    // Diff mode undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && diff.diffSession) {
      e.preventDefault();
      diff.setDiffSession(prev => {
        if (!prev || prev.patchQueue.length === 0) return prev;
        const newQueue = prev.patchQueue.slice(0, -1);
        return { ...prev, patchQueue: newQueue };
      });
      return;
    }

    // Normal undo/redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !diff.diffSession) {
      e.preventDefault();
      if (e.shiftKey) { if (canRedo) redo(); }
      else { if (canUndo) undo(); }
      return;
    }

    // Tab handling
    if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);
      setContent(newVal);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
      return;
    }

    // Enter handling for lists
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
          if (activeFile) saveFileContent(activeFile.id, newVal);
          setTimeout(() => {
            if (textareaRef.current) textareaRef.current.selectionStart = textareaRef.current.selectionEnd = lineStartPos;
          }, 0);
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
          if (activeFile) saveFileContent(activeFile.id, newVal);
          setTimeout(() => {
            if (textareaRef.current) textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + insertion.length;
          }, 0);
        }
      }
    }
  }, [diff.diffSession, canRedo, canUndo, undo, redo, setContent, activeFile, saveFileContent]);

  const handleSetMode = useCallback((mode: 'edit' | 'preview') => {
    setInternalMode(mode);
    if (isSplitView) toggleSplitView();
  }, [isSplitView, toggleSplitView]);

  const handleToggleSplit = useCallback(() => {
    toggleSplitView();
    if (!isSplitView) setInternalMode('edit');
  }, [toggleSplitView, isSplitView]);

  // ==================== Sync computed content ====================
  // 使用 ref 防止无限循环
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    // 只在 diff 模式下，且 computedContent 确实不同时才同步
    if (diff.diffSession && diff.computedContent && diff.computedContent !== content) {
      // 防止首次渲染时的同步
      if (hasSyncedRef.current) {
        setContent(diff.computedContent);
      } else {
        hasSyncedRef.current = true;
      }
    }
    if (!diff.diffSession) {
      hasSyncedRef.current = false;
    }
  }, [diff.diffSession, diff.computedContent]);

  return {
    // Stores
    fileStore,
    activeFile,
    activeFileId,

    // UI Store
    isSplitView,
    toggleSplitView,
    showLineNumbers,
    toggleLineNumbers,
    wordWrap,
    toggleWordWrap,

    // Mode
    internalMode,
    setInternalMode,

    // Content
    content,
    setContent,
    computedContent: diff.computedContent,
    isDirty,

    // Undo/Redo
    canUndo,
    canRedo,
    undo,
    redo,

    // Cursor
    cursorStats,
    setCursorStats,

    // Search
    search,

    // Diff
    diff,

    // Line heights
    lineHeights,
    lines,

    // Word count & preview
    wordCount,
    previewMetadata,
    previewBody,

    // Refs
    textareaRef,
    gutterRef,
    highlightRef,
    overlayScrollTop,
    setOverlayScrollTop,

    // Mobile
    isMobile,

    // Version History
    showVersionHistory,
    setShowVersionHistory,

    // Handlers
    handleChange,
    handleSelect,
    handleScroll,
    handleKeyDown,
    handleSetMode,
    handleToggleSplit
  };
};
