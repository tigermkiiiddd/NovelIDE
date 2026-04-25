
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { dbAPI } from '../services/persistence';
import i18n from '../i18n';

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

  // Language
  language: 'zh' | 'en';
  setLanguage: (lang: 'zh' | 'en') => void;

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
  language: 'zh' | 'en';
}

// 正确的异步 storage adapter for Zustand persist
const asyncIndexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      console.log('[UiStore] getItem called, name:', name);
      const settings = await dbAPI.getUiSettings();
      console.log('[UiStore] Loaded from IndexedDB:', settings);
      if (!settings) return null;

      // Zustand persist 期望的格式：整个 state 对象的 JSON
      const stateWrapper = {
        state: settings,
        version: 0
      };
      const result = JSON.stringify(stateWrapper);
      console.log('[UiStore] Returning to Zustand:', result);
      return result;
    } catch (error) {
      console.error('[UiStore] Failed to load from IndexedDB:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      console.log('[UiStore] setItem called, value:', value);
      const parsed = JSON.parse(value);
      console.log('[UiStore] Parsed value:', parsed);

      // Zustand persist 传入的格式：{ state: {...}, version: 0 }
      const settings = parsed.state as UiSettings;
      await dbAPI.saveUiSettings(settings);
      console.log('[UiStore] Saved to IndexedDB, hasSeenTutorial:', settings.hasSeenTutorial);
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
      language: 'zh',         // 默认中文

      setHasSeenTutorial: (v) => {
        console.log('[UiStore] setHasSeenTutorial called with:', v);
        set({ hasSeenTutorial: v });
      },

      setLanguage: (lang) => {
        set({ language: lang });
        i18n.changeLanguage(lang);
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
      // 添加 onRehydrateStorage 来追踪 hydration 状态
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[UiStore] Hydration error:', error);
        } else {
          console.log('[UiStore] Hydration complete, hasSeenTutorial:', state?.hasSeenTutorial);
        }
      }
    }
  )
);
