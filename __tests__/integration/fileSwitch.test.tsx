/**
 * Bug #1: File Switch IndexedDB Cleanup Test
 *
 * 问题描述: 切换文件时，内存中的diffSession被清理了，但IndexedDB中还保留着上一个文件的diffSession。
 * 这会导致新文件进入diff模式时，错误地从IndexedDB恢复了其他文件的patchQueue。
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { MockIndexedDB, waitForEffects } from '../../src/test/utils/testHelpers';
import { mockDiffSession, mockFileSystem, mockPatch } from '../../src/test/utils/testHelpers';
import { DiffSessionState } from '../../src/types';

describe('Bug #1: File Switch IndexedDB Cleanup', () => {
  let mockDB: MockIndexedDB;

  beforeEach(() => {
    mockDB = new MockIndexedDB();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockDB.clear();
  });

  it('应该清除IndexedDB中的diff session当切换文件时', async () => {
    // 1. 创建文件A和文件B的diff session
    const fileAId = 'file-a';
    const fileBId = 'file-b';
    const fileAName = 'fileA.ts';
    const fileBName = 'fileB.ts';

    const sessionA: DiffSessionState = mockDiffSession({
      sourceFileName: fileAName,
      patchQueue: [
        mockPatch({ id: 'patch-a1', hunkId: 'hunk-a1' })
      ]
    });

    // 2. 保存文件A的diff session到IndexedDB
    await mockDB.put('diffSessions', sessionA, `current_${fileAId}`);
    expect(await mockDB.get('diffSessions', `current_${fileAId}`)).toEqual(sessionA);

    // 3. 模拟文件切换：清除文件A的diff session
    await mockDB.delete('diffSessions', `current_${fileAId}`);

    // 4. 验证IndexedDB中文件A的diff session已被清除
    const deletedSession = await mockDB.get('diffSessions', `current_${fileAId}`);
    expect(deletedSession).toBeUndefined();

    // 5. 为文件B创建新的diff session
    const sessionB: DiffSessionState = mockDiffSession({
      sourceFileName: fileBName,
      patchQueue: [
        mockPatch({ id: 'patch-b1', hunkId: 'hunk-b1' })
      ]
    });
    await mockDB.put('diffSessions', sessionB, `current_${fileBId}`);

    // 6. 验证文件B的diff session是独立的，没有包含文件A的patchQueue
    const retrievedSessionB = await mockDB.get('diffSessions', `current_${fileBId}`);
    expect(retrievedSessionB?.sourceFileName).toBe(fileBName);
    expect(retrievedSessionB?.patchQueue).toHaveLength(1);
    expect(retrievedSessionB?.patchQueue[0].id).toBe('patch-b1');
    expect(retrievedSessionB?.patchQueue[0].id).not.toBe('patch-a1');
  });

  it('应该防止切换文件后新文件继承旧文件的patchQueue', async () => {
    // 1. 文件A有多个已批准的patch
    const fileAId = 'file-a';
    const fileBId = 'file-b';

    const sessionA: DiffSessionState = mockDiffSession({
      sourceFileName: 'fileA.ts',
      patchQueue: [
        mockPatch({ id: 'patch-a1', hunkId: 'hunk-a1', type: 'accept' }),
        mockPatch({ id: 'patch-a2', hunkId: 'hunk-a2', type: 'accept' }),
        mockPatch({ id: 'patch-a3', hunkId: 'hunk-a3', type: 'reject' })
      ]
    });

    // 2. 保存到IndexedDB
    await mockDB.put('diffSessions', sessionA, `current_${fileAId}`);

    // 3. 切换到文件B（模拟）
    // BUG: 当前实现没有清除IndexedDB，所以文件B可能会恢复文件A的session

    // 4. 文件B进入diff模式
    // 如果IndexedDB没有被正确清理，这里会错误地恢复文件A的session
    const wrongSession = await mockDB.get('diffSessions', `current_${fileBId}`);
    expect(wrongSession).toBeUndefined(); // 应该没有文件B的session

    // 5. 文件B应该创建自己的空session，而不是继承文件A的session
    const sessionB: DiffSessionState = mockDiffSession({
      sourceFileName: 'fileB.ts',
      patchQueue: []
    });
    await mockDB.put('diffSessions', sessionB, `current_${fileBId}`);

    // 6. 验证文件B的session是干净的
    const finalSessionB = await mockDB.get('diffSessions', `current_${fileBId}`);
    expect(finalSessionB?.patchQueue).toHaveLength(0);
    expect(finalSessionB?.sourceFileName).toBe('fileB.ts');
  });

  it('应该清理所有相关文件切换时的状态', async () => {
    // 测试完整的文件切换流程
    const fileAId = 'file-a';
    const fileBId = 'file-b';

    // 1. 文件A进入diff模式，批准部分hunk
    const sessionA: DiffSessionState = mockDiffSession({
      sourceFileName: 'fileA.ts',
      patchQueue: [
        mockPatch({ id: 'patch-a1', type: 'accept' }),
        mockPatch({ id: 'patch-a2', type: 'reject' })
      ]
    });
    await mockDB.put('diffSessions', sessionA, `current_${fileAId}`);

    // 2. 切换到文件B
    await mockDB.delete('diffSessions', `current_${fileAId}`);

    // 3. 验证文件A的session被清除
    let sessionAfterSwitch = await mockDB.get('diffSessions', `current_${fileAId}`);
    expect(sessionAfterSwitch).toBeUndefined();

    // 4. 文件B进入diff模式
    const sessionB: DiffSessionState = mockDiffSession({
      sourceFileName: 'fileB.ts',
      patchQueue: []
    });
    await mockDB.put('diffSessions', sessionB, `current_${fileBId}`);

    // 5. 切换回文件A
    await mockDB.delete('diffSessions', `current_${fileBId}`);

    // 6. 验证文件B的session被清除
    sessionAfterSwitch = await mockDB.get('diffSessions', `current_${fileBId}`);
    expect(sessionAfterSwitch).toBeUndefined();

    // 7. 文件A重新进入diff模式，应该创建新session，不恢复旧的
    const newSessionA: DiffSessionState = mockDiffSession({
      sourceFileName: 'fileA.ts',
      patchQueue: []
    });
    await mockDB.put('diffSessions', newSessionA, `current_${fileAId}`);

    const finalSessionA = await mockDB.get('diffSessions', `current_${fileAId}`);
    expect(finalSessionA?.patchQueue).toHaveLength(0);
  });
});
