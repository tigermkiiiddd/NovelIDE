
import { ProjectMeta, FileNode, PlanNote, ChapterAnalysis, LongTermMemory, MemoryEdge, CharacterProfileV2, CharacterProfileVersion, ChapterAnalysisVersion } from '../types';
import { generateId } from './fileSystem';
import { dbAPI } from './persistence';
import { FileVersion } from '../stores/versionStore';

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
    planNotes: PlanNote[];
    characterProfiles: CharacterProfileV2[];
    longTermMemories: LongTermMemory[];
    memoryEdges: MemoryEdge[];
    chapterAnalyses: ChapterAnalysis[];
    versions: FileVersion[];
    characterProfileVersions: CharacterProfileVersion[];
    chapterAnalysisVersions: ChapterAnalysisVersion[];
}

export const exportProject = async (projectId: string): Promise<string> => {
    const projects = await dbAPI.getAllProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error("Project not found");

    const files = await dbAPI.getFiles(projectId) || [];
    const planNotes = await dbAPI.getPlanNotes(`novel-plan-notes-${projectId}`) || [];
    const characterProfiles = await dbAPI.getCharacterProfiles(projectId);
    const longTermMemories = await dbAPI.getLongTermMemories(projectId);
    const memoryEdges = await dbAPI.getMemoryEdges(projectId);
    const chapterAnalyses = await dbAPI.getChapterAnalyses(projectId) || [];
    const versions = await dbAPI.getVersions(projectId) || [];
    const characterProfileVersions = await dbAPI.getCharacterProfileVersions(projectId);
    const chapterAnalysisVersions = await dbAPI.getChapterAnalysisVersions(projectId);

    const backup: ProjectBackup = {
        version: 2,
        meta: project,
        files,
        planNotes,
        characterProfiles,
        longTermMemories,
        memoryEdges,
        chapterAnalyses,
        versions,
        characterProfileVersions,
        chapterAnalysisVersions,
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

        // Save core data
        await dbAPI.saveProject(newProject);
        await dbAPI.saveFiles(newId, backup.files);

        // Restore associated IndexedDB data (v2 backup format)
        if (backup.version >= 2) {
            // Plan notes
            if (backup.planNotes?.length) {
                await dbAPI.savePlanNotes(`novel-plan-notes-${newId}`, backup.planNotes);
            }
            // Character profiles
            for (const profile of backup.characterProfiles || []) {
                await dbAPI.saveCharacterProfile(profile, newId);
            }
            // Long-term memories
            for (const memory of backup.longTermMemories || []) {
                await dbAPI.saveLongTermMemory(memory, newId);
            }
            // Memory edges
            for (const edge of backup.memoryEdges || []) {
                await dbAPI.saveMemoryEdge(edge, newId);
            }
            // Chapter analyses
            if (backup.chapterAnalyses?.length) {
                await dbAPI.saveChapterAnalyses(newId, backup.chapterAnalyses);
            }
            // File versions
            if (backup.versions?.length) {
                await dbAPI.saveVersions(newId, backup.versions);
            }
            // Character profile versions
            for (const version of backup.characterProfileVersions || []) {
                await dbAPI.saveCharacterProfileVersion(version, newId);
            }
            // Chapter analysis versions
            for (const version of backup.chapterAnalysisVersions || []) {
                await dbAPI.saveChapterAnalysisVersion(version, newId);
            }
        }

        return newProject;
    } catch (e) {
        console.error("Import failed", e);
        throw e;
    }
};
