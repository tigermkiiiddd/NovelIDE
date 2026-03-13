import { create } from 'zustand';
import { LongTermMemory, MemoryType } from '../types';
import { createPersistingStore } from './createPersistingStore';
import { dbAPI } from '../services/persistence';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';

interface LongTermMemoryState {
  memories: LongTermMemory[];
  isLoading: boolean;
  isInitialized: boolean; // 标记是否已加载过
  isRefreshing: boolean; // 刷新中

  // Actions
  loadMemories: () => Promise<void>;
  loadProjectMemories: (projectId: string) => Promise<void>; // 项目加载时加载
  ensureInitialized: () => Promise<void>; // 确保已初始化
  refreshMemories: () => Promise<void>; // 刷新记忆
  setMemories: (memories: LongTermMemory[]) => void;
  addMemory: (memory: Omit<LongTermMemory, 'id' | 'metadata'>) => void;
  updateMemory: (id: string, updates: Partial<LongTermMemory>) => void;
  deleteMemory: (id: string) => void;

  // Query methods
  getById: (id: string) => LongTermMemory | undefined;
  getByType: (type: MemoryType) => LongTermMemory[];
  getByTag: (tag: string) => LongTermMemory[];
  searchByKeyword: (keyword: string) => LongTermMemory[];
  getByImportance: (importance: 'critical' | 'important') => LongTermMemory[];
  getRelated: (id: string) => LongTermMemory[];

  // 内部方法：同步到 JSON 文件
  _syncToJsonFile: () => Promise<void>;
}

