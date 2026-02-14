/**
 * EditorToolbar - 编辑器工具栏组件
 *
 * 从 Editor.tsx 提取，负责显示编辑器控制按钮
 */

import React from 'react';
import {
  FileText,
  Edit3,
  Eye,
  Columns,
  WrapText,
  AlignJustify,
  ListOrdered,
  RotateCcw,
  RotateCw
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
  onToggleWordWrap?: () => void;
  onToggleLineNumbers?: () => void;
  onSetMode?: (mode: 'edit' | 'preview') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleSplit?: () => void;
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
  onToggleWordWrap,
  onToggleLineNumbers,
  onSetMode,
  onUndo,
  onRedo,
  onToggleSplit
}) => {
  return (
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
  );
};
