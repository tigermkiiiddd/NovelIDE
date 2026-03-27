import React, { useState, forwardRef, useImperativeHandle, Suspense, lazy } from 'react';
import { ProjectMeta, FileNode, AIConfig } from '../../types';

const ProjectOverview = lazy(() => import('../ProjectOverview'));

export interface AppModalsRef {
  openProjectOverview: () => void;
}

interface AppModalsProps {
  project: ProjectMeta;
  files: FileNode[];
  onUpdateProject: (id: string, updates: Partial<ProjectMeta>) => void;
  aiConfig: AIConfig;
  onUpdateAIConfig: (config: AIConfig) => void;
}

const AppModals = forwardRef<AppModalsRef, AppModalsProps>(({
  project,
  files,
  onUpdateProject,
  aiConfig,
  onUpdateAIConfig,
}, ref) => {
  const [isProjectOverviewOpen, setIsProjectOverviewOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openProjectOverview: () => setIsProjectOverviewOpen(true),
  }));

  if (!isProjectOverviewOpen) return null;

  return (
    <Suspense fallback={null}>
      <ProjectOverview
        project={project}
        files={files}
        isOpen={isProjectOverviewOpen}
        onClose={() => setIsProjectOverviewOpen(false)}
        onUpdate={(updated) => onUpdateProject(updated.id, updated)}
        aiConfig={aiConfig}
        onUpdateAIConfig={onUpdateAIConfig}
      />
    </Suspense>
  );
});

AppModals.displayName = 'AppModals';

export default AppModals;
