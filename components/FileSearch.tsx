/**
 * FileSearch - 文件搜索组件
 *
 * 支持搜索文件名和文件内容
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, File, FileText, Type, ChevronDown, ChevronUp } from 'lucide-react';
import { useFileStore } from '../stores/fileStore';
import { useUiStore } from '../stores/uiStore';
import { getNodePath } from '../services/fileSystem';

interface FileSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (fileId: string) => void;
}

interface SearchResult {
  fileId: string;
  fileName: string;
  filePath: string;
  type: 'name' | 'content';
  matches: Array<{
    line: number;
    content: string;
    index: number;
  }>;
}

export const FileSearch: React.FC<FileSearchProps> = ({
  isOpen,
  onClose,
  onFileSelect
}) => {
  const files = useFileStore(state => state.files);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'name' | 'content'>('content');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Use ref to avoid infinite re-renders when files reference changes
  const filesRef = useRef(files);
  filesRef.current = files;

  // Perform search when term or type changes
  useEffect(() => {
    const currentFiles = filesRef.current;

    if (!searchTerm.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const searchTarget = isCaseSensitive ? searchTerm : searchLower;

    const foundResults: SearchResult[] = [];

    currentFiles.filter(f => f.type === 'FILE').forEach(file => {
      const matches: SearchResult['matches'] = [];

      if (searchType === 'name' || searchType === 'content') {
        // Search in filename
        const fileName = isCaseSensitive ? file.name : file.name.toLowerCase();
        if (fileName.includes(searchTarget)) {
          matches.push({
            line: 0,
            content: file.name,
            index: fileName.indexOf(searchTarget)
          });
        }
      }

      if (searchType === 'content') {
        // Search in file content
        if (file.content) {
          const lines = file.content.split('\n');
          lines.forEach((line, lineNum) => {
            const lineContent = isCaseSensitive ? line : line.toLowerCase();
            let index = lineContent.indexOf(searchTarget);
            while (index !== -1) {
              matches.push({
                line: lineNum + 1,
                content: line.trim(),
                index
              });
              index = lineContent.indexOf(searchTarget, index + 1);
            }
          });
        }
      }

      if (matches.length > 0) {
        foundResults.push({
          fileId: file.id,
          fileName: file.name,
          filePath: getNodePath(file, currentFiles),
          type: searchType,
          matches
        });
      }
    });

    // Sort by relevance (more matches first)
    foundResults.sort((a, b) => b.matches.length - a.matches.length);

    setResults(foundResults);
    setSelectedIndex(foundResults.length > 0 ? 0 : -1);
  }, [searchTerm, searchType, isCaseSensitive]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(results.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault();
        handleSelectResult(results[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  const handleSelectResult = (result: SearchResult) => {
    onFileSelect(result.fileId);
    onClose();
  };

  const highlightMatch = (text: string, term: string) => {
    if (!isCaseSensitive) {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return text.replace(regex, '<mark class="bg-yellow-500/50 text-yellow-200 rounded px-0.5">$1</mark>');
    }
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g');
    return text.replace(regex, '<mark class="bg-yellow-500/50 text-yellow-200 rounded px-0.5">$1</mark>');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-32 bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[70vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold flex items-center gap-2 text-gray-100">
            <Search size={20} className="text-blue-400" />
            搜索文件
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-10 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Search Options */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchType('name')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  searchType === 'name'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <File size={16} />
                文件名
              </button>
              <button
                onClick={() => setSearchType('content')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  searchType === 'content'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <FileText size={16} />
                文件内容
              </button>
            </div>

            <button
              onClick={() => setIsCaseSensitive(!isCaseSensitive)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                isCaseSensitive
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
              title="区分大小写"
            >
              Aa
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {searchTerm && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Search size={48} className="mb-4 opacity-20" />
              <p>未找到匹配的文件</p>
            </div>
          ) : !searchTerm ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Search size={48} className="mb-4 opacity-20" />
              <p>输入关键词开始搜索</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {results.map((result, resultIndex) => (
                <div
                  key={result.fileId}
                  onClick={() => handleSelectResult(result)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedIndex === resultIndex
                      ? 'bg-blue-900/20'
                      : 'hover:bg-gray-800/50'
                  }`}
                >
                  {/* File Path */}
                  <div className="flex items-center gap-2 mb-2">
                    {result.type === 'name' ? (
                      <File size={16} className="text-blue-400" />
                    ) : (
                      <FileText size={16} className="text-purple-400" />
                    )}
                    <span className="text-sm text-gray-300 font-medium truncate">
                      {result.fileName}
                    </span>
                    <span className="text-xs text-gray-600">{result.filePath}</span>
                    <span className="ml-auto text-xs text-gray-500">
                      {result.matches.length} 处匹配
                    </span>
                  </div>

                  {/* Matches */}
                  {result.type === 'content' && result.matches.slice(0, 3).map((match, idx) => (
                    <div
                      key={idx}
                      className="ml-6 mb-1 text-sm text-gray-400 font-mono truncate"
                      dangerouslySetInnerHTML={{
                        __html: `<span class="text-gray-600 mr-2">Ln ${match.line}:</span>${highlightMatch(
                          match.content,
                          isCaseSensitive ? searchTerm : searchTerm.toLowerCase()
                        )}`
                      }}
                    />
                  ))}
                  {result.type === 'content' && result.matches.length > 3 && (
                    <div className="ml-6 text-xs text-gray-600">
                      还有 {result.matches.length - 3} 处匹配...
                    </div>
                  )}

                  {result.type === 'name' && (
                    <div className="ml-6 text-sm text-gray-500 truncate">
                      {result.filePath}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="p-3 border-t border-gray-700 text-xs text-gray-500 flex items-center justify-between">
            <span>找到 {results.length} 个文件</span>
            <span className="text-gray-600">使用 ↑↓ 导航，Enter 打开</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileSearch;
