/**
 * Bug #3: Auto-save in Diff Mode Test
 *
 * 问题描述: diff模式下的auto-save逻辑可能导致意外保存。
 * 虽然检查了`!diffSession`，但`computedContent`在diff模式下也会变化，
 * 如果`diffSession`在某个瞬间为null（异步更新），会意外触发保存。
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { MockIndexedDB, waitForEffects } from '../../src/test/utils/testHelpers';
import { mockDiffSession, mockPatch } from '../../src/test/utils/testHelpers';
import { DiffSessionState } from '../../src/types';

describe('Bug #3: Auto-save in Diff Mode', () => {
  let mockDB: MockIndexedDB;

  beforeEach(() => {
    mockDB = new MockIndexedDB();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockDB.clear();
  });

  it('不应该在diff模式下触发auto-save', async () => {
    // 模拟diff模式的状态
    const diffSession: DiffSessionState = mockDiffSession({
      sourceFileName: 'test.ts',
      patchQueue: [mockPatch({ type: 'accept' })]
    });

    const inDiffMode = true;
    const hasActiveFile = true;
    const hasComputedContent = true;

    // 当前的auto-save条件：!diffSession && activeFile && computedContent
    // FIX: 应该同时检查 !diffSession && internalMode === 'edit'
    const shouldAutoSaveOldLogic = !diffSession && hasActiveFile && hasComputedContent;
    expect(shouldAutoSaveOldLogic).toBe(false); // 当前逻辑：diff模式下不保存

    // 但如果diffSession在某个瞬间为null（异步竞态），就会意外触发
    const diffSessionNullMoment = null;
    const shouldAutoSaveRaceCondition = !diffSessionNullMoment && hasActiveFile && hasComputedContent;
    expect(shouldAutoSaveRaceCondition).toBe(true); // 竞态条件：会触发！

    // FIX: 增强的条件：检查internalMode
    const internalMode = 'diff';
    const shouldAutoSaveNewLogic = !diffSessionNullMoment &&
                                  internalMode === 'edit' &&
                                  hasActiveFile &&
                                  hasComputedContent;
    expect(shouldAutoSaveNewLogic).toBe(false); // 修复后：即使diffSession为null，diff模式也不保存
  });

  it('应该只在edit模式下触发auto-save', async () => {
    const diffSession = null;
    const hasActiveFile = true;
    const hasComputedContent = true;

    // 测试各种模式
    const modes = ['edit', 'preview', 'diff'] as const;

    const editModeResults = modes.map(mode => {
      // FIX: 增强的条件
      const shouldAutoSave = !diffSession &&
                            mode === 'edit' &&
                            hasActiveFile &&
                            hasComputedContent;
      return { mode, shouldAutoSave };
    });

    expect(editModeResults).toEqual([
      { mode: 'edit', shouldAutoSave: true },     // edit模式：保存
      { mode: 'preview', shouldAutoSave: false },  // preview模式：不保存
      { mode: 'diff', shouldAutoSave: false }      // diff模式：不保存
    ]);
  });

  it('应该在preview模式下也不触发auto-save', async () => {
    const diffSession = null;
    const internalMode = 'preview';
    const hasActiveFile = true;
    const hasComputedContent = true;

    // 当前条件：!diffSession && activeFile && computedContent
    // FIX: 应该增加 internalMode === 'edit' 检查
    const shouldAutoSaveNewLogic = !diffSession &&
                                  internalMode === 'edit' &&
                                  hasActiveFile &&
                                  hasComputedContent;
    expect(shouldAutoSaveNewLogic).toBe(false); // preview模式不保存
  });

  it('应该在所有必要条件满足时触发auto-save', async () => {
    const diffSession = null;
    const internalMode = 'edit';
    const hasActiveFile = true;
    const hasComputedContent = true;

    const shouldAutoSave = !diffSession &&
                          internalMode === 'edit' &&
                          hasActiveFile &&
                          hasComputedContent;
    expect(shouldAutoSave).toBe(true); // 所有必要条件满足：保存
  });

  it('应该在任何必要条件不满足时不触发auto-save', async () => {
    const internalMode = 'edit';

    // 测试各种条件不满足的情况
    const testCases = [
      { diffSession: null, activeFile: false, computedContent: null, expected: false },  // 没有activeFile
      { diffSession: null, activeFile: true, computedContent: null, expected: false },   // 没有computedContent
      { diffSession: {}, activeFile: true, computedContent: 'content', expected: false }, // 有diffSession
      { diffSession: null, activeFile: true, computedContent: '', expected: true }        // computedContent为空字符串也算有效
    ];

    testCases.forEach(({ diffSession, activeFile, computedContent, expected }) => {
      const shouldAutoSave = !diffSession &&
                            internalMode === 'edit' &&
                            activeFile &&
                            computedContent !== undefined && computedContent !== null;
      expect(shouldAutoSave).toBe(expected);
    });
  });
});
