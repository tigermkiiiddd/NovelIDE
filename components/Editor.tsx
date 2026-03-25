
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useFileStore } from '../stores/fileStore';
import { useAgentStore } from '../stores/agentStore';
import { useProjectStore } from '../stores/projectStore';
import { useChapterAnalysisStore } from '../stores/chapterAnalysisStore';
import { useUiStore } from '../stores/uiStore';
import { getNodePath, findNodeByPath } from '../services/fileSystem';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { parseFrontmatter } from '../utils/frontmatter';
import { findSearchResults, getLineAndColFromIndex, getIndexFromLineAndCol } from '../utils/searchUtils';
import { ReadingLightView } from './ReadingLightView';
import { JsonViewer } from './JsonViewer';
import { KnowledgeTreeView } from './KnowledgeTreeView';
import { CharacterProfileView } from './CharacterProfileView';
import { useShallow } from 'zustand/react/shallow';
import { PendingChange, EditDiff, EditIncrement } from '../types';
import { EditorToolbar, EditorGutter, EmptyState } from './editor';
import EditHighlightOverlay from './editor/EditHighlightOverlay';
import VersionHistory from './VersionHistory';
import { computeLineDelta, detectEditedRegion, rebuildEditLineNumbers } from '../utils/editIncrement';
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
  PanelRightClose,
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

