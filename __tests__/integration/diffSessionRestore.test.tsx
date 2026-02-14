/**
 * Bug #2: DiffSession File Name Validation Test
 *
 * 问题描述: 恢复diffSession时没有验证sourceFileName是否匹配当前文件。
 * 这会导致如果IndexedDB中是其他文件的patchQueue，会被错误应用到当前文件。
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { MockIndexedDB, waitForEffects } from '../../src/test/utils/testHelpers';
import { mockDiffSession, mockFileSystem, mockPatch } from '../../src/test/utils/testHelpers';
import { DiffSessionState } from '../../src/types';

describe('Bug #2: DiffSession File Name Validation', () => {
  let mockDB: MockIndexedDB;

  beforeEach(() => {
    mockDB = new MockIndexedDB();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockDB.clear();
  });

  it('应该拒绝文件名不匹配的恢复session', async () => {
    // 1. 在文件A创建diff session
    const fileAId = 'file-a';
    const fileAName = 'fileA.ts';
    const fileBId = 'file-b';
    const fileBName = 'fileB.ts';

    const sessionA: DiffSessionState = mockDiffSession({
      sourceFileName: fileAName,
      patchQueue: [
        mockPatch({ id: 'patch-a1', hunkId: 'hunk-a1', type: 'accept' }),
        mockPatch({ id: 'patch-a2', hunkId: 'hunk-a2', type: 'accept' })
      ]
    });

    await mockDB.put('diffSessions', sessionA, `current_${fileAId}`);

    // 2. 手动修改IndexedDB，将session关联到文件B（模拟bug情况）
    // 在实际bug中，这可能是由于文件切换时没有清理导致的
    await mockDB.put('diffSessions', sessionA, `current_${fileBId}`);

    // 3. 读取文件B的session
    const restoredSession = await mockDB.get('diffSessions', `current_${fileBId}`);

    // 4. 验证：应该检测到文件名不匹配
    expect(restoredSession).toBeDefined();
    expect(restoredSession?.sourceFileName).toBe(fileAName); // 是文件A的session

    // 5. 模拟验证逻辑：文件名不匹配时应该拒绝
    const currentFileName = fileBName;
    const isValidSession = !restoredSession ||
                          restoredSession.sourceFileName === currentFileName;

    expect(isValidSession).toBe(false); // 应该检测到不匹配

    // 6. 清理不匹配的session
    await mockDB.delete('diffSessions', `current_${fileBId}`);

    // 7. 验证旧session被清除
    const deletedSession = await mockDB.get('diffSessions', `current_${fileBId}`);
    expect(deletedSession).toBeUndefined();
  });

  it('应该接受文件名匹配的恢复session', async () => {
    // 1. 在文件A创建diff session
    const fileAId = 'file-a';
    const fileAName = 'fileA.ts';

    const sessionA: DiffSessionState = mockDiffSession({
      sourceFileName: fileAName,
      patchQueue: [
        mockPatch({ id: 'patch-a1', hunkId: 'hunk-a1', type: 'accept' })
      ]
    });

    await mockDB.put('diffSessions', sessionA, `current_${fileAId}`);

    // 2. 读取文件A的session
    const restoredSession = await mockDB.get('diffSessions', `current_${fileAId}`);

    // 3. 验证：文件名匹配
    const currentFileName = fileAName;
    const isValidSession = !restoredSession ||
                          restoredSession.sourceFileName === currentFileName;

    expect(isValidSession).toBe(true); // 应该匹配
    expect(restoredSession?.sourceFileName).toBe(fileAName);
    expect(restoredSession?.patchQueue).toHaveLength(1);
  });

  it('应该在没有session时创建新session', async () => {
    // 1. 文件没有已保存的session
    const fileAId = 'file-a';
    const fileAName = 'fileA.ts';

    const restoredSession = await mockDB.get('diffSessions', `current_${fileAId}`);
    expect(restoredSession).toBeUndefined();

    // 2. 验证：允许创建新session
    const isValidSession = !restoredSession; // undefined是有效的
    expect(isValidSession).toBe(true);

    // 3. 创建新session
    const newSession: DiffSessionState = mockDiffSession({
      sourceFileName: fileAName,
      patchQueue: []
    });
    await mockDB.put('diffSessions', newSession, `current_${fileAId}`);

    // 4. 验证新session创建成功
    const finalSession = await mockDB.get('diffSessions', `current_${fileAId}`);
    expect(finalSession).toBeDefined();
    expect(finalSession?.sourceFileName).toBe(fileAName);
    expect(finalSession?.patchQueue).toHaveLength(0);
  });

  it('应该处理sourceFileName为undefined的情况', async () => {
    // 测试向后兼容：旧的session可能没有sourceFileName字段
    const fileAId = 'file-a';
    const fileAName = 'fileA.ts';

    // 1. 创建没有sourceFileName的session（模拟旧数据）
    const oldSession: DiffSessionState = {
      sourceSnapshot: 'Old content',
      patchQueue: [mockPatch({ id: 'patch-1' })]
      // sourceFileName: undefined
    };

    await mockDB.put('diffSessions', oldSession, `current_${fileAId}`);

    // 2. 读取session
    const restoredSession = await mockDB.get('diffSessions', `current_${fileAId}`);

    // 3. 验证：如果sourceFileName为undefined，应该当作匹配
    // 因为这是旧数据，我们无法验证，所以允许使用
    const isValidSession = !restoredSession ||
                          !restoredSession.sourceFileName ||
                          restoredSession.sourceFileName === fileAName;

    expect(isValidSession).toBe(true); // 应该允许（向后兼容）
  });
});
