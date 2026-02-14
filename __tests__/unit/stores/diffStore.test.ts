/**
 * TDD Phase 4.1: 🔴 RED - diffStore 测试
 *
 * 这些测试定义diffStore应该具有的行为。
 * diffStore负责管理diff会话状态，避免组件直接访问dbAPI。
 *
 * 核心职责：
 * 1. 管理多个文件的diff会话状态
 * 2. 提供会话的加载、保存、清除接口
 * 3. 封装dbAPI调用细节
 */

import { DiffSessionState } from '../../../types';
import { useDiffStore } from '../../../stores/diffStore';
import { dbAPI } from '../../../services/persistence';

// Mock dbAPI
jest.mock('../../../services/persistence');
const mockDbAPI = dbAPI as jest.Mocked<typeof dbAPI>;

describe('diffStore - Diff会话状态管理', () => {
  beforeEach(() => {
    // 重置diffStore状态
    useDiffStore.setState({ diffSessions: {} });
    jest.clearAllMocks();
  });

  describe('会话保存', () => {
    it('应该保存diff会话到内存状态', async () => {
      const { saveDiffSession, getDiffSession } = useDiffStore.getState();
      const session: DiffSessionState = {
        sourceSnapshot: 'Original content',
        sourceFileName: 'test.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session);

      expect(getDiffSession('file-1')).toEqual(session);
    });

    it('应该调用dbAPI保存会话到IndexedDB', async () => {
      const { saveDiffSession } = useDiffStore.getState();
      const session: DiffSessionState = {
        sourceSnapshot: 'Content',
        sourceFileName: 'test.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session);

      expect(mockDbAPI.saveDiffSession).toHaveBeenCalledWith('file-1', session);
    });

    it('应该支持保存null值清除会话', async () => {
      const { saveDiffSession, getDiffSession } = useDiffStore.getState();
      const session: DiffSessionState = {
        sourceSnapshot: 'Original',
        sourceFileName: 'test.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session);
      await saveDiffSession('file-1', null);

      expect(getDiffSession('file-1')).toBeNull();
      expect(mockDbAPI.saveDiffSession).toHaveBeenCalledWith('file-1', null);
    });
  });

  describe('会话获取', () => {
    it('应该返回已保存的diff会话', async () => {
      const { saveDiffSession, getDiffSession } = useDiffStore.getState();
      const session: DiffSessionState = {
        sourceSnapshot: 'Content',
        sourceFileName: 'test.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session);
      const retrieved = getDiffSession('file-1');

      expect(retrieved).toEqual(session);
    });

    it('应该返回null当会话不存在时', () => {
      const { getDiffSession } = useDiffStore.getState();
      const retrieved = getDiffSession('nonexistent');

      expect(retrieved).toBeNull();
    });

    it('应该从IndexedDB加载会话', async () => {
      const { loadDiffSession } = useDiffStore.getState();
      const session: DiffSessionState = {
        sourceSnapshot: 'Content',
        sourceFileName: 'test.ts',
        patchQueue: []
      };

      mockDbAPI.getDiffSession.mockResolvedValue(session);

      const retrieved = await loadDiffSession('file-1');

      expect(retrieved).toEqual(session);
      expect(mockDbAPI.getDiffSession).toHaveBeenCalledWith('file-1');
    });
  });

  describe('会话清除', () => {
    it('应该清除指定文件的diff会话', async () => {
      const { saveDiffSession, clearDiffSession, getDiffSession } = useDiffStore.getState();
      const session: DiffSessionState = {
        sourceSnapshot: 'Content',
        sourceFileName: 'test.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session);
      await clearDiffSession('file-1');

      expect(getDiffSession('file-1')).toBeNull();
    });

    it('应该调用dbAPI清除IndexedDB中的会话', async () => {
      const { clearDiffSession } = useDiffStore.getState();
      await clearDiffSession('file-1');

      expect(mockDbAPI.saveDiffSession).toHaveBeenCalledWith('file-1', null);
    });
  });

  describe('多文件会话管理', () => {
    it('应该独立管理多个文件的diff会话', async () => {
      const { saveDiffSession, getDiffSession } = useDiffStore.getState();
      const session1: DiffSessionState = {
        sourceSnapshot: 'File 1',
        sourceFileName: 'file1.ts',
        patchQueue: []
      };

      const session2: DiffSessionState = {
        sourceSnapshot: 'File 2',
        sourceFileName: 'file2.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session1);
      await saveDiffSession('file-2', session2);

      expect(getDiffSession('file-1')).toEqual(session1);
      expect(getDiffSession('file-2')).toEqual(session2);
    });

    it('应该只清除指定文件的会话不影响其他文件', async () => {
      const { saveDiffSession, clearDiffSession, getDiffSession } = useDiffStore.getState();
      const session1: DiffSessionState = {
        sourceSnapshot: 'File 1',
        sourceFileName: 'file1.ts',
        patchQueue: []
      };

      const session2: DiffSessionState = {
        sourceSnapshot: 'File 2',
        sourceFileName: 'file2.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session1);
      await saveDiffSession('file-2', session2);
      await clearDiffSession('file-1');

      expect(getDiffSession('file-1')).toBeNull();
      expect(getDiffSession('file-2')).toEqual(session2);
    });
  });

  describe('文件切换场景', () => {
    it('应该在文件切换时清理上一个文件的会话', async () => {
      const { saveDiffSession, clearDiffSession, getDiffSession } = useDiffStore.getState();
      const prevFileSession: DiffSessionState = {
        sourceSnapshot: 'Previous file',
        sourceFileName: 'prev.ts',
        patchQueue: []
      };

      await saveDiffSession('prev-file', prevFileSession);
      await clearDiffSession('prev-file');

      expect(getDiffSession('prev-file')).toBeNull();
      expect(mockDbAPI.saveDiffSession).toHaveBeenCalledWith('prev-file', null);
    });

    it('应该防止新文件恢复旧文件的会话', async () => {
      const { saveDiffSession, clearDiffSession, getDiffSession } = useDiffStore.getState();
      const oldSession: DiffSessionState = {
        sourceSnapshot: 'Old file',
        sourceFileName: 'old.ts',
        patchQueue: []
      };

      await saveDiffSession('old-file', oldSession);
      await clearDiffSession('old-file');

      // 新文件不应该获取到旧会话
      expect(getDiffSession('new-file')).toBeNull();
    });
  });

  describe('边界情况', () => {
    it('应该处理保存空会话', async () => {
      const { saveDiffSession, getDiffSession } = useDiffStore.getState();
      const emptySession: DiffSessionState = {
        sourceSnapshot: '',
        sourceFileName: 'empty.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', emptySession);

      expect(getDiffSession('file-1')).toEqual(emptySession);
    });

    it('应该处理清除不存在的会话', async () => {
      const { clearDiffSession } = useDiffStore.getState();

      // 不应该抛出错误
      await expect(clearDiffSession('nonexistent')).resolves.not.toThrow();
    });

    it('应该处理保存null到不存在的会话', async () => {
      const { saveDiffSession } = useDiffStore.getState();

      // 不应该抛出错误
      await expect(saveDiffSession('nonexistent', null)).resolves.not.toThrow();
    });

    it('应该处理会话文件名不匹配', async () => {
      const { saveDiffSession, getDiffSession } = useDiffStore.getState();
      const session: DiffSessionState = {
        sourceSnapshot: 'Content',
        sourceFileName: 'old.ts',
        patchQueue: []
      };

      await saveDiffSession('file-1', session);

      // 文件名已改变，应该清除旧会话
      await saveDiffSession('file-1', null);

      expect(getDiffSession('file-1')).toBeNull();
    });
  });
});
