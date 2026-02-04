
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
    <div className="h-7 bg-[#161b22] border-t border-gray-800 flex items-center justify-between px-3 text-[11px] select-none text-gray-400 font-mono shrink-0 safe-area-bottom">
      
      {/* Left: File Context */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 hover:text-white transition-colors cursor-default">
          <GitBranch size={10} className="text-blue-500" />
          <span className="truncate max-w-[100px] sm:max-w-[200px]">
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
          <div className="flex items-center gap-2 text-blue-400 animate-pulse">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              <span>Agent Writing...</span>
          </div>
      )}

      {/* Right: Project Stats */}
      <div className="flex items-center">
         <div 
            onClick={onOpenSettings}
            className="flex items-center gap-4 cursor-pointer hover:bg-gray-800 h-7 px-2 transition-colors rounded"
            title="点击查看详细项目概览"
         >
             <div className="flex items-center gap-1.5 hover:text-white">
                <FileText size={12} />
                <span>{stats.wordCount.toLocaleString()} 字</span>
             </div>

             <div className="hidden sm:flex items-center gap-1.5 hover:text-white">
                <Target size={12} />
                <span>{stats.chapterCount}/{project.targetChapters} 章</span>
             </div>
             
             <div className="hidden sm:flex items-center gap-1.5 hover:text-white">
                <CheckCircle size={12} className={stats.clueRate === 100 ? 'text-green-500' : ''}/>
                <span>伏笔 {stats.clueRate}%</span>
             </div>
             
             {/* Simple Progress Bar */}
             <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden hidden md:block">
                 <div 
                    className="h-full bg-blue-600" 
                    style={{ width: `${stats.progressRate}%` }} 
                 />
             </div>

             <Settings size={12} className="text-gray-500 hover:text-white ml-2" />
         </div>

         <div className="ml-2 pl-2 border-l border-gray-700 flex items-center gap-2">
            <div className="flex items-center gap-1 text-yellow-500">
                <AlertCircle size={10} />
                <span>0</span>
            </div>
         </div>
      </div>
    </div>
  );
};

export default StatusBar;
