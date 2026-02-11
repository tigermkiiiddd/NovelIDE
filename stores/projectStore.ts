
import { create } from 'zustand';
import { ProjectMeta } from '../types';
import { dbAPI } from '../services/persistence';
import { generateId } from '../services/fileSystem';
import { initialFileSystem } from '../services/fileSystem';

interface ProjectState {
  projects: ProjectMeta[];
  currentProjectId: string | null;
  isLoading: boolean;
  
  // Actions
  loadProjects: () => Promise<void>;
  selectProject: (id: string | null) => void;
  createProject: (name: string, description: string, genre: string, wordsPerChapter: number, targetChapters: number) => Promise<void>;
  updateProject: (id: string, updates: Partial<ProjectMeta>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  
  // Computed helpers
  getCurrentProject: () => ProjectMeta | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  isLoading: true,

  getCurrentProject: () => {
    const { projects, currentProjectId } = get();
    return projects.find(p => p.id === currentProjectId);
  },

  loadProjects: async () => {
    set({ isLoading: true });
    
    // Safety timeout: Ensure we don't spin forever if IDB hangs
    const timeout = new Promise<void>(resolve => setTimeout(() => {
        console.warn("Project loading timed out, forcing render.");
        resolve();
    }, 2000)); // 2 seconds soft timeout

    const loadLogic = async () => {
        try {
            // Removed migrateFromLocalStorage() call to prevent freezing
            const list = await dbAPI.getAllProjects();
            list.sort((a, b) => b.lastModified - a.lastModified);
            set({ projects: list });
        } catch (e) {
            console.error("Failed to load projects", e);
        }
    };

    await Promise.race([loadLogic(), timeout]);
    set({ isLoading: false });
  },

  selectProject: (id) => {
    set({ currentProjectId: id });
  },

  createProject: async (name, description, genre, wordsPerChapter, targetChapters) => {
    const newProject: ProjectMeta = {
      id: generateId(),
      name,
      description,
      genre,
      wordsPerChapter,
      targetChapters,
      createdAt: Date.now(),
      lastModified: Date.now()
    };

    // 1. Optimistic Update
    set(state => ({
      projects: [newProject, ...state.projects].sort((a, b) => b.lastModified - a.lastModified)
    }));

    // 2. Persist
    await dbAPI.saveProject(newProject);
    // Init files
    await dbAPI.saveFiles(newProject.id, initialFileSystem);
  },

  updateProject: async (id, updates) => {
    const { projects } = get();
    const project = projects.find(p => p.id === id);
    if (!project) return;

    const updated = { ...project, ...updates, lastModified: Date.now() };

    set(state => ({
      projects: state.projects.map(p => p.id === id ? updated : p)
    }));

    await dbAPI.saveProject(updated);
  },

  deleteProject: async (id) => {
    const { currentProjectId } = get();
    
    set(state => ({
      projects: state.projects.filter(p => p.id !== id),
      currentProjectId: currentProjectId === id ? null : currentProjectId
    }));

    await dbAPI.deleteProject(id);
  },

  refreshProjects: async () => {
      // Re-fetch from DB to ensure sync
      const list = await dbAPI.getAllProjects();
      list.sort((a, b) => b.lastModified - a.lastModified);
      set({ projects: list });
  }
}));
