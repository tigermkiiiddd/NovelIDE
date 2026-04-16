
import React, { useEffect, useState } from 'react';
import VConsole from 'vconsole';
import ErrorBoundary from './components/ErrorBoundary';
import ProjectManager from './components/ProjectManager';
import MainLayout from './components/MainLayout';
import LoadingPage from './components/LoadingPage';
import ToastContainer from './components/Toast';
import { useProjectStore } from './stores/projectStore';
import { useAgentStore } from './stores/agentStore';

// Initialize VConsole for mobile debugging
let vconsole: VConsole | null = null;
if (typeof window !== 'undefined') {
  // Check if mobile device or manually enabled
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const enableVConsole = isMobile || localStorage.getItem('vconsole') === 'true';

  if (enableVConsole) {
    vconsole = new VConsole({
      theme: 'dark'
    });
    console.log('[VConsole] 已启用移动端调试工具');
  }
}

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const selectProject = useProjectStore(state => state.selectProject);
  const loadProjects = useProjectStore(state => state.loadProjects);
  const loadAIConfig = useAgentStore(state => state.loadAIConfig);

  // Initial Load
  useEffect(() => {
    loadProjects();
    loadAIConfig();
  }, [loadProjects, loadAIConfig]);

  const handleSelectProject = async (id: string | null) => {
    await selectProject(id);
  };

  const handleBack = async () => {
    await selectProject(null);
  };

  // Loading phase: download embedding model + show progress
  if (!appReady) {
    return <LoadingPage onReady={() => setAppReady(true)} />;
  }

  return (
    <ErrorBoundary>
      <ToastContainer />
      {!currentProjectId ? (
        <ProjectManager onSelectProject={handleSelectProject} />
      ) : (
        <MainLayout
             projectId={currentProjectId}
             onBack={handleBack}
        />
      )}
    </ErrorBoundary>
  );
}
