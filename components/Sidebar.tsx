
import React from 'react';
import { Menu, ArrowLeft, Settings } from 'lucide-react';
import FileExplorer from './FileExplorer';
import { useFileStore } from '../stores/fileStore';
import { useShallow } from 'zustand/react/shallow';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onBackToProjects: () => void;
  onOpenSettings: () => void;
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen,
  onClose,
  onBackToProjects,
  onOpenSettings,
  className = ''
}) => {
  // Use shallow selection to prevent Sidebar rerender when file CONTENT changes
  const { files, activeFileId, setActiveFileId, deleteFile, createFileById, createFolderById } = useFileStore(
    useShallow(state => ({
        files: state.files,
        activeFileId: state.activeFileId,
        setActiveFileId: state.setActiveFileId,
        deleteFile: state.deleteFile,
        createFileById: state.createFileById,
        createFolderById: state.createFolderById
    }))
  );

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && window.innerWidth < 768 && (
        <div 
          className="absolute inset-0 bg-black/50 z-20"
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <aside 
        className={`absolute md:relative z-30 h-full w-64 bg-gray-850 border-r border-gray-700 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        } ${className}`}
      >
        <div className="p-4 flex items-center justify-between md:hidden">
            <span className="font-bold text-lg">NovelGenie</span>
            <button onClick={onClose}><Menu size={20}/></button>
        </div>
        
        {/* Project Navigation */}
        <div className="px-4 pt-4 pb-2">
            <button 
                onClick={onBackToProjects}
                className="flex items-center space-x-2 text-sm text-gray-400 hover:text-white transition-colors w-full p-2 rounded-lg hover:bg-gray-800"
            >
                <ArrowLeft size={16} />
                <span>返回项目列表</span>
            </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            <FileExplorer 
                files={files} 
                activeFileId={activeFileId} 
                onSelectFile={(id) => {
                  setActiveFileId(id);
                  if (window.innerWidth < 768) onClose();
                }}
                onDeleteFile={deleteFile}
                onCreateFile={createFileById}
                onCreateFolder={createFolderById}
                className="flex-1"
            />
        </div>

        {/* Footer Settings */}
        <div className="p-4 border-t border-gray-800">
            <button 
                onClick={onOpenSettings}
                className="flex items-center space-x-2 w-full p-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
                <Settings size={16} />
                <span>项目概览 & 设置</span>
            </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
