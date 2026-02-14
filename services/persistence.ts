
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ProjectMeta, FileNode, ChatSession, AIConfig, DiffSessionState } from '../types';

interface UiSettings {
  isSidebarOpen: boolean;
  isChatOpen: boolean;
  sidebarWidth: number;
  agentWidth: number;
  isSplitView: boolean;
  showLineNumbers: boolean;
  wordWrap: boolean;
}

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
    key: string;
    value: any; // Can be AIConfig, projectId string, or sessionId string
  };
  diffSessions: {
    key: string; // 'current-{fileId}'
    value: DiffSessionState;
  };
  uiSettings: {
    key: string; // 'global'
    value: UiSettings;
  };
}

const DB_NAME = 'novel-genie-db';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<NovelGenieDB>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<NovelGenieDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Version 1 stores
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files');
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }

        // Version 4: Add diffSessions and uiSettings stores
        if (!db.objectStoreNames.contains('diffSessions')) {
          db.createObjectStore('diffSessions');
        }
        if (!db.objectStoreNames.contains('uiSettings')) {
          db.createObjectStore('uiSettings');
        }
      },
    });
  }
  return dbPromise;
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
    try {
        console.log('[dbAPI.getSessions] 开始读取, storageKey:', storageKey);
        const db = await initDB();
        const result = await db.get('sessions', storageKey);
        console.log('[dbAPI.getSessions] 读取结果:', result ? `找到 ${result.length} 个会话` : '无数据');
        return result;
    } catch (error) {
        console.error('[dbAPI.getSessions] 读取会话失败:', storageKey, error);
        return undefined;
    }
  },

  saveSessions: async (storageKey: string, sessions: ChatSession[]) => {
    console.log('[dbAPI.saveSessions] 开始保存, storageKey:', storageKey, '会话数量:', sessions.length);
    const db = await initDB();
    await db.put('sessions', sessions, storageKey);
    console.log('[dbAPI.saveSessions] 保存完成');
  },

  // Settings (AI Config)
  getAIConfig: async (): Promise<AIConfig | undefined> => {
    const db = await initDB();
    return await db.get('settings', 'global');
  },

  saveAIConfig: async (config: AIConfig) => {
    const db = await initDB();
    await db.put('settings', config, 'global');
  },

  // UI State (Active project/session)
  getCurrentProjectId: async (): Promise<string | null> => {
    try {
      const db = await initDB();
      return await db.get('settings', 'currentProjectId') || null;
    } catch (error) {
      console.error('读取当前项目ID失败:', error);
      return null;
    }
  },

  saveCurrentProjectId: async (projectId: string | null) => {
    try {
      const db = await initDB();
      if (projectId) {
        await db.put('settings', projectId, 'currentProjectId');
      } else {
        await db.delete('settings', 'currentProjectId');
      }
    } catch (error) {
      console.error('保存当前项目ID失败:', error);
    }
  },

  getCurrentSessionId: async (projectId: string): Promise<string | null> => {
    try {
      const db = await initDB();
      return await db.get('settings', `currentSessionId-${projectId}`) || null;
    } catch (error) {
      console.error('读取当前会话ID失败:', error);
      return null;
    }
  },

  saveCurrentSessionId: async (projectId: string, sessionId: string | null) => {
    try {
      const db = await initDB();
      if (sessionId) {
        await db.put('settings', sessionId, `currentSessionId-${projectId}`);
      } else {
        await db.delete('settings', `currentSessionId-${projectId}`);
      }
    } catch (error) {
      console.error('保存当前会话ID失败:', error);
    }
  },

  // --- Diff Sessions ---
  getDiffSession: async (fileId: string): Promise<DiffSessionState | undefined> => {
    try {
      const db = await initDB();
      return await db.get('diffSessions', `current_${fileId}`);
    } catch (error) {
      console.error('读取 diff session 失败:', fileId, error);
      return undefined;
    }
  },

  saveDiffSession: async (fileId: string, session: DiffSessionState | null) => {
    try {
      const db = await initDB();
      if (session) {
        await db.put('diffSessions', session, `current_${fileId}`);
      } else {
        await db.delete('diffSessions', `current_${fileId}`);
      }
    } catch (error) {
      console.error('保存 diff session 失败:', fileId, error);
    }
  },

  deleteFileDiffSessions: async (projectId: string) => {
    // Clean up diff sessions when project is deleted
    try {
      const db = await initDB();
      const tx = db.transaction(['files', 'diffSessions'], 'readwrite');
      const fileStore = tx.objectStore('files');
      const diffStore = tx.objectStore('diffSessions');

      // FIX: Bug #6 - Get all files for this project
      const projectFiles = await fileStore.get(projectId);

      if (!projectFiles) {
        // Project has no files, no diff sessions to delete
        await tx.done;
        return;
      }

      // Collect all file IDs in this project
      const collectFileIds = (nodes: any[]): string[] => {
        const ids: string[] = [];
        nodes.forEach(node => {
          if (node.id) ids.push(node.id);
          if (node.children) {
            ids.push(...collectFileIds(node.children));
          }
        });
        return ids;
      };

      const fileIds = collectFileIds(projectFiles);

      // Delete diff sessions only for files in this project
      let deletedCount = 0;
      for (const fileId of fileIds) {
        const diffKey = `current_${fileId}`;
        await diffStore.delete(diffKey);
        deletedCount++;
      }

      console.log(`[Persistence] Deleted ${deletedCount} diff sessions for project: ${projectId}`);
      await tx.done;
    } catch (error) {
      console.error('删除 diff sessions 失败:', error);
    }
  },

  // NEW: Delete single diff session (useful for cleanup)
  deleteOneDiffSession: async (fileId: string) => {
    try {
      const db = await initDB();
      await db.delete('diffSessions', `current_${fileId}`);
      console.log('[Persistence] Deleted diff session for file:', fileId);
    } catch (error) {
      console.error('删除 diff session 失败:', fileId, error);
    }
  },

  // --- UI Settings ---
  getUiSettings: async (): Promise<UiSettings | undefined> => {
    try {
      const db = await initDB();
      return await db.get('uiSettings', 'global');
    } catch (error) {
      console.error('读取 UI 设置失败:', error);
      return undefined;
    }
  },

  saveUiSettings: async (settings: UiSettings) => {
    try {
      const db = await initDB();
      await db.put('uiSettings', settings, 'global');
    } catch (error) {
      console.error('保存 UI 设置失败:', error);
    }
  },

  deleteUiSettings: async () => {
    try {
      const db = await initDB();
      await db.delete('uiSettings', 'global');
    } catch (error) {
      console.error('删除 UI 设置失败:', error);
    }
  }
};
