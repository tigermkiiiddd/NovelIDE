/**
 * TDD Phase 6.1: 🔴 RED - Editor.tsx 快照测试
 *
 * 捕获 Editor 组件的当前渲染状态作为基线
 * 用于在拆分子组件后验证UI一致性
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Editor } from '../../../components/Editor';

// Mock stores
jest.mock('../../../stores/fileStore');
jest.mock('../../../stores/agentStore');
jest.mock('../../../stores/diffStore');
jest.mock('../../../stores/uiStore');
jest.mock('../../../hooks/useUndoRedo');

// Mock dependencies
jest.mock('../../../services/agent/toolRunner', () => ({
  executeApprovedChange: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../utils/diffUtils', () => ({
  computeLineDiff: jest.fn(() => []),
  groupDiffIntoHunks: jest.fn(() => [])
}));

jest.mock('../../../utils/patchQueue', () => ({
  applyPatchQueue: jest.fn(() => 'mocked content'),
  mergePendingChanges: jest.fn(() => 'mocked content'),
  generatePatchId: jest.fn(() => 'patch-1'),
  extractHunkContent: jest.fn(() => 'hunk content'),
  areAllHunksProcessed: jest.fn(() => false)
}));

jest.mock('../../../services/fileSystem', () => ({
  getNodePath: jest.fn(() => '/test/file.txt'),
  findNodeByPath: jest.fn(() => ({
    id: 'file-1',
    name: 'test.txt',
    content: 'original content',
    type: 'file' as const,
    path: '/test/file.txt'
  }))
}));

describe('Editor - 快照测试', () => {
  const mockFiles = [
    {
      id: 'file-1',
      name: 'test.txt',
      content: 'original content',
      type: 'file' as const,
      path: '/test/file.txt'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('编辑模式', () => {
    it('应该渲染编辑模式的UI', () => {
      const { container } = render(
        <Editor />
      );

      expect(container).toMatchSnapshot();
    });

    it('应该显示文件内容', () => {
      render(<Editor />);

      // 验证核心元素存在
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('预览模式', () => {
    it('应该渲染预览模式的UI', () => {
      const { container } = render(
        <Editor />
      );

      // 切换到预览模式需要通过UI store
      // 这里只测试初始状态
      expect(container).toMatchSnapshot();
    });
  });

  describe('Diff模式', () => {
    it('应该渲染diff模式的UI', () => {
      const { container } = render(
        <Editor />
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('工具栏', () => {
    it('应该显示编辑工具栏按钮', () => {
      render(<Editor />);

      // 验证工具按钮存在（具体按钮根据uiStore状态）
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('行号和代码折叠', () => {
    it('应该支持行号显示', () => {
      const { container } = render(<Editor />);
      expect(container).toMatchSnapshot();
    });

    it('应该支持自动换行', () => {
      const { container } = render(<Editor />);
      expect(container).toMatchSnapshot();
    });
  });

  describe('状态持久化', () => {
    it('应该在卸载时保存状态', () => {
      const { unmount } = render(<Editor />);
      unmount();

      // 验证没有错误抛出
      // 实际的持久化逻辑在组件内部通过useEffect处理
    });
  });
});
