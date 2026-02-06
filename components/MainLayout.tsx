
import React, { useState, useEffect } from 'react';
import { Menu, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Editor from './Editor';
import AgentChat from './AgentChat';
import Sidebar from './Sidebar';
import ProjectOverview from './ProjectOverview';
import StatusBar from './StatusBar';
import { useAgent } from '../hooks/useAgent';
import { useProjectStore } from '../stores/projectStore';
import { useFileStore } from '../stores/fileStore';
import { useUiStore } from '../stores/uiStore';
import { useShallow } from 'zustand/react/shallow';

interface MainLayoutProps {
    projectId: string;
    onBack: () => void;
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
      setSidebarWidth, 
      setAgentWidth,
      toggleChat,
      toggleSidebar
  } = useUiStore(useShallow(state => ({
      isSidebarOpen: state.isSidebarOpen,
      isChatOpen: state.isChatOpen,
      sidebarWidth: state.sidebarWidth,
      agentWidth: state.agentWidth,
      setSidebarOpen: state.setSidebarOpen,
      setChatOpen: state.setChatOpen,
      setSidebarWidth: state.setSidebarWidth,
      setAgentWidth: state.setAgentWidth,
      toggleChat: state.toggleChat,
      toggleSidebar: state.toggleSidebar
  })));

  const [isProjectOverviewOpen, setIsProjectOverviewOpen] = useState(false);
  const [isResizing, setIsResizing] = useState<'sidebar' | 'agent' | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Use Store Hooks (Single Source of Truth)
  const currentProject = useProjectStore(state => state.getCurrentProject());
  const updateProject = useProjectStore(state => state.updateProject);
  const loadFiles = useFileStore(state => state.loadFiles);
  
  // Initialize Files when Project Changes
  useEffect(() => {
    if (projectId) {
        loadFiles(projectId);
    }
  }, [projectId, loadFiles]);

  // File System State & Actions
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

  const fileSystemActions = {
      createFile,
      updateFile,
      patchFile,
      readFile,
      searchFiles,
      listFiles,
      renameFile
  };

  const handleAgentUpdateProject = (updates: any) => {
      if (!projectId) return "Error: No active project.";
      updateProject(projectId, updates);
      return `Successfully updated project metadata: ${JSON.stringify(updates)}`;
  };

  const activeFile = files.find(f => f.id === activeFileId) || null;

  // Initialize Agent Hook (No longer manages UI open state)
  const { 
    messages, isLoading, 
    sendMessage, todos, sessions, currentSessionId, 
    createNewSession, switchSession, deleteSession,
    aiConfig, updateAiConfig, pendingChanges
  } = useAgent(files, currentProject, activeFile, { 
      ...fileSystemActions, 
      deleteFile, 
      updateProjectMeta: handleAgentUpdateProject 
  });

  // Responsive Layout Handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    handleResize();
    
    // Initial Mobile Check on Mount: Close sidebars to ensure clean state
    if (window.innerWidth < 768) {
        setSidebarOpen(false);
        setChatOpen(false);
    } 

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty dependency array ensures this only runs on mount/unmount

  // --- Resizing Logic ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      e.preventDefault();

      if (isResizing === 'sidebar') {
         // Sidebar: Min 180px, Max 600px
         const newWidth = Math.max(180, Math.min(e.clientX, 600));
         setSidebarWidth(newWidth);
      } else if (isResizing === 'agent') {
         // Agent: Min 250px, Max 800px
         const newWidth = Math.max(250, Math.min(window.innerWidth - e.clientX, 800));
         setAgentWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
        setIsResizing(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setSidebarWidth, setAgentWidth]);

  if (!currentProject) return <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-gray-500">Loading Context...</div>;

  return (
    <div className="flex h-[100dvh] bg-gray-950 text-gray-100 font-sans overflow-hidden relative selection:bg-blue-500/30">
      
      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onBackToProjects={onBack}
        onOpenSettings={() => {
            setIsProjectOverviewOpen(true);
            if (isMobile) setSidebarOpen(false);
        }}
        width={sidebarWidth}
        isMobile={isMobile}
      />

      {/* Sidebar Resizer (Desktop Only) */}
      {isSidebarOpen && !isMobile && (
          <div 
             className="w-1 hover:w-1.5 h-full bg-gray-800 hover:bg-blue-500 cursor-col-resize transition-all z-40 shrink-0"
             onMouseDown={() => setIsResizing('sidebar')}
          />
      )}

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 relative transition-all duration-300`}>
        
        {/* Mobile Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 md:hidden shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1 -ml-1 text-gray-400 active:text-white">
            <Menu size={24} />
          </button>
          <span className="font-bold text-gray-200 truncate max-w-[200px] text-sm">
            {activeFile ? activeFile.name : currentProject.name}
          </span>
          <button 
            onClick={toggleChat}
            className={`p-1 -mr-1 ${isChatOpen ? 'text-blue-400' : 'text-gray-400'}`}
          >
            <MessageSquare size={24} />
          </button>
        </header>

        {/* Desktop Header / Toolbar */}
        <div className="hidden md:flex items-center justify-between bg-gray-900 border-b border-gray-800 h-10 px-4 shrink-0">
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
                    onClick={toggleChat}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${isChatOpen ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                 >
                    <MessageSquare size={14} />
                    Agent
                 </button>
            </div>
        </div>

        {/* Editor Container */}
        <div className="flex-1 overflow-hidden relative bg-[#0d1117]">
          <Editor className="w-full h-full" />
        </div>

        {/* Status Bar */}
        <StatusBar 
            project={currentProject} 
            files={files} 
            activeFile={activeFile}
            onOpenSettings={() => setIsProjectOverviewOpen(true)}
            isAgentThinking={isLoading}
        />

        {/* Mobile Floating Action Button (Only if chat is closed) */}
        {!isChatOpen && isMobile && (
            <button
            onClick={() => setChatOpen(true)}
            className="absolute bottom-12 right-6 p-3.5 bg-blue-600 hover:bg-blue-500 rounded-full shadow-lg shadow-blue-900/50 z-20 transition-transform active:scale-95 md:hidden"
            >
            <MessageSquare size={24} color="white" />
            </button>
        )}
      </main>

      {/* Agent Chat Resizer (Desktop Only) */}
      {isChatOpen && !isMobile && (
          <div 
             className="w-1 hover:w-1.5 h-full bg-gray-800 hover:bg-blue-500 cursor-col-resize transition-all z-40 shrink-0"
             onMouseDown={() => setIsResizing('agent')}
          />
      )}

      {/* Agent Panel */}
      <AgentChat 
        messages={messages} 
        onSendMessage={sendMessage}
        isLoading={isLoading}
        isOpen={isChatOpen}
        onClose={() => setChatOpen(false)}
        todos={todos}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onCreateSession={createNewSession}
        onSwitchSession={switchSession}
        onDeleteSession={deleteSession}
        files={files} 
        pendingChanges={pendingChanges}
        width={agentWidth}
        isMobile={isMobile}
      />

      <ProjectOverview 
        project={currentProject}
        files={files}
        isOpen={isProjectOverviewOpen}
        onClose={() => setIsProjectOverviewOpen(false)}
        onUpdate={(updated) => updateProject(updated.id, updated)}
        aiConfig={aiConfig}
        onUpdateAIConfig={updateAiConfig}
      />
    </div>
  );
};

export default MainLayout;
