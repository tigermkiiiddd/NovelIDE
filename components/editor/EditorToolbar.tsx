/**
 * EditorToolbar - 编辑器工具栏组件
 *
 * 从 Editor.tsx 提取，负责显示编辑器控制按钮
 */

import React, { useState } from 'react';
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
  Circle
} from 'lucide-react';

export interface EditorToolbarProps {
  mode: 'edit' | 'preview' | 'diff';
  fileName?: string;
  isDirty?: boolean;
  isSplitView?: boolean;
  wordCount?: number;
  cursorStats?: { line: number; col: number };
  canUndo?: boolean;
  canRedo?: boolean;
  searchOpen?: boolean;
  searchTerm?: string;
  searchCaseSensitive?: boolean;
  currentMatchIndex?: number;
  totalMatches?: number;
  onToggleWordWrap?: () => void;
  onToggleLineNumbers?: () => void;
  onSetMode?: (mode: 'edit' | 'preview') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleSplit?: () => void;
  onToggleSearch?: () => void;
  onSearchChange?: (term: string) => void;
  onSearchNext?: () => void;
  onSearchPrev?: () => void;
  onToggleCaseSensitive?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  mode,
  fileName,
  isDirty,
  isSplitView,
  wordCount,
  cursorStats,
  canUndo = false,
  canRedo = false,
  searchOpen = false,
  searchTerm = '',
  searchCaseSensitive = false,
  currentMatchIndex = 0,
  totalMatches = 0,
  onToggleWordWrap,
  onToggleLineNumbers,
  onSetMode,
  onUndo,
  onRedo,
  onToggleSplit,
  onToggleSearch,
  onSearchChange,
  onSearchNext,
  onSearchPrev,
  onToggleCaseSensitive
}) => {
  return (
    <>
      <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 transition-colors ${
        mode === 'diff' ? 'hidden' : 'bg-[#1b2622] border-gray-800'
      }`}>
        {/* 左侧：文件信息 */}
        <div className="flex items-center gap-2 overflow-hidden">
          <FileText size={16} className="text-blue-400" />
          <span className={`font-medium truncate font-mono text-xs sm:text-sm flex items-center gap-2 text-gray-200`}>
            {fileName || 'Untitled'}
            {isDirty && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="Unsaved changes" />}
          </span>
          {fileName && (
            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono leading-none">
              <span>{wordCount} 字</span>
              <span className="text-gray-700">|</span>
              <span>Ln {cursorStats?.line}, Col {cursorStats?.col}</span>
            </div>
          )}
        </div>

        {/* 右侧：工具按钮组 */}
        <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
          {/* 搜索按钮 */}
          <button
            onClick={onToggleSearch}
            className={`flex items-center justify-center w-8 h-7 rounded transition-all border-r border-gray-700 mr-1 ${
              searchOpen ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="搜索 (Ctrl+F)"
          >
            <Search size={14} />
          </button>

          {/* 模式切换按钮 */}
          <button
            onClick={onToggleWordWrap}
            className={`flex items-center justify-center w-8 h-7 rounded transition-all ${
              mode === 'edit' || isSplitView ? 'bg-gray-700 text-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={wordWrap ? "自动换行: 开启" : "自动换行: 关闭"}
          >
            <WrapText size={14} />
          </button>
          <button
            onClick={onToggleLineNumbers}
            className={`flex items-center justify-center w-8 h-7 rounded transition-all border-r border-gray-700 mr-1 ${
              mode === 'edit' || isSplitView ? 'bg-gray-700 text-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="显示行号"
          >
            <ListOrdered size={14} />
          </button>

          {/* 撤销/重做 */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`flex items-center justify-center w-8 h-7 rounded transition-all border-r border-gray-700 mr-1 ${
              canUndo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`flex items-center justify-center w-8 h-7 rounded transition-all border-r border-gray-700 mr-1 ${
              canRedo ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-700 cursor-not-allowed'
            }`}
            title="Redo (Ctrl+Shift+Z)"
          >
            <RotateCw size={14} />
          </button>

          {/* 模式切换 */}
          <button
            onClick={() => onSetMode?.('edit')}
            className={`flex items-center justify-center w-8 h-7 rounded transition-all ${
              mode === 'edit' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Edit Mode"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={() => onSetMode?.('preview')}
            className={`flex items-center justify-center w-8 h-7 rounded transition-all ${
              mode === 'preview' && !isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Preview Mode"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={onToggleSplit}
            className={`hidden md:flex items-center justify-center w-8 h-7 rounded transition-all border-l border-gray-700 ml-1 ${
              isSplitView ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={isSplitView ? "关闭分屏" : "开启分屏"}
          >
            {isSplitView ? <Columns size={14} /> : <AlignJustify size={14} />}
          </button>
        </div>
      </div>

      {/* 搜索面板 */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 animate-in slide-in-from-top-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="搜索..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange?.('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onSearchPrev}
              disabled={!searchTerm || totalMatches === 0}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="上一个 (Shift+Enter)"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={onSearchNext}
              disabled={!searchTerm || totalMatches === 0}
              className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="下一个 (Enter)"
            >
              <ChevronDown size={16} />
            </button>

            {totalMatches > 0 && (
              <span className="text-xs text-gray-400 min-w-[60px] text-center">
                {currentMatchIndex + 1} / {totalMatches}
              </span>
            )}
          </div>

          <button
            onClick={onToggleCaseSensitive}
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
            onClick={onToggleSearch}
            className="p-1.5 text-gray-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
};
