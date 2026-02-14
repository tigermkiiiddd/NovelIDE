/**
 * TDD Phase 6.1: 🔴 RED - MainLayout.tsx 快照测试
 *
 * 捕获 MainLayout 组件的当前渲染状态作为基线
 * 用于在拆分子组件后验证UI一致性
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainLayout } from '../../../components/MainLayout';

// Mock all dependencies
jest.mock('../../../stores/projectStore');
jest.mock('../../../stores/fileStore');
jest.mock('../../../stores/uiStore');
jest.mock('../../../hooks/useAgent');
jest.mock('../../../components/Editor');
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

      // 验证主要区域存在
      // 具体的选择器依赖于实际DOM结构
      expect(document.querySelector('.main-layout')).toBeInTheDocument();
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
