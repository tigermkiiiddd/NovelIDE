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
import { applyEditsSimple } from './patchUtils';

/**
 * Apply all patches in the queue to the source snapshot
 * Returns the computed content that should be displayed
 */
export const applyPatchQueue = (session: DiffSessionState): string => {
  let result = session.sourceSnapshot;

  // 稳定排序：时间戳 + ID
  const sortedPatches = [...session.patchQueue].sort((a, b) => {
    const timeDiff = a.timestamp - b.timestamp;
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  for (const patch of sortedPatches) {
    if (patch.type === 'accept') {
      // 使用字符串匹配替代行号定位
      const index = result.indexOf(patch.oldContent);
      if (index !== -1) {
        result = result.slice(0, index) +
                 patch.newContent +
                 result.slice(index + patch.oldContent.length);
      } else {
        console.warn('[applyPatchQueue] 未找到匹配内容，跳过 patch:', patch.id);
      }
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
  console.log('[mergePendingChanges] Starting merge:', {
    baseContentLength: baseContent.length,
    changesCount: changes.length,
    basePreview: baseContent.substring(0, 100)
  });

  if (changes.length === 0) return baseContent;

  // Sort by timestamp to apply changes in order
  const sortedChanges = [...changes].sort((a, b) => a.timestamp - b.timestamp);

  let result = baseContent;

  for (const change of sortedChanges) {
    console.log('[mergePendingChanges] Processing change:', {
      toolName: change.toolName,
      newContentLength: change.newContent?.length,
      resultBeforeLength: result.length
    });

    if (change.toolName === 'updateFile' || change.toolName === 'createFile') {
      // Full content replacement for existing file
      // createFile on existing file is treated as updateFile (兜底处理旧数据)
      if (change.toolName === 'createFile') {
        console.warn('[mergePendingChanges] createFile on existing file, treating as updateFile (legacy data)');
      }
      result = change.newContent || '';
      console.log('[mergePendingChanges] After updateFile/createFile:', {
        resultLength: result.length,
        resultPreview: result.substring(0, 100)
      });
    } else if (change.toolName === 'patchFile') {
      // Apply patch edits using common utility
      const edits = change.args?.edits || [];
      if (edits.length > 0) {
        result = applyEditsSimple(result, edits);
        console.log('[mergePendingChanges] After patchFile:', {
          editsCount: edits.length,
          resultLength: result.length,
          resultPreview: result.substring(0, 100)
        });
      }
    }
  }

  console.log('[mergePendingChanges] Final result:', {
    resultLength: result.length,
    changedFromBase: result !== baseContent,
    resultPreview: result.substring(0, 100)
  });

  return result;
};
