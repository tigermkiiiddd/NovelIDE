/**
 * useEditorDiff - 编辑器 Diff 模式 Hook
 *
 * 封装所有与 Diff 相关的逻辑：
 * - Diff 会话管理
 * - Pending Changes 处理
 * - Patch Queue
 * - 编辑增量计算
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useFileStore } from '../../stores/fileStore';
import { useDiffStore } from '../../stores/diffStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChapterAnalysisStore } from '../../stores/chapterAnalysisStore';
import { useKnowledgeGraphStore } from '../../stores/knowledgeGraphStore';
import { getNodePath, findNodeByPath } from '../../services/fileSystem';
import { applyPatchQueue, mergePendingChanges, generatePatchId, extractHunkContent, areAllHunksProcessed } from '../../utils/patchQueue';
import { computeLineDiff, groupDiffIntoHunks, DiffHunk } from '../../utils/diffUtils';
import { rebuildEditLineNumbers, computeLineDelta, detectEditedRegion } from '../../utils/editIncrement';
import { FileNode, PendingChange, DiffSessionState, FilePatch, EditDiff, EditIncrement } from '../../types';

export type EditorMode = 'edit' | 'preview' | 'diff';

export interface UseEditorDiffOptions {
  activeFile: FileNode | undefined;
  activeFileId: string | null;
  files: FileNode[];
  content: string;
  setContent: (content: string) => void;
  saveFileContent: (id: string, content: string) => void;
  setIsDirty: (dirty: boolean) => void;
  internalMode: EditorMode;
  setInternalMode: (mode: EditorMode) => void;
  isUndoRedoRef: React.MutableRefObject<boolean>;
  resetHistory: (newPresent: string) => void;
}

export interface EditorDiffHookResult {
  // ==================== State ====================
  diffSession: DiffSessionState | null;
  setDiffSession: React.Dispatch<React.SetStateAction<DiffSessionState | null>>;
  mergedPendingChange: PendingChange | null;
  activePendingChange: PendingChange | null;
  activeEditDiffs: EditDiff[];
  pendingEditCount: number;
  editIncrements: EditIncrement[];
  setEditIncrements: (increments: EditIncrement[]) => void;
  processedEditIds: string[];
  setProcessedEditIds: (ids: string[]) => void;
  processedHunkIds: string[];
  computedContent: string;

  // ==================== Handlers ====================
  handleAcceptHunk: (hunk: DiffHunk) => void;
  handleRejectHunk: (hunk: DiffHunk) => void;
  handleAcceptAll: () => Promise<void>;
  handleRejectAll: () => void;
  handleDismiss: () => void;
  handleEditAction: (editId: string, action: 'accept' | 'reject') => void;
  handleAcceptAllEdits: () => void;
  handleRejectAllEdits: () => void;
}

export const useEditorDiff = (options: UseEditorDiffOptions): EditorDiffHookResult => {
  const {
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
  } = options;

  // ==================== Stores ====================
  const {
    pendingChanges,
    updatePendingChange,
    removePendingChange,
    addMessage,
    reviewingChangeId,
    setReviewingChangeId
  } = useAgentStore();

  const diffStore = useDiffStore();
  const { loadDiffSession, saveDiffSession: saveToStore, clearDiffSession } = diffStore;

  // ==================== Local State ====================
  const [diffSession, setDiffSession] = useState<DiffSessionState | null>(null);
  const [editIncrements, setEditIncrements] = useState<EditIncrement[]>([]);
  const [processedEditIds, setProcessedEditIds] = useState<string[]>([]);

  // ==================== Refs ====================
  const isApplyingBatchRef = useRef(false);
  const completionMessageSentRef = useRef<string | null>(null);
  const computedContentFileIdRef = useRef<string | null>(null);
  const prevFileIdRef = useRef<string | null>(null);

  // ==================== Pending Changes ====================
  const activePendingChange = useMemo(() => {
    if (reviewingChangeId) {
      return pendingChanges.find(c => c.id === reviewingChangeId) || null;
    }
    return null;
  }, [reviewingChangeId, pendingChanges]);

  const mergedPendingChange = useMemo(() => {
    if (!activeFile) {
      return null;
    }

    // 对于虚拟文件，使用 metadata.virtualFilePath 匹配
    const filePath = activeFile.metadata?.virtualFilePath || getNodePath(activeFile, files);
    const fileChanges = pendingChanges.filter(c => c.fileName === filePath);

    if (fileChanges.length === 0) return null;

    // 对于虚拟文件（createFile 预览），originalContent 应该为空
    // 因为虚拟文件代表一个新文件，没有原始内容
    const isVirtualFile = !!activeFile.metadata?.virtualFilePath;
    const baseContent = isVirtualFile ? '' : (activeFile?.content || '');

    // 检查是否有 createFile 类型的变更
    // 对于 createFile，应该使用 pendingChange 自己的 originalContent（空字符串）
    // 而不是 activeFile.content（已创建文件的内容）
    const hasCreateFile = fileChanges.some(c => c.toolName === 'createFile');
    // 如果有 createFile，使用第一个 createFile 的 originalContent（应该是空字符串）
    const originalContent = hasCreateFile
      ? (fileChanges.find(c => c.toolName === 'createFile')?.originalContent ?? '')
      : baseContent;

    console.log('[useEditorDiff] originalContent calculation:', {
      isVirtualFile,
      hasCreateFile,
      baseContentLength: baseContent.length,
      originalContentLength: originalContent.length,
      willUseEmptyOriginal: hasCreateFile || isVirtualFile
    });

    const finalContent = mergePendingChanges(
      baseContent,
      fileChanges.map(c => ({
        toolName: c.toolName,
        newContent: c.newContent,
        args: c.args,
        timestamp: c.timestamp
      }))
    );

    return {
      id: 'merged',
      fileName: filePath,
      originalContent: originalContent,
      newContent: finalContent,
      toolName: 'merged' as const,
      args: {},
      timestamp: Date.now(),
      description: `${fileChanges.length}个待审变更`,
      metadata: { sourceChanges: fileChanges }
    };
  }, [activeFile?.id, activeFile?.content, activeFile?.metadata?.virtualFilePath, pendingChanges]);

  const activeEditDiffs = useMemo(() => {
    if (!activeFile) return [];

    // 对于虚拟文件，使用 metadata.virtualFilePath 匹配
    const filePath = activeFile.metadata?.virtualFilePath || getNodePath(activeFile, files);
    const fileChanges = pendingChanges.filter(c => c.fileName === filePath);

    const allEdits: EditDiff[] = [];
    for (const change of fileChanges) {
      if (change.editDiffs) {
        allEdits.push(...change.editDiffs);
      }
    }

    return allEdits;
  }, [activeFile?.id, activeFile?.content, activeFile?.metadata?.virtualFilePath, pendingChanges]);

  const pendingEditCount = useMemo(() => {
    return activeEditDiffs.filter(edit =>
      edit.status === 'pending' && !processedEditIds.includes(edit.id)
    ).length;
  }, [activeEditDiffs, processedEditIds]);

  const processedHunkIds = useMemo(() => {
    if (!diffSession) return [];
    return diffSession.patchQueue.map(p => p.hunkId);
  }, [diffSession]);

  // ==================== Computed Content ====================
  const computedContent = useMemo(() => {
    if (!diffSession) {
      if (computedContentFileIdRef.current &&
          computedContentFileIdRef.current !== activeFileId) {
        return '';
      }
      return content;
    }
    computedContentFileIdRef.current = activeFileId;
    return applyPatchQueue(diffSession);
  }, [diffSession, diffSession?.patchQueue?.length, activeFileId, content]);

  // ==================== File Sync Effect ====================
  useEffect(() => {
    if (activeFileId !== prevFileIdRef.current) {
      computedContentFileIdRef.current = null;
      setEditIncrements([]);
      setProcessedEditIds([]);

      if (diffSession) {
        setDiffSession(null);
      }

      if (prevFileIdRef.current) {
        clearDiffSession(prevFileIdRef.current);
      }

      if (prevFileIdRef.current && reviewingChangeId) {
        const reviewingChange = pendingChanges.find(c => c.id === reviewingChangeId);
        if (reviewingChange) {
          const belongsToPrevFile = reviewingChange.fileId
            ? reviewingChange.fileId === prevFileIdRef.current
            : (() => {
              const prevFile = files.find(f => f.id === prevFileIdRef.current);
              return prevFile && reviewingChange.fileName === getNodePath(prevFile, files);
            })();

          if (belongsToPrevFile) {
            setReviewingChangeId(null);
          }
        }
      }

      if (internalMode === 'diff') {
        setInternalMode('edit');
      }

      if (activeFile) {
        resetHistory(activeFile.content || '');
      } else {
        resetHistory('');
      }
      prevFileIdRef.current = activeFileId;
    }
    else if (activeFile && activeFile.content !== content && !isApplyingBatchRef.current && internalMode !== 'diff') {
      if (isUndoRedoRef.current) {
        isUndoRedoRef.current = false;
      } else {
        setContent(activeFile.content || '');
      }
    }
  }, [activeFileId, activeFile, content, resetHistory, setContent, diffSession, clearDiffSession, pendingChanges, reviewingChangeId, setReviewingChangeId, files, internalMode]);

  // ==================== Diff Session Management ====================
  useEffect(() => {
    if (internalMode !== 'diff' && diffSession) {
      setDiffSession(null);
      if (activeFile) {
        clearDiffSession(activeFile.id);
      }
      return;
    }

    const initializeSession = async () => {
      if (!activeFile) return;

      const restoredSession = await loadDiffSession(activeFile.id);

      if (internalMode === 'diff' && !diffSession) {
        const isValidSession = !restoredSession ||
          !restoredSession.sourceFileName ||
          restoredSession.sourceFileName === activeFile.name;

        if (!isValidSession) {
          await saveToStore(activeFile.id, null);
        }

        const sourceContent = activeFile.content || '';
        setDiffSession({
          sourceSnapshot: sourceContent,
          sourceFileName: activeFile.name,
          patchQueue: isValidSession && restoredSession ? restoredSession.patchQueue : []
        });
      }
    };

    initializeSession();
  }, [internalMode, activeFile?.id, loadDiffSession, clearDiffSession, saveToStore, diffSession]);

  // Save diff session
  useEffect(() => {
    if (!activeFile) return;

    const saveSession = async () => {
      if (diffSession) {
        const sessionFileMatches = !diffSession.sourceFileName ||
          diffSession.sourceFileName === activeFile.name;
        if (!sessionFileMatches) return;
        await saveToStore(activeFile.id, diffSession);
      } else {
        await saveToStore(activeFile.id, null);
      }
    };

    saveSession();
  }, [diffSession, activeFile?.id, saveToStore]);

  // ==================== Auto Save ====================
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentExtractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const shouldAutoSave = !diffSession &&
      internalMode === 'edit' &&
      activeFile &&
      computedContent &&
      computedContentFileIdRef.current === activeFile.id;

    if (shouldAutoSave) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        saveFileContent(activeFile.id, computedContent);
        const filePath = getNodePath(activeFile, files);

        if (documentExtractionTimeoutRef.current) {
          clearTimeout(documentExtractionTimeoutRef.current);
        }

        documentExtractionTimeoutRef.current = setTimeout(() => {
          // 正文文件由章节分析处理，不进入知识图谱
          const { autoExtraction } = useAgentStore.getState().aiConfig;
          if (!filePath.startsWith('05_正文草稿/') && autoExtraction?.document !== false) {
            useKnowledgeGraphStore
              .getState()
              .triggerDocumentExtraction(filePath, computedContent)
              .then((result) => {
                if (!result || result.added + result.updated + result.linked === 0) return;

                addMessage({
                  id: Math.random().toString(),
                  role: 'system',
                  text: `🧠 已从文档提取知识：新增 ${result.added} 条，更新 ${result.updated} 条，关联 ${result.linked} 条`,
                  timestamp: Date.now(),
                  metadata: { logType: 'success', extractionSummary: result.summary, filePath }
                });
              })
              .catch((error: Error) => {
                console.error('[DocumentMemory] auto extraction failed', error);
              });
          }
        }, 1500);

        autoSaveTimeoutRef.current = null;
      }, 300);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      if (documentExtractionTimeoutRef.current) {
        clearTimeout(documentExtractionTimeoutRef.current);
        documentExtractionTimeoutRef.current = null;
      }
    };
  }, [computedContent, diffSession, activeFile, files, internalMode, saveFileContent, addMessage]);

  // ==================== Auto Exit Diff Mode ====================
  useEffect(() => {
    if (!diffSession || !activeFile) return;

    const targetChange = activePendingChange || mergedPendingChange;
    if (!targetChange) return;

    const allProcessed = areAllHunksProcessed(
      diffSession.sourceSnapshot,
      computedContent,
      targetChange.newContent || ''
    );

    if (allProcessed && diffSession.patchQueue.length > 0) {
      const completionKey = `${activeFile.id}-${diffSession.patchQueue.length}-${computedContent.length}`;

      if (completionMessageSentRef.current === completionKey) {
        return;
      }

      completionMessageSentRef.current = completionKey;

      isApplyingBatchRef.current = true;

      saveFileContent(activeFile.id, computedContent);

      // 只移除已经处理的 pendingChanges（通过 timestamp 识别）
      // 避免移除在处理过程中新添加的 changes
      const processedTimestamp = targetChange.timestamp;
      const filePath = getNodePath(activeFile, files);
      pendingChanges
        .filter(c => c.fileName === filePath && c.timestamp <= processedTimestamp)
        .forEach(c => removePendingChange(c.id));

      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `✅ 已应用 ${diffSession.patchQueue.length} 个变更到 ${activeFile.name}`,
        timestamp: Date.now(),
        metadata: { logType: 'success' }
      });

      setDiffSession(null);
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null;
    }
  }, [diffSession, computedContent, activeFile, mergedPendingChange, activePendingChange, pendingChanges, saveFileContent, removePendingChange, addMessage, files]);

  // ==================== Reset completion tracking when new change arrives ====================
  useEffect(() => {
    // 当 mergedPendingChange 改变时（有新的 change 进来），重置 completionMessageSentRef
    // 这样可以确保新的 change 不会被跳过
    if (mergedPendingChange) {
      completionMessageSentRef.current = null;
    }
  }, [mergedPendingChange?.id]);

  // ==================== Reviewing Change Effect ====================
  // 只有当前文件有 pending changes 时才触发 diff 模式
  // 不再使用 activePendingChange（可能指向其他文件）
  useEffect(() => {
    console.log('[useEditorDiff] Reviewing Change Effect:', {
      hasMergedPendingChange: !!mergedPendingChange,
      internalMode,
      willSetDiff: mergedPendingChange && internalMode !== 'diff'
    });
    if (mergedPendingChange && internalMode !== 'diff') {
      setInternalMode('diff');
    }
  }, [mergedPendingChange, internalMode, setInternalMode]);

  // ==================== Edit Increments Effect ====================
  useEffect(() => {
    if (internalMode !== 'edit' || activeEditDiffs.length === 0) {
      setEditIncrements([]);
      return;
    }

    const increments: EditIncrement[] = [];
    let lineDelta = 0;

    for (const edit of activeEditDiffs) {
      if (processedEditIds.includes(edit.id)) continue;

      // 简化处理：使用 edit 的行号信息
      const delta = edit.originalSegment
        ? computeLineDelta(edit.originalSegment, edit.modifiedSegment || '')
        : 0;

      increments.push({
        editId: edit.id,
        lineDelta: delta,
        timestamp: Date.now()
      });
      lineDelta += delta;
    }

    setEditIncrements(increments);
  }, [internalMode, activeEditDiffs, processedEditIds]);

  // ==================== Handlers ====================
  const handleAcceptHunk = useCallback((hunk: DiffHunk) => {
    const newContent = extractHunkContent(hunk.lines);

    const newPatch: FilePatch = {
      id: generatePatchId(),
      type: 'accept',
      hunkId: hunk.id,
      startLineOriginal: hunk.startLineOriginal,
      endLineOriginal: hunk.endLineOriginal,
      newContent,
      timestamp: Date.now()
    };

    if (!diffSession) {
      const targetChange = activePendingChange || mergedPendingChange;
      const sourceSnapshot = targetChange?.originalContent || '';
      setDiffSession({
        sourceSnapshot,
        patchQueue: [newPatch]
      });
      return;
    }

    setDiffSession(prev => prev ? {
      ...prev,
      patchQueue: [...prev.patchQueue, newPatch]
    } : null);
  }, [diffSession, mergedPendingChange, activePendingChange]);

  const handleRejectHunk = useCallback((hunk: DiffHunk) => {
    const newPatch: FilePatch = {
      id: generatePatchId(),
      type: 'reject',
      hunkId: hunk.id,
      startLineOriginal: hunk.startLineOriginal,
      endLineOriginal: hunk.endLineOriginal,
      newContent: '',
      timestamp: Date.now()
    };

    if (!diffSession) {
      const targetChange = activePendingChange || mergedPendingChange;
      const sourceSnapshot = targetChange?.originalContent || '';
      setDiffSession({
        sourceSnapshot,
        patchQueue: [newPatch]
      });
      return;
    }

    setDiffSession(prev => prev ? {
      ...prev,
      patchQueue: [...prev.patchQueue, newPatch]
    } : null);
  }, [diffSession, mergedPendingChange, activePendingChange]);

  const triggerChapterAnalysis = useCallback((filePath: string, toolName: string) => {
    if (filePath?.startsWith('05_正文草稿/') &&
      (toolName === 'createFile' || toolName === 'updateFile' || toolName === 'patchFile')) {
      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `🔍 正在自动分析章节: ${filePath}`,
        timestamp: Date.now(),
        metadata: { logType: 'info' }
      });

      const chapterAnalysisStore = useChapterAnalysisStore.getState();
      const agentStore = useAgentStore.getState();
      const projectStore = useProjectStore.getState();

      chapterAnalysisStore.triggerExtraction(
        filePath,
        agentStore.currentSessionId || '',
        projectStore.getCurrentProject()?.id || ''
      ).then(() => {
        addMessage({
          id: Math.random().toString(),
          role: 'system',
          text: `✅ 章节分析完成: ${filePath}`,
          timestamp: Date.now(),
          metadata: { logType: 'success' }
        });
      }).catch((err: Error) => {
        addMessage({
          id: Math.random().toString(),
          role: 'system',
          text: `⚠️ 章节分析失败: ${err.message}`,
          timestamp: Date.now(),
          metadata: { logType: 'error' }
        });
      });
    }
  }, [addMessage]);

  const triggerDocumentMemoryExtraction = useCallback((filePath: string, content: string) => {
    const { autoExtraction } = useAgentStore.getState().aiConfig;
    if (autoExtraction?.document === false) return;

    useKnowledgeGraphStore
      .getState()
      .triggerDocumentExtraction(filePath, content)
      .then((result) => {
        if (!result || result.added + result.updated + result.linked === 0) return;

        addMessage({
          id: Math.random().toString(),
          role: 'system',
          text: `🧠 已从文档提取知识：新增 ${result.added} 条，更新 ${result.updated} 条，关联 ${result.linked} 条`,
          timestamp: Date.now(),
          metadata: { logType: 'success', extractionSummary: result.summary, filePath }
        });
      })
      .catch((error: Error) => {
        console.error('[DocumentMemory] extraction failed', error);
      });
  }, [addMessage]);

  const handleAcceptAll = useCallback(async () => {
    const targetChange = activePendingChange || mergedPendingChange;
    if (!targetChange) return;

    let fileToSave = activeFile;
    let fileToSaveId = activeFileId;

    if (!fileToSave && targetChange.fileName) {
      const { files: currentFiles, createFile: createFileFn } = useFileStore.getState();
      const existingFile = findNodeByPath(currentFiles, targetChange.fileName);

      if (existingFile) {
        fileToSave = existingFile;
        fileToSaveId = existingFile.id;
      } else {
        const createResult = createFileFn(targetChange.fileName, targetChange.newContent || '');
        if (createResult.startsWith('Error:')) return;
        const newActiveFileId = useFileStore.getState().activeFileId;
        if (newActiveFileId) {
          fileToSaveId = newActiveFileId;
        }
      }
    }

    const fileName = fileToSave?.name || targetChange.fileName.split('/').pop() || '文件';

    if (!diffSession) {
      const originalContent = targetChange.originalContent || '';
      setDiffSession({
        sourceSnapshot: originalContent,
        patchQueue: []
      });
    }

    isApplyingBatchRef.current = true;

    const currentContent = computedContent;
    const targetContent = targetChange.newContent || '';
    const diffLines = computeLineDiff(currentContent, targetContent);
    const hunks = groupDiffIntoHunks(diffLines, 3);

    const newPatches: FilePatch[] = [];
    hunks.forEach(hunk => {
      if (hunk.type === 'change') {
        const hunkContent = extractHunkContent(hunk.lines);
        newPatches.push({
          id: generatePatchId(),
          type: 'accept',
          hunkId: hunk.id,
          startLineOriginal: hunk.startLineOriginal,
          endLineOriginal: hunk.endLineOriginal,
          newContent: hunkContent,
          timestamp: Date.now()
        });
      }
    });

    setDiffSession(prev => prev ? {
      ...prev,
      patchQueue: [...prev.patchQueue, ...newPatches]
    } : {
      sourceSnapshot: targetChange.originalContent || '',
      patchQueue: newPatches
    });

        const finalContent = targetChange.newContent || '';

        // 检查是否是虚拟文件（createFile 预览）
        const isVirtualFile = activeFile?.metadata?.virtualFilePath;

        if (isVirtualFile && targetChange.fileName) {
          // 对于 createFile，需要创建真实文件
          console.log('[handleAcceptAll] Creating real file for virtual file:', targetChange.fileName);
          const fileStore = useFileStore.getState();
          const createResult = fileStore.createFile(targetChange.fileName, finalContent);
          if (createResult.startsWith('Error:')) {
            console.error('[handleAcceptAll] Failed to create file:', createResult);
            return;
          }
          // 获取新创建的文件 ID（createFile 会自动设置为 activeFileId）
          const newFileId = useFileStore.getState().activeFileId;
          console.log('[handleAcceptAll] File created, newFileId:', newFileId);
          if (newFileId) {
            fileToSaveId = newFileId;
          }
          // 清除虚拟文件，但保留 activeFileId
          // setVirtualFile(null) 会同时设置 activeFileId: null，所以我们需要先保存然后恢复
          useFileStore.getState().setVirtualFile(null);
          // 恢复 activeFileId 到新创建的文件
          if (newFileId) {
            useFileStore.getState().setActiveFileId(newFileId);
          }
        } else if (fileToSaveId && finalContent) {
          // 普通文件，直接保存
          computedContentFileIdRef.current = null;
          saveFileContent(fileToSaveId, finalContent);
        }

        const { files: currentFilesForPath } = useFileStore.getState();
    const { pendingChanges: currentPendingChanges } = useAgentStore.getState();
    // 对于 createFile（虚拟文件），使用 targetChange.fileName（真实路径）
    // 而不是虚拟文件路径
    const filePath = isVirtualFile ? targetChange.fileName : (fileToSave ? getNodePath(fileToSave, currentFilesForPath) : targetChange.fileName);
    console.log('[handleAcceptAll] Removing pendingChanges:', {
      isVirtualFile,
      filePath,
      targetChangeFileName: targetChange.fileName,
      currentPendingChangesCount: currentPendingChanges.length,
      currentPendingChangeFileNames: currentPendingChanges.map(c => c.fileName)
    });
    const changesToRemove = currentPendingChanges.filter(c => c.fileName === filePath);
    console.log('[handleAcceptAll] Changes to remove:', {
      count: changesToRemove.length,
      ids: changesToRemove.map(c => c.id)
    });
    changesToRemove.forEach(c => removePendingChange(c.id));

    addMessage({
      id: Math.random().toString(),
      role: 'system',
      text: `✅ 已应用所有待审变更到 ${fileName}`,
      timestamp: Date.now(),
      metadata: { logType: 'success' }
    });

    triggerChapterAnalysis(filePath, targetChange.toolName);
    triggerDocumentMemoryExtraction(filePath, finalContent);

    setTimeout(() => {
      setDiffSession(null);
      setInternalMode('edit');
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null;
    }, 100);
  }, [mergedPendingChange, activePendingChange, activeFile, activeFileId, diffSession, computedContent, saveFileContent, removePendingChange, addMessage, setInternalMode, triggerChapterAnalysis, triggerDocumentMemoryExtraction]);

  const handleRejectAll = useCallback(() => {
    const targetChange = activePendingChange || mergedPendingChange;

    const cleanupAndExit = () => {
      if (targetChange) {
        removePendingChange(targetChange.id);
      }

      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `❌ 已拒绝变更: ${targetChange?.fileName || '未知文件'}`,
        timestamp: Date.now(),
        metadata: { logType: 'info' }
      });

      setDiffSession(null);
      setInternalMode('edit');
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null;
    };

    if (targetChange?.toolName === 'createFile') {
      isApplyingBatchRef.current = true;
      if (activeFile) {
        const { deleteFile } = useFileStore.getState();
        deleteFile(activeFile.id);
      }
      cleanupAndExit();
      return;
    }

    if (!activeFile) {
      cleanupAndExit();
      return;
    }

    isApplyingBatchRef.current = true;

    const originalContent = diffSession?.sourceSnapshot || targetChange?.originalContent || '';
    saveFileContent(activeFile.id, originalContent);

    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    cleanupAndExit();
  }, [mergedPendingChange, activePendingChange, activeFile, diffSession, pendingChanges, saveFileContent, removePendingChange, addMessage, setInternalMode, files]);

  const handleDismiss = useCallback(() => {
    if (!activeFile) return;
    const targetChange = activePendingChange || mergedPendingChange;
    if (!targetChange) return;

    isApplyingBatchRef.current = true;

    saveFileContent(activeFile.id, computedContent);

    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    addMessage({
      id: Math.random().toString(),
      role: 'system',
      text: `✅ 变更已手动完成: ${targetChange.fileName}`,
      timestamp: Date.now(),
      metadata: { logType: 'success' }
    });

    setTimeout(() => {
      setDiffSession(null);
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null;
    }, 100);
  }, [activeFile, mergedPendingChange, activePendingChange, computedContent, pendingChanges, saveFileContent, removePendingChange, addMessage, files]);

  const handleEditAction = useCallback((editId: string, action: 'accept' | 'reject') => {
    if (action === 'accept') {
      setProcessedEditIds(prev => [...prev, editId]);

      const editDiff = activeEditDiffs.find(e => e.id === editId);
      if (editDiff && activeFile) {
        const currentContent = content;
        const lines = currentContent.split('\n');
        const adjustedEdits = rebuildEditLineNumbers(activeEditDiffs, editIncrements);
        const adjustedEdit = adjustedEdits.find(e => e.id === editId);

        if (adjustedEdit) {
          const startIdx = Math.max(0, adjustedEdit.startLine - 1);
          const endIdx = Math.min(lines.length, adjustedEdit.endLine);
          const newLines = editDiff.modifiedSegment.split('\n');

          lines.splice(startIdx, endIdx - startIdx, ...newLines);
          const newContent = lines.join('\n');

          setContent(newContent);
          saveFileContent(activeFile.id, newContent);
        }
      }

      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `✅ 已批准变更 #${editDiff?.editIndex !== undefined ? editDiff.editIndex + 1 : editId}`,
        timestamp: Date.now(),
        metadata: { logType: 'success' }
      });
    } else {
      setProcessedEditIds(prev => [...prev, editId]);

      const editDiff = activeEditDiffs.find(e => e.id === editId);
      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `❌ 已拒绝变更 #${editDiff?.editIndex !== undefined ? editDiff.editIndex + 1 : editId}`,
        timestamp: Date.now(),
        metadata: { logType: 'info' }
      });
    }

    const remainingEdits = activeEditDiffs.filter(e =>
      e.status === 'pending' && !processedEditIds.includes(e.id) && e.id !== editId
    );

    if (remainingEdits.length === 0 && activeFile) {
      const filePath = getNodePath(activeFile, files);
      const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
      changesToRemove.forEach(c => removePendingChange(c.id));

      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `✅ 所有变更已处理完成`,
        timestamp: Date.now(),
        metadata: { logType: 'success' }
      });

      triggerChapterAnalysis(filePath, changesToRemove[0]?.toolName || '');
      triggerDocumentMemoryExtraction(filePath, newContent);
    }
  }, [activeEditDiffs, processedEditIds, activeFile, content, editIncrements, saveFileContent, setContent, removePendingChange, addMessage, files, pendingChanges, triggerChapterAnalysis, triggerDocumentMemoryExtraction]);

  const handleAcceptAllEdits = useCallback(() => {
    if (!activeFile || activeEditDiffs.length === 0) return;

    const pendingEdits = activeEditDiffs.filter(edit =>
      edit.status === 'pending' && !processedEditIds.includes(edit.id)
    );

    if (pendingEdits.length === 0) return;

    const adjustedEdits = rebuildEditLineNumbers(activeEditDiffs, editIncrements);
    const lines = content.split('\n');

    const sortedEdits = pendingEdits
      .map(edit => ({
        ...edit,
        adjusted: adjustedEdits.find(e => e.id === edit.id)
      }))
      .filter(e => e.adjusted)
      .sort((a, b) => b.adjusted!.startLine - a.adjusted!.startLine);

    for (const edit of sortedEdits) {
      const startIdx = Math.max(0, edit.adjusted!.startLine - 1);
      const endIdx = Math.min(lines.length, edit.adjusted!.endLine);
      const newLines = edit.modifiedSegment.split('\n');
      lines.splice(startIdx, endIdx - startIdx, ...newLines);
    }

    const newContent = lines.join('\n');
    setContent(newContent);
    saveFileContent(activeFile.id, newContent);

    setProcessedEditIds(prev => [...prev, ...pendingEdits.map(e => e.id)]);

    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    addMessage({
      id: Math.random().toString(),
      role: 'system',
      text: `✅ 已批准全部 ${pendingEdits.length} 个变更`,
      timestamp: Date.now(),
      metadata: { logType: 'success' }
    });

    triggerChapterAnalysis(filePath, changesToRemove[0]?.toolName || '');
    triggerDocumentMemoryExtraction(filePath, newContent);
  }, [activeFile, activeEditDiffs, processedEditIds, editIncrements, content, setContent, saveFileContent, pendingChanges, removePendingChange, addMessage, files, triggerChapterAnalysis, triggerDocumentMemoryExtraction]);

  const handleRejectAllEdits = useCallback(() => {
    if (!activeFile || activeEditDiffs.length === 0) return;

    const pendingEdits = activeEditDiffs.filter(edit =>
      edit.status === 'pending' && !processedEditIds.includes(edit.id)
    );

    if (pendingEdits.length === 0) return;

    setProcessedEditIds(prev => [...prev, ...pendingEdits.map(e => e.id)]);

    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    addMessage({
      id: Math.random().toString(),
      role: 'system',
      text: `❌ 已拒绝全部 ${pendingEdits.length} 个变更`,
      timestamp: Date.now(),
      metadata: { logType: 'info' }
    });
  }, [activeFile, activeEditDiffs, processedEditIds, pendingChanges, removePendingChange, addMessage, files]);

  return {
    // State
    diffSession,
    setDiffSession,
    mergedPendingChange,
    activePendingChange,
    activeEditDiffs,
    pendingEditCount,
    editIncrements,
    setEditIncrements,
    processedEditIds,
    setProcessedEditIds,
    processedHunkIds,
    computedContent,

    // Handlers
    handleAcceptHunk,
    handleRejectHunk,
    handleAcceptAll,
    handleRejectAll,
    handleDismiss,
    handleEditAction,
    handleAcceptAllEdits,
    handleRejectAllEdits
  };
};
