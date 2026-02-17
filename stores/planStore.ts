/**
 * planStore.ts
 * Plan 笔记本数据管理
 *
 * 注意：Plan 模式开关存储在 ChatSession.planModeEnabled（会话级别）
 * 这里只管理 Plan 笔记本的数据
 */

import { create } from 'zustand';
import { PlanNote, PlanNoteLine, PlanNoteAnnotation } from '../types';
import { dbAPI } from '../services/persistence';
import { generateId } from '../services/fileSystem';

// 简单的 debounce 工具函数
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

interface PlanState {
  // 全局 Plan 模式开关（控制 AI 行为模式）
  planMode: { isEnabled: boolean };
  // 当前项目的 Plan 笔记列表
  planNotes: PlanNote[];

  // 加载状态
  isLoading: boolean;

  // --- Plan Mode Actions ---
  setPlanModeEnabled: (enabled: boolean) => void;
  togglePlanMode: () => void;

  // --- Plan Note CRUD ---
  loadPlanNotes: (projectId: string) => Promise<void>;
  createPlanNote: (sessionId: string, projectId: string, title?: string) => PlanNote;
  updatePlanNote: (planId: string, updates: Partial<PlanNote>) => void;
  deletePlanNote: (planId: string) => void;
  getPlanNoteBySessionId: (sessionId: string) => PlanNote | null;

  // --- Line Management ---
  addLine: (planId: string, text: string, afterLineId?: string) => PlanNoteLine | null;
  updateLine: (planId: string, lineId: string, text: string) => void;
  deleteLine: (planId: string, lineId: string) => void;
  reorderLines: (planId: string, lineIds: string[]) => void;
  replaceAllLines: (planId: string, lines: string[]) => void;

  // --- Annotation Management ---
  addAnnotation: (planId: string, lineId: string, content: string) => PlanNoteAnnotation | null;
  updateAnnotation: (planId: string, annotationId: string, content: string) => void;
  deleteAnnotation: (planId: string, annotationId: string) => void;

  // --- Status Management ---
  submitForReview: (planId: string) => void;
  approvePlan: (planId: string) => void;
  rejectPlan: (planId: string) => void;
}

// Helper to sync plan notes to IDB
const syncPlanNotesToDB = (projectId: string, planNotes: PlanNote[]) => {
  console.log('[syncPlanNotesToDB] 保存 Plan 笔记到 IndexedDB, projectId:', projectId, '笔记数量:', planNotes.length);
  dbAPI.savePlanNotes(`novel-plan-notes-${projectId}`, planNotes);
};

// 创建防抖版本（1秒防抖）
const debouncedSyncPlanNotesToDB = debounce(syncPlanNotesToDB, 1000);

