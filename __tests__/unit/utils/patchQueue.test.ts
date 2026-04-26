import { applyPatchQueue, mergePendingChanges } from '../../../utils/patchQueue';
import { DiffSessionState } from '../../../types';

describe('patchQueue utilities', () => {
  describe('mergePendingChanges', () => {
    it('merges multiple write changes using the latest content', () => {
      const result = mergePendingChanges('original', [
        {
          id: 'a',
          toolName: 'write',
          newContent: 'first rewrite',
          timestamp: 1,
        },
        {
          id: 'b',
          toolName: 'write',
          newContent: 'second rewrite',
          timestamp: 2,
        },
      ]);

      expect(result).toBe('second rewrite');
    });

    it('applies edit changes to the accumulated shadow content after write', () => {
      const result = mergePendingChanges('A\nB', [
        {
          id: 'a',
          toolName: 'write',
          newContent: 'A\nB\nC',
          timestamp: 1,
        },
        {
          id: 'b',
          toolName: 'edit',
          newContent: 'A\nB\nD',
          args: {
            edits: [
              { mode: 'single', oldContent: 'C', newContent: 'D' },
            ],
          },
          timestamp: 2,
        },
      ]);

      expect(result).toBe('A\nB\nD');
    });

    it('applies consecutive edit changes against shadow content', () => {
      const result = mergePendingChanges('A\nB', [
        {
          id: 'a',
          toolName: 'edit',
          newContent: 'A\nC',
          args: {
            edits: [
              { mode: 'single', oldContent: 'B', newContent: 'C' },
            ],
          },
          timestamp: 1,
        },
        {
          id: 'b',
          toolName: 'edit',
          newContent: 'A\nD',
          args: {
            edits: [
              { mode: 'single', oldContent: 'C', newContent: 'D' },
            ],
          },
          timestamp: 2,
        },
      ]);

      expect(result).toBe('A\nD');
    });

    it('preserves empty write content instead of falling back to base content', () => {
      const result = mergePendingChanges('delete me', [
        {
          id: 'a',
          toolName: 'write',
          newContent: '',
          timestamp: 1,
        },
      ]);

      expect(result).toBe('');
    });

    it('keeps legacy tool names compatible', () => {
      const result = mergePendingChanges('A\nB', [
        {
          id: 'a',
          toolName: 'updateFile',
          newContent: 'A\nB\nC',
          timestamp: 1,
        },
        {
          id: 'b',
          toolName: 'patchFile',
          newContent: 'A\nB\nD',
          args: {
            edits: [
              { mode: 'single', oldContent: 'C', newContent: 'D' },
            ],
          },
          timestamp: 2,
        },
      ]);

      expect(result).toBe('A\nB\nD');
    });
  });

  describe('applyPatchQueue', () => {
    it('uses hunk line position before falling back to first string match', () => {
      const session: DiffSessionState = {
        sourceSnapshot: 'repeat\nsame\nmiddle\nrepeat\nsame',
        patchQueue: [
          {
            id: 'patch-second-repeat',
            type: 'accept',
            hunkId: 'hunk-second-repeat',
            startLineOriginal: 4,
            endLineOriginal: 5,
            oldContent: 'repeat\nsame',
            newContent: 'repeat\nchanged',
            timestamp: 1,
          },
        ],
      };

      expect(applyPatchQueue(session)).toBe('repeat\nsame\nmiddle\nrepeat\nchanged');
    });
  });
});
