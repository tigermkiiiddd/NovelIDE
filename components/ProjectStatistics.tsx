
import React from 'react';
import { ProjectMeta, FileNode } from '../types';
import { FileText, BookOpen, Users, CheckCircle } from 'lucide-react';
import { useProjectStats } from '../hooks/useProjectStats';

interface ProjectStatisticsProps {
  project: ProjectMeta;
  files: FileNode[];
}

const ProjectStatistics: React.FC<ProjectStatisticsProps> = ({ project, files }) => {
  const stats = useProjectStats(project, files);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="text-blue-400 mb-2"><FileText size={24} /></div>
            <div className="text-2xl font-bold text-white">{stats.wordCount.toLocaleString()}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">正文总字数</div>
            <div className="text-[10px] text-gray-600 mt-1">进度: {stats.progressRate}%</div>
            <div className="absolute bottom-0 left-0 h-1 bg-blue-500/50 transition-all duration-1000" style={{ width: `${stats.progressRate}%` }} />
        </div>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 flex flex-col items-center justify-center text-center">
            <div className="text-purple-400 mb-2"><BookOpen size={24} /></div>
            <div className="text-2xl font-bold text-white">{stats.chapterCount} <span className="text-sm text-gray-500 font-normal">/ {project.targetChapters}</span></div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">完成章节</div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 flex flex-col items-center justify-center text-center">
            <div className="text-yellow-400 mb-2"><Users size={24} /></div>
            <div className="text-2xl font-bold text-white">{stats.charCount}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">角色数量</div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="text-green-400 mb-2"><CheckCircle size={24} /></div>
            <div className="text-2xl font-bold text-white">{stats.clueRate}%</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">伏笔回收率</div>
            <div className="text-[10px] text-gray-600 mt-1">({stats.solvedClues}/{stats.totalClues})</div>
            <div className="absolute bottom-0 left-0 h-1 bg-green-500/50 transition-all duration-1000" style={{ width: `${stats.clueRate}%` }} />
        </div>
    </div>
  );
};

export default ProjectStatistics;
