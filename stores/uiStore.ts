
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

// 创建持久化 Store - 使用 localStorage（同步、可靠）
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
      name: 'novel-genie-ui-storage', // localStorage key
    }
  )
);
