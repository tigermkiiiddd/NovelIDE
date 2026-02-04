
import { ProjectMeta } from '../types';
import { generateId } from './fileSystem';
import { dbAPI } from './persistence';
import { FileNode } from '../types';

/**
 * Pure Business Logic / Factory Functions
 * 
 * Note: Actual persistence is handled by the stores (projectStore.ts) using dbAPI.
 */

export const createProject = (
  name: string, 
  description: string,
  genre: string = '通用',
  wordsPerChapter: number = 3000,
  targetChapters: number = 100,
  skipSave: boolean = false
): ProjectMeta => {
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
  
  return newProject;
};

export const updateProject = (current: ProjectMeta, updates: Partial<Omit<ProjectMeta, 'id' | 'createdAt'>>): ProjectMeta => {
  return {
    ...current,
    ...updates,
    lastModified: Date.now()
  };
};

// Key Helper
export const getProjectStorageKey = (projectId: string) => `novel-files-${projectId}`;

// --- Import/Export Utilities ---

export interface ProjectBackup {
    version: number;
    meta: ProjectMeta;
    files: FileNode[];
}

export const exportProject = async (projectId: string): Promise<string> => {
    const projects = await dbAPI.getAllProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error("Project not found");

    const files = await dbAPI.getFiles(projectId) || [];

    const backup: ProjectBackup = {
        version: 1,
        meta: project,
        files: files
    };

    return JSON.stringify(backup, null, 2);
};

export const importProject = async (jsonString: string): Promise<ProjectMeta> => {
    try {
        const backup: ProjectBackup = JSON.parse(jsonString);
        if (!backup.meta || !backup.files) throw new Error("Invalid project file format");

        // Force new ID to avoid collision
        const newId = generateId();
        const newProject: ProjectMeta = {
            ...backup.meta,
            id: newId,
            name: `${backup.meta.name} (Imported)`,
            lastModified: Date.now()
        };

        // Save via DB API
        await dbAPI.saveProject(newProject);
        await dbAPI.saveFiles(newId, backup.files);

        return newProject;
    } catch (e) {
        console.error("Import failed", e);
        throw e;
    }
};
