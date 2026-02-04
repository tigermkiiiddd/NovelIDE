
import React, { useState, useEffect } from 'react';
import { ProjectMeta, FileNode, AIConfig } from '../types';
import { X, Save, TrendingUp, Settings, Hash, Target } from 'lucide-react';
import { updateProject } from '../services/projectService';
import ProjectStatistics from './ProjectStatistics';
import AISettingsForm from './AISettingsForm';

interface ProjectOverviewProps {
  project: ProjectMeta;
  files: FileNode[];
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedProject: ProjectMeta) => void;
  // AI Config Props
  aiConfig: AIConfig;
  onUpdateAIConfig: (config: AIConfig) => void;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ 
    project, files, isOpen, onClose, onUpdate,
    aiConfig, onUpdateAIConfig
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // Overview State
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [genre, setGenre] = useState(project.genre || '');
  const [wordsPerChapter, setWordsPerChapter] = useState(project.wordsPerChapter || 3000);
  const [targetChapters, setTargetChapters] = useState(project.targetChapters || 100);

  useEffect(() => {
    if (isOpen) {
      setName(project.name);
      setDescription(project.description || '');
      setGenre(project.genre || '');
      setWordsPerChapter(project.wordsPerChapter || 3000);
      setTargetChapters(project.targetChapters || 100);
      setActiveTab('overview');
    }
  }, [isOpen, project]);

  const handleSaveProject = () => {
    const updated = updateProject(project, { 
        name, 
        description,
        genre,
        wordsPerChapter,
        targetChapters
    });
    if (updated) {
      onUpdate(updated);
      onClose();
    }
  };

  const handleSaveConfig = (newConfig: AIConfig) => {
      onUpdateAIConfig(newConfig);
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        
        {/* Header & Tabs */}
        <div className="flex justify-between items-center px-6 pt-6 pb-2 border-b border-gray-800">
          <div className="flex space-x-6">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'overview' 
                    ? 'text-blue-400 border-blue-400' 
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                  <span className="flex items-center gap-2"><TrendingUp size={16}/> 项目概览</span>
              </button>
              <button 
                onClick={() => setActiveTab('settings')}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'settings' 
                    ? 'text-blue-400 border-blue-400' 
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                   <span className="flex items-center gap-2"><Settings size={16}/> AI 设置</span>
              </button>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors mb-2">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in slide-in-from-left-4 duration-200">
                <ProjectStatistics project={project} files={files} />

                {/* Project Metadata Form */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-300">基础信息 & 规划</h3>
                        <button 
                            onClick={handleSaveProject}
                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
                        >
                            <Save size={12} /> 保存更改
                        </button>
                    </div>

                    <div className="space-y-4 p-4 rounded-lg border border-gray-800 bg-gray-800/20">
                    
                    {/* Row 1 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">书名</label>
                            <input 
                                type="text" 
                                value={name} 
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">题材类型</label>
                            <input 
                                type="text" 
                                value={genre} 
                                onChange={e => setGenre(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                placeholder="如：玄幻、悬疑"
                            />
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1"><Hash size={12}/> 单章字数</label>
                            <input 
                                type="number" 
                                value={wordsPerChapter} 
                                onChange={e => setWordsPerChapter(parseInt(e.target.value) || 0)}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                            />
                         </div>
                         <div>
                            <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1"><Target size={12}/> 目标章节</label>
                            <input 
                                type="number" 
                                value={targetChapters} 
                                onChange={e => setTargetChapters(parseInt(e.target.value) || 0)}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                            />
                         </div>
                    </div>

                    {/* Row 3 */}
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">简介 / 核心梗</label>
                        <textarea 
                            value={description} 
                            onChange={e => setDescription(e.target.value)}
                            rows={4}
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
                        />
                    </div>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="text-center text-xs text-gray-600 pt-8 border-t border-gray-800">
                    项目ID: {project.id} <br/>
                    创建时间: {new Date(project.createdAt).toLocaleString()} <br/>
                    最后修改: {new Date(project.lastModified).toLocaleString()}
                </div>
            </div>
          )}

          {activeTab === 'settings' && (
             <AISettingsForm config={aiConfig} onSave={handleSaveConfig} />
          )}

        </div>

      </div>
    </div>
  );
};

export default ProjectOverview;