const Editor: React.FC<EditorProps> = ({
  className,
}) => {
  // 1. Core Stores
  const fileStore = useFileStore();
  const { files, activeFileId, saveFileContent, createFile, deleteFile, virtualFile } = fileStore;
  // Support virtual files for createFile preview
  const isVirtualFile = virtualFile?.id === activeFileId;
  const activeFile = files.find(f => f.id === activeFileId) || (isVirtualFile ? virtualFile : undefined);

  // Wrapper for saveFileContent that skips virtual files
  const safeSaveFileContent = useCallback((id: string, content: string) => {
    if (!isVirtualFile) {
      saveFileContent(id, content);
    }
  }, [isVirtualFile, saveFileContent]);

  // 2. Agent Store (for pending changes)
  const { pendingChanges, updatePendingChange, removePendingChange, addMessage, reviewingChangeId, setReviewingChangeId } = useAgentStore();

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
    undo: originalUndo,
    redo: originalRedo,
    canUndo,
    canRedo,
    reset: resetHistory
  } = useUndoRedo<string>('', 800);

  // Wrap undo/redo to set flag and prevent external sync from overwriting
  const undo = useCallback(() => {
    isUndoRedoRef.current = true;
    originalUndo();
  }, [originalUndo]);

  const redo = useCallback(() => {
    isUndoRedoRef.current = true;
    originalRedo();
  }, [originalRedo]);

  const [internalMode, setInternalMode] = useState<'edit' | 'preview'>('edit');
  const [isDirty, setIsDirty] = useState(false);
  const [cursorStats, setCursorStats] = useState({ line: 1, col: 1 });

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<Array<{ index: number; length: number }>>([]);

  // Edit mode diff highlighting state
  const [editIncrements, setEditIncrements] = useState<EditIncrement[]>([]);
  const [processedEditIds, setProcessedEditIds] = useState<string[]>([]);
  const [overlayScrollTop, setOverlayScrollTop] = useState(0);

  // Flag to prevent content sync during batch operations
  const isApplyingBatchRef = useRef(false);

  // Flag to track undo/redo operations to prevent external sync from overwriting
  const isUndoRedoRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Version History State
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 5. (Removed - diff mode no longer exists, inline diff in edit mode handles everything)

  // 6.1 Collect all editDiffs from pending changes for the active file (for edit mode highlighting)
  const activeEditDiffs = useMemo(() => {
    if (!activeFile) return [];

    const filePath = getNodePath(activeFile, files);
    const fileChanges = pendingChanges.filter(c => c.fileName === filePath);

    // Collect all editDiffs from all pending changes
    const allEdits: EditDiff[] = [];
    for (const change of fileChanges) {
      if (change.editDiffs) {
        allEdits.push(...change.editDiffs);
      }
    }

    return allEdits;
  }, [activeFile?.id, pendingChanges, files]);

  // 6.2 Count pending edits for toolbar display
  const pendingEditCount = useMemo(() => {
    return activeEditDiffs.filter(edit =>
      edit.status === 'pending' && !processedEditIds.includes(edit.id)
    ).length;
  }, [activeEditDiffs, processedEditIds]);

  // 6.3 Handler for individual edit actions (accept/reject)
  // In the new inline diff model:
  //   - Content in textarea is already the NEW content (auto-applied)
  //   - Accept = just clear the marker (content stays)
  //   - Reject = revert the region to originalSegment
  const handleEditAction = useCallback((editId: string, action: 'accept' | 'reject') => {
    console.log('[Editor] Edit action:', { editId, action });

    const editDiff = activeEditDiffs.find(e => e.id === editId);
    setProcessedEditIds(prev => [...prev, editId]);

    if (action === 'accept') {
      // Content already applied - just clear marker
      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `✅ 已批准变更 #${editDiff?.editIndex !== undefined ? editDiff.editIndex + 1 : editId}`,
        timestamp: Date.now(),
        metadata: { logType: 'success' }
      });
    } else if (action === 'reject') {
      // Revert the region to original content
      if (editDiff && activeFile) {
        const currentContent = content;
        const lines = currentContent.split('\n');
        const adjustedEdits = rebuildEditLineNumbers(activeEditDiffs, editIncrements);
        const adjustedEdit = adjustedEdits.find(e => e.id === editId);

        if (adjustedEdit) {
          const startIdx = Math.max(0, adjustedEdit.startLine - 1);
          const endIdx = Math.min(lines.length, adjustedEdit.endLine);
          const originalLines = editDiff.originalSegment ? editDiff.originalSegment.split('\n') : [];

          lines.splice(startIdx, endIdx - startIdx, ...originalLines);
          const newContent = lines.join('\n');

          setContent(newContent);
          safeSaveFileContent(activeFile.id, newContent);
        }
      }

      addMessage({
        id: Math.random().toString(),
        role: 'system',
        text: `❌ 已拒绝变更 #${editDiff?.editIndex !== undefined ? editDiff.editIndex + 1 : editId}`,
        timestamp: Date.now(),
        metadata: { logType: 'info' }
      });
    }

    // Check if all edits have been processed
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

      // Auto chapter analysis for draft files
      if (filePath?.startsWith('05_正文草稿/') && changesToRemove.length > 0) {
        addMessage({ id: Math.random().toString(), role: 'system', text: `🔍 正在自动分析章节: ${filePath}`, timestamp: Date.now(), metadata: { logType: 'info' } });
        const chapterAnalysisStore = useChapterAnalysisStore.getState();
        const agentStore = useAgentStore.getState();
        const projectStore = useProjectStore.getState();
        chapterAnalysisStore.triggerExtraction(filePath, agentStore.currentSessionId || '', projectStore.project?.id || '')
          .then(() => { addMessage({ id: Math.random().toString(), role: 'system', text: `✅ 章节分析完成: ${filePath}`, timestamp: Date.now(), metadata: { logType: 'success' } }); })
          .catch((err: Error) => { addMessage({ id: Math.random().toString(), role: 'system', text: `⚠️ 章节分析失败: ${err.message}`, timestamp: Date.now(), metadata: { logType: 'error' } }); });
      }
    }
  }, [activeEditDiffs, processedEditIds, activeFile, content, editIncrements, addMessage, pendingChanges, removePendingChange, safeSaveFileContent, setContent, files]);

  // 6.4 Handler for accepting all pending edits
  // Content already applied - just clear all markers
  const handleAcceptAllEdits = useCallback(() => {
    if (!activeFile || activeEditDiffs.length === 0) return;

    const pendingEdits = activeEditDiffs.filter(edit =>
      edit.status === 'pending' && !processedEditIds.includes(edit.id)
    );
    if (pendingEdits.length === 0) return;

    // Mark all as processed (content already in textarea)
    setProcessedEditIds(prev => [...prev, ...pendingEdits.map(e => e.id)]);

    // Save current content (it's already the new content)
    safeSaveFileContent(activeFile.id, content);

    // Clean up pending changes
    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    addMessage({ id: Math.random().toString(), role: 'system', text: `✅ 已批准全部 ${pendingEdits.length} 个变更`, timestamp: Date.now(), metadata: { logType: 'success' } });

    // Auto chapter analysis
    if (filePath?.startsWith('05_正文草稿/') && changesToRemove.length > 0) {
      addMessage({ id: Math.random().toString(), role: 'system', text: `🔍 正在自动分析章节: ${filePath}`, timestamp: Date.now(), metadata: { logType: 'info' } });
      const chapterAnalysisStore = useChapterAnalysisStore.getState();
      const agentStore = useAgentStore.getState();
      const projectStore = useProjectStore.getState();
      chapterAnalysisStore.triggerExtraction(filePath, agentStore.currentSessionId || '', projectStore.project?.id || '')
        .then(() => { addMessage({ id: Math.random().toString(), role: 'system', text: `✅ 章节分析完成: ${filePath}`, timestamp: Date.now(), metadata: { logType: 'success' } }); })
        .catch((err: Error) => { addMessage({ id: Math.random().toString(), role: 'system', text: `⚠️ 章节分析失败: ${err.message}`, timestamp: Date.now(), metadata: { logType: 'error' } }); });
    }
  }, [activeFile, activeEditDiffs, processedEditIds, content, safeSaveFileContent, pendingChanges, removePendingChange, addMessage, files]);

  // 6.5 Handler for rejecting all pending edits
  // Revert ALL change regions to their original content
  const handleRejectAllEdits = useCallback(() => {
    if (!activeFile || activeEditDiffs.length === 0) return;

    const pendingEdits = activeEditDiffs.filter(edit =>
      edit.status === 'pending' && !processedEditIds.includes(edit.id)
    );
    if (pendingEdits.length === 0) return;

    // Revert all changes by replacing modified regions with originals
    const adjustedEdits = rebuildEditLineNumbers(activeEditDiffs, editIncrements);
    const lines = content.split('\n');

    // Sort descending to apply from bottom to top (prevents index shift)
    const sortedEdits = pendingEdits
      .map(edit => ({ ...edit, adjusted: adjustedEdits.find(e => e.id === edit.id) }))
      .filter(e => e.adjusted)
      .sort((a, b) => b.adjusted!.startLine - a.adjusted!.startLine);

    for (const edit of sortedEdits) {
      const startIdx = Math.max(0, edit.adjusted!.startLine - 1);
      const endIdx = Math.min(lines.length, edit.adjusted!.endLine);
      const originalLines = edit.originalSegment ? edit.originalSegment.split('\n') : [];
      lines.splice(startIdx, endIdx - startIdx, ...originalLines);
    }

    const newContent = lines.join('\n');
    setContent(newContent);
    safeSaveFileContent(activeFile.id, newContent);

    // Mark all as processed
    setProcessedEditIds(prev => [...prev, ...pendingEdits.map(e => e.id)]);

    // Clean up pending changes
    const filePath = getNodePath(activeFile, files);
    const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);
    changesToRemove.forEach(c => removePendingChange(c.id));

    addMessage({ id: Math.random().toString(), role: 'system', text: `❌ 已拒绝全部 ${pendingEdits.length} 个变更`, timestamp: Date.now(), metadata: { logType: 'info' } });
  }, [activeFile, activeEditDiffs, processedEditIds, editIncrements, content, setContent, safeSaveFileContent, pendingChanges, removePendingChange, addMessage, files]);

  // 6.6 Auto-apply pending changes to editor content
  // When new editDiffs arrive, apply modifiedSegments to the textarea
  const prevAppliedChangeIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeFile || activeEditDiffs.length === 0) return;

    // Find changes that haven't been applied yet
    const filePath = getNodePath(activeFile, files);
    const fileChanges = pendingChanges.filter(c => c.fileName === filePath);
    const newChangeIds = fileChanges.map(c => c.id).filter(id => !prevAppliedChangeIdsRef.current.has(id));

    if (newChangeIds.length === 0) return;

    // Get the new edits from these changes
    const newEdits: EditDiff[] = [];
    for (const change of fileChanges) {
      if (newChangeIds.includes(change.id) && change.editDiffs) {
        newEdits.push(...change.editDiffs);
      }
    }

    if (newEdits.length === 0) {
      newChangeIds.forEach(id => prevAppliedChangeIdsRef.current.add(id));
      return;
    }

    // Apply all new edits to current content (bottom-up to preserve indices)
    const lines = content.split('\n');
    const sortedEdits = [...newEdits].sort((a, b) => b.startLine - a.startLine);

    for (const edit of sortedEdits) {
      const startIdx = Math.max(0, edit.startLine - 1);
      const endIdx = Math.min(lines.length, edit.endLine);
      const newLines = edit.modifiedSegment ? edit.modifiedSegment.split('\n') : [];
      lines.splice(startIdx, endIdx - startIdx, ...newLines);
    }

    const newContent = lines.join('\n');
    isApplyingBatchRef.current = true;
    setContent(newContent);
    safeSaveFileContent(activeFile.id, newContent);
    isApplyingBatchRef.current = false;

    // Mark these changes as applied
    newChangeIds.forEach(id => prevAppliedChangeIdsRef.current.add(id));

    console.log('[Editor] Auto-applied pending changes', {
      changeIds: newChangeIds,
      editCount: newEdits.length
    });
  }, [activeEditDiffs, activeFile?.id, pendingChanges]);

  // Clear applied change tracking when switching files
  useEffect(() => {
    prevAppliedChangeIdsRef.current = new Set();
  }, [activeFileId]);

  // Sync content from store
  const prevFileIdRef = useRef<string | null>(null);
  useEffect(() => {
      // Logic 1: File Switch
      if (activeFileId !== prevFileIdRef.current) {
          // Clear edit mode diff state when switching files
          setEditIncrements([]);
          setProcessedEditIds([]);

          // FIX: 独立化审查状态 - 切换文件时只清理 reviewingChangeId，不删除 pendingChanges
          // 使用 fileId 进行更可靠的比较
          if (prevFileIdRef.current && reviewingChangeId) {
              const reviewingChange = pendingChanges.find(c => c.id === reviewingChangeId);
              if (reviewingChange) {
                  // 优先使用 fileId 比较，如果没有 fileId 则 fallback 到路径比较
                  const belongsToPrevFile = reviewingChange.fileId
                      ? reviewingChange.fileId === prevFileIdRef.current
                      : (() => {
                          const prevFile = files.find(f => f.id === prevFileIdRef.current);
                          return prevFile && reviewingChange.fileName === getNodePath(prevFile, files);
                      })();

                  if (belongsToPrevFile) {
                      console.log('[File Switch] Exiting review mode - switched away from reviewed file');
                      setReviewingChangeId(null);
                  }
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
      else if (activeFile && activeFile.content !== content && !isApplyingBatchRef.current) {
          // Skip sync if triggered by undo/redo - let local state take precedence
          if (isUndoRedoRef.current) {
              isUndoRedoRef.current = false;
              console.log('[Editor] Skipping external sync - undo/redo in progress');
          } else {
              setContent(activeFile.content || '');
          }
      }
  }, [activeFileId, activeFile, content, resetHistory, setContent, pendingChanges, reviewingChangeId, setReviewingChangeId, files, internalMode]);

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

  // --- 测量每行实际高度（用于 wordWrap 模式） ---
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  // 测量每行实际高度的函数
  const measureLineHeights = useCallback(() => {
    const textarea = textareaRef.current;

    if (!textarea || !wordWrap) {
      // 非 wordWrap 模式，不需要测量
      setLineHeights([]);
      return;
    }

    // 获取 textarea 的样式信息
    const computedStyle = window.getComputedStyle(textarea);

    // 获取内容行
    const contentLines = content.split('\n');
    const newLineHeights: number[] = [];

    // 获取 textarea 的可用宽度（减去 padding）
    const textareaWidth = textarea.clientWidth;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const availableWidth = textareaWidth - paddingLeft - paddingRight;

    // 测量每行的实际高度
    const measureDiv = document.createElement('div');
    measureDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-family: ${computedStyle.fontFamily};
      font-size: ${computedStyle.fontSize};
      line-height: ${computedStyle.lineHeight};
      width: ${availableWidth}px;
    `;
    document.body.appendChild(measureDiv);

    contentLines.forEach((line) => {
      measureDiv.textContent = line || '\u200B'; // 使用零宽空格保持空行
      const height = measureDiv.offsetHeight;
      newLineHeights.push(height);
    });

    document.body.removeChild(measureDiv);
    setLineHeights(newLineHeights);
  }, [content, wordWrap]);

  // 当 content 或 wordWrap 变化时重新测量行高
  useEffect(() => {
    measureLineHeights();
  }, [measureLineHeights]);

  // 当窗口大小变化时重新测量
  useEffect(() => {
    const handleResize = () => {
      // 延迟测量，等待布局完成
      setTimeout(measureLineHeights, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureLineHeights]);

  // --- Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setContent(newText);
    setIsDirty(true);
    if (activeFile) {
        safeSaveFileContent(activeFile.id, newText);
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
      if (highlightRef.current) {
          highlightRef.current.scrollTop = e.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
      // Track scroll position for EditHighlightOverlay
      setOverlayScrollTop(e.currentTarget.scrollTop);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;

      // Standard undo/redo
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
                  if (activeFile) safeSaveFileContent(activeFile.id, newVal);
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
                  if (activeFile) safeSaveFileContent(activeFile.id, newVal);
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

  // Search handlers
  const handleToggleSearch = () => {
      setSearchOpen(!searchOpen);
      if (!searchOpen) {
          // Opening search - focus on existing search or reset
          if (searchTerm) {
              // Keep existing search
          } else {
              setCurrentMatchIndex(0);
              setSearchResults([]);
          }
      }
  };

  const handleSearchChange = (term: string) => {
      setSearchTerm(term);
      if (term) {
          const results = findSearchResults(content, term, searchCaseSensitive);
          setSearchResults(results);
          setCurrentMatchIndex(results.length > 0 ? 0 : -1);
      } else {
          setSearchResults([]);
          setCurrentMatchIndex(-1);
      }
  };

  const handleSearchNext = () => {
      if (searchResults.length === 0) return;
      const nextIndex = (currentMatchIndex + 1) % searchResults.length;
      setCurrentMatchIndex(nextIndex);
      jumpToMatch(nextIndex);
  };

  const handleSearchPrev = () => {
      if (searchResults.length === 0) return;
      const prevIndex = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
      setCurrentMatchIndex(prevIndex);
      jumpToMatch(prevIndex);
  };

  const handleToggleCaseSensitive = () => {
      setSearchCaseSensitive(!searchCaseSensitive);
      if (searchTerm) {
          const results = findSearchResults(content, searchTerm, !searchCaseSensitive);
          setSearchResults(results);
          setCurrentMatchIndex(results.length > 0 ? 0 : -1);
      }
  };

  const jumpToMatch = (index: number) => {
      if (index < 0 || index >= searchResults.length) return;
      const match = searchResults[index];
      const { line, col } = getLineAndColFromIndex(content, match.index);

      // Calculate cursor position in textarea
      const lines = content.split('\n');
      let charCount = 0;
      for (let i = 0; i < line - 1; i++) {
          charCount += lines[i].length + 1;
      }
      charCount += col - 1;

      // Focus textarea and set cursor position
      const textarea = textareaRef.current;
      if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(charCount + match.length, charCount + match.length);

          // Calculate scroll position
          const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
          const scrollPosition = (line - 1) * lineHeight;
          textarea.scrollTop = Math.max(0, scrollPosition - textarea.clientHeight / 2);
      }
  };

  useEffect(() => {
      if (isDirty) {
          const timer = setTimeout(() => setIsDirty(false), 1000);
          return () => clearTimeout(timer);
      }
  }, [isDirty]);

  // (Old diff mode handlers removed - inline diff in edit mode replaces all of this)

  // --- Search Highlight Rendering ---
  const highlightedContent = useMemo(() => {
    if (!searchOpen || !searchTerm || searchResults.length === 0) {
      return null;
    }

    // Build highlighted HTML with mark tags
    const result: React.ReactNode[] = [];
    let lastIndex = 0;

    searchResults.forEach((match, idx) => {
      // Add text before match
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        result.push(<span key={`text-${idx}`}>{textBefore}</span>);
      }

      // Add highlighted match
      const matchText = content.slice(match.index, match.index + match.length);
      const isCurrentMatch = idx === currentMatchIndex;
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

    // Add remaining text
    if (lastIndex < content.length) {
      result.push(<span key="text-end">{content.slice(lastIndex)}</span>);
    }

    return result;
  }, [searchOpen, searchTerm, searchResults, currentMatchIndex, content]);

  const renderEditor = () => (
      <div className="flex h-full w-full relative overflow-hidden">
          {/* Gutter - Only visible if line numbers enabled */}
          {showLineNumbers && (
              <div
                  ref={gutterRef}
                  className="shrink-0 w-10 sm:w-12 bg-[#0d1117] border-r border-gray-800 text-right pr-2 pt-4 sm:pt-6 text-gray-600 select-none overflow-hidden font-mono text-sm sm:text-base"
                  aria-hidden="true"
              >
                  {lines.map((ln, index) => {
                      // wordWrap 模式下使用测量的高度，否则使用默认行高
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
                  {/* Extra padding at bottom to match textarea scrolling */}
                  <div className="h-20" />
              </div>
          )}

          {/* Search Highlight Layer - positioned above textarea */}
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

          {/* Inline Diff Highlight Overlay */}
          {activeEditDiffs.length > 0 && pendingEditCount > 0 && (
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

  // Fallback: If no file selected
  if (!activeFile) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-gray-500 bg-[#0d1117] ${className}`}>
        <FileText size={48} className="mb-4 opacity-20" />
        <p className="text-sm">选择一个文件开始写作</p>
      </div>
    );
  }

  // 检测是否为章节分析虚拟文件（用于阅读灯视图）- 优先级最高
  if (activeFile) {
    const filePath = getNodePath(activeFile, files).replace(/\\/g, '/'); // 统一用正斜杠
    // 章节分析.json -> ReadingLightView（优先级最高）
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

  // 正常的 Markdown/其他文件渲染

  return (
    <div className={`flex flex-col h-full bg-[#0d1117] ${className}`}>

      {/* EDITOR TOOLBAR */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 border-b shrink-0 bg-[#161b22] border-gray-800">
        {/* File Info - Single Row Layout */}
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

        {/* Pending Edits Indicator & Actions */}
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
            {/* Search Button */}
            <button
                onClick={handleToggleSearch}
                className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-r border-gray-700 mr-0.5 sm:mr-1 ${
                    searchOpen ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
                title="搜索 (Ctrl+F)"
            >
                <Search size={14} />
            </button>

            {/* View Settings Toggles - Desktop Only */}
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

            <button onClick={undo} disabled={!canUndo} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all ${canUndo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'}`} title="Undo (Ctrl+Z)"><RotateCcw size={14} /></button>
            <button onClick={redo} disabled={!canRedo} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all border-r border-gray-700 mr-0.5 sm:mr-1 ${canRedo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'}`} title="Redo (Ctrl+Shift+Z)"><RotateCw size={14} /></button>
            <button onClick={() => handleSetMode('edit')} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all ${internalMode === 'edit' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title="Edit Mode"><Edit3 size={14} /></button>
            <button onClick={() => handleSetMode('preview')} className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-7 rounded transition-all ${internalMode === 'preview' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title="Preview Mode"><Eye size={14} /></button>
            {/* Split View - Desktop Only */}
            <button onClick={handleToggleSplit} className={`hidden sm:flex items-center justify-center w-8 h-7 rounded transition-all border-l border-gray-700 ml-1 ${isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} title={isSplitView ? "关闭分屏" : "开启分屏对比"}><Columns size={14} /></button>

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

      {/* SEARCH PANEL */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 animate-in slide-in-from-top-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="搜索..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                      e.shiftKey ? handleSearchPrev() : handleSearchNext();
                  } else if (e.key === 'Escape') {
                      setSearchOpen(false);
                  }
              }}
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleSearchPrev}
              disabled={!searchTerm || searchResults.length === 0}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="上一个 (Shift+Enter)"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={handleSearchNext}
              disabled={!searchTerm || searchResults.length === 0}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="下一个 (Enter)"
            >
              <ChevronDown size={16} />
            </button>

            {searchResults.length > 0 && (
              <span className="text-xs text-gray-400 min-w-[60px] text-center">
                {currentMatchIndex + 1} / {searchResults.length}
              </span>
            )}
          </div>

          <button
            onClick={handleToggleCaseSensitive}
            className={`px-2 py-1.5 text-xs rounded border transition-colors ${
              searchCaseSensitive
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
            title="区分大小写"
          >
            Aa
          </button>

          <button
            onClick={handleToggleSearch}
            className="p-1.5 text-gray-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative bg-[#0d1117]">
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
