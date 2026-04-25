/**
 * createPersistingStore - 统一持久化策略工具
 *
 * 职责：
 * 1. 提供防抖持久化（默认1秒）
 * 2. 统一错误处理
 * 3. 支持状态变化时自动保存
 * 4. 避免频繁写入IndexedDB
 *
 * 设计原则：
 * - 状态与持久化分离
 * - 可配置的防抖延迟
 * - 自动错误处理
 * - 保持Zustand的简洁API
 */

import { create } from 'zustand';

export interface PersistingStoreConfig<T> {
  name: string;
  initialState: T;
  saver?: (state: T) => Promise<any>;
  debounceMs?: number;
}

/**
 * 创建带持久化功能的Zustand store
 *
 * @param name Store名称（用于错误日志）
 * @param initialState 初始状态
 * @param saver 持久化函数
 * @param debounceMs 防抖延迟（毫秒），默认1000ms
 * @returns Zustand store
 */
export function createPersistingStore<T extends object>(
  name: string,
  initialState: T,
  saver: ((state: T) => Promise<any>) | undefined,
  debounceMs: number = 1000
) {
  // Backward-compatible wrapper: existing code uses (name, initialState, saver, debounceMs)
  return createPersistingStoreFromConfig<T>({
    name,
    initialState,
    saver,
    debounceMs,
  });
}

// 新签名：更清晰的配置对象形式
export function createPersistingStoreFromConfig<T extends object>(
  config: PersistingStoreConfig<T>
) {
  const { name, initialState, saver, debounceMs = 1000 } = config;

  let isLoaded = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingState: T | null = null;

  const saveNow = (state: T) => {
    if (!isLoaded) return;
    if (typeof saver !== 'function') return;

    Promise.resolve(saver(state)).catch((error) => {
      console.error(`[${name}] Failed to persist state: Failed to persist ${name}`, error);
    });
  };

  // 创建防抖保存函数（基于 store.setState 包装触发）
  const debouncedSave = (state: T) => {
    if (typeof saver !== 'function') return;

    // 0ms 表示立即保存（便于同步测试与需要立刻落盘的场景）
    if (debounceMs <= 0) {
      saveNow(state);
      return;
    }

    pendingState = state;

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const stateToSave = pendingState || state;
      pendingState = null;
      saveNow(stateToSave);
    }, debounceMs);
  };

  // 创建 store（保持 Zustand 默认 API：store.setState / store.getState / selector）
  const store = create<T>(() => ({
    ...initialState,
  } as T));

  // 加载控制：防止 HMR/初始化阶段保存空状态
  (store as any)._markLoaded = () => { isLoaded = true; };
  (store as any)._markUnloaded = () => { isLoaded = false; };

  // 包装 Zustand 的 setState：每次更新后触发防抖持久化
  const rawSetState = store.setState;
  (store as any).setState = (partial: any, replace?: boolean) => {
    rawSetState(partial, replace as any);
    debouncedSave(store.getState());
  };

  return store;
}

/**
 * 手动触发立即保存（绕过防抖）
 *
 * 用于需要立即持久化的场景，如页面卸载
 */
export function flushPersistingStore<T = any>(
  store: any
): void {
  const state = store.getState?.();
  void state;
  console.warn('[flushPersistingStore] Manual flush not implemented. Use setState trigger instead.');
}
