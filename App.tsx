
import React, { useEffect } from 'react';
import ProjectManager from './components/ProjectManager';
import MainLayout from './components/MainLayout';
import { useProjectStore } from './stores/projectStore';
import { useAgentStore } from './stores/agentStore';

export default function App() {
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const selectProject = useProjectStore(state => state.selectProject);
  const loadProjects = useProjectStore(state => state.loadProjects);
  const loadAIConfig = useAgentStore(state => state.loadAIConfig);

  // Initial Load
  useEffect(() => {
    loadProjects();
    loadAIConfig();
  }, [loadProjects, loadAIConfig]);

  return (
    <>
      {!currentProjectId ? (
        <ProjectManager onSelectProject={selectProject} />
      ) : (
        <MainLayout 
             projectId={currentProjectId} 
             onBack={() => selectProject(null)} 
        />
      )}
    </>
  );
}
