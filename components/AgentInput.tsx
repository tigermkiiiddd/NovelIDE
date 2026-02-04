

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Send, FileText, Folder } from 'lucide-react';
import { FileNode, FileType } from '../types';
import { getNodePath } from '../services/fileSystem';

interface AgentInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  files: FileNode[];
  autoFocus?: boolean;
}

const AgentInput: React.FC<AgentInputProps> = ({ onSendMessage, isLoading, files, autoFocus }) => {
  const [input, setInput] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && window.innerWidth > 768) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // --- Filter Files for Mention ---
  const filteredFiles = useMemo(() => {
      if (!showMentionList) return [];
      const lowerQuery = mentionQuery.toLowerCase();
      
      return files
          .filter(f => f.name.toLowerCase().includes(lowerQuery) && f.id !== 'root')
          .sort((a, b) => {
               if (a.type !== b.type) return a.type === FileType.FILE ? -1 : 1;
               return a.name.localeCompare(b.name);
          })
          .slice(10);
  }, [showMentionList, mentionQuery, files]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const selectionStart = e.target.selectionStart || 0;
    setInput(val);
    setCursorPos(selectionStart);

    // Detect @ mention
    const textBeforeCursor = val.slice(0, selectionStart);
    const mentionMatch = textBeforeCursor.match(/@([^@\s]*)$/);

    if (mentionMatch) {
        setShowMentionList(true);
        setMentionQuery(mentionMatch[1]);
        setMentionIndex(0);
    } else {
        setShowMentionList(false);
    }
  };

  const insertMention = (file: FileNode) => {
      // Use system utility to get standardized path
      const fullPath = getNodePath(file, files);
      const textBeforeCursor = input.slice(0, cursorPos);
      const textAfterCursor = input.slice(cursorPos);
      
      const lastAtPos = textBeforeCursor.lastIndexOf('@');
      const newTextBefore = textBeforeCursor.slice(0, lastAtPos) + `@${fullPath} `;
      
      const newValue = newTextBefore + textAfterCursor;
      setInput(newValue);
      setShowMentionList(false);
      
      setTimeout(() => {
          if (inputRef.current) {
              inputRef.current.focus();
              const newCursorPos = newTextBefore.length;
              inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
      }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (showMentionList && filteredFiles.length > 0) {
          if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMentionIndex(prev => (prev > 0 ? prev - 1 : filteredFiles.length - 1));
              return;
          }
          if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMentionIndex(prev => (prev < filteredFiles.length - 1 ? prev + 1 : 0));
              return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insertMention(filteredFiles[mentionIndex]);
              return;
          }
          if (e.key === 'Escape') {
              e.preventDefault();
              setShowMentionList(false);
              return;
          }
      }

      if (e.key === 'Enter' && !e.shiftKey && !showMentionList) {
          e.preventDefault();
          handleSubmit();
      }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
    setShowMentionList(false);
  };

  return (
    <div className="p-3 bg-gray-800 border-t border-gray-700 shrink-0 safe-area-bottom relative">
        {/* Mention Autocomplete List */}
        {showMentionList && filteredFiles.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden z-50 max-h-60 flex flex-col">
                <div className="p-2 bg-gray-850 text-xs text-gray-500 border-b border-gray-700 font-medium">
                    选择文件引用 (使用 ↑↓ Enter)
                </div>
                <ul className="overflow-y-auto">
                    {filteredFiles.map((file, index) => {
                        const fullPath = getNodePath(file, files);
                        return (
                            <li 
                                key={file.id}
                                onClick={() => insertMention(file)}
                                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between group ${
                                    index === mentionIndex ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    {file.type === FileType.FOLDER ? <Folder size={14} className="text-yellow-500" /> : <FileText size={14} className="text-blue-400 group-hover:text-blue-300" />}
                                    <span className="truncate font-medium">{file.name}</span>
                                </div>
                                <span className={`text-xs ml-4 truncate max-w-[40%] ${index === mentionIndex ? 'text-blue-200' : 'text-gray-500'}`}>
                                    {fullPath}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入 @ 引用文件..."
            className="flex-1 bg-gray-900 text-white placeholder-gray-500 border border-gray-600 rounded-full px-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
            autoComplete="off"
        />
        <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
            <Send size={18} />
        </button>
        </form>
    </div>
  );
};

export default AgentInput;