/**
 * Patch Queue Utilities for Diff Mode
 *
 * This module provides utilities for managing the patch queue system used in diff mode.
 * The patch queue allows users to:
 * 1. See a snapshot of the file when entering diff mode (immutable baseline)
 * 2. Apply/reject hunks which are added to a queue
 * 3. Undo operations (Ctrl+Z) by removing from the queue
 * 4. See real-time preview of all applied patches
 */

import { FilePatch, DiffSessionState } from '../types';
import { applyPatchInMemory } from './diffUtils';

/**
 * Apply all patches in the queue to the source snapshot
 * Returns the computed content that should be displayed
 */
export const applyPatchQueue = (session: DiffSessionState): string => {
  let result = session.sourceSnapshot;

  // Sort patches by timestamp to ensure correct order
  const sortedPatches = [...session.patchQueue].sort((a, b) => a.timestamp - b.timestamp);

  for (const patch of sortedPatches) {
    if (patch.type === 'accept') {
      // Accept: apply the new content
      result = applyPatchInMemory(
        result,
        patch.startLineOriginal === 0 ? 1 : patch.startLineOriginal,
        patch.endLineOriginal === 0 ? 0 : patch.endLineOriginal,
        patch.newContent
      );
    }
    // Reject: do nothing, keep original content
  }

  return result;
};

/**
 * Extract the new content from a hunk's lines
 * This is what gets applied when accepting a hunk
 */
export const extractHunkContent = (hunkLines: Array<{type: string; content: string}>): string => {
  return hunkLines
    .filter(l => l.type !== 'remove')
    .map(l => l.content)
    .join('\n');
};

/**
 * Generate a unique ID for a new patch
 */
export const generatePatchId = (): string => {
  return `patch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Check if all hunks have been processed
 * Returns true if there are no remaining changes between source and computed content
 */
export const areAllHunksProcessed = (
  sourceSnapshot: string,
  computedContent: string,
  targetContent: string
): boolean => {
  // If computed content matches target, all hunks are processed
  return computedContent === targetContent;
};

/**
 * Merge multiple pending changes for the same file into a single final content
 * This handles the case where AI made multiple changes to the same file
 */
export const mergePendingChanges = (
  baseContent: string,
  changes: Array<{
    toolName: string;
    newContent: string | null;
    args?: any;
    timestamp: number;
  }>
): string => {
  if (changes.length === 0) return baseContent;

  // Sort by timestamp to apply changes in order
  const sortedChanges = [...changes].sort((a, b) => a.timestamp - b.timestamp);

  let result = baseContent;

  for (const change of sortedChanges) {
    if (change.toolName === 'updateFile') {
      // Full content replacement for existing file
      result = change.newContent || '';
    } else if (change.toolName === 'createFile') {
      // createFile should NOT be merged into existing file content
      // It creates a new file, not modify current one
      // If this happens, it's a bug in caller logic
      console.warn('[mergePendingChanges] createFile operation in merge - this should not happen!', change);
      continue;
    } else if (change.toolName === 'patchFile') {
      // Apply patch edits
      const edits = change.args?.edits || [];
      if (edits.length > 0) {
        // Sort edits in reverse order by startLine to apply correctly
        const sortedEdits = [...edits].sort((a, b) => b.startLine - a.startLine);
        let lines = result.split('\n');

        for (const edit of sortedEdits) {
          const startIdx = Math.max(0, edit.startLine - 1);
          const deleteCount = Math.max(0, edit.endLine - edit.startLine + 1);
          const newLines = edit.newContent ? edit.newContent.split('\n') : [];
          lines.splice(startIdx, deleteCount, ...newLines);
        }

        result = lines.join('\n');
      }
    }
  }

  return result;
};
