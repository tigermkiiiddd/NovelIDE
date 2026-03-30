
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { dbAPI } from '../services/persistence';

interface UiState {
  isSidebarOpen: boolean;
  isChatOpen: boolean;
  sidebarWidth: number;
  agentWidth: number;
  isSplitView: boolean; // Editor split view state

  // Editor Settings
  showLineNumbers: boolean;
  wordWrap: boolean;

  // Debug Mode
  isDebugMode: boolean;

  // Tutorial
  hasSeenTutorial: boolean;
  setHasSeenTutorial: (v: boolean) => void;

  setSidebarOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setAgentWidth: (width: number) => void;
  setSplitView: (isSplit: boolean) => void;

  // Toggle Actions
  toggleSidebar: () => void;
  toggleChat: () => void;
  toggleSplitView: () => void;
  toggleLineNumbers: () => void;
  toggleWordWrap: () => void;
  toggleDebugMode: () => void;
}

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

// 正确的异步 storage adapter for Zustand persist
const asyncIndexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const settings = await dbAPI.getUiSettings();
      console.log('[UiStore] Loaded from IndexedDB:', settings);
      return settings ? JSON.stringify(settings) : null;
    } catch (error) {
      console.error('[UiStore] Failed to load from IndexedDB:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value) as { state: UiSettings };
      await dbAPI.saveUiSettings(parsed.state);
      console.log('[UiStore] Saved to IndexedDB, hasSeenTutorial:', parsed.state.hasSeenTutorial);
    } catch (error) {
      console.error('[UiStore] Failed to save to IndexedDB:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await dbAPI.deleteUiSettings();
    } catch (error) {
      console.error('[UiStore] Failed to delete from IndexedDB:', error);
    }
  }
};

// 创建持久化 Store
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isSidebarOpen: true, // 默认打开
      isChatOpen: true,    // 默认打开
      sidebarWidth: 256,
      agentWidth: 384,
      isSplitView: false,

      showLineNumbers: true,  // 默认开启行号（方便配合 Agent 精确修改）
      wordWrap: true,         // 默认开启换行（小说模式）

      isDebugMode: false,     // 默认关闭调试模式
      hasSeenTutorial: false, // 默认未看过教程

      setHasSeenTutorial: (v) => {
        console.log('[UiStore] setHasSeenTutorial called with:', v);
        set({ hasSeenTutorial: v });
      },

      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      setChatOpen: (open) => set({ isChatOpen: open }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setAgentWidth: (width) => set({ agentWidth: width }),
      setSplitView: (isSplit) => set({ isSplitView: isSplit }),

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
      toggleSplitView: () => set((state) => ({ isSplitView: !state.isSplitView })),
      toggleLineNumbers: () => set((state) => ({ showLineNumbers: !state.showLineNumbers })),
      toggleWordWrap: () => set((state) => ({ wordWrap: !state.wordWrap })),
      toggleDebugMode: () => set((state) => ({ isDebugMode: !state.isDebugMode })),
    }),
    {
      name: 'novel-genie-ui-storage',
      storage: createJSONStorage(() => asyncIndexedDBStorage),
    }
  )
);
