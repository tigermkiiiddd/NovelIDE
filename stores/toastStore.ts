/**
 * Toast 通知 Store
 * 用于显示顶部渐隐弹窗通知
 */

import { create } from 'zustand';

export type ToastType = 'error' | 'warning' | 'success' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // 毫秒，0 表示不自动关闭
  timestamp: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId();
    const newToast: Toast = {
      ...toast,
      id,
      timestamp: Date.now(),
      duration: toast.duration ?? 5000, // 默认5秒
    };

    set((state) => ({
      toasts: [...state.toasts, newToast]
    }));

    // 自动移除（如果 duration > 0）
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, newToast.duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  }
}));

// 便捷方法（可在非 React 代码中调用）
export const toast = {
  error: (title: string, message?: string, duration?: number) => {
    return useToastStore.getState().addToast({ type: 'error', title, message, duration });
  },
  warning: (title: string, message?: string, duration?: number) => {
    return useToastStore.getState().addToast({ type: 'warning', title, message, duration });
  },
  success: (title: string, message?: string, duration?: number) => {
    return useToastStore.getState().addToast({ type: 'success', title, message, duration });
  },
  info: (title: string, message?: string, duration?: number) => {
    return useToastStore.getState().addToast({ type: 'info', title, message, duration });
  },
};
