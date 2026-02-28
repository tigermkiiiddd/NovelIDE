/**
 * editIncrement.ts - Edit Increment Utilities for Line Number Tracking
 *
 * When users edit the file while pending changes exist, we need to track
 * the line number changes to correctly display remaining diff highlights.
 *
 * Core Concepts:
 * 1. EditIncrement - records line count changes when user edits
 * 2. Rebuild line numbers - adjust remaining edits based on increments
 */

import { EditDiff, EditIncrement } from '../types';

/**
 * Calculate the line count delta between old and new content.
 * Positive = lines added, Negative = lines removed
 */
export const computeLineDelta = (oldContent: string, newContent: string): number => {
    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;
    return newLines - oldLines;
};

/**
 * Detect which edit region was modified based on content comparison.
 * Returns the editId if a match is found, or null if no match.
 *
 * Algorithm:
 * 1. For each pending edit, check if the modification affects that region
 * 2. Use content fingerprinting to identify the region
 */
export const detectEditedRegion = (
    newContent: string,
    editDiffs: EditDiff[],
    increments: EditIncrement[]
): string | null => {
    if (!editDiffs || editDiffs.length === 0) return null;

    const newLines = newContent.split('\n');
    const processedEditIds = new Set(increments.map(inc => inc.editId));

    // Find edits that haven't been processed yet
    const pendingEdits = editDiffs.filter(edit => !processedEditIds.has(edit.id));

    for (const edit of pendingEdits) {
        // Calculate adjusted line numbers based on previous increments
        const adjustedStart = adjustLineNumber(edit.startLine, edit.id, increments, editDiffs);
        const adjustedEnd = adjustLineNumber(edit.endLine, edit.id, increments, editDiffs);

        // Check if the region contains expected content (heuristic match)
        const regionContent = newLines
            .slice(Math.max(0, adjustedStart - 1), Math.min(newLines.length, adjustedEnd))
            .join('\n');

        // If the region no longer matches the original or modified segment,
        // it was likely edited by the user
        if (regionContent !== edit.originalSegment && regionContent !== edit.modifiedSegment) {
            return edit.id;
        }
    }

    return null;
};

/**
 * Adjust a line number based on increments from edits that occurred before this line.
 *
 * @param originalLine - The original line number
 * @param currentEditId - The ID of the edit being adjusted
 * @param increments - All recorded increments
 * @param editDiffs - All edit diffs (needed to determine edit positions)
 */
export const adjustLineNumber = (
    originalLine: number,
    currentEditId: string,
    increments: EditIncrement[],
    editDiffs: EditDiff[]
): number => {
    // Find all increments from edits that were BEFORE this line
    let totalDelta = 0;

    for (const inc of increments) {
        if (inc.editId === currentEditId) continue;

        // Find the edit diff for this increment
        const incEdit = editDiffs.find(e => e.id === inc.editId);
        if (!incEdit) continue;

        // If the increment's edit was before this line, apply the delta
        if (incEdit.startLine < originalLine) {
            totalDelta += inc.lineDelta;
        }
    }

    return originalLine + totalDelta;
};

/**
 * Rebuild all edit diff line numbers based on recorded increments.
 * Returns a new array with updated line numbers.
 */
export const rebuildEditLineNumbers = (
    editDiffs: EditDiff[],
    increments: EditIncrement[]
): EditDiff[] => {
    if (!editDiffs || editDiffs.length === 0) return [];
    if (!increments || increments.length === 0) return editDiffs;

    return editDiffs.map(edit => {
        const adjustedStart = adjustLineNumber(edit.startLine, edit.id, increments, editDiffs);
        const adjustedEnd = adjustLineNumber(edit.endLine, edit.id, increments, editDiffs);

        return {
            ...edit,
            startLine: adjustedStart,
            endLine: adjustedEnd
        };
    });
};

/**
 * Calculate the visual position (pixel offset) for a line in the editor.
 * Used by the highlight overlay to position diff highlights correctly.
 */
export const calculateLinePosition = (
    lineNumber: number,
    lineHeights: number[],
    defaultLineHeight: number = 20,
    paddingTop: number = 24
): { top: number; height: number } => {
    if (!lineHeights || lineHeights.length === 0) {
        // No measured heights, use default
        return {
            top: paddingTop + (lineNumber - 1) * defaultLineHeight,
            height: defaultLineHeight
        };
    }

    // Calculate cumulative height up to the target line
    let top = paddingTop;
    for (let i = 0; i < lineNumber - 1 && i < lineHeights.length; i++) {
        top += lineHeights[i] || defaultLineHeight;
    }

    // Get height of the target line
    const lineIndex = lineNumber - 1;
    const height = lineHeights[lineIndex] || defaultLineHeight;

    return { top, height };
};

/**
 * Calculate the visual position for a multi-line edit region.
 */
export const calculateEditRegionPosition = (
    startLine: number,
    endLine: number,
    lineHeights: number[],
    defaultLineHeight: number = 20,
    paddingTop: number = 24
): { top: number; height: number } => {
    const start = calculateLinePosition(startLine, lineHeights, defaultLineHeight, paddingTop);
    const end = calculateLinePosition(endLine, lineHeights, defaultLineHeight, paddingTop);

    return {
        top: start.top,
        height: end.top + end.height - start.top
    };
};
