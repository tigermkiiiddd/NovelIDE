
import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { FileNode } from '../types';
import { Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, BrainCircuit, HelpCircle, Zap, HeartHandshake } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import TutorialModal from './TutorialModal';
import { useAgent } from '../hooks/useAgent';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { useProjectStore } from '../stores/projectStore';
import { useFileStore } from '../stores/fileStore';
import { useUiStore } from '../stores/uiStore';
import { useChapterAnalysisStore, ChapterAnalysisState } from '../stores/chapterAnalysisStore';
import { useCharacterMemoryStore, CharacterMemoryState } from '../stores/characterMemoryStore';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';
import { useWorldTimelineStore } from '../stores/worldTimelineStore';
import { useRelationshipStore } from '../stores/relationshipStore';
import { useShallow } from 'zustand/react/shallow';
import { getNodePath } from '../services/fileSystem';
// Extracted layout modules
import { usePanelResize, ResizeHandle } from './layout/PanelManager';
import EditorArea from './layout/EditorArea';
import AppModals, { AppModalsRef } from './layout/AppModals';

// Lazy-loaded heavy components
const AgentChat = lazy(() => import('./AgentChat'));

interface MainLayoutProps {
    projectId: string;
    onBack: () => void | Promise<void>;
}

const MainLayout: React.FC<MainLayoutProps> = ({ projectId, onBack }) => {
  // --- UI Store (Persisted State) ---
  const {
      isSidebarOpen,
      isChatOpen,
      sidebarWidth,
      agentWidth,
      setSidebarOpen,
      setChatOpen,
      toggleChat,
      toggleSidebar,
      hasSeenTutorial
  } = useUiStore(useShallow(state => ({
      isSidebarOpen: state.isSidebarOpen,
      isChatOpen: state.isChatOpen,
      sidebarWidth: state.sidebarWidth,
      agentWidth: state.agentWidth,
      setSidebarOpen: state.setSidebarOpen,
      setChatOpen: state.setChatOpen,
      toggleChat: state.toggleChat,
      toggleSidebar: state.toggleSidebar,
      hasSeenTutorial: state.hasSeenTutorial
  })));
  const setHasSeenTutorial = useUiStore(state => state.setHasSeenTutorial);

  // 等待 Zustand persist hydration 完成
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    const unsubscribe = useUiStore.persist.onFinishHydration(() => {
      console.log('[MainLayout] Hydration finished, hasSeenTutorial:', useUiStore.getState().hasSeenTutorial);
      setIsHydrated(true);
    });
    // 如果已经 hydrated，立即设置
    if (useUiStore.persist.hasHydrated()) {
      setIsHydrated(true);
    }
    return unsubscribe;
  }, []);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isKnowledgeGraphOpen, setIsKnowledgeGraphOpen] = useState(false);
  const [isRelationshipViewOpen, setIsRelationshipViewOpen] = useState(false);
  const [isPlanViewerOpen, setIsPlanViewerOpen] = useState(false);
  const [isForeshadowingTrackerOpen, setIsForeshadowingTrackerOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  // 防止 effect 多次触发弹窗
  const tutorialShownRef = useRef(false);

  // --- Refs ---
  const appModalsRef = useRef<AppModalsRef>(null);

  // --- Panel Resize ---
  const { startResize } = usePanelResize();

  // --- Store Hooks ---
  const currentProject = useProjectStore(state => state.getCurrentProject());
  const updateProject = useProjectStore(state => state.updateProject);
  const loadFiles = useFileStore(state => state.loadFiles);

  // 包装 updateProject：检测 presetId 变更时切换题材文件
  const handleUpdateProject = useCallback(async (id: string, updates: Partial<import('../types').ProjectMeta>) => {
    const oldProject = useProjectStore.getState().projects.find(p => p.id === id);
    const oldPresetId = oldProject?.presetId || undefined;

    await updateProject(id, updates);

    // presetId 变更时切换文件系统中的题材文件（标准化空字符串为 undefined）
    const newPresetId = updates.presetId || undefined;
    if (newPresetId !== oldPresetId) {
      useFileStore.getState().switchPreset(newPresetId);
    }
  }, [updateProject]);
  const loadProjectAnalyses = useChapterAnalysisStore((state: ChapterAnalysisState) => state.loadProjectAnalyses);
  const triggerExtraction = useChapterAnalysisStore((state: ChapterAnalysisState) => state.triggerExtraction);
  const loadProjectCharacterProfiles = useCharacterMemoryStore((state: CharacterMemoryState) => state.loadProjectProfiles);
  const ensureKnowledgeGraphInitialized = useKnowledgeGraphStore(state => state.ensureInitialized);
  const loadTimeline = useWorldTimelineStore(state => state.loadTimeline);
  const loadRelations = useRelationshipStore(state => state.loadRelations);
  const currentProjectId = useProjectStore(state => state.currentProjectId);

  // --- Data Initialization ---
  useEffect(() => {
    if (projectId) {
        loadFiles(projectId).then(() => {
          loadProjectAnalyses(projectId);
          loadProjectCharacterProfiles(projectId);
          ensureKnowledgeGraphInitialized(projectId);
          loadTimeline(projectId);
          loadRelations();
        });
    }
  }, [projectId, loadFiles, loadProjectAnalyses, loadProjectCharacterProfiles, ensureKnowledgeGraphInitialized, loadTimeline, loadRelations]);

  // --- Tutorial Auto-popup ---
  useEffect(() => {
    if (!isHydrated || hasSeenTutorial || !projectId || tutorialShownRef.current) return;
    console.log('[MainLayout] Showing tutorial, hasSeenTutorial:', hasSeenTutorial);
    tutorialShownRef.current = true;
    const timer = setTimeout(() => setIsTutorialOpen(true), 800);
    return () => clearTimeout(timer);
  }, [isHydrated, hasSeenTutorial, projectId]);

  const handleTutorialClose = useCallback(() => {
    console.log('[MainLayout] Tutorial closing, setting hasSeenTutorial to true');
    setIsTutorialOpen(false);
    setHasSeenTutorial(true);
  }, [setHasSeenTutorial]);

  const handleOpenTutorial = useCallback(() => {
    setIsTutorialOpen(true);
  }, []);

  // --- File System State & Actions ---
  const {
      files,
      activeFileId,
      deleteFile,
      createFile,
      updateFile,
      patchFile,
      readFile,
      searchFiles,
      listFiles,
      renameFile
  } = useFileStore(
    useShallow(state => ({
        files: state.files,
        activeFileId: state.activeFileId,
        deleteFile: state.deleteFile,
        createFile: state.createFile,
        updateFile: state.updateFile,
        patchFile: state.patchFile,
        readFile: state.readFile,
        searchFiles: state.searchFiles,
        listFiles: state.listFiles,
        renameFile: state.renameFile
    }))
  );

  const activeFile = files.find(f => f.id === activeFileId) || null;

  // --- Callbacks ---
  const handleAgentUpdateProject = (updates: Record<string, unknown>) => {
      if (!projectId) return "Error: No active project.";
      updateProject(projectId, updates as any);
      return `Successfully updated project metadata: ${JSON.stringify(updates)}`;
  };

  const handleAnalyzeFile = async (file: FileNode) => {
    const filePath = getNodePath(file, files);
    try {
      await triggerExtraction(filePath, 'manual', currentProjectId || '');
    } catch (error) {
      console.error('[MainLayout] 章节分析失败:', error);
    }
  };

  const handleSendFeedbackToAI = useCallback((feedback: string) => {
    sendMessage(`[Plan审批反馈] ${feedback}`);
  }, []);

  // --- Agent Hook ---
  const {
    messages, isLoading,
    sendMessage,
    stopGeneration,
    regenerateMessage,
    editUserMessage,
    todos, sessions, currentSessionId,
    createNewSession, switchSession, deleteSession,
    aiConfig, updateAiConfig, pendingChanges,
    tokenUsage,
    messageWindowInfo,
    // Plan Mode
    planMode,
    togglePlanMode,
    currentPlanNote,
    approvePlanNote,
    rejectPlanNote
  } = useAgent(files, currentProject, activeFile, {
      createFile, updateFile, patchFile, readFile, searchFiles, listFiles, renameFile,
      deleteFile,
      updateProjectMeta: handleAgentUpdateProject
  });

  // --- Responsive Layout ---
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    if (window.innerWidth < 768) {
        setSidebarOpen(false);
        setChatOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useSwipeGesture({
    onSwipeRight: () => { if (isMobile && !isSidebarOpen) setSidebarOpen(true); },
    onSwipeLeft: () => { if (isMobile && !isChatOpen) setChatOpen(true); },
    enabled: isMobile
  });

  // --- Listen for agent trigger events (from Editor polish button) ---
  // --- Helpers ---
  if (!currentProject) return <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-gray-500">Loading Context...</div>;

  const openProjectOverview = () => appModalsRef.current?.openProjectOverview();

  return (
    <div className="flex h-[100dvh] bg-gray-950 text-gray-100 font-sans overflow-hidden relative selection:bg-blue-500/30">

      <ErrorBoundary>
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onBackToProjects={onBack}
          onOpenSettings={() => { openProjectOverview(); if (isMobile) setSidebarOpen(false); }}
          onOpenTutorial={() => { handleOpenTutorial(); if (isMobile) setSidebarOpen(false); }}
          width={sidebarWidth}
          isMobile={isMobile}
          onAnalyzeFile={handleAnalyzeFile}
        />
      </ErrorBoundary>

      {isSidebarOpen && !isMobile && <ResizeHandle panel="sidebar" onStart={startResize} />}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative transition-all duration-300">

        {/* Mobile Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 md:hidden shrink-0 select-none">
          <button onClick={() => setSidebarOpen(true)} className="p-1 -ml-1 text-gray-400 active:text-white">
            <Menu size={24} />
          </button>
          <span className="font-bold text-gray-200 truncate max-w-[160px] text-sm">
            {activeFile ? activeFile.name : currentProject.name}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenTutorial}
              className="p-1 text-gray-400 active:text-white"
              title="新手指南"
            >
              <HelpCircle size={20} />
            </button>
            <button
              onClick={toggleChat}
              className={`p-1 -mr-1 ${isChatOpen ? 'text-blue-400' : 'text-gray-400'}`}
            >
              <MessageSquare size={24} />
            </button>
          </div>
        </header>

        {/* Desktop Header / Toolbar */}
        <div className="hidden md:flex items-center justify-between bg-gray-900 border-b border-gray-800 h-10 px-4 shrink-0 select-none">
            <div className="flex items-center gap-2 text-gray-500">
               <button onClick={toggleSidebar} className="hover:text-white transition-colors">
                  {isSidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
               </button>
               <span className="text-xs">
                   {currentProject.name} / {activeFile?.name || 'No File'}
               </span>
            </div>
            <div className="flex items-center gap-2">
                 <button
                    onClick={() => setIsKnowledgeGraphOpen(!isKnowledgeGraphOpen)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${isKnowledgeGraphOpen ? 'bg-purple-600/20 text-purple-400' : 'text-gray-400 hover:text-white'}`}
                 >
                    <BrainCircuit size={14} />
                    知识图谱
                 </button>
                 <button
                    onClick={() => setIsRelationshipViewOpen(!isRelationshipViewOpen)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${isRelationshipViewOpen ? 'bg-pink-600/20 text-pink-400' : 'text-gray-400 hover:text-white'}`}
                 >
                    <HeartHandshake size={14} />
                    人际关系
                 </button>
                 <button
                    onClick={toggleChat}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${isChatOpen ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                 >
                    <MessageSquare size={14} />
                    Agent
                 </button>
            </div>
        </div>

        {/* Editor Area */}
        <ErrorBoundary>
        <div className="flex-1 overflow-hidden relative bg-[#0d1117]">
          <EditorArea
            activeFile={activeFile}
            isKnowledgeGraphOpen={isKnowledgeGraphOpen}
            isRelationshipViewOpen={isRelationshipViewOpen}
            isPlanViewerOpen={isPlanViewerOpen}
            onClosePlanViewer={() => setIsPlanViewerOpen(false)}
            currentPlanNote={currentPlanNote || null}
            planMode={planMode}
            togglePlanMode={togglePlanMode}
            approvePlanNote={approvePlanNote}
            rejectPlanNote={rejectPlanNote}
            onSendFeedbackToAI={handleSendFeedbackToAI}
            isMobile={isMobile}
            onOpenChat={() => setChatOpen(true)}
          />
        </div>
        </ErrorBoundary>

        {/* Status Bar */}
        <StatusBar
            project={currentProject}
            files={files}
            activeFile={activeFile}
            onOpenSettings={openProjectOverview}
            onOpenTutorial={handleOpenTutorial}
            isAgentThinking={isLoading}
        />

        {/* Mobile Floating Action Button */}
        {!isChatOpen && isMobile && (
            <button
            onClick={() => setChatOpen(true)}
            className="absolute bottom-12 right-6 p-3.5 bg-blue-600 hover:bg-blue-500 rounded-full shadow-lg shadow-blue-900/50 z-20 transition-transform active:scale-95 md:hidden"
            >
            <MessageSquare size={24} color="white" />
            </button>
        )}
      </main>

      {isChatOpen && !isMobile && <ResizeHandle panel="agent" onStart={startResize} />}

      {/* Agent Panel */}
      <ErrorBoundary>
      <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-gray-950 text-gray-500 text-sm">Loading Agent...</div>}>
      <AgentChat
        messages={messages}
        onSendMessage={sendMessage}
        onRegenerate={regenerateMessage}
        onEditMessage={editUserMessage}
        onStop={stopGeneration}
        isLoading={isLoading}
        isOpen={isChatOpen}
        onClose={() => setChatOpen(false)}
        todos={todos}
        sessions={sessions}
        currentSessionId={currentSessionId ?? ''}
        onCreateSession={createNewSession}
        onSwitchSession={switchSession}
        onDeleteSession={deleteSession}
        files={files}
        pendingChanges={pendingChanges}
        width={agentWidth}
        isMobile={isMobile}
        tokenUsage={tokenUsage}
        messageWindowInfo={messageWindowInfo}
        planMode={planMode}
        onTogglePlanMode={togglePlanMode}
        currentPlanNote={currentPlanNote}
        onOpenPlanViewer={() => {
        setIsPlanViewerOpen(true);
        if (isMobile) setChatOpen(false);
      }}
      />
      </Suspense>
      </ErrorBoundary>

      {/* Modals */}
      <AppModals
        ref={appModalsRef}
        project={currentProject}
        files={files}
        onUpdateProject={handleUpdateProject}
        aiConfig={aiConfig}
        onUpdateAIConfig={updateAiConfig}
      />

      {/* Tutorial */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={handleTutorialClose}
      />
    </div>
  );
};

export default MainLayout;
