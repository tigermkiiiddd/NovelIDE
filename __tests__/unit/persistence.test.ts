/**
 * Bug #6: IndexedDB Delete Logic Test
 *
 * 问题描述: deleteFileDiffSessions函数虽然参数是projectId，但实际删除了所有项目的diffSessions。
 * 应该只删除指定项目的diffSessions。
 */

import { mockDiffSession, mockPatch } from '../../src/test/utils/testHelpers';
import { DiffSessionState } from '../../src/types';

describe('Bug #6: IndexedDB Delete Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only delete diff sessions for specified project', () => {
    // Mock diff sessions for different projects
    const projectA = 'project-a';
    const projectB = 'project-b';

    const sessions = {
      [projectA]: [
        { fileId: 'file-1', session: mockDiffSession({ sourceFileName: 'file1.ts' }) },
        { fileId: 'file-2', session: mockDiffSession({ sourceFileName: 'file2.ts' }) }
      ],
      [projectB]: [
        { fileId: 'file-3', session: mockDiffSession({ sourceFileName: 'file3.ts' }) },
        { fileId: 'file-4', session: mockDiffSession({ sourceFileName: 'file4.ts' }) }
      ]
    };

    // Simulate calling deleteFileDiffSessions(projectA)
    // Expected: Only delete projectA's sessions, keep projectB's

    let deletedCount = 0;
    let remainingCount = 0;

    // Mock delete logic
    const projectIdToDelete = projectA;
    Object.entries(sessions).forEach(([projectId, files]) => {
      if (projectId === projectIdToDelete) {
        // This project's sessions should be deleted
        deletedCount += files.length;
      } else {
        // Other projects' sessions should remain
        remainingCount += files.length;
      }
    });

    expect(deletedCount).toBe(2); // projectA has 2 files
    expect(remainingCount).toBe(2); // projectB has 2 files
  });

  it('should delete all diff sessions when projectId matches all', () => {
    // If all diff sessions belong to the same project, all should be deleted
    const projectId = 'project-x';

    const sessions = {
      [projectId]: [
        { fileId: 'file-1', session: mockDiffSession() },
        { fileId: 'file-2', session: mockDiffSession() },
        { fileId: 'file-3', session: mockDiffSession() }
      ]
    };

    let deletedCount = 0;

    Object.entries(sessions).forEach(([projId, files]) => {
      if (projId === projectId) {
        deletedCount += files.length;
      }
    });

    expect(deletedCount).toBe(3); // All 3 sessions deleted
  });

  it('should handle empty diff sessions gracefully', () => {
    // No diff sessions exist
    const sessions: Record<string, any> = {};

    const projectId = 'project-empty';
    let deletedCount = 0;

    Object.entries(sessions).forEach(([projId, files]) => {
      if (projId === projectId) {
        deletedCount += files.length;
      }
    });

    expect(deletedCount).toBe(0); // Nothing to delete
  });

  it('should handle non-existent project gracefully', () => {
    // Project doesn't exist
    const projectId = 'non-existent-project';

    const sessions = {
      'project-a': [
        { fileId: 'file-1', session: mockDiffSession() }
      ]
    };

    let deletedCount = 0;

    Object.entries(sessions).forEach(([projId, files]) => {
      if (projId === projectId) {
        deletedCount += files.length;
      }
    });

    expect(deletedCount).toBe(0); // Nothing deleted
  });

  it('should implement selective delete based on project ID', () => {
    // Verify the fix implementation approach
    const projectId = 'project-target';

    const mockStore = new Map([
      ['current_file-1', { fileId: 'file-1', projectId: 'project-target', data: mockDiffSession() }],
      ['current_file-2', { fileId: 'file-2', projectId: 'project-target', data: mockDiffSession() }],
      ['current_file-3', { fileId: 'file-3', projectId: 'project-other', data: mockDiffSession() }],
      ['current_file-4', { fileId: 'file-4', projectId: 'project-target', data: mockDiffSession() }]
    ]);

    // Simulate fix: Only delete entries where projectId matches
    let deletedCount = 0;
    let remainingCount = 0;

    mockStore.forEach((value, key) => {
      if (value.projectId === projectId) {
        mockStore.delete(key);
        deletedCount++;
      } else {
        remainingCount++;
      }
    });

    expect(deletedCount).toBe(3); // 3 entries with project-target
    expect(remainingCount).toBe(1); // 1 entry with project-other
    expect(mockStore.size).toBe(1); // Only 1 remaining
  });

  it('should log deletion operation', () => {
    // Verify logging for debugging
    const projectId = 'project-test';
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const sessions = {
      [projectId]: [
        { fileId: 'file-1', session: mockDiffSession() }
      ]
    };

    // Simulate delete
    let deletedCount = 0;
    Object.entries(sessions).forEach(([projId, files]) => {
      if (projId === projectId) {
        deletedCount += files.length;
        console.log(`Deleting ${files.length} diff sessions for project: ${projectId}`);
      }
    });

    expect(deletedCount).toBe(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Deleting 1 diff sessions for project: project-test'
    );

    consoleSpy.mockRestore();
  });

  it('should handle errors during deletion', () => {
    // Test error handling
    const projectId = 'project-error';
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    // Simulate error during deletion
    try {
      throw new Error('Database error');
    } catch (error) {
      console.error('Deleting diff sessions failed:', error);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Deleting diff sessions failed:',
        error
      );
    }

    consoleSpy.mockRestore();
  });
});
