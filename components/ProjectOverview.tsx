
import React, { useState, useEffect } from 'react';
import { ProjectMeta, FileNode, AIConfig } from '../types';
import { X, Save, TrendingUp, Settings, BarChart3, Database } from 'lucide-react';
import { updateProject } from '../services/projectService';
import ProjectStatistics from './ProjectStatistics';
import AISettingsForm from './AISettingsForm';
import ProjectMetaForm, { PleasureRhythm } from './ProjectMetaForm';
import { UsageStatsPanel } from './UsageStatsPanel';
import { EmbeddingAdminPanel } from './EmbeddingAdminPanel';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'usage' | 'embedding'>('overview');

  // Overview State
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [genre, setGenre] = useState(project.genre || '');
  const [wordsPerChapter, setWordsPerChapter] = useState(project.wordsPerChapter || 3000);
  const [targetChapters, setTargetChapters] = useState(project.targetChapters || 100);
  const [chaptersPerVolume, setChaptersPerVolume] = useState(project.chaptersPerVolume || 10);
  const [pleasureRhythm, setPleasureRhythm] = useState<PleasureRhythm>(
    project.pleasureRhythm || { small: 3, medium: 10, large: 30 }
  );
  const [pleasureRhythmEnabled, setPleasureRhythmEnabled] = useState(
    project.pleasureRhythmEnabled !== false
  );
  const [selectedPresetId, setSelectedPresetId] = useState(project.presetId || '');
  // 新增：扩展标签状态
  const [coreGameplay, setCoreGameplay] = useState<string[]>(project.coreGameplay || []);
  const [narrativeElements, setNarrativeElements] = useState<string[]>(project.narrativeElements || []);
  const [styleTone, setStyleTone] = useState<string[]>(project.styleTone || []);
  const [romanceLine, setRomanceLine] = useState<string[]>(project.romanceLine || []);

  useEffect(() => {
    if (isOpen) {
      setName(project.name);
      setDescription(project.description || '');
      setGenre(project.genre || '');
      setWordsPerChapter(project.wordsPerChapter || 3000);
      setTargetChapters(project.targetChapters || 100);
      setChaptersPerVolume(project.chaptersPerVolume || 10);
      setPleasureRhythm(project.pleasureRhythm || { small: 3, medium: 10, large: 30 });
      setPleasureRhythmEnabled(project.pleasureRhythmEnabled !== false);
      setSelectedPresetId(project.presetId || '');
      setCoreGameplay(project.coreGameplay || []);
      setNarrativeElements(project.narrativeElements || []);
      setStyleTone(project.styleTone || []);
      setRomanceLine(project.romanceLine || []);
      setActiveTab('overview');
    }
  }, [isOpen, project]);

  const handleSaveProject = () => {
    const updated = updateProject(project, {
        name,
        description,
        genre,
        wordsPerChapter,
        targetChapters,
        chaptersPerVolume,
        pleasureRhythm,
        pleasureRhythmEnabled,
        presetId: selectedPresetId || undefined,
        coreGameplay,
        narrativeElements,
        styleTone,
        romanceLine,
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
              <button
                onClick={() => setActiveTab('usage')}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'usage'
                    ? 'text-blue-400 border-blue-400'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                   <span className="flex items-center gap-2"><BarChart3 size={16}/> 流量统计</span>
              </button>
              <button
                onClick={() => setActiveTab('embedding')}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'embedding'
                    ? 'text-blue-400 border-blue-400'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                   <span className="flex items-center gap-2"><Database size={16}/> Embedding</span>
              </button>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors mb-2">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

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
                      <ProjectMetaForm
                        mode="edit"
                        name={name} setName={setName}
                        description={description} setDescription={setDescription}
                        genre={genre} setGenre={setGenre}
                        wordsPerChapter={wordsPerChapter} setWordsPerChapter={setWordsPerChapter}
                        targetChapters={targetChapters} setTargetChapters={setTargetChapters}
                        chaptersPerVolume={chaptersPerVolume} setChaptersPerVolume={setChaptersPerVolume}
                        pleasureRhythm={pleasureRhythm} setPleasureRhythm={setPleasureRhythm}
                        pleasureRhythmEnabled={pleasureRhythmEnabled} setPleasureRhythmEnabled={setPleasureRhythmEnabled}
                        selectedPresetId={selectedPresetId} setSelectedPresetId={setSelectedPresetId}
                        coreGameplay={coreGameplay} setCoreGameplay={setCoreGameplay}
                        narrativeElements={narrativeElements} setNarrativeElements={setNarrativeElements}
                        styleTone={styleTone} setStyleTone={setStyleTone}
                        romanceLine={romanceLine} setRomanceLine={setRomanceLine}
                      />
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

          {activeTab === 'usage' && (
            <div className="animate-in slide-in-from-left-4 duration-200">
              <UsageStatsPanel />
            </div>
          )}

          {activeTab === 'embedding' && (
            <div className="animate-in slide-in-from-left-4 duration-200">
              <EmbeddingAdminPanel />
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default ProjectOverview;
