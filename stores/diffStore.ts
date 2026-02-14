/**
 * diffStore - Diff会话状态管理
 *
 * 职责：
 * 1. 管理多个文件的diff会话状态
 * 2. 封装dbAPI调用，避免组件直接访问持久化层
 * 3. 提供会话的加载、保存、清除接口
 *
 * 设计原则：
 * - 状态与持久化分离
 * - 支持多文件并发diff会话
 * - 防止文件间的会话串扰
 */

import { create } from 'zustand';
import { DiffSessionState } from '../types';
import { dbAPI } from '../services/persistence';

interface DiffState {
  diffSessions: Record<string, DiffSessionState | null>;

  // Actions
  getDiffSession: (fileId: string) => DiffSessionState | null;
  loadDiffSession: (fileId: string) => Promise<DiffSessionState | null>;
  saveDiffSession: (fileId: string, session: DiffSessionState | null) => Promise<void>;
  clearDiffSession: (fileId: string) => Promise<void>;
}

export const useDiffStore = create<DiffState>((set, get) => ({
  diffSessions: {},

  getDiffSession: (fileId: string) => {
    const { diffSessions } = get();
    return diffSessions[fileId] || null;
  },

  loadDiffSession: async (fileId: string) => {
    // 先从内存状态获取
    const { diffSessions } = get();
    if (diffSessions[fileId] !== undefined) {
      return diffSessions[fileId];
    }

    // 从IndexedDB加载
    try {
      const session = await dbAPI.getDiffSession(fileId);
      set((state) => ({
        diffSessions: {
          ...state.diffSessions,
          [fileId]: session
        }
      }));
      return session;
    } catch (error) {
      console.error(`[diffStore] Failed to load diff session for ${fileId}:`, error);
      return null;
    }
  },

  saveDiffSession: async (fileId: string, session: DiffSessionState | null) => {
    // 更新内存状态
    set((state) => ({
      diffSessions: {
        ...state.diffSessions,
        [fileId]: session
      }
    }));

    // 持久化到IndexedDB
    try {
      await dbAPI.saveDiffSession(fileId, session);
    } catch (error) {
      console.error(`[diffStore] Failed to save diff session for ${fileId}:`, error);
    }
  },

  clearDiffSession: async (fileId: string) => {
    // 清除内存状态
    set((state) => {
      const newSessions = { ...state.diffSessions };
      delete newSessions[fileId];
      return { diffSessions: newSessions };
    });

    // 清除IndexedDB
    try {
      await dbAPI.saveDiffSession(fileId, null);
    } catch (error) {
      console.error(`[diffStore] Failed to clear diff session for ${fileId}:`, error);
    }
  }
}));
