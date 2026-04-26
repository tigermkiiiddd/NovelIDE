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
import { applyEditsSimple } from './patchUtils';

type PendingChangeLike = {
  id?: string;
  toolName: string;
  newContent: string | null;
  args?: any;
  timestamp: number;
};

const normalizeToolName = (toolName: string): 'write' | 'edit' | 'delete' | 'other' => {
  switch (toolName) {
    case 'write':
    case 'createFile':
    case 'updateFile':
      return 'write';
    case 'edit':
    case 'patchFile':
      return 'edit';
    case 'deleteFile':
      return 'delete';
    default:
      return 'other';
  }
};

const splitLines = (content: string): string[] => {
  if (content === '') return [];
  return content.split(/\r?\n/);
};

const replaceByExactText = (content: string, oldContent: string, newContent: string): string | null => {
  const index = content.indexOf(oldContent);
  if (index === -1) return null;
  return content.slice(0, index) + newContent + content.slice(index + oldContent.length);
};

const applyAcceptedPatch = (content: string, patch: FilePatch): string => {
  const contentLines = splitLines(content);
  const oldLines = splitLines(patch.oldContent);
  const newLines = splitLines(patch.newContent);
  const startIndex = Math.max(0, patch.startLineOriginal - 1);

  // Prefer the hunk's line window. This avoids applying a repeated paragraph to
  // the first identical occurrence elsewhere in the file.
  if (startIndex <= contentLines.length) {
    const candidate = contentLines.slice(startIndex, startIndex + oldLines.length).join('\n');
    if (candidate === patch.oldContent) {
      const nextLines = [...contentLines];
      nextLines.splice(startIndex, oldLines.length, ...newLines);
      return nextLines.join('\n');
    }
  }

  // Fallback for old sessions whose line numbers may no longer be reliable.
  const fallback = replaceByExactText(content, patch.oldContent, patch.newContent);
  if (fallback !== null) return fallback;

  console.warn('[applyPatchQueue] 未找到匹配内容，跳过 patch:', patch.id);
  return content;
};

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
      result = applyAcceptedPatch(result, patch);
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
  changes: PendingChangeLike[]
): string => {
  console.log('[mergePendingChanges] Starting merge:', {
    baseContentLength: baseContent.length,
    changesCount: changes.length,
    basePreview: baseContent.substring(0, 100)
  });

  if (changes.length === 0) return baseContent;

  // Sort by timestamp + id to apply changes in a deterministic order.
  const sortedChanges = [...changes].sort((a, b) => {
    const timeDiff = a.timestamp - b.timestamp;
    if (timeDiff !== 0) return timeDiff;
    return (a.id || '').localeCompare(b.id || '');
  });

  let result = baseContent;

  for (const change of sortedChanges) {
    console.log('[mergePendingChanges] Processing change:', {
      toolName: change.toolName,
      newContentLength: change.newContent?.length,
      resultBeforeLength: result.length
    });

    const normalizedTool = normalizeToolName(change.toolName);

    if (normalizedTool === 'write') {
      // Full content replacement for existing file. `write` is the current tool;
      // createFile/updateFile are legacy-compatible pending changes.
      result = change.newContent ?? '';
      console.log('[mergePendingChanges] After write:', {
        resultLength: result.length,
        resultPreview: result.substring(0, 100)
      });
    } else if (normalizedTool === 'edit') {
      // Apply edit operations against the accumulated shadow content.
      const edits = change.args?.edits || [];
      if (edits.length > 0) {
        result = applyEditsSimple(result, edits);
        console.log('[mergePendingChanges] After edit:', {
          editsCount: edits.length,
          resultLength: result.length,
          resultPreview: result.substring(0, 100)
        });
      }
    } else if (normalizedTool === 'delete') {
      result = '';
      console.log('[mergePendingChanges] After delete:', { resultLength: result.length });
    }
  }

  console.log('[mergePendingChanges] Final result:', {
    resultLength: result.length,
    changedFromBase: result !== baseContent,
    resultPreview: result.substring(0, 100)
  });

  return result;
};
