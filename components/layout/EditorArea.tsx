import React, { useState, useEffect, Suspense, lazy } from 'react';
import { FileNode, PlanNote } from '../../types';
import { usePlanStore } from '../../stores/planStore';

// Lazy-loaded views (only loaded when activated)
const KnowledgeTreeView = lazy(() => import('../KnowledgeTreeView').then(m => ({ default: m.KnowledgeTreeView })));
const OutlineViewer = lazy(() => import('../OutlineViewer'));
const PlanNoteViewer = lazy(() => import('../PlanNoteViewer'));
const RelationshipGraph = lazy(() => import('../RelationshipGraph').then(m => ({ default: m.RelationshipGraph })));
// Editor is always needed — eager import
import Editor from '../EditorRefactored';

const loadingFallback = (
  <div className="w-full h-full flex items-center justify-center bg-[#0d1117] text-gray-500 text-sm">
    Loading...
  </div>
);

interface EditorAreaProps {
  activeFile: FileNode | null;
  isKnowledgeGraphOpen: boolean;
  isRelationshipViewOpen: boolean;
  isPlanViewerOpen: boolean;
  onClosePlanViewer: () => void;
  currentPlanNote: PlanNote | null;
  planMode: boolean;
  togglePlanMode: () => void;
  approvePlanNote: (noteOrId: PlanNote | string) => void;
  rejectPlanNote: (noteOrId: PlanNote | string) => void;
  onSendFeedbackToAI: (feedback: string) => void;
  isMobile: boolean;
  onOpenChat: () => void;
}

const EditorArea: React.FC<EditorAreaProps> = ({
  activeFile,
  isKnowledgeGraphOpen,
  isRelationshipViewOpen,
  isPlanViewerOpen,
  onClosePlanViewer,
  currentPlanNote,
  planMode,
  togglePlanMode,
  approvePlanNote,
  rejectPlanNote,
  onSendFeedbackToAI,
  isMobile,
  onOpenChat,
}) => {
  const [isOutlineViewerOpen, setIsOutlineViewerOpen] = useState(false);

  // Auto-open/close OutlineViewer when active file is outline.json
  useEffect(() => {
    if (!activeFile) return;
    const shouldBeOpen = activeFile.name === 'outline.json';
    setIsOutlineViewerOpen(prev => {
      if (shouldBeOpen && !prev) return true;
      if (!shouldBeOpen && prev) return false;
      return prev;
    });
  }, [activeFile]);

  // Plan Store annotation actions
  const addAnnotation = usePlanStore(state => state.addAnnotation);
  const updateAnnotation = usePlanStore(state => state.updateAnnotation);
  const deleteAnnotation = usePlanStore(state => state.deleteAnnotation);

  // --- Content routing ---

  if (isKnowledgeGraphOpen) {
    return (
      <Suspense fallback={loadingFallback}>
        <KnowledgeTreeView
          onSelectNode={(node) => console.log('Selected knowledge node:', node)}
          className="h-full"
        />
      </Suspense>
    );
  }

  if (isRelationshipViewOpen) {
    return (
      <Suspense fallback={loadingFallback}>
        <RelationshipGraph height={window.innerHeight - 100} />
      </Suspense>
    );
  }

  if (isOutlineViewerOpen) {
    return (
      <Suspense fallback={loadingFallback}>
        <OutlineViewer
          isOpen={isOutlineViewerOpen}
          onClose={() => setIsOutlineViewerOpen(false)}
        />
      </Suspense>
    );
  }

  if (isPlanViewerOpen) {
    return (
      <Suspense fallback={loadingFallback}>
        <PlanNoteViewer
          planNote={currentPlanNote}
          isOpen={isPlanViewerOpen}
          onClose={onClosePlanViewer}
          onAddAnnotation={addAnnotation}
          onUpdateAnnotation={updateAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onApprove={(planId) => {
            approvePlanNote(planId);
            togglePlanMode();
          }}
          onReject={rejectPlanNote}
          onSendFeedback={onSendFeedbackToAI}
          isMobile={isMobile}
          onOpenChat={onOpenChat}
        />
      </Suspense>
    );
  }

  return <Editor className="w-full h-full" />;
};

export default EditorArea;
