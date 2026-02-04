
import { useState, useCallback, useRef } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UndoRedoResult<T> {
  state: T;
  set: (newPresent: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (newPresent: T) => void;
}

export const useUndoRedo = <T>(initialPresent: T, debounceTimeout: number = 500): UndoRedoResult<T> => {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialPresent,
    future: []
  });

  // 用于记录上一次修改的时间，实现智能合并
  const lastChangeTime = useRef<number>(0);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const undo = useCallback(() => {
    setHistory(curr => {
      if (curr.past.length === 0) return curr;

      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, curr.past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(curr => {
      if (curr.future.length === 0) return curr;

      const next = curr.future[0];
      const newFuture = curr.future.slice(1);

      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture
      };
    });
  }, []);

  const set = useCallback((newPresent: T) => {
    setHistory(curr => {
      if (curr.present === newPresent) return curr;

      const now = Date.now();
      const isRapidInput = (now - lastChangeTime.current) < debounceTimeout;
      
      lastChangeTime.current = now;

      // 如果是短时间内的连续输入，且不是第一次输入，我们替换当前的 present 而不推入 past
      // 这可以避免用户打一个字就存一个历史记录
      if (isRapidInput && curr.past.length > 0) {
        return {
          ...curr,
          present: newPresent,
          // 注意：这里我们不清除 future，或者我们可以清除。
          // 标准行为通常是新的输入会清除重做栈
          future: [] 
        };
      }

      // 否则，作为新的历史节点
      return {
        past: [...curr.past, curr.present],
        present: newPresent,
        future: []
      };
    });
  }, [debounceTimeout]);

  const reset = useCallback((newPresent: T) => {
    setHistory({
      past: [],
      present: newPresent,
      future: []
    });
    lastChangeTime.current = 0;
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
    reset
  };
};
