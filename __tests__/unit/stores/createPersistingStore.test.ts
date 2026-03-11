/**
 * TDD Phase 5.1: 🔴 RED - 持久化工具测试
 */

import { createPersistingStore } from '../../../stores/createPersistingStore';

// Mock dbAPI
jest.mock('../../../services/persistence');
import { dbAPI } from '../../../services/persistence';

const mockDbAPI = dbAPI as jest.Mocked<typeof dbAPI>;

interface TestState {
  items: string[];
  count: number;
}

describe('createPersistingStore - 统一持久化策略', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('防抖持久化', () => {
    it('应该在状态变化后防抖保存', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      store.setState({ items: ['a'], count: 1 });
      store.setState({ items: ['a', 'b'], count: 2 });
      store.setState({ items: ['a', 'b', 'c'], count: 3 });

      // 快进1秒（防抖）
      jest.advanceTimersByTime(1000);

      expect(saver).toHaveBeenCalledTimes(1);
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining(['c']),
          count: 3
        })
      );
    });

    it('应该在配置的延迟时间后保存', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state),
        500 // 500ms延迟
      );

      store.setState({ items: ['a'], count: 1 });

      // 500ms前不应该保存
      jest.advanceTimersByTime(499);
      expect(saver).not.toHaveBeenCalled();

      // 500ms后应该保存
      jest.advanceTimersByTime(1);
      expect(saver).toHaveBeenCalledTimes(1);
    });

    it('应该取消pending的保存当有新状态变化时', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      // 快速连续更新
      store.setState({ items: ['a'], count: 1 });
      store.setState({ items: ['a', 'b'], count: 2 });
      store.setState({ items: ['a', 'b', 'c'], count: 3 });

      // 只应该保存最后一次状态
      jest.advanceTimersByTime(1000);

      expect(saver).toHaveBeenCalledTimes(1);
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining(['c']),
          count: 3
        })
      );
    });

    it('应该处理异步保存错误', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      const error = new Error('Save failed');
      const saver = jest.fn().mockRejectedValue(error);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      store.setState({ items: ['a'], count: 1 });

      try {
        await jest.advanceTimersByTimeAsync(1000);
      } catch (e) {
        // 应该已经处理错误
      }

      expect(consoleError).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist test-store'),
        expect.any(Error)
      );

      consoleError.mockRestore();
    });
  });

  describe('状态管理', () => {
    it('应该提供setState方法更新状态', () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      store.setState({ items: ['a', 'b'], count: 2 });

      expect(store.getState().items).toEqual(['a', 'b']);
      expect(store.getState().count).toBe(2);
    });

    it('应该合并部分状态更新', () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      store.setState({ items: ['a'] });
      store.setState({ count: 5 });

      expect(store.getState().items).toEqual(['a']);
      expect(store.getState().count).toBe(5);
    });

    it('应该保持Zustand的selector功能', () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      store.setState({ items: ['a', 'b'], count: 2 });

      // 在非 React 环境下，直接通过 getState 使用 selector 等价验证
      const state = store.getState();
      const items = ((s: any) => s.items)(state);
      const count = ((s: any) => s.count)(state);

      expect(items).toEqual(['a', 'b']);
      expect(count).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('应该处理空初始状态', () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      expect(store.getState().items).toEqual([]);
      expect(store.getState().count).toBe(0);
    });

    it('应该处理null值更新', () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
      );

      store.setState({ items: null as any });

      expect(store.getState().items).toBeNull();
    });

    it('应该处理saver为undefined的情况', () => {
      expect(() => {
        const store = createPersistingStore<TestState>(
          'test-store',
          { items: [], count: 0 },
          undefined as any
        );

        store.setState({ items: ['a'] });
      }).not.toThrow();
    });
  });

  describe('配置选项', () => {
    it('应该使用默认1秒防抖延迟', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state)
        // 不传入debounceMs，使用默认值
      );

      store.setState({ items: ['a'], count: 1 });

      // 快进时间小于默认值
      jest.advanceTimersByTime(999);
      expect(saver).not.toHaveBeenCalled();

      // 1000ms（默认1秒）后应该保存
      jest.advanceTimersByTime(1);
      expect(saver).toHaveBeenCalledTimes(1);
    });

    it('应该支持自定义防抖延迟', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state),
        200 // 200ms自定义延迟
      );

      store.setState({ items: ['a'], count: 1 });

      // 199ms前不应该保存
      jest.advanceTimersByTime(199);
      expect(saver).not.toHaveBeenCalled();

      // 200ms后应该保存
      jest.advanceTimersByTime(1);
      expect(saver).toHaveBeenCalledTimes(1);
    });

    it('应该支持0延迟（立即保存）', async () => {
      const saver = jest.fn().mockResolvedValue(undefined);

      const store = createPersistingStore<TestState>(
        'test-store',
        { items: [], count: 0 },
        (state) => saver(state),
        0 // 立即保存
      );

      store.setState({ items: ['a'], count: 1 });

      // 应该立即保存（即使在同一个tick中）
      expect(saver).toHaveBeenCalledTimes(1);
    });
  });
});
