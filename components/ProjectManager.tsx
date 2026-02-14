
import React, { useState, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useAgentStore } from '../stores/agentStore';
import { AIService } from '../services/geminiService';
import { exportProject, importProject } from '../services/projectService';
import { Book, Plus, Trash2, Clock, FileText, Settings, Target, Download, Upload, Sparkles, Loader2, X } from 'lucide-react';
import AISettingsForm from './AISettingsForm';

interface ProjectManagerProps {
  onSelectProject: (id: string) => void | Promise<void>;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({ onSelectProject }) => {
  // Use Zustand Selector
  const projects = useProjectStore(state => state.projects);
  const isLoading = useProjectStore(state => state.isLoading);
  const createProject = useProjectStore(state => state.createProject);
  const deleteProject = useProjectStore(state => state.deleteProject);
  const refreshProjects = useProjectStore(state => state.refreshProjects);
  
  // AI Config for Polishing
  const aiConfig = useAgentStore(state => state.aiConfig);
  const setAiConfig = useAgentStore(state => state.setAiConfig);

  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [wordsPerChapter, setWordsPerChapter] = useState(3000);
  const [targetChapters, setTargetChapters] = useState(100);

  // AI State
  const [isPolishing, setIsPolishing] = useState(false);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [polishInstruction, setPolishInstruction] = useState('');

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for effective API Key (Custom or Environment)
  const hasApiKey = !!(aiConfig.apiKey || process.env.API_KEY);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    await createProject(name, description, genre, wordsPerChapter, targetChapters);
    resetForm();
  };

