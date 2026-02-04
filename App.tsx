
import React, { useEffect } from 'react';
import ProjectManager from './components/ProjectManager';
import MainLayout from './components/MainLayout';
import { useProjectStore } from './stores/projectStore';

export default function App() {
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const selectProject = useProjectStore(state => state.selectProject);
  const loadProjects = useProjectStore(state => state.loadProjects);

  // Initial Load
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
