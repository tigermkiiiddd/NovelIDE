
import { create } from 'zustand';
import { ProjectMeta } from '../types';
import { dbAPI } from '../services/persistence';
import { dataService } from '../services/dataService';
import { generateId } from '../services/fileSystem';
import { createInitialFileSystem } from '../services/fileSystem';
import { getPresetById } from '../services/resources/presets';

export interface ProjectState {
  projects: ProjectMeta[];
  currentProjectId: string | null;
  isLoading: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  selectProject: (id: string | null) => Promise<void>; // Changed to async
  createProject: (
    name: string,
    description: string,
    genre: string,
    wordsPerChapter: number,
    targetChapters: number,
    chaptersPerVolume?: number,
    presetId?: string,
    pleasureRhythm?: ProjectMeta['pleasureRhythm'],
    pleasureRhythmEnabled?: boolean,
    coreGameplay?: string[],
    narrativeElements?: string[],
    styleTone?: string[],
    romanceLine?: string[]
  ) => Promise<void>;
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

    try {
        // Load projects
        const list = await dbAPI.getAllProjects();
        list.sort((a, b) => b.lastModified - a.lastModified);
        set({ projects: list });

        // Restore last active project
        const savedProjectId = await dbAPI.getCurrentProjectId();
        if (savedProjectId) {
            set({ currentProjectId: savedProjectId });
        }
    } catch (e) {
        console.error("Failed to load projects", e);
    } finally {
        set({ isLoading: false });
    }
  },

  selectProject: async (id) => {
    set({ currentProjectId: id });
    // Persist to IndexedDB
    await dbAPI.saveCurrentProjectId(id);
  },

  createProject: async (name, description, genre, wordsPerChapter, targetChapters, chaptersPerVolume, presetId, pleasureRhythm, pleasureRhythmEnabled, coreGameplay, narrativeElements, styleTone, romanceLine) => {
    const newProject: ProjectMeta = {
      id: generateId(),
      name,
      description,
      genre,
      wordsPerChapter,
      targetChapters,
      chaptersPerVolume,
      presetId,
      pleasureRhythmEnabled,
      pleasureRhythm,
      coreGameplay,
      narrativeElements,
      styleTone,
      romanceLine,
      createdAt: Date.now(),
      lastModified: Date.now()
    };

    // 1. Optimistic Update
    set(state => ({
      projects: [newProject, ...state.projects].sort((a, b) => b.lastModified - a.lastModified)
    }));

    // 2. Persist
    await dbAPI.saveProject(newProject);

    // 3. Init files with preset (if provided)
    const preset = presetId ? getPresetById(presetId) : undefined;
    await dbAPI.saveFiles(newProject.id, createInitialFileSystem(preset));
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

    // 使用 DataService 进行完整的级联删除
    await dataService.deleteProjectCascade(id);

    // If deleting current project, clear saved ID
    if (currentProjectId === id) {
      await dbAPI.saveCurrentProjectId(null);
    }
  },

  refreshProjects: async () => {
      // Re-fetch from DB to ensure sync
      const list = await dbAPI.getAllProjects();
      list.sort((a, b) => b.lastModified - a.lastModified);
      set({ projects: list });
  }
}));
