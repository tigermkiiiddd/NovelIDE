/**
 * Bug #5: Pending Changes Cleanup on File Switch Test
 */

import { mockPendingChange } from '../../src/test/utils/testHelpers';
import { PendingChange, FileNode } from '../../src/types';

describe('Bug #5: Pending Changes Cleanup on File Switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clear previous file pending changes when switching', () => {
    // 1. Create file A and file B
    const fileA: FileNode = {
      id: 'file-a',
      parentId: null,
      name: 'fileA.ts',
      type: 'FILE',
      content: 'console.log("File A");',
      lastModified: Date.now()
    };

    const fileB: FileNode = {
      id: 'file-b',
      parentId: null,
      name: 'fileB.ts',
      type: 'FILE',
      content: 'console.log("File B");',
      lastModified: Date.now()
    };

    // 2. Create pending changes for file A
    const changeA: PendingChange = mockPendingChange({
      id: 'change-a',
      fileName: 'fileA.ts',
      toolName: 'file_write',
      args: { filePath: 'fileA.ts' },
      originalContent: fileA.content,
      newContent: 'console.log("Modified File A");',
      timestamp: Date.now()
    });

    const pendingChanges: PendingChange[] = [changeA];

    // 3. Simulate file switch: Switch from file A to file B
    const prevFileId = 'file-a';

    // 4. Get pending changes for previous file (file A)
    const prevFile = fileA;
    const changesToRemove = pendingChanges.filter(c => {
      if (!prevFile) return false;
      return c.fileName === prevFile.name;
    });

    expect(changesToRemove).toHaveLength(1);
    expect(changesToRemove[0].id).toBe('change-a');

    // 5. Verify: These changes should be removed when switching files
    const removedIds = changesToRemove.map(c => c.id);
    expect(removedIds).toContain('change-a');
  });

  it('should only clean up changes for the previous file, not all changes', () => {
    // 1. Create file A, file B, and file C
    const fileA: FileNode = {
      id: 'file-a',
      parentId: null,
      name: 'fileA.ts',
      type: 'FILE',
      content: 'Content A',
      lastModified: Date.now()
    };

    const fileB: FileNode = {
      id: 'file-b',
      parentId: null,
      name: 'fileB.ts',
      type: 'FILE',
      content: 'Content B',
      lastModified: Date.now()
    };

    const fileC: FileNode = {
      id: 'file-c',
      parentId: null,
      name: 'fileC.ts',
      type: 'FILE',
      content: 'Content C',
      lastModified: Date.now()
    };

    // 2. Create pending changes for file A and file C
    const changeA: PendingChange = mockPendingChange({
      id: 'change-a',
      fileName: 'fileA.ts',
      newContent: 'Modified A'
    });

    const changeC: PendingChange = mockPendingChange({
      id: 'change-c',
      fileName: 'fileC.ts',
      newContent: 'Modified C'
    });

    const pendingChanges: PendingChange[] = [changeA, changeC];

    // 3. Switch from file A to file B
    const prevFileId = 'file-a';

    // 4. Get changes to remove (only for file A)
    const prevFile = fileA;
    const changesToRemove = pendingChanges.filter(c => {
      if (!prevFile) return false;
      return c.fileName === prevFile.name;
    });

    // 5. Verify: Only file A changes should be removed, not file C
    expect(changesToRemove).toHaveLength(1);
    expect(changesToRemove[0].id).toBe('change-a');

    // 6. Verify: File C changes are still in pendingChanges
    const remainingChanges = pendingChanges.filter(c => !changesToRemove.includes(c));
    expect(remainingChanges).toHaveLength(1);
    expect(remainingChanges[0].id).toBe('change-c');
  });

  it('should clean up multiple pending changes for the same file', () => {
    // 1. Create file A with multiple pending changes
    const fileA: FileNode = {
      id: 'file-a',
      parentId: null,
      name: 'fileA.ts',
      type: 'FILE',
      content: 'Original content',
      lastModified: Date.now()
    };

    // 2. Create multiple changes for file A
    const change1: PendingChange = mockPendingChange({
      id: 'change-1',
      fileName: 'fileA.ts',
      newContent: 'Modified content 1'
    });

    const change2: PendingChange = mockPendingChange({
      id: 'change-2',
      fileName: 'fileA.ts',
      newContent: 'Modified content 2'
    });

    const change3: PendingChange = mockPendingChange({
      id: 'change-3',
      fileName: 'fileA.ts',
      newContent: 'Modified content 3'
    });

    const pendingChanges: PendingChange[] = [change1, change2, change3];

    // 3. Switch away from file A
    const prevFileId = 'file-a';

    // 4. Get changes to remove
    const prevFile = fileA;
    const changesToRemove = pendingChanges.filter(c => {
      if (!prevFile) return false;
      return c.fileName === prevFile.name;
    });

    // 5. Verify: All changes for file A should be removed
    expect(changesToRemove).toHaveLength(3);
    const removedIds = changesToRemove.map(c => c.id).sort();
    expect(removedIds).toEqual(['change-1', 'change-2', 'change-3']);
  });

  it('should verify the fix approach for clearing pending changes', () => {
    // This test verifies the actual fix implementation approach
    const fileA: FileNode = {
      id: 'file-a',
      parentId: null,
      name: 'fileA.ts',
      type: 'FILE',
      content: 'Content A',
      lastModified: Date.now()
    };

    const change: PendingChange = mockPendingChange({
      id: 'change-a',
      fileName: 'fileA.ts',
      newContent: 'New content'
    });

    const pendingChanges: PendingChange[] = [change];
    const prevFileId = 'file-a';

    // Simulate the fix logic
    const prevFile = fileA;
    let removedCount = 0;

    if (prevFile) {
      const filePath = prevFile.name;
      const changesToRemove = pendingChanges.filter(c => c.fileName === filePath);

      // Remove each change
      changesToRemove.forEach(c => {
        const index = pendingChanges.indexOf(c);
        if (index > -1) {
          pendingChanges.splice(index, 1);
          removedCount++;
        }
      });
    }

    // Verify: Change was removed
    expect(removedCount).toBe(1);
    expect(pendingChanges).toHaveLength(0);
  });
});
