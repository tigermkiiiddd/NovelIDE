/**
 * TDD Phase 5.1: 🔴 RED - 持久化工具基本测试
 *
 * 最简化测试，验证createPersistingStore核心功能
 */

import { createPersistingStore } from '../../../stores/createPersistingStore';

// Mock dbAPI
jest.mock('../../../services/persistence');
import { dbAPI } from '../../../services/persistence';

const mockDbAPI = dbAPI as jest.Mocked<typeof dbAPI>;

interface TestState {
  value: string;
}

describe('createPersistingStore - 基本功能验证', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('基本功能', () => {
    it('应该创建store并返回setState', () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { value: 'initial' },
        (state) => saver(state)
      );

      expect(store.setState).toBeDefined();
      expect(typeof store.setState).toBe('function');
    });

    it('应该在状态变化时调用saver', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { value: 'initial' },
        (state) => saver(state)
      );

      store.setState({ value: 'updated' });

      // 等待防抖（默认1000ms）
      jest.advanceTimersByTime(1000);

      expect(saver).toHaveBeenCalledTimes(1);
      expect(saver).toHaveBeenCalledWith({ value: 'updated' });
    });

    it('应该支持0ms防抖延迟（立即保存）', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { value: 'initial' },
        (state) => saver(state),
        0 // 0ms延迟
      );

      store.setState({ value: 'updated' });

      // 0ms后应该调用saver
      jest.advanceTimersByTime(0);

      expect(saver).toHaveBeenCalledTimes(1);
      expect(saver).toHaveBeenCalledWith({ value: 'updated' });
    });
  });

  describe('错误处理', () => {
    it('应该捕获持久化错误并输出到console', async () => {
      const error = new Error('DB write failed');
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      const saver = jest.fn().mockRejectedValue(error);

      const store = createPersistingStore<TestState>(
        'test-store',
        { value: 'initial' },
        (state) => saver(state)
      );

      store.setState({ value: 'updated' });

      try {
        await jest.advanceTimersByTimeAsync(1000);
      } catch (e) {
        // 应该被捕获
      }

      expect(consoleError).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('[test-store] Failed to persist state:'),
        expect.any(Error)
      );
    });
  });
});
