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

import { create, StateCreator } from 'zustand';

export interface PersistingStoreConfig<T> {
  name: string;
  initialState: T;
  saver: (state: T) => Promise<any>;
  debounceMs?: number;
}

type WithSetState<T> = T & {
  setState: (update: Partial<T> | ((prev: T) => Partial<T>) => void;
};

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
  config: PersistingStoreConfig<T>
) {
  const { name, initialState, saver, debounceMs = 1000 } = config;

  let debounceTimer: NodeJS.Timeout | null = null;
  let pendingState: Partial<T> | null = null;

  // 创建防抖保存函数
  const debouncedSave = (state: T) => {
    // 保存pending的状态
    pendingState = state;

    // 清除之前的定时器
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    // 设置新的定时器
    debounceTimer = setTimeout(() => {
      // 保存pending的状态
      const stateToSave = pendingState || state;
      pendingState = null;

      // 调用持久化函数
      Promise.resolve(saver(stateToSave)).catch((error) => {
        console.error(`[${name}] Failed to persist state:`, error);
      });
    }, debounceMs);
  };

  // 创建store
  const store = create<WithSetState<T>>((set, get) => ({
    ...initialState,

    setState: (update) => {
      set(update);
      // 状态更新后触发防抖保存
      debouncedSave(get());
    },
  }));

  return Store as ReturnType<typeof Store>;
}

/**
 * 手动触发立即保存（绕过防抖）
 *
 * 用于需要立即持久化的场景，如页面卸载
 */
export function flushPersistingStore<T = any>(
  store: ReturnType<ReturnType<typeof create<T>>>
): void {
  const state = store.getState();
  // 这里无法访问debouncedSave，所以不实现
  // 如果需要立即保存，可以直接调用saver
  console.warn('[flushPersistingStore] Manual flush not implemented. Use setState trigger instead.');
}
