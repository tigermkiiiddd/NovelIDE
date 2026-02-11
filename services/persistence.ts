
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
// Check if LocalStorage has data, move to IDB, then clear LocalStorage
export const migrateFromLocalStorage = async () => {
  const db = await initDB();
  
  // 1. Projects & Files Migration
  const PROJECTS_KEY = 'novel-projects-list';
  const lsProjects = localStorage.getItem(PROJECTS_KEY);
  if (lsProjects) {
    try {
      console.log('Migrating projects from LocalStorage to IndexedDB...');
      const projects: ProjectMeta[] = JSON.parse(lsProjects);
      
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      
      for (const project of projects) {
        // 1. Save Project Meta
        await tx.objectStore('projects').put(project);
        
        // 2. Save Files
        const fileKey = `novel-files-${project.id}`;
        const lsFiles = localStorage.getItem(fileKey);
        if (lsFiles) {
          const files: FileNode[] = JSON.parse(lsFiles);
          await tx.objectStore('files').put(files, project.id);
          localStorage.removeItem(fileKey); // Clear converted data
        }
      }
      
      await tx.done;
      localStorage.removeItem(PROJECTS_KEY); // Clear list
      console.log('Project migration complete.');
    } catch (e) {
      console.error('Project migration failed:', e);
    }
  }

  // 2. AI Config Migration (Agent Store)
  const AGENT_STORAGE_KEY = 'novel-genie-agent-storage';
  const lsAgent = localStorage.getItem(AGENT_STORAGE_KEY);
  if (lsAgent) {
      try {
          console.log('Migrating AI Config from LocalStorage to IndexedDB...');
          const parsed = JSON.parse(lsAgent);
          // Zustand persist wraps state in 'state' object
          if (parsed.state && parsed.state.aiConfig) {
              await db.put('settings', parsed.state.aiConfig, 'global');
              console.log('AI Config migration complete.');
          }
          localStorage.removeItem(AGENT_STORAGE_KEY);
      } catch (e) {
          console.error("Config migration failed", e);
      }
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
