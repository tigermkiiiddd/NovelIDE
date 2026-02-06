
import React, { useState, useRef, useEffect } from 'react';
import { FileNode, FileType } from '../types';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, Trash2, FilePlus, FolderPlus, X, Edit2, Download } from 'lucide-react';
import { downloadSingleFile, downloadFolderAsZip } from '../utils/exportUtils';

interface FileExplorerProps {
  files: FileNode[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onDeleteFile: (id: string) => void;
  onCreateFile?: (parentId: string, name: string) => void;
  onCreateFolder?: (parentId: string, name: string) => void;
  onRenameFile?: (id: string, newName: string) => void;
  className?: string;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  files, 
  activeFileId, 
  onSelectFile,
  onDeleteFile,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  className 
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

  // --- Modal State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'FILE' | 'FOLDER' | 'RENAME'>('FILE');
  const [modalTargetId, setModalTargetId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isModalOpen && inputRef.current) {
        // Small delay to ensure render in some browsers
        setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isModalOpen]);

  const toggleFolder = (folderId: string) => {
    const newSet = new Set(expandedFolders);
    if (newSet.has(folderId)) {
      newSet.delete(folderId);
    } else {
      newSet.add(folderId);
    }
    setExpandedFolders(newSet);
  };

  const handleCreateClick = (e: React.MouseEvent, parentId: string, type: 'FILE' | 'FOLDER') => {
      e.stopPropagation();
      setModalType(type);
      setModalTargetId(parentId);
      setInputValue('');
      setIsModalOpen(true);
  };

  const handleRenameClick = (e: React.MouseEvent, node: FileNode) => {
      e.stopPropagation();
      setModalType('RENAME');
      setModalTargetId(node.id);
      setInputValue(node.name);
      setIsModalOpen(true);
  };

  const handleDownloadClick = (e: React.MouseEvent, node: FileNode) => {
      e.stopPropagation();
      if (node.type === FileType.FILE) {
          downloadSingleFile(node);
      } else {
          downloadFolderAsZip(node, files);
      }
  };

  const handleModalSubmit = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!inputValue.trim() || !modalTargetId) return;

      if (modalType === 'FILE' && onCreateFile) {
          onCreateFile(modalTargetId, inputValue.endsWith('.md') ? inputValue : `${inputValue}.md`);
          // Auto expand
          const newSet = new Set(expandedFolders);
          newSet.add(modalTargetId);
          setExpandedFolders(newSet);
      } else if (modalType === 'FOLDER' && onCreateFolder) {
          onCreateFolder(modalTargetId, inputValue);
          // Auto expand
          const newSet = new Set(expandedFolders);
          newSet.add(modalTargetId);
          setExpandedFolders(newSet);
      } else if (modalType === 'RENAME' && onRenameFile) {
          onRenameFile(modalTargetId, inputValue);
      }
      
      setIsModalOpen(false);
  };

  const renderTree = (parentId: string | null, depth: number = 0) => {
    const children = files
      .filter(f => f.parentId === parentId)
      .sort((a, b) => {
        // 文件夹优先，然后按名称排序
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === FileType.FOLDER ? -1 : 1;
      });

    if (children.length === 0 && parentId === 'root') {
       return <div className="p-4 text-gray-500 text-sm text-center">暂无文件</div>
    }

    return children.map(node => {
      const isExpanded = expandedFolders.has(node.id);
      const isActive = activeFileId === node.id;
      const paddingLeft = `${depth * 1.2 + 0.5}rem`;
      
      // Check if it's a system directory (Direct child of root)
      const isSystemDir = node.parentId === 'root' && node.type === FileType.FOLDER;

      return (
        <div key={node.id}>
          <div 
            className={`flex items-center py-2 pr-2 cursor-pointer transition-colors group ${
              isActive ? 'bg-blue-900/40 border-r-2 border-blue-500' : 'hover:bg-gray-800'
            }`}
            style={{ paddingLeft }}
            onClick={() => {
              if (node.type === FileType.FOLDER) {
                toggleFolder(node.id);
              } else {
                onSelectFile(node.id);
              }
            }}
          >
            <span className="mr-2 text-gray-400">
              {node.type === FileType.FOLDER ? (
                isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
              ) : (
                <div className="w-4" /> // 占位
              )}
            </span>
            
            <span className={`mr-2 ${node.type === FileType.FOLDER ? 'text-yellow-500' : 'text-blue-400'}`}>
               {node.type === FileType.FOLDER ? <Folder size={16} /> : <FileText size={16} />}
            </span>

            <span className={`flex-1 truncate text-sm ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>
              {node.name}
            </span>

            {/* Actions Group - Always visible for mobile */}
            <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                
                {/* Download Button (New) */}
                <button
                    onClick={(e) => handleDownloadClick(e, node)}
                    className="p-1 hover:text-green-400 text-gray-500 transition-colors"
                    title={node.type === FileType.FOLDER ? "下载文件夹 (Zip)" : "下载文件"}
                >
                    <Download size={14} />
                </button>

                {/* Rename Button */}
                <button
                    onClick={(e) => handleRenameClick(e, node)}
                    className="p-1 hover:text-white text-gray-500 transition-colors"
                    title="重命名"
                >
                    <Edit2 size={14} />
                </button>

                {/* Folder Creation Actions */}
                {node.type === FileType.FOLDER && (
                    <>
                        <button
                            onClick={(e) => handleCreateClick(e, node.id, 'FILE')}
                            className="p-1 hover:text-blue-400 text-gray-500 transition-colors"
                            title="新建文件"
                        >
                            <FilePlus size={14} />
                        </button>
                        <button
                            onClick={(e) => handleCreateClick(e, node.id, 'FOLDER')}
                            className="p-1 hover:text-yellow-400 text-gray-500 transition-colors"
                            title="新建文件夹"
                        >
                            <FolderPlus size={14} />
                        </button>
                    </>
                )}

                {/* Delete Button - Hidden for System Directories */}
                {!isSystemDir && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            // Removed confirm dialog check
                            onDeleteFile(node.id);
                        }}
                        className="p-1 hover:text-red-400 text-gray-500 transition-colors"
                        title="删除"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
          </div>
          
          {node.type === FileType.FOLDER && isExpanded && (
            <div>{renderTree(node.id, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className={`overflow-y-auto h-full ${className}`}>
      <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-850 sticky top-0 z-10">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">项目文件</h2>
      </div>
      <div className="py-2">
        {renderTree('root')}
      </div>

      {/* Input Modal for Creating/Renaming */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsModalOpen(false)}>
            <div 
                className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center bg-gray-850">
                    <h3 className="font-medium text-gray-200 flex items-center gap-2">
                        {modalType === 'RENAME' 
                            ? <Edit2 size={16} className="text-purple-400"/> 
                            : (modalType === 'FILE' ? <FilePlus size={16} className="text-blue-400"/> : <FolderPlus size={16} className="text-yellow-400"/>)
                        }
                        {modalType === 'RENAME' ? '重命名' : (modalType === 'FILE' ? '新建文件' : '新建文件夹')}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleModalSubmit} className="p-4">
                    <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                        {modalType === 'FILE' ? '文件名' : (modalType === 'FOLDER' ? '文件夹名称' : '新名称')}
                    </label>
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-600"
                        placeholder={modalType === 'FILE' ? "例如: 第一章.md" : "例如: 设定集"}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            取消
                        </button>
                        <button 
                            type="submit"
                            disabled={!inputValue.trim()}
                            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
                        >
                            {modalType === 'RENAME' ? '确认修改' : '创建'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
