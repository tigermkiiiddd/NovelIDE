/**
 * useEditorSearch - 编辑器搜索功能 Hook
 *
 * 从 Editor.tsx 提取的搜索逻辑
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { findSearchResults, getLineAndColFromIndex, getIndexFromLineAndCol } from '../../utils/searchUtils';

export interface SearchResult {
  index: number;
  length: number;
}

export interface EditorSearchState {
  // 搜索状态
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  toggleSearch: () => void;

  searchTerm: string;
  setSearchTerm: (term: string) => void;

  searchCaseSensitive: boolean;
  setSearchCaseSensitive: (sensitive: boolean) => void;
  toggleCaseSensitive: () => void;

  currentMatchIndex: number;
  setCurrentMatchIndex: (index: number) => void;

  searchResults: SearchResult[];

  // 操作
  searchNext: () => void;
  searchPrev: () => void;

  // 统计
  totalMatches: number;
}

export interface UseEditorSearchOptions {
  content: string;
  cursorStats: { line: number; col: number };
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onCursorChange?: (line: number, col: number) => void;
}

export const useEditorSearch = (options: UseEditorSearchOptions): EditorSearchState => {
  const { content, cursorStats, textareaRef, onCursorChange } = options;

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    return findSearchResults(content, searchTerm, searchCaseSensitive);
  }, [content, searchTerm, searchCaseSensitive]);

  const totalMatches = searchResults.length;

  // 切换搜索面板
  const toggleSearch = useCallback(() => {
    setSearchOpen(prev => !prev);
  }, []);

  // 切换大小写敏感
  const toggleCaseSensitive = useCallback(() => {
    setSearchCaseSensitive(prev => !prev);
  }, []);

  // 搜索下一个
  const searchNext = useCallback(() => {
    if (searchResults.length === 0) return;

    const nextIndex = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIndex);

    const match = searchResults[nextIndex];
    if (match && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(match.index, match.index + match.length);

      // 更新光标位置
      const { line, col } = getLineAndColFromIndex(content, match.index);
      onCursorChange?.(line, col);
    }
  }, [searchResults, currentMatchIndex, textareaRef, content, onCursorChange]);

  // 搜索上一个
  const searchPrev = useCallback(() => {
    if (searchResults.length === 0) return;

    const prevIndex = currentMatchIndex === 0 ? searchResults.length - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);

    const match = searchResults[prevIndex];
    if (match && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(match.index, match.index + match.length);

      // 更新光标位置
      const { line, col } = getLineAndColFromIndex(content, match.index);
      onCursorChange?.(line, col);
    }
  }, [searchResults, currentMatchIndex, textareaRef, content, onCursorChange]);

  // 当搜索词变化时重置索引
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchTerm]);

  // 快捷键: Ctrl+F 打开搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  return {
    searchOpen,
    setSearchOpen,
    toggleSearch,

    searchTerm,
    setSearchTerm,

    searchCaseSensitive,
    setSearchCaseSensitive,
    toggleCaseSensitive,

    currentMatchIndex,
    setCurrentMatchIndex,

    searchResults,
    totalMatches,

    searchNext,
    searchPrev
  };
};