  const resetForm = () => {
    setIsCreating(false);
    setName('');
    setDescription('');
    setGenre('');
    setWordsPerChapter(3000);
    setTargetChapters(100);
    setPolishInstruction('');
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('确定要删除这个项目吗？所有文件将无法恢复。')) {
        await deleteProject(id);
    }
  };

  const handleExport = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      try {
          const jsonStr = await exportProject(id);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          const project = projects.find(p => p.id === id);
          a.download = `novel-genie-${project?.name || 'export'}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (err) {
          alert('导出失败: ' + err);
      }
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const content = event.target?.result as string;
              await importProject(content);
              await refreshProjects();
              alert('项目导入成功！');
          } catch (err) {
              alert('导入失败: 无效的项目文件');
              console.error(err);
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  // Open Modal logic
  const handleOpenPolishModal = () => {
      if (!hasApiKey) {
          if (confirm("未检测到 API Key。AI 润色功能需要配置 API Key 才能使用。\n是否现在打开设置进行配置？")) {
              setIsSettingsOpen(true);
          }
          return;
      }
      setShowPolishModal(true);
  };

  // Direct AI Polish Execution
  const handleRunPolish = async () => {
      setIsPolishing(true);
      try {
          const service = new AIService(aiConfig);
          
          const userPrompt = `
请作为一名资深网文编辑，帮我完善以下小说项目的设定。

【当前表单信息】：
- 书名：${name || '(未定)'}
- 题材：${genre || '(未定)'}
- 简介/核心梗：${description || '(未提供)'}
- 预期章节数：${targetChapters}
- 单章字数：${wordsPerChapter}

【用户额外指令】：
${polishInstruction || '(无额外指令，请根据上述信息进行专业优化和补全)'}

【任务要求】：
1. **执行指令**：优先遵循用户的【额外指令】进行修改（如修改风格、主角设定等）。
2. **优化书名**：提供更具吸引力、符合网文商业化风格的书名。
3. **完善简介**：扩写一段 100-200 字的精彩简介，突出冲突和爽点（Hook）。
4. **智能补全**：自动补充缺失的题材、建议合理的章节规划。
5. **严禁输出 Markdown 代码块**，直接返回纯 JSON 字符串。格式如下：
{
"name": "...",
"genre": "...",
"description": "...",
"targetChapters": 100,
"wordsPerChapter": 3000
}`;

          const response = await service.sendMessage(
              [], 
              userPrompt, 
              '你是一个专门输出 JSON 格式的小说设定辅助工具。请只输出 JSON，不要包含 ```json 前缀。', 
              []
          );

          let text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          text = text.replace(/```json|```/g, '').trim();
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          
          if (start !== -1 && end !== -1) {
              const jsonStr = text.substring(start, end + 1);
              const data = JSON.parse(jsonStr);
              
              // Direct state updates
              if (data.name) setName(data.name);
              if (data.genre) setGenre(data.genre);
              if (data.description) setDescription(data.description);
              if (data.targetChapters) setTargetChapters(Number(data.targetChapters));
              if (data.wordsPerChapter) setWordsPerChapter(Number(data.wordsPerChapter));
              
              // Close modal on success
              setShowPolishModal(false);
          } else {
              throw new Error("Invalid JSON response");
          }

      } catch (e) {
          console.error(e);
          alert('AI 润色失败，请检查配置或网络。');
      } finally {
          setIsPolishing(false);
      }
  };

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-gray-950 text-gray-500">Loading Projects...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 p-6 overflow-hidden">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
        
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
              NovelGenie Projects
            </h1>
            <p className="text-gray-500 mt-2">选择一个项目开始创作，或创建一个新的世界。</p>
          </div>
          <div className="flex gap-3">
             <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors border border-gray-700"
                title="全局 AI 设置"
             >
                <Settings size={20} />
             </button>
             <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".json"
             />
             <button 
                onClick={handleImportClick}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg transition-colors border border-gray-700"
              >
                <Upload size={20} />
                <span className="hidden sm:inline">导入</span>
              </button>
              <button 
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors shadow-lg"
              >
                <Plus size={20} />
                <span>新建项目</span>
              </button>
          </div>
        </header>

        {isCreating && (
          <div className="mb-8 bg-gray-900 border border-gray-700 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <Book size={20} className="text-blue-400" />
                    创建新项目
                </h3>
                <button
                    type="button"
                    onClick={handleOpenPolishModal}
                    title={!hasApiKey ? "需要先配置 API Key" : "根据输入内容自动完善设定"}
                    className="text-xs flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-3 py-1.5 rounded-full shadow-lg transition-all transform active:scale-95 ring-1 ring-white/10"
                >
                    <Sparkles size={12} />
                    AI 智能润色
                </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">书名 <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none placeholder-gray-600 transition-colors"
                      placeholder="例如：赛博修仙传 (输入关键词后点击右上角 AI 润色)"
                      autoFocus
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">题材类型</label>
                    <input 
                      type="text" 
                      value={genre}
                      onChange={e => setGenre(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none placeholder-gray-600 transition-colors"
                      placeholder="例如：玄幻、悬疑、科幻"
                    />
                  </div>

                  <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-sm text-gray-400 mb-1">单章字数</label>
                        <input 
                          type="number" 
                          value={wordsPerChapter}
                          onChange={e => setWordsPerChapter(parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm text-gray-400 mb-1">目标章节</label>
                        <input 
                          type="number" 
                          value={targetChapters}
                          onChange={e => setTargetChapters(parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
                        />
                      </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">简介 / 核心梗 (可选)</label>
                    <textarea 
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none resize-none h-24 placeholder-gray-600 transition-colors"
                      placeholder="写下一句话核心梗，点击 AI 润色，自动为您扩写成精彩简介..."
                    />
                  </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={!name.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20 transition-all"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
              <Book size={48} className="mb-4 opacity-20" />
              <p>暂无项目，请点击右上方按钮创建。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <div 
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="group relative bg-gray-900 border border-gray-800 hover:border-blue-500/50 hover:bg-gray-850 rounded-xl p-5 cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-md hover:shadow-xl flex flex-col"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-blue-900/20 rounded-lg text-blue-400">
                      <FileText size={24} />
                    </div>
                    <div className="flex gap-1">
                        <button 
                            onClick={(e) => handleExport(e, project.id)}
                            className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                            title="导出项目"
                        >
                            <Download size={16} />
                        </button>
                        <button 
                            onClick={(e) => handleDelete(e, project.id)}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-full transition-colors"
                            title="删除项目"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-lg text-gray-100 mb-1 truncate">{project.name}</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded border border-gray-700">
                        {project.genre || '通用'}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Target size={10} /> {project.targetChapters}章
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-6 line-clamp-2 h-10">
                    {project.description || '暂无简介'}
                  </p>
                  
                  <div className="mt-auto flex items-center text-xs text-gray-600 pt-3 border-t border-gray-800">
                    <Clock size={12} className="mr-1" />
                    <span>
                      最后编辑: {new Date(project.lastModified).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>

      {/* AI Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl relative">
                <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-100">
                        <Settings className="text-blue-400" />
                        全局 AI 配置
                    </h2>
                    <AISettingsForm 
                        config={aiConfig} 
                        onSave={(newConfig) => {
                            setAiConfig(newConfig);
                            setIsSettingsOpen(false);
                        }} 
                    />
                </div>
            </div>
        </div>
      )}

      {/* AI Instruction Modal */}
      {showPolishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 transform animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Sparkles size={18} className="text-purple-400" />
                        AI 设定助手
                    </h3>
                    <button 
                        onClick={() => setShowPolishModal(false)}
                        className="text-gray-500 hover:text-white transition-colors"
                        disabled={isPolishing}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">
                        额外指令 / 修改需求 (可选)
                    </label>
                    <textarea 
                        value={polishInstruction}
                        onChange={e => setPolishInstruction(e.target.value)}
                        placeholder="例如：把主角改成反派、风格要更黑暗一点、或者将背景设定在赛博朋克世界..."
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none resize-none h-32 text-sm placeholder-gray-600"
                        autoFocus
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setShowPolishModal(false)}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                        disabled={isPolishing}
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleRunPolish}
                        disabled={isPolishing}
                        className="px-6 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20"
                    >
                        {isPolishing ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16} />}
                        {isPolishing ? 'AI 正在构思...' : '开始生成'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManager;
