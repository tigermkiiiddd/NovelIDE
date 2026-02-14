import { diffLines, Change } from 'diff';

export interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  content: string;
  lineNumOriginal?: number;
  lineNumNew?: number;
}

export interface DiffHunk {
  id: string;
  type: 'change' | 'unchanged'; // New field to distinguish active diffs from context
  lines: DiffLine[];
  startLineOriginal: number;
  endLineOriginal: number;
  startLineNew: number;
  endLineNew: number;
}

/**
 * Compute line-based diff using jsdiff library (Myers algorithm)
 * This is the same algorithm used by VS Code and Git.
 */
export const computeLineDiff = (original: string, modified: string): DiffLine[] => {
  const diff: DiffLine[] = [];

  // Handle empty content edge cases
  const originalContent = original ?? '';
  const modifiedContent = modified ?? '';

  // Use jsdiff's diffLines (implements Myers algorithm)
  const changes: Change[] = diffLines(originalContent, modifiedContent);

  let origLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    const lines = change.value.split(/\r?\n/).filter((_, idx, arr) =>
      // Filter out empty last element from split
      idx < arr.length - 1 || arr[idx] !== ''
    );

    if (change.added) {
      // Added lines
      for (const line of lines) {
        diff.push({
          type: 'add',
          content: line,
          lineNumNew: newLineNum++
        });
      }
    } else if (change.removed) {
      // Removed lines
      for (const line of lines) {
        diff.push({
          type: 'remove',
          content: line,
          lineNumOriginal: origLineNum++
        });
      }
    } else {
      // Unchanged lines
      for (const line of lines) {
        diff.push({
          type: 'equal',
          content: line,
          lineNumOriginal: origLineNum++,
          lineNumNew: newLineNum++
        });
      }
    }
  }

  return diff;
};

/**
 * Group flat diff lines into interactive hunks (chunks of changes).
 * Returns a sequence of hunks that cover the ENTIRE file content.
 * 'change' hunks contain the diffs + contextLines.
 * 'unchanged' hunks contain the rest of the file.
 */
export const groupDiffIntoHunks = (diffLines: DiffLine[], contextLines = 3): DiffHunk[] => {
    const activeIndices = new Set<number>();
    
    // 1. Identify "Active" lines (Changes + Context)
    diffLines.forEach((line, index) => {
        if (line.type !== 'equal') {
            activeIndices.add(index);
            // Add context before
            for (let i = 1; i <= contextLines; i++) {
                 if (index - i >= 0) activeIndices.add(index - i);
            }
            // Add context after
            for (let i = 1; i <= contextLines; i++) {
                 if (index + i < diffLines.length) activeIndices.add(index + i);
            }
        }
    });

    const hunks: DiffHunk[] = [];
    if (diffLines.length === 0) return hunks;

    let currentHunkLines: DiffLine[] = [];
    let isCurrentHunkActive = activeIndices.has(0);

    const flush = () => {
        if (currentHunkLines.length === 0) return;

        const firstOriginal = currentHunkLines.find(l => l.lineNumOriginal !== undefined);
        const lastOriginal = [...currentHunkLines].reverse().find(l => l.lineNumOriginal !== undefined);
        const firstNew = currentHunkLines.find(l => l.lineNumNew !== undefined);
        const lastNew = [...currentHunkLines].reverse().find(l => l.lineNumNew !== undefined);

        // Generate stable ID based on content hash
        const contentForId = currentHunkLines
            .map(l => `${l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' '}${l.content}`)
            .join('|');
        let hash = 0;
        for (let i = 0; i < contentForId.length; i++) {
            hash = ((hash << 5) - hash) + contentForId.charCodeAt(i);
            hash |= 0;
        }
        const stableId = `hunk_${Math.abs(hash).toString(36)}`;

        hunks.push({
            id: stableId,
            lines: [...currentHunkLines],
            startLineOriginal: firstOriginal?.lineNumOriginal || 0,
            endLineOriginal: lastOriginal?.lineNumOriginal || 0,
            startLineNew: firstNew?.lineNumNew || 0,
            endLineNew: lastNew?.lineNumNew || 0,
            type: isCurrentHunkActive ? 'change' : 'unchanged'
        });
        currentHunkLines = [];
    };

    diffLines.forEach((line, index) => {
        const isActive = activeIndices.has(index);
        
        // If state flips, start a new hunk
        if (isActive !== isCurrentHunkActive) {
            flush();
            isCurrentHunkActive = isActive;
        }
        currentHunkLines.push(line);
    });
    flush();

    return hunks;
};

// Helper to simulate patch application for diff preview (moved from useAgent.ts)
// Updated to accept string[] for newContent to unambiguously handle empty content vs blank lines
export const applyPatchInMemory = (original: string, startLine: number, endLine: number, newContent: string | string[]): string => {
    const allLines = original.split(/\r?\n/);
    const totalLines = allLines.length;
    const safeEndLine = Math.min(Math.max(startLine, endLine), totalLines);
    
    const before = allLines.slice(0, startLine - 1);
    const after = allLines.slice(safeEndLine);
    
    let newLines: string[] = [];
    if (Array.isArray(newContent)) {
        newLines = newContent;
    } else {
        newLines = newContent ? newContent.split(/\r?\n/) : [];
    }

    return [...before, ...newLines, ...after].join('\n');
};

/**
 * Reverts a specific hunk in the "New Content" string to match the "Old Content".
 * effectively "Rejecting" a hunk by making the new content same as old for that block.
 */
export const rejectHunkInNewContent = (
    fullNewContent: string, 
    fullOldContent: string, 
    hunk: DiffHunk
): string => {
    // This function attempts to revert `fullNewContent` to `fullOldContent` ONLY for the lines in `hunk`.
    
    const newLines = fullNewContent.split(/\r?\n/);
    const oldLines = fullOldContent.split(/\r?\n/);
    
    const startNewIndex = hunk.startLineNew - 1; 
    const endNewIndex = hunk.endLineNew - 1; 
    
    const startOldIndex = hunk.startLineOriginal - 1;
    const endOldIndex = hunk.endLineOriginal - 1;
    
    // Validate indices
    if (startNewIndex < 0 || endNewIndex >= newLines.length) return fullNewContent;
    
    // Extract the original segment
    let originalSegment: string[] = [];
    
    if (hunk.startLineOriginal === 0 && hunk.endLineOriginal === 0) {
        // It was a pure addition in New. Original had nothing here.
        // To reject, we replace with empty array.
        originalSegment = [];
    } else {
        // Normal case
        if (startOldIndex >= 0 && endOldIndex < oldLines.length) {
            originalSegment = oldLines.slice(startOldIndex, endOldIndex + 1);
        }
    }
    
    const before = newLines.slice(0, startNewIndex);
    const after = newLines.slice(endNewIndex + 1);
    
    return [...before, ...originalSegment, ...after].join('\n');
};
