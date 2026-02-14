
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useFileStore } from '../stores/fileStore';
import { useAgentStore } from '../stores/agentStore';
import { useUiStore } from '../stores/uiStore';
import { DiffHunk, computeLineDiff, groupDiffIntoHunks } from '../utils/diffUtils';
import { executeApprovedChange } from '../services/agent/toolRunner';
import { getNodePath, findNodeByPath } from '../services/fileSystem';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { parseFrontmatter } from '../utils/frontmatter';
import { applyPatchQueue, mergePendingChanges, generatePatchId, extractHunkContent, areAllHunksProcessed } from '../utils/patchQueue';
import DiffViewer from './DiffViewer';
import { useShallow } from 'zustand/react/shallow';
import { PendingChange, DiffSessionState, FilePatch } from '../types';
import { useDiffStore } from '../stores/diffStore';
import { EditorToolbar, EditorGutter, EmptyState } from './editor';

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

  // 2. Diff Store (for diff session management)
  const diffStore = useDiffStore();
  const { loadDiffSession, saveDiffSession: saveToStore, clearDiffSession } = diffStore;

  // 3. Agent Store (for pending changes)
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

  // Diff session state (only used in diff mode)
  const [diffSession, setDiffSession] = useState<DiffSessionState | null>(null);

  // Flag to prevent content sync during batch operations
  const isApplyingBatchRef = useRef(false);

  // Track if we've already sent a completion message for current diff session
  const completionMessageSentRef = useRef<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  
  // 5. Detect Pending Change for Active File OR Explicit Review
  // Only for explicit review mode - normal diff uses mergedPendingChange
  const activePendingChange = useMemo(() => {
      if (reviewingChangeId) {
          return pendingChanges.find(c => c.id === reviewingChangeId) || null;
      }
      // Don't auto-detect for normal diff mode - let mergedPendingChange handle it
      return null;
  }, [reviewingChangeId, pendingChanges]);

  // 5.1 Switch to diff mode when reviewing change
  // This should only trigger when user clicks a pendingChange in AgentChat
  useEffect(() => {
    if (activePendingChange && internalMode !== 'diff') {
      console.log('[Editor] Entering diff mode for pending change', {
        changeId: activePendingChange.id,
        fileName: activePendingChange.fileName
      });
      setInternalMode('diff');
    }
  }, [activePendingChange, internalMode]);

  // 6. Merge multiple pending changes for the same file
  const mergedPendingChange = useMemo(() => {
    if (!activeFile) return null;

    const filePath = getNodePath(activeFile, files);

    console.log('mergedPendingChange calculation:', {
      filePath,
      allPendingChanges: pendingChanges.map(c => ({ id: c.id, fileName: c.fileName }))
    });

    const fileChanges = pendingChanges.filter(c => c.fileName === filePath);

    console.log('mergedPendingChange filtered:', {
      filePath,
      matchedCount: fileChanges.length,
      matched: fileChanges.map(c => ({ id: c.id, fileName: c.fileName }))
    });

    if (fileChanges.length === 0) return null;

    // Compute the merged final content
    const baseContent = activeFile?.content || '';
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
      originalContent: baseContent,
      newContent: finalContent,
      toolName: 'merged' as const,
      args: {},
      timestamp: Date.now(),
      description: `${fileChanges.length}个待审变更`,
      metadata: { sourceChanges: fileChanges }
    };
  }, [activeFile?.id, pendingChanges]);

  // Auto-switch to Diff Mode
  // REMOVED: Auto-switching caused unwanted diff mode activation when switching files
  // Diff mode should only be triggered by explicit user click on pendingChange
  // The AgentChat component's handleReviewClick will set reviewingChangeId
  // which is detected by a separate useEffect below

  // Initialize diff session when entering diff mode
  useEffect(() => {
    // Exit diff mode - clean up session
    if (internalMode !== 'diff' && diffSession) {
      setDiffSession(null);
      if (activeFile) {
        clearDiffSession(activeFile.id);  // Clear IndexedDB via diffStore
      }
      return;
    }

    // Only close session when explicitly done, not when pending changes removed
    // Keep diff session active based on mode, not on pending changes
    const initializeSession = async () => {
      if (!activeFile) return;

      const restoredSession = await loadDiffSession(activeFile.id);

      if (internalMode === 'diff' && !diffSession) {
        // FIX: Bug #2 - Validate restored session file name matches current file
        const isValidSession = !restoredSession ||
                              !restoredSession.sourceFileName ||
                              restoredSession.sourceFileName === activeFile.name;

        if (!isValidSession) {
          // File name mismatch - clean up and create new session
          console.warn('[Editor] Restored session file name mismatch, clearing and creating new session', {
            restored: restoredSession?.sourceFileName,
            current: activeFile.name
          });
          await saveToStore(activeFile.id, null);
        }

        // Need to create or restore session
        const sourceContent = activeFile.content || '';
        setDiffSession({
          sourceSnapshot: sourceContent,
          sourceFileName: activeFile.name,  // Track file name to prevent cross-file diffs
          patchQueue: isValidSession && restoredSession ? restoredSession.patchQueue : []
        });
      }
    };

    initializeSession();
  }, [internalMode, activeFile?.id, loadDiffSession, clearDiffSession, saveToStore]);  // Only depend on mode and file, not pending changes

  // Save diff session to IndexedDB whenever it changes
  useEffect(() => {
    if (!activeFile) return;

    const saveSession = async () => {
      if (diffSession) {
        await saveToStore(activeFile.id, diffSession);
      } else {
        await saveToStore(activeFile.id, null);  // Clear when not in diff mode
      }
    };

    saveSession();
  }, [diffSession, activeFile?.id, saveToStore]);

  // Don't clear diff session when pending changes are removed
  // Keep the session active until explicitly closed or all hunks processed
  const prevPendingCountRef = useRef(0);

  // Computed content: source snapshot + all applied patches
  // FIX: Bug #7 - Add patchQueue.length to dependencies to detect changes
  // Also track the actual diffSession object reference to detect mutations
  const prevDiffSessionRef = useRef<DiffSessionState | null>(null);
  const computedContent = useMemo(() => {
    prevDiffSessionRef.current = diffSession; // Track reference for next comparison
    if (!diffSession) return content;  // Non-diff mode, return normal content
    return applyPatchQueue(diffSession);
  }, [diffSession, diffSession?.patchQueue?.length]);  // Depend on diffSession and patchQueue length

  // Get processed hunk IDs (hunks that have been accepted/rejected)
  const processedHunkIds = useMemo(() => {
    if (!diffSession) return [];
    return diffSession.patchQueue.map(p => p.hunkId);
  }, [diffSession]);

  // Sync computed content to local state (for display)
  useEffect(() => {
    if (diffSession && computedContent !== content) {
      setContent(computedContent);
    }
  }, [computedContent, diffSession]);

  // Immediate save in diff mode (no debounce)
  // CRITICAL: Disable auto-save in diff mode to prevent conflicts with patch application
  useEffect(() => {
    // FIX: Bug #3 - Only auto-save in EDIT mode, not in diff or preview mode
    // This prevents accidental saves during diff mode state transitions
    const shouldAutoSave = !diffSession &&
                          internalMode === 'edit' &&
                          activeFile &&
                          computedContent;

    if (shouldAutoSave) {
      console.log('[Edit Mode] Auto-saving to fileStore', {
        fileId: activeFile.id,
        fileName: activeFile.name,
        contentLength: computedContent.length
      });
      saveFileContent(activeFile.id, computedContent);
    }
  }, [computedContent, diffSession, activeFile?.id, internalMode]); 

  // Sync content from store
  const prevFileIdRef = useRef<string | null>(null);
  useEffect(() => {
      // Logic 1: File Switch
      if (activeFileId !== prevFileIdRef.current) {
          // CRITICAL: Clear diff session when switching files
          // This prevents comparing snapshots from different files
          if (diffSession) {
              console.log('[File Switch] Clearing diff session', {
                  prevFileId: prevFileIdRef.current,
                  newFileId: activeFileId
              });
              setDiffSession(null);
          }

          // FIX: Bug #1 - Clear IndexedDB diff session when switching files
          // This prevents the new file from restoring the old file's diff session
          if (prevFileIdRef.current) {
              console.log('[File Switch] Cleaning up IndexedDB diff session for file:', prevFileIdRef.current);
              clearDiffSession(prevFileIdRef.current);
          }

          // FIX: Bug #5 - Clean up pending changes for previous file
          if (prevFileIdRef.current) {
              const prevFile = files.find(f => f.id === prevFileIdRef.current);
              if (prevFile) {
                  const filePath = getNodePath(prevFile, files);
                  const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
                  changesToRemove.forEach(c => removePendingChange(c.id));
                  console.log('[File Switch] Cleaned up pending changes', {
                      fileName: filePath,
                      count: changesToRemove.length
                  });
              }
          }

          if (activeFile) {
              resetHistory(activeFile.content || '');
          } else {
              resetHistory('');
          }
          prevFileIdRef.current = activeFileId;
          // Reset cursor stats on file change
          setCursorStats({ line: 1, col: 1 });
      } 
      // Logic 2: External Update (e.g. Agent Diff Apply)
      // Check if store content differs from local content.
      // Since user typing updates store synchronously via saveFileContent,
      // activeFile.content === content usually.
      // If they differ, it means the store was updated externally (Agent).
      // Skip during batch operations to prevent overwriting just-saved content
      // Also skip in diff mode since diff manages its own sync via computedContent
      else if (activeFile && activeFile.content !== content && !isApplyingBatchRef.current && internalMode !== 'diff') {
          setContent(activeFile.content || '');
      }
  }, [activeFileId, activeFile, content, resetHistory, setContent]);

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

      // Diff mode: Ctrl+Z undoes the last patch
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && diffSession) {
          e.preventDefault();

          setDiffSession(prev => {
            if (!prev || prev.patchQueue.length === 0) return prev;

            const newQueue = prev.patchQueue.slice(0, -1);  // Remove last patch
            return { ...prev, patchQueue: newQueue };
          });
          return;
      }

      // Normal mode: standard undo/redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !diffSession) {
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

  // --- Approval Logic (Patch Queue System) ---
  const handleAcceptHunk = (hunk: DiffHunk) => {
    console.log('handleAcceptHunk called', { hunkId: hunk.id, hasDiffSession: !!diffSession });

    // Extract new content from hunk
    const newContent = extractHunkContent(hunk.lines);

    // Add accept patch to queue
    const newPatch: FilePatch = {
      id: generatePatchId(),
      type: 'accept',
      hunkId: hunk.id,
      startLineOriginal: hunk.startLineOriginal,
      endLineOriginal: hunk.endLineOriginal,
      newContent,
      timestamp: Date.now()
    };

    // Handle case where diffSession doesn't exist yet
    if (!diffSession) {
      console.warn('handleAcceptHunk: diffSession not initialized, creating temporary session');
      const targetChange = mergedPendingChange || activePendingChange;
      const sourceSnapshot = targetChange?.originalContent || '';
      setDiffSession({
        sourceSnapshot,
        patchQueue: [newPatch]
      });
      return;
    }

    console.log('Adding patch to queue', { patchCount: diffSession.patchQueue.length + 1 });
    setDiffSession(prev => prev ? {
      ...prev,
      patchQueue: [...prev.patchQueue, newPatch]
    } : null);
  };

  const handleRejectHunk = (hunk: DiffHunk) => {
    console.log('handleRejectHunk called', { hunkId: hunk.id, hasDiffSession: !!diffSession });

    // Add reject patch to queue (doesn't apply changes)
    const newPatch: FilePatch = {
      id: generatePatchId(),
      type: 'reject',
      hunkId: hunk.id,
      startLineOriginal: hunk.startLineOriginal,
      endLineOriginal: hunk.endLineOriginal,
      newContent: '',
      timestamp: Date.now()
    };

    // Handle case where diffSession doesn't exist yet
    if (!diffSession) {
      console.warn('handleRejectHunk: diffSession not initialized, creating temporary session');
      const targetChange = mergedPendingChange || activePendingChange;
      const sourceSnapshot = targetChange?.originalContent || '';
      setDiffSession({
        sourceSnapshot,
        patchQueue: [newPatch]
      });
      return;
    }

    console.log('Adding reject patch to queue', { patchCount: diffSession.patchQueue.length + 1 });
    setDiffSession(prev => prev ? {
      ...prev,
      patchQueue: [...prev.patchQueue, newPatch]
    } : null);
  };
  const handleAcceptAll = async () => {
    console.log('handleAcceptAll called', {
      hasDiffSession: !!diffSession,
      hasActiveFile: !!activeFile,
      activeFileName: activeFile?.name
    });

    const targetChange = mergedPendingChange || activePendingChange;
    if (!targetChange) {
      console.error('handleAcceptAll: No pending change to accept');
      return;
    }

    // ===== 新增：处理 activeFile 为 undefined 的情况 =====
    let fileToSave = activeFile;
    let fileToSaveId = activeFileId;

    if (!fileToSave && targetChange.fileName) {
      // 检查文件是否已存在于 fileStore
      const existingFile = findNodeByPath(files, targetChange.fileName);

      if (existingFile) {
        // 文件存在，使用它
        console.log('[handleAcceptAll] Found existing file:', targetChange.fileName);
        fileToSave = existingFile;
        fileToSaveId = existingFile.id;
      } else {
        // 文件不存在，需要创建
        console.log('[handleAcceptAll] Creating new file:', targetChange.fileName);
        const createResult = createFile(targetChange.fileName, targetChange.newContent || '');

        if (createResult.startsWith('Error:')) {
          console.error('[handleAcceptAll] Failed to create file:', createResult);
          return;
        }

        // createFile 内部已经设置了 activeFileId
        // 由于 React 状态更新是批量的，我们需要从 store 直接获取最新值
        const newActiveFileId = fileStore.getState().activeFileId;
        if (newActiveFileId) {
          fileToSaveId = newActiveFileId;
          console.log('[handleAcceptAll] Using new activeFileId after creation:', newActiveFileId);
        }
      }
    }
    // ===== 新增结束 =====

    // Use activeFile if available, otherwise rely on pendingChange metadata
    const fileName = fileToSave?.name || targetChange.fileName.split('/').pop() || '文件';

    // Initialize diffSession on-the-fly if not exists (fallback for cases where activeFile wasn't ready)
    if (!diffSession) {
      console.warn('handleAcceptAll: diffSession not initialized, creating temporary session');
      const originalContent = targetChange.originalContent || '';
      setDiffSession({
        sourceSnapshot: originalContent,
        patchQueue: []
      });
      // Don't return - continue to apply changes
    }

    // Set batch flag to prevent content sync from overwriting
    isApplyingBatchRef.current = true;

    // Generate hunks between current computed state and target
    // This ensures all remaining changes are added to patch queue
    const currentContent = computedContent;
    const targetContent = targetChange.newContent || '';
    const diffLines = computeLineDiff(currentContent, targetContent);
    const hunks = groupDiffIntoHunks(diffLines, 3);

    // Add all remaining change hunks to patch queue
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

    console.log('[handleAcceptAll] Adding patches to queue:', { count: newPatches.length });

    // Update patch queue - computedContent will update automatically
    setDiffSession(prev => prev ? {
      ...prev,
      patchQueue: [...prev.patchQueue, ...newPatches]
    } : {
      // Fallback: create new session with patches
      sourceSnapshot: targetChange.originalContent || '',
      patchQueue: newPatches
    });

    // 计算最终内容
    const finalContent = applyPatchQueue({
      sourceSnapshot: diffSession?.sourceSnapshot || targetChange.originalContent || '',
      patchQueue: newPatches
    });

    // ===== 新增：直接保存文件内容 =====
    if (fileToSaveId && finalContent) {
      console.log('[handleAcceptAll] Saving file content:', {
        fileId: fileToSaveId,
        fileName: fileToSave?.name || targetChange.fileName,
        contentLength: finalContent.length
      });
      saveFileContent(fileToSaveId, finalContent);
    } else if (!fileToSaveId) {
      console.warn('[handleAcceptAll] Cannot save: fileToSaveId is undefined');
    }
    // ===== 新增结束 =====

    // Remove all pending changes for this file
    const filePath = fileToSave ? getNodePath(fileToSave, files) : targetChange.fileName;
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);

    console.log('Removing pending changes:', {
      filePath,
      count: changesToRemove.length,
      changes: changesToRemove.map(c => ({ id: c.id, fileName: c.fileName }))
    });

    changesToRemove.forEach(c => removePendingChange(c.id));
    console.log('[handleAcceptAll] Pending changes removed');

    // Add system message
    addMessage({
      id: Math.random().toString(),
      role: 'system',
      text: `✅ 已应用所有待审变更到 ${fileName}`,
      timestamp: Date.now(),
      metadata: { logType: 'success' }
    });

    // Clear diff session after a short delay to allow file save to complete
    setTimeout(() => {
      setDiffSession(null);
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null; // Reset for next session
    }, 100);
  };

  const handleRejectAll = () => {
    if (!activeFile || !diffSession) return;
    const targetChange = mergedPendingChange || activePendingChange;
    if (!targetChange) return;

    // Set batch flag
    isApplyingBatchRef.current = true;

    // Save original content (reject all changes)
    const originalContent = diffSession.sourceSnapshot;
    saveFileContent(activeFile.id, originalContent);

    // Remove all pending changes for this file
    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    // Add system message
    addMessage({
      id: Math.random().toString(),
      role: 'system',
      text: `❌ 已拒绝所有变更: ${targetChange.fileName}`,
      timestamp: Date.now(),
      metadata: { logType: 'info' }
    });

    // Clear diff session after a short delay
    setTimeout(() => {
      setDiffSession(null);
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null; // Reset for next session
    }, 100);
  };

  const handleDismiss = () => {
    if (!activeFile) return;
    const targetChange = mergedPendingChange || activePendingChange;
    if (!targetChange) return;

    // Set batch flag
    isApplyingBatchRef.current = true;

    // Save current computed content (user manually finished)
    saveFileContent(activeFile.id, computedContent);

    // Remove all pending changes
    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    // Add system message
    addMessage({
      id: Math.random().toString(),
      role: 'system',
      text: `✅ 变更已手动完成: ${targetChange.fileName}`,
      timestamp: Date.now(),
      metadata: { logType: 'success' }
    });

    // Clear diff session after a short delay
    setTimeout(() => {
      setDiffSession(null);
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null; // Reset for next session
    }, 100);
  };

  // Auto-exit diff mode when all hunks have been processed
  useEffect(() => {
    if (!diffSession || !activeFile) return;

    const targetChange = mergedPendingChange || activePendingChange;
    if (!targetChange) return;

    // Check if all hunks have been processed
    const allProcessed = areAllHunksProcessed(
      diffSession.sourceSnapshot,
      computedContent,
      targetChange.newContent || ''
    );

    if (allProcessed && diffSession.patchQueue.length > 0) {
      // Generate a unique key for this completion state based on patch queue
      const completionKey = `${activeFile.id}-${diffSession.patchQueue.length}-${computedContent.length}`;

      // Check if we've already sent a message for this exact state
      if (completionMessageSentRef.current === completionKey) {
        return; // Skip, already processed
      }

      // Mark this completion as processed
      completionMessageSentRef.current = completionKey;

      // Set batch flag to prevent content sync
      isApplyingBatchRef.current = true;

      // Apply final result and exit diff mode
      saveFileContent(activeFile.id, computedContent);

      // Remove all pending changes for this file
      const filePath = getNodePath(activeFile, files);
      pendingChanges
        .filter(c => c.fileName === filePath)
        .forEach(c => removePendingChange(c.id));

      // Add system message
      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `✅ 已应用 ${diffSession.patchQueue.length} 个变更到 ${activeFile.name}`,
        timestamp: Date.now(),
        metadata: { logType: 'success' }
      });

      // CRITICAL: Immediately exit diff mode - don't show completion screen
      // The completion screen in DiffViewer is confusing and redundant
      setDiffSession(null);
      isApplyingBatchRef.current = false;
      completionMessageSentRef.current = null; // Reset for next session
    }
  }, [diffSession, computedContent, activeFile]);
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
                className={`flex items-center justify-center w-8 h-7 rounded transition-all ${wordWrap ? 'bg-gray-700 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`} 
                title={wordWrap ? "自动换行: 开启" : "自动换行: 关闭"}
            >
                {wordWrap ? <WrapText size={14} /> : <AlignJustify size={14} />}
            </button>
            <button 
                onClick={toggleLineNumbers} 
                className={`flex items-center justify-center w-8 h-7 rounded transition-all border-r border-gray-700 mr-1 ${showLineNumbers ? 'bg-gray-700 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`} 
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
        {internalMode === 'diff' && (mergedPendingChange || activePendingChange) ? (
             <DiffViewer
                originalContent={(() => {
                    // Determine correct original content based on activeFile and pendingChange
                    // This prevents comparing snapshots from different files
                    const targetChange = mergedPendingChange || activePendingChange;

                    if (activeFile && diffSession?.sourceSnapshot) {
                        // Active file exists - verify snapshot is from this file
                        if (diffSession.sourceFileName === activeFile.name) {
                            // Snapshot matches current file - safe to use
                            return diffSession.sourceSnapshot;
                        } else {
                            // Snapshot is from a different file - use current file content
                            console.warn('[DiffViewer] Snapshot from different file, using file content', {
                                snapshotFile: diffSession.sourceFileName,
                                currentFile: activeFile.name
                            });
                            return activeFile.content || '';
                        }
                    } else if (activeFile) {
                        return activeFile.content || '';
                    } else {
                        // No active file (new file) - use pending change's original content
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
