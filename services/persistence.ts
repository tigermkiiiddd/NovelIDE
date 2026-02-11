
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ProjectMeta, FileNode, ChatSession, AIConfig } from '../types';

interface NovelGenieDB extends DBSchema {
  projects: {
    key: string; // project.id
    value: ProjectMeta;
  };
  files: {
    key: string; // project.id
    value: FileNode[];
  };
  sessions: {
    key: string; // storageKey (e.g. novel-chat-sessions-{projectId})
    value: ChatSession[];
  };
  settings: {
    key: string; // 'global'
    value: AIConfig;
  };
}

const DB_NAME = 'novel-genie-db';
const DB_VERSION = 2; // Increment version for new store

let dbPromise: Promise<IDBPDatabase<NovelGenieDB>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<NovelGenieDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files'); // Key is projectId
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions'); // Key is storageKey
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings'); // Key is 'global'
        }
      },
    });
  }
  return dbPromise;
};

// --- Migration Utility ---
// Robust migration: Try/Catch everything, don't block app load.
export const migrateFromLocalStorage = async () => {
  try {
      const db = await initDB();
      
      // 1. Projects & Files Migration
      const PROJECTS_KEY = 'novel-projects-list';
      const lsProjects = localStorage.getItem(PROJECTS_KEY);
      
      if (lsProjects) {
        console.log('Found legacy projects in LocalStorage. Starting migration...');
        let projects: ProjectMeta[] = [];
        try {
            projects = JSON.parse(lsProjects);
        } catch (e) {
            console.error("Failed to parse legacy projects list:", e);
        }

        if (Array.isArray(projects)) {
            for (const project of projects) {
                try {
                    // Save Project Meta (Use db.put for auto-transaction)
                    // We check if it exists first to avoid overwriting newer data if migration runs again
                    const existing = await db.get('projects', project.id);
                    if (!existing) {
                        await db.put('projects', project);
                    }
                    
                    // Save Files
                    const fileKey = `novel-files-${project.id}`;
                    const lsFiles = localStorage.getItem(fileKey);
                    if (lsFiles) {
                        try {
                            const files: FileNode[] = JSON.parse(lsFiles);
                            // Check if files already exist in DB
                            const existingFiles = await db.get('files', project.id);
                            if (!existingFiles) {
                                await db.put('files', files, project.id);
                            }
                            // Only remove from LS if successful
                            localStorage.removeItem(fileKey);
                        } catch (err) {
                            console.warn(`Failed to migrate files for project ${project.id}`, err);
                        }
                    }
                } catch (err) {
                    console.error(`Failed to migrate project ${project.id}`, err);
                }
            }
            // Clear main list only after attempting all
            localStorage.removeItem(PROJECTS_KEY);
        }
        console.log('Project migration process finished.');
      }

      // 2. AI Config Migration (Agent Store)
      const AGENT_STORAGE_KEY = 'novel-genie-agent-storage';
      const lsAgent = localStorage.getItem(AGENT_STORAGE_KEY);
      if (lsAgent) {
          try {
              console.log('Migrating AI Config...');
              const parsed = JSON.parse(lsAgent);
              // Zustand persist wraps state in 'state' object
              if (parsed.state && parsed.state.aiConfig) {
                  const existingConfig = await db.get('settings', 'global');
                  if (!existingConfig) {
                      await db.put('settings', parsed.state.aiConfig, 'global');
                  }
              }
              localStorage.removeItem(AGENT_STORAGE_KEY);
          } catch (e) {
              console.error("Config migration failed", e);
          }
      }
  } catch (globalErr) {
      console.error("Catastrophic migration failure (ignored to allow app boot):", globalErr);
  }
};

// --- API ---

export const dbAPI = {
  // Projects
  getAllProjects: async (): Promise<ProjectMeta[]> => {
    const db = await initDB();
    return await db.getAll('projects');
  },
  
  saveProject: async (project: ProjectMeta) => {
    const db = await initDB();
    await db.put('projects', project);
  },

  deleteProject: async (id: string) => {
    const db = await initDB();
    const tx = db.transaction(['projects', 'files', 'sessions'], 'readwrite');
    await tx.objectStore('projects').delete(id);
    await tx.objectStore('files').delete(id);
    // Delete sessions associated with project
    // Note: This is an approximation. IDB doesn't support wildcard delete easily without iteration.
    // Ideally we iterate keys, but for now this deletes the main session key if it matches exact pattern.
    // Since we store sessions as array in one key "novel-chat-sessions-{id}", this is correct.
    await tx.objectStore('sessions').delete(`novel-chat-sessions-${id}`);
    await tx.done;
  },

  // Files (Stored as whole tree array for simplicity, matching current logic)
  getFiles: async (projectId: string): Promise<FileNode[] | undefined> => {
    const db = await initDB();
    return await db.get('files', projectId);
  },

  saveFiles: async (projectId: string, files: FileNode[]) => {
    const db = await initDB();
    await db.put('files', files, projectId);
  },

  // Sessions
  getSessions: async (storageKey: string): Promise<ChatSession[] | undefined> => {
    const db = await initDB();
    return await db.get('sessions', storageKey);
  },

  saveSessions: async (storageKey: string, sessions: ChatSession[]) => {
    const db = await initDB();
    await db.put('sessions', sessions, storageKey);
  },

  // Settings (AI Config)
  getAIConfig: async (): Promise<AIConfig | undefined> => {
    const db = await initDB();
    return await db.get('settings', 'global');
  },

  saveAIConfig: async (config: AIConfig) => {
    const db = await initDB();
    await db.put('settings', config, 'global');
  }
};
