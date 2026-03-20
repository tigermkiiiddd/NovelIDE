/**
 * useEditorSync - 编辑器文件同步 Hook
 *
 * 从 Editor.tsx 提取的文件同步逻辑
 * 负责编辑器内容与文件系统之间的同步
 */

import { useEffect, useCallback, useRef } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useDiffStore } from '../../stores/diffStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVersionStore } from '../../stores/versionStore';
import { parseFrontmatter } from '../../utils/frontmatter';
import { getNodePath } from '../../services/fileSystem';

export interface UseEditorSyncOptions {
  // 内容状态
  content: string;
  setContent: (content: string) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  resetHistory: () => void;

  // 文件信息
  activeFileId: string | null;

  // 控制标记
  isApplyingBatchRef: React.MutableRefObject<boolean>;
  isUndoRedoRef: React.MutableRefObject<boolean>;
  computedContentFileIdRef: React.MutableRefObject<string | null>;

  // 回调
  onFileLoaded?: (file: { id: string; name: string; content: string }) => void;
  onFileSaved?: (fileId: string) => void;
}

export interface EditorSyncActions {
  // 保存文件
  saveCurrentFile: () => void;

  // 重新加载文件
  reloadCurrentFile: () => void;
}

export const useEditorSync = (options: UseEditorSyncOptions): EditorSyncActions => {
  const {
    content,
    setContent,
    isDirty,
    setIsDirty,
    resetHistory,
    activeFileId,
    isApplyingBatchRef,
    isUndoRedoRef,
    computedContentFileIdRef,
    onFileLoaded,
    onFileSaved
  } = options;

  const fileStore = useFileStore();
  const { files, saveFileContent } = fileStore;

  const diffStore = useDiffStore();
  const { loadDiffSession, clearDiffSession } = diffStore;

  const projectStore = useProjectStore();
  const currentProject = projectStore.getCurrentProject();

  const versionStore = useVersionStore();

  // 跟踪上一个文件 ID
  const prevFileIdRef = useRef<string | null>(null);

  // 获取当前文件
  const activeFile = files.find(f => f.id === activeFileId);

  // 当活动文件变化时，加载内容
  useEffect(() => {
    // 避免批量操作期间切换
    if (isApplyingBatchRef.current) return;

    // 文件 ID 变化
    if (activeFileId !== prevFileIdRef.current) {
      prevFileIdRef.current = activeFileId;

      if (activeFile) {
        // 加载文件内容
        const fileContent = activeFile.content || '';
        setContent(fileContent);
        setIsDirty(false);
        resetHistory();

        // 更新计算内容文件 ID
        computedContentFileIdRef.current = activeFileId;

        // 加载 diff session
        loadDiffSession(activeFileId);

        // 回调
        onFileLoaded?.({
          id: activeFile.id,
          name: activeFile.name,
          content: fileContent
        });

        console.log('[useEditorSync] Loaded file:', activeFile.name);
      } else {
        // 没有活动文件
        setContent('');
        setIsDirty(false);
        resetHistory();
        computedContentFileIdRef.current = null;
      }
    }
  }, [activeFileId, activeFile, setContent, setIsDirty, resetHistory, loadDiffSession, isApplyingBatchRef, computedContentFileIdRef, onFileLoaded]);

  // 当外部文件内容变化时同步（非撤销/重做）
  useEffect(() => {
    // 跳过条件
    if (!activeFile) return;
    if (isApplyingBatchRef.current) return;
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    if (activeFileId !== computedContentFileIdRef.current) return;

    const fileContent = activeFile.content || '';

    // 只在外部内容与当前内容不同时同步
    if (fileContent !== content) {
      // 检查是否是同一个文件的内容更新
      const isSameFile = activeFile.id === activeFileId;
      if (isSameFile && !isDirty) {
        setContent(fileContent);
        console.log('[useEditorSync] Synced content from external change');
      }
    }
  }, [activeFile?.content, activeFile?.id, activeFileId, content, isDirty, setContent, isApplyingBatchRef, isUndoRedoRef, computedContentFileIdRef]);

  // 保存当前文件
  const saveCurrentFile = useCallback(() => {
    if (!activeFileId || !activeFile) return;

    // 检查是否是正确的文件
    if (activeFileId !== computedContentFileIdRef.current) {
      console.warn('[useEditorSync] File ID mismatch, skipping save');
      return;
    }

    // 保存文件
    saveFileContent(activeFileId, content);
    setIsDirty(false);

    // 清除 diff session
    clearDiffSession(activeFileId);

    // 回调
    onFileSaved?.(activeFileId);

    console.log('[useEditorSync] Saved file:', activeFile.name);
  }, [activeFileId, activeFile, content, saveFileContent, setIsDirty, clearDiffSession, computedContentFileIdRef, onFileSaved]);

  // 重新加载当前文件
  const reloadCurrentFile = useCallback(() => {
    if (!activeFile) return;

    const fileContent = activeFile.content || '';
    setContent(fileContent);
    setIsDirty(false);
    resetHistory();
    computedContentFileIdRef.current = activeFileId;

    console.log('[useEditorSync] Reloaded file:', activeFile.name);
  }, [activeFile, activeFileId, setContent, setIsDirty, resetHistory, computedContentFileIdRef]);

  // 自动保存（防抖）
  useEffect(() => {
    if (!isDirty || !activeFileId) return;

    const timer = setTimeout(() => {
      saveCurrentFile();
    }, 2000); // 2秒后自动保存

    return () => clearTimeout(timer);
  }, [isDirty, content, activeFileId, saveCurrentFile]);

  // 快捷键: Ctrl+S 保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentFile]);

  // 加载版本历史
  useEffect(() => {
    if (currentProject?.id) {
      versionStore.loadVersions(currentProject.id);
    }
  }, [currentProject?.id]);

  return {
    saveCurrentFile,
    reloadCurrentFile
  };
};