export const usePlanStore = create<PlanState>((set, get) => ({
  planMode: {
    isEnabled: false
  },
  planNotes: [],
  isLoading: false,

  // --- Plan Mode Actions ---
  setPlanModeEnabled: (enabled) => {
    set(state => ({
      planMode: { ...state.planMode, isEnabled: enabled }
    }));
  },

  togglePlanMode: () => {
    set(state => ({
      planMode: { ...state.planMode, isEnabled: !state.planMode.isEnabled }
    }));
  },

  // --- Plan Note CRUD ---
  loadPlanNotes: async (projectId: string) => {
    set({ isLoading: true });
    try {
      const planNotes = await dbAPI.getPlanNotes(`novel-plan-notes-${projectId}`);
      console.log('[loadPlanNotes] 从 IndexedDB 读取到的 Plan 笔记:', planNotes);
      set({ planNotes: planNotes || [] });
    } catch (error) {
      console.error('[loadPlanNotes] 加载 Plan 笔记失败:', error);
      set({ planNotes: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  createPlanNote: (sessionId, projectId, title = '新计划') => {
    const newPlan: PlanNote = {
      id: generateId(),
      sessionId,
      projectId,
      title,
      lines: [],
      annotations: [],
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    set(state => ({
      planNotes: [newPlan, ...state.planNotes]
    }));

    debouncedSyncPlanNotesToDB(projectId, [newPlan, ...get().planNotes.slice(1)]);

    return newPlan;
  },

  updatePlanNote: (planId, updates) => {
    set(state => {
      const updatedNotes = state.planNotes.map(note =>
        note.id === planId
          ? { ...note, ...updates, updatedAt: Date.now() }
          : note
      );
      const currentNote = updatedNotes.find(n => n.id === planId);
      if (currentNote) {
        debouncedSyncPlanNotesToDB(currentNote.projectId, updatedNotes);
      }
      return { planNotes: updatedNotes };
    });
  },

  deletePlanNote: (planId) => {
    set(state => {
      const noteToDelete = state.planNotes.find(n => n.id === planId);
      const updatedNotes = state.planNotes.filter(n => n.id !== planId);
      if (noteToDelete) {
        debouncedSyncPlanNotesToDB(noteToDelete.projectId, updatedNotes);
      }
      return { planNotes: updatedNotes };
    });
  },

  getPlanNoteBySessionId: (sessionId) => {
    const { planNotes } = get();
    return planNotes.find(n => n.sessionId === sessionId) || null;
  },

  // --- Line Management ---
  addLine: (planId, text, afterLineId) => {
    let newLine: PlanNoteLine | null = null;

    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      const maxOrder = note.lines.length > 0
        ? Math.max(...note.lines.map(l => l.order))
        : 0;

      newLine = {
        id: generateId(),
        text,
        order: maxOrder + 1
      };

      // If afterLineId is specified, reorder lines
      let newLines = [...note.lines];
      if (afterLineId) {
        const afterIndex = newLines.findIndex(l => l.id === afterLineId);
        if (afterIndex !== -1) {
          // Insert after the specified line
          const afterOrder = newLines[afterIndex].order;
          newLine.order = afterOrder + 0.5; // Will be normalized
          newLines.push(newLine);
          // Re-normalize orders
          newLines.sort((a, b) => a.order - b.order);
          newLines = newLines.map((l, idx) => ({ ...l, order: idx + 1 }));
        } else {
          newLines.push(newLine);
        }
      } else {
        newLines.push(newLine);
      }

      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? { ...n, lines: newLines, updatedAt: Date.now() }
          : n
      );

      if (note) {
        debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);
      }

      return { planNotes: updatedNotes };
    });

    return newLine;
  },

  updateLine: (planId, lineId, text) => {
    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? {
              ...n,
              lines: n.lines.map(l =>
                l.id === lineId ? { ...l, text } : l
              ),
              updatedAt: Date.now()
            }
          : n
      );

      debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);

      return { planNotes: updatedNotes };
    });
  },

  deleteLine: (planId, lineId) => {
    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? {
              ...n,
              lines: n.lines.filter(l => l.id !== lineId),
              // Also remove annotations for this line
              annotations: n.annotations.filter(a => a.lineId !== lineId),
              updatedAt: Date.now()
            }
          : n
      );

      debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);

      return { planNotes: updatedNotes };
    });
  },

  reorderLines: (planId, lineIds) => {
    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      // Create a map for quick lookup
      const lineMap = new Map(note.lines.map(l => [l.id, l]));

      // Reorder based on new order
      const reorderedLines = lineIds
        .map((id, idx) => {
          const line = lineMap.get(id);
          return line ? { ...line, order: idx + 1 } : null;
        })
        .filter((l): l is PlanNoteLine => l !== null);

      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? { ...n, lines: reorderedLines, updatedAt: Date.now() }
          : n
      );

      debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);

      return { planNotes: updatedNotes };
    });
  },

  replaceAllLines: (planId, lines) => {
    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      const newLines: PlanNoteLine[] = lines.map((text, idx) => ({
        id: generateId(),
        text,
        order: idx + 1
      }));

      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? {
              ...n,
              lines: newLines,
              // Clear annotations when replacing all lines
              annotations: [],
              updatedAt: Date.now()
            }
          : n
      );

      debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);

      return { planNotes: updatedNotes };
    });
  },

  // --- Annotation Management ---
  addAnnotation: (planId, lineId, content) => {
    let newAnnotation: PlanNoteAnnotation | null = null;

    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      const now = Date.now();
      newAnnotation = {
        id: generateId(),
        lineId,
        content,
        createdAt: now,
        modifiedAt: now
      };

      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? {
              ...n,
              annotations: [...n.annotations, newAnnotation!],
              updatedAt: now
            }
          : n
      );

      debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);

      return { planNotes: updatedNotes };
    });

    return newAnnotation;
  },

  updateAnnotation: (planId, annotationId, content) => {
    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      const now = Date.now();
      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? {
              ...n,
              annotations: n.annotations.map(a =>
                a.id === annotationId
                  ? { ...a, content, modifiedAt: now }
                  : a
              ),
              updatedAt: now
            }
          : n
      );

      debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);

      return { planNotes: updatedNotes };
    });
  },

  deleteAnnotation: (planId, annotationId) => {
    set(state => {
      const note = state.planNotes.find(n => n.id === planId);
      if (!note) return state;

      const updatedNotes = state.planNotes.map(n =>
        n.id === planId
          ? {
              ...n,
              annotations: n.annotations.filter(a => a.id !== annotationId),
              updatedAt: Date.now()
            }
          : n
      );

      debouncedSyncPlanNotesToDB(note.projectId, updatedNotes);

      return { planNotes: updatedNotes };
    });
  },

  // --- Status Management ---
  submitForReview: (planId) => {
    get().updatePlanNote(planId, { status: 'reviewing' });
  },

  approvePlan: (planId) => {
    get().updatePlanNote(planId, { status: 'approved' });
  },

  rejectPlan: (planId) => {
    get().updatePlanNote(planId, { status: 'rejected' });
  }
}));
