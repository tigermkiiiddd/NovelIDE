
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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

// Custom IndexedDB storage adapter for Zustand persist
const indexedDBStorage = {
  getItem: async (name: string) => {
    const settings = await dbAPI.getUiSettings();
    // Zustand expects the stored string value directly
    return settings ? JSON.stringify(settings) : null;
  },
  setItem: async (name: string, value: string) => {
    // Zustand passes JSON string, parse it before saving
    const parsed = JSON.parse(value) as UiState;
    await dbAPI.saveUiSettings({
      isSidebarOpen: parsed.isSidebarOpen ?? true,
      isChatOpen: parsed.isChatOpen ?? true,
      sidebarWidth: parsed.sidebarWidth ?? 256,
      agentWidth: parsed.agentWidth ?? 384,
      isSplitView: parsed.isSplitView ?? false,
      showLineNumbers: parsed.showLineNumbers ?? true,
      wordWrap: parsed.wordWrap ?? true,
      isDebugMode: parsed.isDebugMode ?? false
    });
  },
  removeItem: async (name: string) => {
    // Actually delete the stored settings
    await dbAPI.deleteUiSettings();
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
      name: 'novel-genie-ui-storage', // Storage Key (for compatibility)
      storage: indexedDBStorage,
      // 选择性持久化
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        isChatOpen: state.isChatOpen,
        sidebarWidth: state.sidebarWidth,
        agentWidth: state.agentWidth,
        isSplitView: state.isSplitView,
        showLineNumbers: state.showLineNumbers,
        wordWrap: state.wordWrap,
        isDebugMode: state.isDebugMode
      }),
    }
  )
);
