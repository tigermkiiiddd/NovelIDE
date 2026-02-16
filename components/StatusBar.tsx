
import React from 'react';
import { ProjectMeta, FileNode, FileType } from '../types';
import { useProjectStats } from '../hooks/useProjectStats';
import { Settings, FileText, CheckCircle, Target, GitBranch, AlertCircle } from 'lucide-react';

interface StatusBarProps {
  project: ProjectMeta;
  files: FileNode[];
  activeFile: FileNode | null;
  onOpenSettings: () => void;
  isAgentThinking?: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({
  project,
  files,
  activeFile,
  onOpenSettings,
  isAgentThinking
}) => {
  const stats = useProjectStats(project, files);

  return (
    <div className="h-7 bg-[#161b22] border-t border-gray-800 flex items-center justify-between px-2 sm:px-3 text-[10px] sm:text-[11px] select-none text-gray-400 font-mono shrink-0 safe-area-bottom">

      {/* Left: File Context */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="flex items-center gap-1 hover:text-white transition-colors cursor-default">
          <GitBranch size={10} className="text-blue-500 shrink-0" />
          <span className="truncate max-w-[80px] sm:max-w-[200px]">
             {project.name}
          </span>
        </div>

        {activeFile && (
            <div className="hidden sm:flex items-center gap-1.5 text-gray-500">
                <span>•</span>
                <span className="text-gray-300">{activeFile.name}</span>
                <span className="px-1 text-gray-600">UTF-8</span>
                <span className="px-1 text-gray-600">Markdown</span>
            </div>
        )}
      </div>

      {/* Center / Agent Status (Mobile & Desktop) */}
      {isAgentThinking && (
          <div className="flex items-center gap-1 sm:gap-2 text-blue-400 animate-pulse shrink-0">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              <span className="hidden sm:inline">Agent Writing...</span>
              <span className="sm:hidden">Writing...</span>
          </div>
      )}

      {/* Right: Project Stats */}
      <div className="flex items-center shrink-0">
         <div
            onClick={onOpenSettings}
            className="flex items-center gap-2 sm:gap-4 cursor-pointer hover:bg-gray-800 h-7 px-1.5 sm:px-2 transition-colors rounded"
            title="点击查看详细项目概览"
         >
             {/* Word Count - Always visible */}
             <div className="flex items-center gap-1 hover:text-white">
                <FileText size={12} className="shrink-0" />
                <span>{stats.wordCount.toLocaleString()}</span>
                <span className="hidden sm:inline">字</span>
             </div>

             {/* Chapter Progress - Desktop: full text, Mobile: simplified */}
             <div className="flex items-center gap-1 hover:text-white">
                <Target size={12} className="shrink-0 hidden sm:block" />
                <span className="sm:hidden text-[10px]">{stats.chapterCount}/{project.targetChapters}</span>
                <span className="hidden sm:inline">{stats.chapterCount}/{project.targetChapters} 章</span>
             </div>

             {/* Clue Rate - Desktop: text, Mobile: icon color only */}
             <div className="flex items-center gap-1 hover:text-white">
                <CheckCircle
                  size={12}
                  className={`shrink-0 ${
                    stats.clueRate === 100 ? 'text-green-500' :
                    stats.clueRate >= 50 ? 'text-yellow-500' : 'text-gray-500'
                  }`}
                  title={`伏笔率: ${stats.clueRate}%`}
                />
                <span className="hidden sm:inline">伏笔 {stats.clueRate}%</span>
             </div>

             {/* Simple Progress Bar - Desktop only */}
             <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden hidden md:block">
                 <div
                    className="h-full bg-blue-600"
                    style={{ width: `${stats.progressRate}%` }}
                 />
             </div>

             <Settings size={12} className="text-gray-500 hover:text-white ml-1 sm:ml-2 shrink-0" />
         </div>

         <div className="ml-1 sm:ml-2 pl-1 sm:pl-2 border-l border-gray-700 flex items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-0.5 sm:gap-1 text-yellow-500">
                <AlertCircle size={10} />
                <span>0</span>
            </div>
         </div>
      </div>
    </div>
  );
};

export default StatusBar;
