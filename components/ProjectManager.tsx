
import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useAgentStore } from '../stores/agentStore';
import { AIService } from '../services/geminiService';
import { exportProject, importProject } from '../services/projectService';
import { getDisplayVersion } from '../utils/version';
import { Book, Plus, Trash2, Clock, FileText, Settings, Target, Download, Upload, Sparkles, Loader2, X, Info } from 'lucide-react';
import AISettingsForm from './AISettingsForm';
import ProjectMetaForm, { PleasureRhythm } from './ProjectMetaForm';

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
  const [chaptersPerVolume, setChaptersPerVolume] = useState(10);

  // Preset State
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [pleasureRhythm, setPleasureRhythm] = useState<PleasureRhythm>({
    small: 3,
    medium: 10,
    large: 30
  });

  // AI State
  const [isPolishing, setIsPolishing] = useState(false);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [polishInstruction, setPolishInstruction] = useState('');

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mobile detection (matches MainLayout pattern)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock body scroll when mobile creation overlay is open to prevent white edge on keyboard
  useEffect(() => {
    if (isMobile && isCreating) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalOverflow; };
    }
  }, [isMobile, isCreating]);

  // Check for effective API Key (Custom or Environment)
  const hasApiKey = !!(aiConfig.apiKey || process.env.API_KEY);

  // Auto-open settings if no API Key configured
  useEffect(() => {
    if (!hasApiKey && !isLoading) {
      setIsSettingsOpen(true);
    }
  }, [hasApiKey, isLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await createProject(
      name,
      description,
      genre,
      wordsPerChapter,
      targetChapters,
      chaptersPerVolume,
      selectedPresetId || undefined,
      pleasureRhythm
    );
    resetForm();
  };

  const resetForm = () => {
    setIsCreating(false);
    setName('');
    setDescription('');
    setGenre('');
    setWordsPerChapter(3000);
    setTargetChapters(100);
    setChaptersPerVolume(10);
    setSelectedPresetId('');
    setPleasureRhythm({ small: 3, medium: 10, large: 30 });
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
5. **反套路设计**：
   - 基于题材识别1条最常见的套路，设计一条反套路规则（如何反转/打破这个套路）
   - 生成2条硬性创作约束（如：金手指必须有明确代价、配角不得工具人化）
   - 生成1个开篇钩子建议（前3章如何抓住读者）
6. **差异化卖点**：
   - 一句话说出这个故事和同类作品的核心区别
7. **严禁输出 Markdown 代码块**，直接返回纯 JSON 字符串。格式如下：
{
"name": "...",
"genre": "...",
"description": "...",
"targetChapters": 100,
"wordsPerChapter": 3000,
"antiTropeRule": "一条反套路规则",
"hardConstraints": ["约束1", "约束2"],
"openingHook": "开篇钩子建议",
"sellingPoint": "一句话差异化卖点"
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

              // 反套路 & 创意约束 — 追加到 description 末尾
              const extras: string[] = [];
              if (data.antiTropeRule) extras.push(`【反套路规则】${data.antiTropeRule}`);
              if (data.hardConstraints?.length) extras.push(`【硬性约束】${data.hardConstraints.join('；')}`);
              if (data.openingHook) extras.push(`【开篇钩子】${data.openingHook}`);
              if (data.sellingPoint) extras.push(`【差异化卖点】${data.sellingPoint}`);
              if (extras.length && data.description) {
                setDescription(prev => prev ? prev + '\n\n' + extras.join('\n') : extras.join('\n'));
              }

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

  // Shared form props
  const formProps = {
    mode: 'create' as const,
    name, setName,
    description, setDescription,
    genre, setGenre,
    wordsPerChapter, setWordsPerChapter,
    targetChapters, setTargetChapters,
    chaptersPerVolume, setChaptersPerVolume,
    pleasureRhythm, setPleasureRhythm,
    selectedPresetId, setSelectedPresetId,
  };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto bg-gray-950 p-4 text-gray-100 sm:p-6 md:h-screen md:overflow-hidden safe-area-top safe-area-bottom">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col md:min-h-0">

        <header className="flex flex-col items-start gap-3 mb-4 md:gap-4 md:mb-8 md:flex-row md:justify-between md:items-center">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
                NovelGenie Projects
              </h1>
              <span className="text-xs text-gray-600 bg-gray-900 px-2 py-1 rounded border border-gray-800 flex items-center gap-1">
                <Info size={12} />
                v{getDisplayVersion()}
              </span>
            </div>
            <p className="text-gray-500 mt-2">选择一个项目开始创作，或创建一个新的世界。</p>
          </div>
          <div className="flex w-full gap-2 md:w-auto md:gap-3">
             <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-300 px-3 py-2.5 rounded-lg transition-colors border border-gray-700 min-h-[44px]"
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
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-300 px-4 py-2.5 rounded-lg transition-colors border border-gray-700 min-h-[44px]"
              >
                <Upload size={20} />
                <span className="hidden sm:inline">导入</span>
              </button>
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-2.5 rounded-lg transition-colors shadow-lg min-h-[44px]"
              >
                <Plus size={20} />
                <span>新建项目</span>
              </button>
          </div>
        </header>

        {isCreating && (
          isMobile ? (
            /* Mobile: Full-screen overlay */
            <div className="fixed inset-x-0 top-0 z-50 flex flex-col bg-gray-950 safe-area-top safe-area-bottom animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ height: '100dvh' }}>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Book size={20} className="text-blue-400" />
                  创建新项目
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenPolishModal}
                    title={!hasApiKey ? "需要先配置 API Key" : "AI 智能润色"}
                    className="text-xs flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1.5 rounded-full min-h-[36px]"
                  >
                    <Sparkles size={12} />
                    润色
                  </button>
                  <button onClick={resetForm} className="p-2 text-gray-400 active:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
                    <X size={24} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <form onSubmit={handleCreate} className="space-y-4" autoComplete="off">
                  <ProjectMetaForm {...formProps} />
                  <div className="flex gap-3 pt-2 pb-4">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 px-4 py-2.5 text-gray-400 transition-colors active:text-white rounded-lg border border-gray-700 min-h-[44px]"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={!name.trim()}
                      className="flex-1 rounded-lg bg-blue-600 px-6 py-2.5 text-white shadow-lg shadow-blue-900/20 transition-all active:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
                    >
                      创建
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* Desktop: Inline section */
          <div className="relative mb-8 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-xl animate-in fade-in slide-in-from-top-4 sm:p-6">
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <ProjectMetaForm {...formProps} />

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full px-4 py-2 text-gray-400 transition-colors hover:text-white sm:w-auto"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="w-full rounded-lg bg-blue-600 px-6 py-2 text-white shadow-lg shadow-blue-900/20 transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
          )
        )}

        <div className="flex-1 min-h-0 overflow-visible pb-2 pr-0 md:overflow-y-auto md:pr-2">
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
                  className="group relative bg-gray-900 border border-gray-800 hover:border-blue-500/50 hover:bg-gray-850 rounded-xl p-4 sm:p-5 cursor-pointer transition-all duration-200 md:hover:-translate-y-1 shadow-md hover:shadow-xl flex flex-col active:bg-gray-800"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-blue-900/20 rounded-lg text-blue-400">
                      <FileText size={24} />
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={(e) => handleExport(e, project.id)}
                            className="p-2.5 text-gray-500 hover:text-white hover:bg-gray-700 active:bg-gray-600 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="导出项目"
                        >
                            <Download size={16} />
                        </button>
                        <button
                            onClick={(e) => handleDelete(e, project.id)}
                            className="p-2.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 active:bg-red-900/30 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
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

      {/* Mobile FAB for creating new project */}
      {isMobile && !isCreating && (
        <button
          onClick={() => setIsCreating(true)}
          className="fixed bottom-6 right-6 p-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-full shadow-lg shadow-blue-900/50 z-30 transition-transform active:scale-95 md:hidden"
          style={{ minHeight: 56, minWidth: 56 }}
        >
          <Plus size={24} color="white" />
        </button>
      )}

      {/* AI Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className={`bg-gray-900 border border-gray-700 rounded-xl w-full flex flex-col shadow-2xl relative ${
              isMobile ? 'h-full max-h-[100dvh] rounded-none border-0 safe-area-top safe-area-bottom' : 'max-w-2xl max-h-[90vh]'
            }`}>
                <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white active:text-white transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                    <X size={24} />
                </button>
                <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar">
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
            <div className={`w-full bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 sm:p-6 transform animate-in zoom-in-95 duration-200 ${
              isMobile ? 'h-full max-h-[100dvh] rounded-none border-0 safe-area-top safe-area-bottom flex flex-col' : 'max-w-md'
            }`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Sparkles size={18} className="text-purple-400" />
                        AI 设定助手
                    </h3>
                    <button
                        onClick={() => setShowPolishModal(false)}
                        className="text-gray-500 hover:text-white active:text-white transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        disabled={isPolishing}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4 flex-1">
                    <label className="block text-sm text-gray-400 mb-2">
                        额外指令 / 修改需求 (可选)
                    </label>
                    <textarea
                        value={polishInstruction}
                        onChange={e => setPolishInstruction(e.target.value)}
                        placeholder="例如：把主角改成反派、风格要更黑暗一点、或者将背景设定在赛博朋克世界..."
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none resize-none h-32 text-sm placeholder-gray-600"
                        autoComplete="off"
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setShowPolishModal(false)}
                        className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors min-h-[44px]"
                        disabled={isPolishing}
                    >
                        取消
                    </button>
                    <button
                        onClick={handleRunPolish}
                        disabled={isPolishing}
                        className="px-6 py-2.5 text-sm bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20 min-h-[44px]"
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
