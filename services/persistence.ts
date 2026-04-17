
import { openDB, DBSchema, IDBPDatabase, IDBPObjectStore } from 'idb';
import { ProjectMeta, FileNode, ChatSession, AIConfig, DiffSessionState, PlanNote, PendingChange, ChapterAnalysis, LongTermMemory, MemoryEdge, CharacterProfileV2, FileType, KnowledgeNode, CharacterProfileVersion, ChapterAnalysisVersion } from '../types';
import { FileVersion } from '../stores/versionStore';

interface UiSettings {
  isSidebarOpen: boolean;
  isChatOpen: boolean;
  sidebarWidth: number;
  agentWidth: number;
  isSplitView: boolean;
  showLineNumbers: boolean;
  wordWrap: boolean;
  isDebugMode: boolean;
  hasSeenTutorial: boolean;
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
    value: any; // Can be AIConfig, projectId string, sessionId string, or KnowledgeNode[] for global preferences
  };
  diffSessions: {
    key: string; // 'current-{fileId}'
    value: DiffSessionState;
  };
  uiSettings: {
    key: string; // 'global'
    value: UiSettings;
  };
  planNotes: {
    key: string; // storageKey (e.g. novel-plan-notes-{projectId})
    value: PlanNote[];
  };
  pendingChanges: {
    key: string; // 'session-pending-{sessionId}'
    value: PendingChange[];
  };
  chapterAnalyses: {
    key: string; // 'chapter-analyses-{projectId}'
    value: ChapterAnalysis[];
  };
  versions: {
    key: string; // 'versions-{projectId}'
    value: FileVersion[];
  };
  backups: {
    key: string; // '{type}-{projectId}' e.g. 'files-{projectId}', 'sessions-{projectId}'
    value: {
      timestamp: number;
      content: string;
    };
  };
  // 新增：长期记忆专用表
  longTermMemories: {
    key: string; // memory.id
    value: LongTermMemory & { projectId: string };
    indexes: { 'by-project': string };
  };
  memoryEdges: {
    key: string; // edge.id
    value: MemoryEdge & { projectId: string };
    indexes: { 'by-project': string };
  };
  // 新增：角色档案专用表
  characterProfiles: {
    key: string; // profile.characterId
    value: CharacterProfileV2 & { projectId: string };
    indexes: { 'by-project': string };
  };
  // 项目元数据（用于标记迁移状态等）
  projectMeta: {
    key: string; // '{projectId}-{key}'
    value: any;
  };
  // 新增：角色档案版本历史
  characterProfileVersions: {
    key: string; // version.id
    value: CharacterProfileVersion & { projectId: string };
    indexes: { 'by-project': string; 'by-entity': string };
  };
  // 新增：章节分析版本历史
  chapterAnalysisVersions: {
    key: string; // version.id
    value: ChapterAnalysisVersion & { projectId: string };
    indexes: { 'by-project': string; 'by-entity': string };
  };
  // 技能触发状态
  skillTrigger: {
    key: string; // 'skill-trigger-{projectId}'
    value: { records: any[]; currentRound: number };
  };
  // 自进化记忆（跨项目持久）
  agentMemories: {
    key: string;
    value: {
      id: string;
      type: 'insight' | 'pattern' | 'correction' | 'workflow' | 'preference';
      content: string;
      context: string;
      relatedSkills?: string[];
      projectGenre?: string;
      importance: 'critical' | 'high' | 'medium' | 'low';
      createdAt: number;
      accessedAt: number;
      accessCount: number;
    };
    indexes: { 'by-type': string; 'by-importance': string };
  };
  agentSessionSummaries: {
    key: string;
    value: {
      sessionId: string;
      projectId: string;
      summary: string;
      keyDecisions: string[];
      unresolvedTopics: string[];
      timestamp: number;
    };
  };
}

