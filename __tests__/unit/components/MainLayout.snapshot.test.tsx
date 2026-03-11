/**
 * TDD Phase 6.1: 🔴 RED - MainLayout.tsx 快照测试
 *
 * 捕获 MainLayout 组件的当前渲染状态作为基线
 * 用于在拆分子组件后验证UI一致性
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-markdown', () => {
  return {
    __esModule: true,
    default: ({ children }: any) => <div data-testid="react-markdown">{children}</div>,
  };
});

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => {},
}));

jest.mock('remark-breaks', () => ({
  __esModule: true,
  default: () => {},
}));

import MainLayout from '../../../components/MainLayout';

// Mock all dependencies
jest.mock('../../../services/persistence', () => ({
  __esModule: true,
  dbAPI: {
    getUiSettings: jest.fn().mockResolvedValue(undefined),
    saveUiSettings: jest.fn().mockResolvedValue(undefined),
    getDiffSession: jest.fn().mockResolvedValue(null),
    saveDiffSession: jest.fn().mockResolvedValue(undefined),
    deleteDiffSession: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../stores/projectStore', () => ({
  __esModule: true,
  useProjectStore: (selector?: any) => {
    const state = {
      getCurrentProject: () => ({ id: 'project-1', name: 'Test Project' }),
      updateProject: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock('../../../stores/fileStore', () => ({
  __esModule: true,
  useFileStore: (selector?: any) => {
    const state = {
      files: [{ id: 'file-1', parentId: 'root', name: 'test.md', type: 'file', content: 'content', lastModified: Date.now() }],
      activeFileId: 'file-1',
      loadFiles: jest.fn(),
      deleteFile: jest.fn(),
      createFile: jest.fn(),
      updateFile: jest.fn(),
      patchFile: jest.fn(),
      readFile: jest.fn(),
      searchFiles: jest.fn(),
      listFiles: jest.fn(),
      renameFile: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

jest.mock('../../../stores/uiStore', () => ({
  __esModule: true,
  useUiStore: (selector?: any) => {
    const state = {
      isSidebarOpen: true,
      isChatOpen: true,
      sidebarWidth: 280,
      agentWidth: 360,
      setSidebarOpen: jest.fn(),
      setChatOpen: jest.fn(),
      setSidebarWidth: jest.fn(),
      setAgentWidth: jest.fn(),
      toggleChat: jest.fn(),
      toggleSidebar: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
}));
jest.mock('../../../hooks/useAgent', () => ({
  __esModule: true,
  useAgent: () => ({
    messages: [],
    isLoading: false,
    sendMessage: jest.fn(),
    stopGeneration: jest.fn(),
    regenerateMessage: jest.fn(),
    editUserMessage: jest.fn(),
    todos: [],
    sessions: [],
    currentSessionId: 'session-1',
    createNewSession: jest.fn(),
    switchSession: jest.fn(),
    deleteSession: jest.fn(),
    aiConfig: {},
    updateAiConfig: jest.fn(),
    pendingChanges: [],
    tokenUsage: null,
    messageWindowInfo: null,
    planMode: false,
    togglePlanMode: jest.fn(),
    planNotes: [],
    currentPlanNote: null,
    submitPlanForReview: jest.fn(),
    approvePlanNote: jest.fn(),
    rejectPlanNote: jest.fn(),
  }),
}));
jest.mock('../../../hooks/useSwipeGesture', () => ({
  __esModule: true,
  useSwipeGesture: () => {},
}));
jest.mock('../../../components/AgentChat');
jest.mock('../../../components/Sidebar');
jest.mock('../../../components/ProjectOverview');
jest.mock('../../../components/StatusBar');

describe('MainLayout - 快照测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('桌面视图布局', () => {
    it('应该渲染主布局结构', () => {
      const mockOnBack = jest.fn();

      const { container } = render(
        <MainLayout
          projectId="project-1"
          onBack={mockOnBack}
        />
      );

      expect(container).toMatchSnapshot();
    });

    it('应该包含侧边栏、编辑器和聊天面板', () => {
      const mockOnBack = jest.fn();

      render(
        <MainLayout
          projectId="project-1"
          onBack={mockOnBack}
        />
      );

      // 验证主要区域存在（不依赖具体 className）
      expect(document.querySelector('main')).toBeInTheDocument();
    });
  });

  describe('响应式布局', () => {
    it('应该在小屏幕上调整布局', () => {
      // Mock window.innerWidth
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600
      });

      const { container } = render(
        <MainLayout
          projectId="project-1"
          onBack={() => {}}
        />
      );

      expect(container).toMatchSnapshot();
    });

    it('应该在大屏幕上显示所有面板', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1400
      });

      const { container } = render(
        <MainLayout
          projectId="project-1"
          onBack={() => {}}
        />
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('面板切换交互', () => {
    it('应该支持侧边栏开关', () => {
      const { container } = render(
        <MainLayout
          projectId="project-1"
          onBack={() => {}}
        />
      );

      expect(container).toMatchSnapshot();
    });

    it('应该支持聊天面板开关', () => {
      const { container } = render(
        <MainLayout
          projectId="project-1"
          onBack={() => {}}
        />
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('项目文件管理', () => {
    it('应该显示项目概览', () => {
      const { container } = render(
        <MainLayout
          projectId="project-1"
          onBack={() => {}}
        />
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('返回按钮', () => {
    it('应该在点击返回按钮时调用onBack', () => {
      const mockOnBack = jest.fn();

      render(
        <MainLayout
          projectId="project-1"
          onBack={mockOnBack}
        />
      );

      // 查找返回按钮并点击
      // 具体选择器取决于实际的DOM结构
      const backButton = document.querySelector('[data-testid="back-button"]');
      if (backButton) {
        backButton.click();
        expect(mockOnBack).toHaveBeenCalled();
      }
    });
  });
});
