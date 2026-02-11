
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
 * A simple line-based diff implementation.
 * Returns an array of DiffLine objects describing the changes.
 */
export const computeLineDiff = (original: string, modified: string): DiffLine[] => {
  const originalLines = original ? original.split(/\r?\n/) : [];
  const modifiedLines = modified ? modified.split(/\r?\n/) : [];

  // If one is empty, it's a full add or full remove
  if (originalLines.length === 0 && modifiedLines.length > 0) {
    return modifiedLines.map((line, i) => ({ type: 'add', content: line, lineNumNew: i + 1 }));
  }
  if (modifiedLines.length === 0 && originalLines.length > 0) {
    return originalLines.map((line, i) => ({ type: 'remove', content: line, lineNumOriginal: i + 1 }));
  }

  // Use a simple LCS (Longest Common Subsequence) based approach or a simplified greedy match
  const diff: DiffLine[] = [];
  let i = 0; // cursor for original
  let j = 0; // cursor for modified

  while (i < originalLines.length || j < modifiedLines.length) {
    // 1. Equal
    if (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
      diff.push({ 
        type: 'equal', 
        content: originalLines[i], 
        lineNumOriginal: i + 1, 
        lineNumNew: j + 1 
      });
      i++;
      j++;
    } 
    // 2. Different
    else {
      // Look ahead to find synchronization point
      let foundSync = false;
      const lookAheadLimit = 50; // Performance safeguard

      // Check if modified has an inserted block
      for (let k = 1; k < lookAheadLimit; k++) {
        if (j + k < modifiedLines.length && originalLines[i] === modifiedLines[j + k]) {
          // Found match ahead in modified -> means lines were inserted
          for (let m = 0; m < k; m++) {
            diff.push({ type: 'add', content: modifiedLines[j + m], lineNumNew: j + m + 1 });
          }
          j += k;
          foundSync = true;
          break;
        }
      }

      if (!foundSync) {
        // Check if original has a deleted block
        for (let k = 1; k < lookAheadLimit; k++) {
          if (i + k < originalLines.length && originalLines[i + k] === modifiedLines[j]) {
             // Found match ahead in original -> means lines were removed
             for (let m = 0; m < k; m++) {
               diff.push({ type: 'remove', content: originalLines[i + m], lineNumOriginal: i + m + 1 });
             }
             i += k;
             foundSync = true;
             break;
          }
        }
      }

      if (!foundSync) {
        if (i < originalLines.length) {
          diff.push({ type: 'remove', content: originalLines[i], lineNumOriginal: i + 1 });
          i++;
        }
        if (j < modifiedLines.length) {
           diff.push({ type: 'add', content: modifiedLines[j], lineNumNew: j + 1 });
           j++;
        }
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

        hunks.push({
            id: Math.random().toString(36).substring(7),
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
