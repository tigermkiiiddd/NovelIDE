
export interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  content: string;
  lineNumOriginal?: number;
  lineNumNew?: number;
}

export interface DiffHunk {
  id: string;
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
 * Contiguous changes are grouped. Equal lines separate groups.
 */
export const groupDiffIntoHunks = (diffLines: DiffLine[]): DiffHunk[] => {
    const hunks: DiffHunk[] = [];
    let currentHunkLines: DiffLine[] = [];
    
    // We want to group contiguous 'add' or 'remove' lines. 
    // 'equal' lines break the groups.
    
    // Helper to flush current hunk
    const flush = () => {
        if (currentHunkLines.length > 0) {
             const first = currentHunkLines[0];
             const last = currentHunkLines[currentHunkLines.length - 1];
             
             // Calculate simplistic range
             const startLineOriginal = currentHunkLines.find(l => l.lineNumOriginal)?.lineNumOriginal || 0;
             const endLineOriginal = [...currentHunkLines].reverse().find(l => l.lineNumOriginal)?.lineNumOriginal || 0;
             const startLineNew = currentHunkLines.find(l => l.lineNumNew)?.lineNumNew || 0;
             const endLineNew = [...currentHunkLines].reverse().find(l => l.lineNumNew)?.lineNumNew || 0;

             hunks.push({
                 id: Math.random().toString(36).substring(7),
                 lines: [...currentHunkLines],
                 startLineOriginal,
                 endLineOriginal,
                 startLineNew,
                 endLineNew
             });
             currentHunkLines = [];
        }
    };

    diffLines.forEach((line) => {
        if (line.type === 'equal') {
            flush(); // Context break
        } else {
            currentHunkLines.push(line);
        }
    });
    flush(); // Final flush

    return hunks;
};

// Helper to simulate patch application for diff preview (moved from useAgent.ts)
export const applyPatchInMemory = (original: string, startLine: number, endLine: number, newContent: string): string => {
    const allLines = original.split(/\r?\n/);
    const totalLines = allLines.length;
    const safeEndLine = Math.min(Math.max(startLine, endLine), totalLines);
    
    const before = allLines.slice(0, startLine - 1);
    const after = allLines.slice(safeEndLine);
    const newLines = newContent.split(/\r?\n/);

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
    const newLines = fullNewContent.split(/\r?\n/);
    const oldLines = fullOldContent.split(/\r?\n/);
    
    // Logic: We need to replace the lines in 'newLines' identified by the hunk
    // with the lines from 'oldLines' identified by the hunk.
    
    // The hunk tells us which lines in the NEW content are affected (hunk.startLineNew to hunk.endLineNew)
    // And which lines in the OLD content they corresponded to (hunk.startLineOriginal to hunk.endLineOriginal)
    
    // If it was a pure ADD (startLineOriginal is 0/undefined context), we just remove lines from New.
    // If it was a pure REMOVE (startLineNew is 0/undefined context), we insert lines from Old into New.
    
    // But since line numbers in Hunk are 1-based and absolute to the *files passed to diff*,
    // we can use them directly if we are careful.

    // 1. Identify where in New Content to splice
    // Note: Diff line numbers are stable relative to the content generated.
    
    const linesToInsertFromOld = hunk.lines
        .filter(l => l.type === 'remove')
        .map(l => l.content);
        
    // Identify range to remove from New
    // Hunk might contain adds and removes mixed. 
    // The 'Add' lines in hunk exist in NewContent. The 'Remove' lines do not exist in NewContent.
    
    // Actually, simpler logic:
    // We are replacing the "New Version of this Hunk" with the "Old Version of this Hunk".
    // "New Version of Hunk" = All lines in hunk where type='add' (or implicitly lines that replaced removes).
    // "Old Version of Hunk" = All lines in hunk where type='remove'.
    
    // We need to find the splice index in newLines.
    // The hunk.startLineNew indicates where the hunk STARTS in the new file.
    // However, if the hunk is PURE REMOVE, startLineNew might be the line *before* or *after* where it was? 
    // Actually computeLineDiff usually attaches 'remove' lines to the original index.
    
    // Let's use a simpler robust approach for this specific IDE context:
    // We trust startLineNew and endLineNew derived from the diff.
    
    let startIndexNew = -1;
    let endIndexNew = -1;
    
    // Find valid new line indices in the hunk
    const validNewLines = hunk.lines.filter(l => l.lineNumNew !== undefined);
    if (validNewLines.length > 0) {
        startIndexNew = validNewLines[0].lineNumNew! - 1; // 0-based
        endIndexNew = validNewLines[validNewLines.length - 1].lineNumNew! - 1;
    } else {
        // Pure remove. We need to find insertion point.
        // This is tricky without context. 
        // BUT, we handle pure removes by looking at where the diff says they *would* be.
        // Actually, for a pure remove, we need to INSERT old text back. 
        // We need context 'equal' lines to locate, but `groupDiffIntoHunks` strips equal lines.
        
        // Strategy B: 
        // We can't easily patch the string without context.
        // BUT, we are in an IDE. We can cheat:
        // When "Rejecting", we are essentially "Accepting the Old Content" for that block.
        // "Accepting Old Content" means applying a patch to NewContent that turns it into OldContent.
        
        // Let's rely on `applyPatchInMemory` but we need to construct the patch.
        // The patch should replace [StartNew, EndNew] with [OldLines].
    }

    // Get the segment of text from Old Content that this hunk represents
    const originalTextSegment = hunk.lines
        .filter(l => l.type === 'remove')
        .map(l => l.content);
    
    // Calculate range in New Content to replace
    // If it's an Addition, we remove it.
    // If it's a Removal, we insert original text.
    // If it's a Modification, we replace new text with old text.
    
    // If validNewLines exists, we have a range in NewContent to replace.
    if (startIndexNew !== -1 && endIndexNew !== -1) {
         const before = newLines.slice(0, startIndexNew);
         const after = newLines.slice(endIndexNew + 1);
         return [...before, ...originalTextSegment, ...after].join('\n');
    } 
    
    // If no validNewLines (Pure Remove from Original), we need to insert `originalTextSegment` back into `fullNewContent`.
    // But where? We need the line number from the diff.
    // In a pure remove, `computeLineDiff` aligns it with original index. 
    // We need the index in NEW content.
    // Let's re-run diff with context or pass context.
    // Alternative: The UI passes us the context index? No.
    
    // Fallback: If we can't determine exact location (rare in simple edits), fail safe or reject all.
    // However, usually a "Remove" hunk is surrounded by 'equal' lines in the raw diff. 
    // If we passed the full diff to this function, we could find the index.
    
    // For now, to keep it safe, if we can't easily revert partial, we might force user to Reject All.
    // BUT, let's try to find the 'equal' line preceding this hunk in the full diff (not passed here).
    
    return fullNewContent; // Fallback (No-op)
};
