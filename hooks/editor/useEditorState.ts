/**
 * useEditorState - 编辑器状态管理 Hook
 *
 * 从 Editor.tsx 提取的状态管理逻辑
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFileStore } from '../../stores/fileStore';
import { useDiffStore } from '../../stores/diffStore';
import { useAgentStore } from '../../stores/agentStore';
import { useUiStore } from '../../stores/uiStore';
import { useUndoRedo } from '../useUndoRedo';
import { EditIncrement } from '../../types';
import { getNodePath } from '../../services/fileSystem';
import { mergePendingChanges } from '../../utils/patchQueue';

export type EditorMode = 'edit' | 'preview' | 'diff';

export interface EditorState {
  // 模式
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;

  // 内容
  content: string;
  setContent: (content: string) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;

  // 撤销/重做
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  resetHistory: (newPresent: string) => void;

  // 光标
  cursorStats: { line: number; col: number };
  setCursorStats: (stats: { line: number; col: number }) => void;

  // 编辑增量
  editIncrements: EditIncrement[];
  setEditIncrements: (increments: EditIncrement[]) => void;
  processedEditIds: string[];
  setProcessedEditIds: (ids: string[]) => void;

  // 滚动
  overlayScrollTop: number;
  setOverlayScrollTop: (top: number) => void;

  // refs
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  gutterRef: React.RefObject<HTMLDivElement | null>;
  highlightRef: React.RefObject<HTMLDivElement | null>;

  // 批量操作标记
  isApplyingBatchRef: React.MutableRefObject<boolean>;
  isUndoRedoRef: React.MutableRefObject<boolean>;
  computedContentFileIdRef: React.MutableRefObject<string | null>;
}

export interface UseEditorStateOptions {
  onContentChange?: (content: string) => void;
}

export const useEditorState = (options: UseEditorStateOptions = {}): EditorState => {
  const { onContentChange } = options;

  // Stores
  const fileStore = useFileStore();
  const { files, activeFileId, virtualFile } = fileStore;
  // 支持虚拟文件（用于 createFile 预览）
  const isVirtualFile = virtualFile?.id === activeFileId;
  const activeFile = files.find(f => f.id === activeFileId) || (isVirtualFile ? virtualFile : undefined);

  const diffStore = useDiffStore();
  const { loadDiffSession, saveDiffSession, clearDiffSession } = diffStore;

  const { pendingChanges, reviewingChangeId, setReviewingChangeId } = useAgentStore();

  const {
    isSplitView,
    showLineNumbers,
    wordWrap
  } = useUiStore(useShallow(state => ({
    isSplitView: state.isSplitView,
    showLineNumbers: state.showLineNumbers,
    wordWrap: state.wordWrap
  })));

  // 本地状态
  const [internalMode, setInternalMode] = useState<EditorMode>('edit');
  const [isDirty, setIsDirty] = useState(false);
  const [cursorStats, setCursorStats] = useState({ line: 1, col: 1 });
  const [editIncrements, setEditIncrements] = useState<EditIncrement[]>([]);
  const [processedEditIds, setProcessedEditIds] = useState<string[]>([]);
  const [overlayScrollTop, setOverlayScrollTop] = useState(0);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const isApplyingBatchRef = useRef(false);
  const isUndoRedoRef = useRef(false);
  const computedContentFileIdRef = useRef<string | null>(null);

  // 撤销/重做
  const {
    state: content,
    set: setContent,
    undo: originalUndo,
    redo: originalRedo,
    canUndo,
    canRedo,
    reset: resetHistory
  } = useUndoRedo<string>('', 800);

  // 包装 undo/redo 以设置标记
  const undo = useCallback(() => {
    isUndoRedoRef.current = true;
    originalUndo();
  }, [originalUndo]);

  const redo = useCallback(() => {
    isUndoRedoRef.current = true;
    originalRedo();
  }, [originalRedo]);

  // 内容变化回调
  const handleSetContent = useCallback((newContent: string) => {
    setContent(newContent);
    onContentChange?.(newContent);
  }, [setContent, onContentChange]);

  // 当 reviewingChangeId 变化时切换到 diff 模式
  useEffect(() => {
    if (reviewingChangeId && internalMode !== 'diff') {
      setInternalMode('diff');
    }
  }, [reviewingChangeId, internalMode]);

  return {
    mode: internalMode,
    setMode: setInternalMode,

    content,
    setContent: handleSetContent,
    isDirty,
    setIsDirty,

    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,

    cursorStats,
    setCursorStats,

    editIncrements,
    setEditIncrements,
    processedEditIds,
    setProcessedEditIds,

    overlayScrollTop,
    setOverlayScrollTop,

    textareaRef,
    gutterRef,
    highlightRef,

    isApplyingBatchRef,
    isUndoRedoRef,
    computedContentFileIdRef
  };
};