const DB_NAME = 'novel-genie-db';
const DB_VERSION = 15;

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

        // Version 5: Add planNotes store
        if (!db.objectStoreNames.contains('planNotes')) {
          db.createObjectStore('planNotes');
        }

        // Version 6: Add pendingChanges store
        if (!db.objectStoreNames.contains('pendingChanges')) {
          db.createObjectStore('pendingChanges');
        }

        // Version 9: Add chapterAnalyses store
        if (!db.objectStoreNames.contains('chapterAnalyses')) {
          db.createObjectStore('chapterAnalyses');
        }

        // Version 10: Add versions store for document version management
        if (!db.objectStoreNames.contains('versions')) {
          db.createObjectStore('versions');
        }

        // Version 11: Add backups store for data safety
        if (!db.objectStoreNames.contains('backups')) {
          db.createObjectStore('backups');
        }

        // Version 12: Add dedicated tables for memories and profiles
        if (!db.objectStoreNames.contains('longTermMemories')) {
          const store = db.createObjectStore('longTermMemories', { keyPath: 'id' });
          store.createIndex('by-project', 'projectId');
        }
        if (!db.objectStoreNames.contains('memoryEdges')) {
          const store = db.createObjectStore('memoryEdges', { keyPath: 'id' });
          store.createIndex('by-project', 'projectId');
        }
        if (!db.objectStoreNames.contains('characterProfiles')) {
          const store = db.createObjectStore('characterProfiles', { keyPath: 'characterId' });
          store.createIndex('by-project', 'projectId');
        }
        if (!db.objectStoreNames.contains('projectMeta')) {
          db.createObjectStore('projectMeta');
        }

        // Version 13: Add entity version history tables
        if (!db.objectStoreNames.contains('characterProfileVersions')) {
          const store = db.createObjectStore('characterProfileVersions', { keyPath: 'id' });
          store.createIndex('by-project', 'projectId');
          store.createIndex('by-entity', 'entityId');
        }
        if (!db.objectStoreNames.contains('chapterAnalysisVersions')) {
          const store = db.createObjectStore('chapterAnalysisVersions', { keyPath: 'id' });
          store.createIndex('by-project', 'projectId');
          store.createIndex('by-entity', 'entityId');
        }

        // Version 7 & 8: Schema changes applied externally (version bump to match browser DB).
        // No new object stores required for these versions.

        // Version 14: Add skillTrigger store
        if (!db.objectStoreNames.contains('skillTrigger')) {
          db.createObjectStore('skillTrigger');
        }