const generateId = () => `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useLongTermMemoryStore = createPersistingStore<LongTermMemoryState>(
  'longTermMemoryStore',
  {
    memories: [],
    isLoading: false,
    isInitialized: false,
    isRefreshing: false,

    // 项目加载时加载记忆（供 MainLayout 调用）
    loadProjectMemories: async (projectId: string) => {
      console.log('[LongTermMemoryStore] loadProjectMemories 被调用, projectId:', projectId);
      await useLongTermMemoryStore.getState().loadMemories();
    },

    // 确保已初始化（如果未初始化则自动加载）
    ensureInitialized: async () => {
      const state = useLongTermMemoryStore.getState();
      if (!state.isInitialized) {
        await state.loadMemories();
      }
    },

    // 刷新记忆（重新从文件加载）
    refreshMemories: async () => {
      const state = useLongTermMemoryStore.getState();
      if (state.isRefreshing) return;

      state.setState({ isRefreshing: true });
      try {
        await state.loadMemories();
      } finally {
        state.setState({ isRefreshing: false });
      }
    },

    loadMemories: async () => {
      try {
        console.log('[LongTermMemoryStore] 开始加载记忆');

        const fileStore = useFileStore.getState();
        const memoryFile = fileStore.files.find(f => f.name === '长期记忆.json');

        if (memoryFile && memoryFile.content) {
          try {
            const memories = JSON.parse(memoryFile.content);
            if (Array.isArray(memories)) {
              useLongTermMemoryStore.setState({ memories, isInitialized: true });
              console.log('[LongTermMemoryStore] 从 JSON 文件加载完成, 记忆数量:', memories.length);
              return;
            }
          } catch (parseError) {
            console.error('[LongTermMemoryStore] JSON 解析失败:', parseError);
          }
        }

        console.log('[LongTermMemoryStore] 没有找到长期记忆数据，初始化空列表');
        useLongTermMemoryStore.setState({ memories: [], isInitialized: true });
      } catch (error) {
        console.error('[LongTermMemoryStore] 加载失败:', error);
        useLongTermMemoryStore.setState({ memories: [], isInitialized: true });
      }
    },

    setMemories: (memories) => {
      useLongTermMemoryStore.setState({ memories });
    },

    // 内部方法：同步到 JSON 文件
    _syncToJsonFile: async () => {
      console.log('[LongTermMemoryStore] _syncToJsonFile 开始');

      const state = useLongTermMemoryStore.getState();
      const fileStore = useFileStore.getState();
      const jsonContent = JSON.stringify(state.memories, null, 2);

      // 查找或创建长期记忆文件
      let memoryFile = fileStore.files.find(f => f.name === '长期记忆.json');

      if (memoryFile) {
        // 更新现有文件内容
        memoryFile.content = jsonContent;
        memoryFile.lastModified = Date.now();
        console.log('[LongTermMemoryStore] 更新现有文件');
      } else {
        // 创建新文件
        const infoFolder = fileStore.files.find(f => f.name === '00_基础信息' && f.parentId === 'root');
        if (infoFolder) {
          memoryFile = {
            id: `memory-file-${Date.now()}`,
            parentId: infoFolder.id,
            name: '长期记忆.json',
            type: 'FILE' as const,
            content: jsonContent,
            lastModified: Date.now()
          };
          fileStore.files.push(memoryFile);
          console.log('[LongTermMemoryStore] 创建新文件');
        } else {
          console.error('[LongTermMemoryStore] 未找到 00_基础信息 文件夹');
        }
      }

      // 立即保存到数据库
      const projectStore = useProjectStore.getState();
      const projectId = projectStore.currentProjectId;

      if (projectId) {
        try {
          await dbAPI.saveFiles(projectId, [...fileStore.files]);
          console.log('[LongTermMemoryStore] ✅ 保存成功');
        } catch (err) {
          console.error('[LongTermMemoryStore] ❌ 保存失败:', err);
        }
      }
    },

    addMemory: (memory) => {
      console.log('[LongTermMemoryStore] addMemory 被调用', memory);
      const state = useLongTermMemoryStore.getState();
      const newMemory: LongTermMemory = {
        ...memory,
        id: generateId(),
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: memory.metadata?.source || 'agent'
        }
      };
      const newMemories = [...state.memories, newMemory];
      useLongTermMemoryStore.setState({ memories: newMemories });
      console.log('[LongTermMemoryStore] 新状态:', newMemories.length);
      // 立即同步到 JSON 文件
      useLongTermMemoryStore.getState()._syncToJsonFile();
    },

    updateMemory: (id, updates) => {
      console.log('[LongTermMemoryStore] updateMemory 被调用', id, updates);
      const state = useLongTermMemoryStore.getState();
      const newMemories = state.memories.map((m) =>
        m.id === id
          ? { ...m, ...updates, metadata: { ...m.metadata, updatedAt: Date.now() } }
          : m
      );
      useLongTermMemoryStore.setState({ memories: newMemories });
      // 立即同步到 JSON 文件
      useLongTermMemoryStore.getState()._syncToJsonFile();
    },

    deleteMemory: (id) => {
      console.log('[LongTermMemoryStore] deleteMemory 被调用', id);
      const state = useLongTermMemoryStore.getState();
      const newMemories = state.memories.filter((m) => m.id !== id);
      useLongTermMemoryStore.setState({ memories: newMemories });
      // 立即同步到 JSON 文件
      useLongTermMemoryStore.getState()._syncToJsonFile();
    },

    getById: (id) => {
      const state = useLongTermMemoryStore.getState();
      return state.memories.find((m) => m.id === id);
    },

    getByType: (type) => {
      const state = useLongTermMemoryStore.getState();
      return state.memories.filter((m) => m.type === type);
    },

    getByTag: (tag) => {
      const state = useLongTermMemoryStore.getState();
      return state.memories.filter((m) => m.tags.includes(tag));
    },

    searchByKeyword: (keyword) => {
      const state = useLongTermMemoryStore.getState();
      const lowerKeyword = keyword.toLowerCase();
      return state.memories.filter((m) =>
        m.keywords.some(k => k.toLowerCase().includes(lowerKeyword)) ||
        m.name.toLowerCase().includes(lowerKeyword) ||
        m.summary.toLowerCase().includes(lowerKeyword) ||
        m.content.toLowerCase().includes(lowerKeyword)
      );
    },

    getByImportance: (importance) => {
      const state = useLongTermMemoryStore.getState();
      return state.memories.filter((m) => m.importance === importance);
    },

    getRelated: (id) => {
      const state = useLongTermMemoryStore.getState();
      const memory = state.memories.find((m) => m.id === id);
      if (!memory) return [];

      const relatedIds = new Set(memory.relatedMemories);
      return state.memories.filter((m) => relatedIds.has(m.id));
    }
  },
  async (state) => {
    // 保存到 JSON 文件
    const fileStore = useFileStore.getState();
    let memoryFile = fileStore.files.find(f => f.name === '长期记忆.json');

    if (!memoryFile) {
      // 需要先找到 00_基础信息 文件夹
      const infoFolder = fileStore.files.find(f => f.name === '00_基础信息' && f.parentId === 'root');
      if (infoFolder) {
        memoryFile = {
          id: `memory-file-${Date.now()}`,
          parentId: infoFolder.id,
          name: '长期记忆.json',
          type: 'FILE' as const,
          content: JSON.stringify(state.memories, null, 2),
          lastModified: Date.now()
        };
        fileStore.files.push(memoryFile);
      }
    } else {
      memoryFile.content = JSON.stringify(state.memories, null, 2);
      memoryFile.lastModified = Date.now();
    }

    const projectStore = useProjectStore.getState();
    const projectId = projectStore.project?.id;
    if (projectId) {
      await dbAPI.saveFiles(projectId, [...fileStore.files]);
      console.log('[LongTermMemoryStore] 已保存到 JSON 文件');
    }
  },
  0  // 立即保存，不延迟
);