// Version 15: Add agentMemories + agentSessionSummaries for self-evolution
        if (!db.objectStoreNames.contains('agentMemories')) {
          const store = db.createObjectStore('agentMemories', { keyPath: 'id' });
          store.createIndex('by-type', 'type');
          store.createIndex('by-importance', 'importance');
        }
        if (!db.objectStoreNames.contains('agentSessionSummaries')) {
          db.createObjectStore('agentSessionSummaries', { keyPath: 'sessionId' });
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

  /**
   * 删除项目及其所有关联数据（完整级联删除）
   * @param projectId 项目 ID
   */
  deleteProjectCascade: async (projectId: string) => {
    const db = await initDB();
    const tx = db.transaction([
      'projects',
      'files',
      'sessions',
      'characterProfiles',
      'longTermMemories',
      'memoryEdges',
      'chapterAnalyses',
      'versions',
      'planNotes',
      'pendingChanges',
      'diffSessions',
      'characterProfileVersions',
      'chapterAnalysisVersions',
    ], 'readwrite');

    // 删除主表
    await tx.objectStore('projects').delete(projectId);
    await tx.objectStore('files').delete(projectId);
    await tx.objectStore('sessions').delete(`novel-chat-sessions-${projectId}`);

    // 级联删除关联表
    await clearByProjectIndex(tx.objectStore('characterProfiles'), projectId);
    await clearByProjectIndex(tx.objectStore('longTermMemories'), projectId);
    await clearByProjectIndex(tx.objectStore('memoryEdges'), projectId);
    await clearByProjectIndex(tx.objectStore('characterProfileVersions'), projectId);
    await clearByProjectIndex(tx.objectStore('chapterAnalysisVersions'), projectId);
    await tx.objectStore('chapterAnalyses').delete(`chapter-analyses-${projectId}`);
    await tx.objectStore('versions').delete(`versions-${projectId}`);
    await tx.objectStore('planNotes').delete(`novel-plan-notes-${projectId}`);

    await tx.done;
    console.log(`[dbAPI] 级联删除项目完成: ${projectId}`);
  },

  // Files (Stored as whole tree array for simplicity, matching current logic)
  getFiles: async (projectId: string): Promise<FileNode[] | undefined> => {
    const db = await initDB();
    return await db.get('files', projectId);
  },

  saveFiles: async (projectId: string, files: FileNode[]) => {
    const db = await initDB();
    // 写入前备份现有数据
    try {
      const existing = await db.get('files', projectId);
      if (existing) {
        await db.put('backups', {
          timestamp: Date.now(),
          content: JSON.stringify(existing)
        }, `files-${projectId}`);
        console.log(`[dbAPI.saveFiles] 已备份旧数据: files-${projectId}`);
      }
    } catch (backupError) {
      console.warn('[dbAPI.saveFiles] 备份失败，继续保存:', backupError);
    }
    // 保存新数据
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
  },

  // --- Plan Notes ---
  getPlanNotes: async (storageKey: string): Promise<PlanNote[] | undefined> => {
    try {
      console.log('[dbAPI.getPlanNotes] 开始读取, storageKey:', storageKey);
      const db = await initDB();
      const result = await db.get('planNotes', storageKey);
      console.log('[dbAPI.getPlanNotes] 读取结果:', result ? `找到 ${result.length} 个笔记` : '无数据');
      return result;
    } catch (error) {
      console.error('[dbAPI.getPlanNotes] 读取 Plan 笔记失败:', storageKey, error);
      return undefined;
    }
  },

  savePlanNotes: async (storageKey: string, planNotes: PlanNote[]) => {
    console.log('[dbAPI.savePlanNotes] 开始保存, storageKey:', storageKey, '笔记数量:', planNotes.length);
    const db = await initDB();
    await db.put('planNotes', planNotes, storageKey);
    console.log('[dbAPI.savePlanNotes] 保存完成');
  },

  deletePlanNotes: async (projectId: string) => {
    try {
      const db = await initDB();
      await db.delete('planNotes', `novel-plan-notes-${projectId}`);
      console.log('[Persistence] Deleted plan notes for project:', projectId);
    } catch (error) {
      console.error('删除 Plan 笔记失败:', error);
    }
  },

  // --- Pending Changes ---
  getPendingChanges: async (sessionId: string): Promise<PendingChange[] | undefined> => {
    try {
      console.log('[dbAPI.getPendingChanges] 开始读取, sessionId:', sessionId);
      const db = await initDB();
      const result = await db.get('pendingChanges', `session-pending-${sessionId}`);
      console.log('[dbAPI.getPendingChanges] 读取结果:', result ? `找到 ${result.length} 个待审变更` : '无数据');
      return result;
    } catch (error) {
      console.error('[dbAPI.getPendingChanges] 读取待审变更失败:', sessionId, error);
      return undefined;
    }
  },

  savePendingChanges: async (sessionId: string, changes: PendingChange[]) => {
    console.log('[dbAPI.savePendingChanges] 开始保存, sessionId:', sessionId, '变更数量:', changes.length);
    const db = await initDB();
    if (changes.length > 0) {
      await db.put('pendingChanges', changes, `session-pending-${sessionId}`);
    } else {
      await db.delete('pendingChanges', `session-pending-${sessionId}`);
    }
    console.log('[dbAPI.savePendingChanges] 保存完成');
  },

  deletePendingChanges: async (sessionId: string) => {
    try {
      const db = await initDB();
      await db.delete('pendingChanges', `session-pending-${sessionId}`);
      console.log('[Persistence] Deleted pending changes for session:', sessionId);
    } catch (error) {
      console.error('删除待审变更失败:', error);
    }
  },

  // --- Chapter Analyses ---
  getChapterAnalyses: async (projectId: string): Promise<ChapterAnalysis[] | undefined> => {
    try {
      console.log('[dbAPI.getChapterAnalyses] 开始读取, projectId:', projectId);
      const db = await initDB();
      const result = await db.get('chapterAnalyses', `chapter-analyses-${projectId}`);
      console.log('[dbAPI.getChapterAnalyses] 读取结果:', result ? `找到 ${result.length} 个章节分析` : '无数据');
      return result;
    } catch (error) {
      console.error('[dbAPI.getChapterAnalyses] 读取章节分析失败:', projectId, error);
      return undefined;
    }
  },

  saveChapterAnalyses: async (projectId: string, analyses: ChapterAnalysis[]) => {
    console.log('[dbAPI.saveChapterAnalyses] 开始保存, projectId:', projectId, '分析数量:', analyses.length);
    const db = await initDB();
    await db.put('chapterAnalyses', analyses, `chapter-analyses-${projectId}`);
    console.log('[dbAPI.saveChapterAnalyses] 保存完成');
  },

  deleteChapterAnalyses: async (projectId: string) => {
    try {
      const db = await initDB();
      await db.delete('chapterAnalyses', `chapter-analyses-${projectId}`);
      console.log('[Persistence] Deleted chapter analyses for project:', projectId);
    } catch (error) {
      console.error('删除章节分析失败:', error);
    }
  },

  // --- File Versions ---
  getVersions: async (projectId: string): Promise<FileVersion[] | undefined> => {
    try {
      console.log('[dbAPI.getVersions] 开始读取, projectId:', projectId);
      const db = await initDB();

      // 检查 versions 表是否存在，如果不存在则返回空数组
      if (!db.objectStoreNames.contains('versions')) {
        console.warn('[dbAPI.getVersions] versions 表不存在，返回空数组');
        return [];
      }

      const result = await db.get('versions', `versions-${projectId}`);
      console.log('[dbAPI.getVersions] 读取结果:', result ? `找到 ${result.length} 个版本` : '无数据');
      return result;
    } catch (error) {
      console.error('[dbAPI.getVersions] 读取版本失败:', projectId, error);
      return undefined;
    }
  },

  saveVersions: async (projectId: string, versions: FileVersion[]) => {
    console.log('[dbAPI.saveVersions] 开始保存, projectId:', projectId, '版本数量:', versions.length);
    const db = await initDB();

    // 检查 versions 表是否存在，如果不存在则跳过保存
    if (!db.objectStoreNames.contains('versions')) {
      console.warn('[dbAPI.saveVersions] versions 表不存在，跳过保存');
      return;
    }

    await db.put('versions', versions, `versions-${projectId}`);
    console.log('[dbAPI.saveVersions] 保存完成');
  },

  deleteVersions: async (projectId: string) => {
    try {
      const db = await initDB();

      // 检查 versions 表是否存在
      if (!db.objectStoreNames.contains('versions')) {
        console.warn('[dbAPI.deleteVersions] versions 表不存在，跳过删除');
        return;
      }

      await db.delete('versions', `versions-${projectId}`);
      console.log('[Persistence] Deleted versions for project:', projectId);
    } catch (error) {
      console.error('删除版本失败:', error);
    }
  },

  // --- Backups (for data safety) ---
  getBackup: async (key: string): Promise<{ timestamp: number; content: string } | undefined> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('backups')) {
        console.warn('[dbAPI.getBackup] backups 表不存在');
        return undefined;
      }
      return await db.get('backups', key);
    } catch (error) {
      console.error('[dbAPI.getBackup] 读取备份失败:', key, error);
      return undefined;
    }
  },

  saveBackup: async (key: string, content: string) => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('backups')) {
        console.warn('[dbAPI.saveBackup] backups 表不存在，跳过保存');
        return;
      }
      await db.put('backups', { timestamp: Date.now(), content }, key);
      console.log('[dbAPI.saveBackup] 备份已保存:', key);
    } catch (error) {
      console.error('[dbAPI.saveBackup] 保存备份失败:', key, error);
    }
  },

  listBackups: async (prefix?: string): Promise<string[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('backups')) {
        return [];
      }
      const allKeys = await db.getAllKeys('backups');
      if (prefix) {
        return allKeys.filter(k => k.startsWith(prefix));
      }
      return allKeys;
    } catch (error) {
      console.error('[dbAPI.listBackups] 列出备份失败:', error);
      return [];
    }
  },

  // ============================================
  // 长期记忆专用表 API
  // ============================================

  getLongTermMemories: async (projectId: string): Promise<LongTermMemory[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('longTermMemories')) {
        return [];
      }
      const all = await db.getAllFromIndex('longTermMemories', 'by-project', projectId);
      return all.map(({ projectId: _, ...memory }) => memory as LongTermMemory);
    } catch (error) {
      console.error('[dbAPI.getLongTermMemories] 读取失败:', error);
      return [];
    }
  },

  saveLongTermMemory: async (memory: LongTermMemory, projectId: string) => {
    try {
      const db = await initDB();
      await db.put('longTermMemories', { ...memory, projectId });
    } catch (error) {
      console.error('[dbAPI.saveLongTermMemory] 保存失败:', error);
    }
  },

  deleteLongTermMemory: async (memoryId: string) => {
    try {
      const db = await initDB();
      await db.delete('longTermMemories', memoryId);
    } catch (error) {
      console.error('[dbAPI.deleteLongTermMemory] 删除失败:', error);
    }
  },

  getMemoryEdges: async (projectId: string): Promise<MemoryEdge[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('memoryEdges')) {
        return [];
      }
      const all = await db.getAllFromIndex('memoryEdges', 'by-project', projectId);
      return all.map(({ projectId: _, ...edge }) => edge as MemoryEdge);
    } catch (error) {
      console.error('[dbAPI.getMemoryEdges] 读取失败:', error);
      return [];
    }
  },

  saveMemoryEdge: async (edge: MemoryEdge, projectId: string) => {
    try {
      const db = await initDB();
      await db.put('memoryEdges', { ...edge, projectId });
    } catch (error) {
      console.error('[dbAPI.saveMemoryEdge] 保存失败:', error);
    }
  },

  deleteMemoryEdge: async (edgeId: string) => {
    try {
      const db = await initDB();
      await db.delete('memoryEdges', edgeId);
    } catch (error) {
      console.error('[dbAPI.deleteMemoryEdge] 删除失败:', error);
    }
  },

  // ============================================
  // 角色档案专用表 API
  // ============================================

  getCharacterProfiles: async (projectId: string): Promise<CharacterProfileV2[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('characterProfiles')) {
        return [];
      }
      const all = await db.getAllFromIndex('characterProfiles', 'by-project', projectId);
      return all.map(({ projectId: _, ...profile }) => profile as CharacterProfileV2);
    } catch (error) {
      console.error('[dbAPI.getCharacterProfiles] 读取失败:', error);
      return [];
    }
  },

  saveCharacterProfile: async (profile: CharacterProfileV2, projectId: string) => {
    try {
      const db = await initDB();
      await db.put('characterProfiles', { ...profile, projectId });
    } catch (error) {
      console.error('[dbAPI.saveCharacterProfile] 保存失败:', error);
    }
  },

  deleteCharacterProfile: async (characterId: string) => {
    try {
      const db = await initDB();
      await db.delete('characterProfiles', characterId);
    } catch (error) {
      console.error('[dbAPI.deleteCharacterProfile] 删除失败:', error);
    }
  },

  // ============================================
  // 角色档案版本历史 API
  // ============================================

  getCharacterProfileVersions: async (projectId: string): Promise<CharacterProfileVersion[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('characterProfileVersions')) {
        return [];
      }
      const all = await db.getAllFromIndex('characterProfileVersions', 'by-project', projectId);
      // 移除 projectId 字段
      return all.map(({ projectId: _, ...version }) => version as CharacterProfileVersion);
    } catch (error) {
      console.error('[dbAPI.getCharacterProfileVersions] 读取失败:', error);
      return [];
    }
  },

  getCharacterProfileVersionsByEntity: async (characterId: string): Promise<CharacterProfileVersion[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('characterProfileVersions')) {
        return [];
      }
      const all = await db.getAllFromIndex('characterProfileVersions', 'by-entity', characterId);
      return all.map(({ projectId: _, ...version }) => version as CharacterProfileVersion);
    } catch (error) {
      console.error('[dbAPI.getCharacterProfileVersionsByEntity] 读取失败:', error);
      return [];
    }
  },

  saveCharacterProfileVersion: async (version: CharacterProfileVersion, projectId: string) => {
    try {
      const db = await initDB();
      await db.put('characterProfileVersions', { ...version, projectId, entityId: version.entityId });
    } catch (error) {
      console.error('[dbAPI.saveCharacterProfileVersion] 保存失败:', error);
    }
  },

  deleteCharacterProfileVersion: async (versionId: string) => {
    try {
      const db = await initDB();
      await db.delete('characterProfileVersions', versionId);
    } catch (error) {
      console.error('[dbAPI.deleteCharacterProfileVersion] 删除失败:', error);
    }
  },

  clearCharacterProfileVersions: async (characterId: string) => {
    try {
      const db = await initDB();
      const tx = db.transaction('characterProfileVersions', 'readwrite');
      const index = tx.store.index('by-entity');
      const all = await index.getAll(characterId);
      for (const item of all) {
        await tx.store.delete(item.id);
      }
      await tx.done;
    } catch (error) {
      console.error('[dbAPI.clearCharacterProfileVersions] 清理失败:', error);
    }
  },

  // ============================================
  // 章节分析版本历史 API
  // ============================================

  getChapterAnalysisVersions: async (projectId: string): Promise<ChapterAnalysisVersion[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('chapterAnalysisVersions')) {
        return [];
      }
      const all = await db.getAllFromIndex('chapterAnalysisVersions', 'by-project', projectId);
      return all.map(({ projectId: _, ...version }) => version as ChapterAnalysisVersion);
    } catch (error) {
      console.error('[dbAPI.getChapterAnalysisVersions] 读取失败:', error);
      return [];
    }
  },

  getChapterAnalysisVersionsByEntity: async (analysisId: string): Promise<ChapterAnalysisVersion[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('chapterAnalysisVersions')) {
        return [];
      }
      const all = await db.getAllFromIndex('chapterAnalysisVersions', 'by-entity', analysisId);
      return all.map(({ projectId: _, ...version }) => version as ChapterAnalysisVersion);
    } catch (error) {
      console.error('[dbAPI.getChapterAnalysisVersionsByEntity] 读取失败:', error);
      return [];
    }
  },

  saveChapterAnalysisVersion: async (version: ChapterAnalysisVersion, projectId: string) => {
    try {
      const db = await initDB();
      await db.put('chapterAnalysisVersions', { ...version, projectId, entityId: version.entityId });
    } catch (error) {
      console.error('[dbAPI.saveChapterAnalysisVersion] 保存失败:', error);
    }
  },

  deleteChapterAnalysisVersion: async (versionId: string) => {
    try {
      const db = await initDB();
      await db.delete('chapterAnalysisVersions', versionId);
    } catch (error) {
      console.error('[dbAPI.deleteChapterAnalysisVersion] 删除失败:', error);
    }
  },

  clearChapterAnalysisVersions: async (analysisId: string) => {
    try {
      const db = await initDB();
      const tx = db.transaction('chapterAnalysisVersions', 'readwrite');
      const index = tx.store.index('by-entity');
      const all = await index.getAll(analysisId);
      for (const item of all) {
        await tx.store.delete(item.id);
      }
      await tx.done;
    } catch (error) {
      console.error('[dbAPI.clearChapterAnalysisVersions] 清理失败:', error);
    }
  },

  // ============================================
  // 项目元数据 API
  // ============================================

  getProjectMeta: async (projectId: string, key: string): Promise<any> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('projectMeta')) {
        return undefined;
      }
      return await db.get('projectMeta', `${projectId}-${key}`);
    } catch (error) {
      console.error('[dbAPI.getProjectMeta] 读取失败:', error);
      return undefined;
    }
  },

  setProjectMeta: async (projectId: string, key: string, value: any) => {
    try {
      const db = await initDB();
      await db.put('projectMeta', value, `${projectId}-${key}`);
    } catch (error) {
      console.error('[dbAPI.setProjectMeta] 保存失败:', error);
    }
  },

  // ============================================
  // 全局用户偏好 API（跨项目通用）
  // ============================================

  getGlobalUserPreferences: async (): Promise<KnowledgeNode[]> => {
    try {
      const db = await initDB();
      if (!db.objectStoreNames.contains('settings')) {
        return [];
      }
      const data = await db.get('settings', 'global-user-preferences');
      return data || [];
    } catch (error) {
      console.error('[dbAPI.getGlobalUserPreferences] 读取失败:', error);
      return [];
    }
  },

  saveGlobalUserPreferences: async (nodes: KnowledgeNode[]) => {
    try {
      const db = await initDB();
      await db.put('settings', nodes, 'global-user-preferences');
      console.log(`[dbAPI.saveGlobalUserPreferences] 已保存 ${nodes.length} 个用户偏好节点到全局存储`);
    } catch (error) {
      console.error('[dbAPI.saveGlobalUserPreferences] 保存失败:', error);
    }
  },

  // ============================================
  // 迁移函数：从 JSON 文件迁移到专用表
  // ============================================

  migrateMemoriesFromFiles: async (projectId: string): Promise<{ memories: number; profiles: number }> => {
    console.log('[dbAPI.migrateMemoriesFromFiles] 开始迁移, projectId:', projectId);
    const result = { memories: 0, profiles: 0 };

    try {
      const db = await initDB();

      // 检查是否已迁移
      const migrated = await dbAPI.getProjectMeta(projectId, 'memoriesMigrated');
      if (migrated) {
        console.log('[dbAPI.migrateMemoriesFromFiles] 已迁移，跳过');
        return result;
      }

      // 1. 读取 files 表中的 JSON
      const files = await db.get('files', projectId);
      if (!files) {
        console.log('[dbAPI.migrateMemoriesFromFiles] 没有文件数据');
        await dbAPI.setProjectMeta(projectId, 'memoriesMigrated', true);
        return result;
      }

      // 2. 迁移长期记忆
      const memoryFile = files.find((f: FileNode) => f.name === '长期记忆.json');
      if (memoryFile?.content) {
        try {
          const data = JSON.parse(memoryFile.content);
          const memories = Array.isArray(data) ? data : (data.memories || []);
          const edges = data.edges || [];

          for (const memory of memories) {
            if (memory.id) {
              await db.put('longTermMemories', { ...memory, projectId });
              result.memories++;
            }
          }
          for (const edge of edges) {
            if (edge.id) {
              await db.put('memoryEdges', { ...edge, projectId });
            }
          }
          console.log(`[dbAPI.migrateMemoriesFromFiles] 迁移了 ${result.memories} 条记忆`);
        } catch (e) {
          console.error('[dbAPI.migrateMemoriesFromFiles] 长期记忆解析失败:', e);
        }
      }

      // 3. 迁移角色档案
      const CHARACTER_ROOT_FOLDER = '02_角色档案';
      const PROFILE_FOLDER = '角色状态与记忆';
      const characterFolder = files.find((f: FileNode) => f.name === CHARACTER_ROOT_FOLDER && f.parentId === 'root');
      if (characterFolder) {
        const profileFolder = files.find((f: FileNode) => f.name === PROFILE_FOLDER && f.parentId === characterFolder.id);
        if (profileFolder) {
          const profileFiles = files.filter((f: FileNode) => f.parentId === profileFolder.id && f.content);
          for (const file of profileFiles) {
            try {
              const profile = JSON.parse(file.content!);
              if (profile.characterId) {
                await db.put('characterProfiles', { ...profile, projectId });
                result.profiles++;
              }
            } catch (e) {
              console.error(`[dbAPI.migrateMemoriesFromFiles] 角色档案解析失败: ${file.name}`, e);
            }
          }
          console.log(`[dbAPI.migrateMemoriesFromFiles] 迁移了 ${result.profiles} 个角色档案`);
        }
      }

      // 4. 标记已迁移
      await dbAPI.setProjectMeta(projectId, 'memoriesMigrated', true);
      console.log('[dbAPI.migrateMemoriesFromFiles] 迁移完成');

    } catch (error) {
      console.error('[dbAPI.migrateMemoriesFromFiles] 迁移失败:', error);
    }

    return result;
  },

  // --- Skill Trigger ---
  getSkillTriggerState: async (projectId: string): Promise<{ records: any[]; currentRound: number } | undefined> => {
    try {
      const db = await initDB();
      return await db.get('skillTrigger', `skill-trigger-${projectId}`);
    } catch (error) {
      console.error('[dbAPI.getSkillTriggerState] 读取失败:', projectId, error);
      return undefined;
    }
  },

  saveSkillTriggerState: async (projectId: string, state: { records: any[]; currentRound: number }) => {
    console.log('[dbAPI.saveSkillTriggerState] 保存, projectId:', projectId, '记录数:', state.records.length);
    const db = await initDB();
    await db.put('skillTrigger', state, `skill-trigger-${projectId}`);
  },
};

// ============================================
// 辅助函数
// ============================================

/**
 * 按项目索引清理数据
 */
async function clearByProjectIndex(store: any, projectId: string): Promise<void> {
  try {
    const index = store.index('by-project');
    const all = await index.getAll(projectId);
    for (const item of all) {
      const key = item.id || item.characterId;
      if (key) {
        await store.delete(key);
      }
    }
  } catch (error) {
    console.error('[clearByProjectIndex] 清理失败:', error);
  }
}
