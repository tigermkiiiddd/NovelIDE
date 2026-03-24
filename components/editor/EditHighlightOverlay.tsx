/**
 * EditHighlightOverlay - Inline Diff Overlay for Edit Mode
 *
 * Displays inline diff directly in the editor:
 * 1. Green highlight on modified regions (new content in textarea, editable)
 * 2. Red original content panel above each change (read-only)
 * 3. Accept/reject buttons per change region
 */

import React, { useMemo, useCallback, useRef } from 'react';
import { Check, X, GitCompare } from 'lucide-react';
import { EditDiff, EditIncrement } from '../../types';
import {
    rebuildEditLineNumbers,
    calculateEditRegionPosition
} from '../../utils/editIncrement';

export interface EditHighlightOverlayProps {
    editDiffs: EditDiff[];
    increments: EditIncrement[];
    processedEditIds: string[];
    onEditClick: (editId: string, action: 'accept' | 'reject') => void;
    lineHeights: number[];
    scrollTop: number;
    scrollTopRef?: React.RefObject<HTMLTextAreaElement>;
    paddingTop?: number;
    defaultLineHeight?: number;
    showLineNumbers?: boolean;
    paddingLeft?: number;
}

interface EditRegion {
    edit: EditDiff;
    top: number;
    height: number;
    visible: boolean;
}

/** Truncate text to maxLines, appending "..." if truncated */
const truncateLines = (text: string, maxLines: number): { lines: string[]; truncated: boolean } => {
    const allLines = text.split('\n');
    if (allLines.length <= maxLines) return { lines: allLines, truncated: false };
    return { lines: allLines.slice(0, maxLines), truncated: true };
};

const MAX_PREVIEW_LINES = 6;

const EditHighlightOverlay: React.FC<EditHighlightOverlayProps> = ({
    editDiffs,
    increments,
    processedEditIds,
    onEditClick,
    lineHeights,
    scrollTop,
    paddingTop = 24,
    defaultLineHeight = 20,
    showLineNumbers = true,
    paddingLeft
}) => {
    const overlayRef = useRef<HTMLDivElement>(null);

    // Calculate left padding based on line numbers visibility
    const leftPadding = paddingLeft ?? (showLineNumbers ? 48 : 16);

    // Rebuild edit line numbers based on increments
    const adjustedEdits = useMemo(() => {
        return rebuildEditLineNumbers(editDiffs, increments);
    }, [editDiffs, increments]);

    // Calculate positions for each pending edit
    const editRegions: EditRegion[] = useMemo(() => {
        return adjustedEdits
            .filter(edit => edit.status === 'pending' && !processedEditIds.includes(edit.id))
            .map(edit => {
                const { top, height } = calculateEditRegionPosition(
                    edit.startLine,
                    edit.endLine,
                    lineHeights,
                    defaultLineHeight,
                    paddingTop
                );

                // Check if region is visible in viewport (with generous buffer for panels)
                const viewportHeight = overlayRef.current?.clientHeight || 800;
                const visible = top + height > scrollTop - 200 && top < scrollTop + viewportHeight + 200;

                return { edit, top, height, visible };
            });
    }, [adjustedEdits, processedEditIds, lineHeights, defaultLineHeight, paddingTop, scrollTop]);

    const handleAction = useCallback((e: React.MouseEvent, editId: string, action: 'accept' | 'reject') => {
        e.stopPropagation();
        onEditClick(editId, action);
    }, [onEditClick]);

    if (editRegions.length === 0) {
        return null;
    }

    return (
        <div
            ref={overlayRef}
            className="absolute inset-0 pointer-events-none overflow-hidden"
            style={{
                top: -scrollTop,
                left: leftPadding,
                right: 0
            }}
        >
            {editRegions.map(({ edit, top, height, visible }) => {
                const origPreview = truncateLines(edit.originalSegment, MAX_PREVIEW_LINES);
                const hasOriginal = edit.originalSegment.trim().length > 0;
                const hasModified = edit.modifiedSegment.trim().length > 0;

                return (
                    <div
                        key={edit.id}
                        className={`absolute pointer-events-auto ${
                            visible ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{
                            top: top,
                            left: 0,
                            right: 16,
                        }}
                    >
                        {/* Original Content Panel (above the green highlight) */}
                        <div
                            className="rounded-t-lg overflow-hidden border border-gray-700/60 bg-[#161b22] shadow-lg shadow-black/30"
                            style={{ transform: 'translateY(-100%)' }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-2 py-1 bg-[#1c2128] border-b border-gray-700/50">
                                <div className="flex items-center gap-1.5">
                                    <GitCompare size={11} className="text-yellow-400" />
                                    <span className="text-[10px] font-mono text-yellow-200/80">
                                        #{edit.editIndex + 1} · L{edit.startLine}
                                        {edit.endLine !== edit.startLine ? `–L${edit.endLine}` : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => handleAction(e, edit.id, 'reject')}
                                        className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded border border-red-900/30 transition-colors"
                                        title="拒绝此变更"
                                    >
                                        <X size={10} /> 拒绝
                                    </button>
                                    <button
                                        onClick={(e) => handleAction(e, edit.id, 'accept')}
                                        className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-green-900/20 text-green-400 hover:bg-green-900/40 rounded border border-green-900/30 transition-colors"
                                        title="批准此变更"
                                    >
                                        <Check size={10} /> 批准
                                    </button>
                                </div>
                            </div>

                            {/* Original Content (red, deleted) */}
                            {hasOriginal && (
                                <div className="px-1 py-0.5 overflow-x-auto">
                                    {origPreview.lines.map((line, idx) => (
                                        <div key={idx} className="flex bg-red-500/10">
                                            <span className="shrink-0 w-5 text-right pr-1 text-[10px] text-red-500/50 select-none">−</span>
                                            <span className="text-xs font-mono text-red-300 line-through decoration-red-900/50 whitespace-pre-wrap break-all py-0.5">
                                                {line || ' '}
                                            </span>
                                        </div>
                                    ))}
                                    {origPreview.truncated && (
                                        <div className="text-[10px] text-gray-500 px-5 py-0.5">...</div>
                                    )}
                                </div>
                            )}

                            {/* Modified Content Preview (green, added) - only show if there's original to compare */}
                            {hasOriginal && hasModified && (
                                <div className="px-1 py-0.5 overflow-x-auto border-t border-gray-700/30">
                                    {truncateLines(edit.modifiedSegment, MAX_PREVIEW_LINES).lines.map((line, idx) => (
                                        <div key={idx} className="flex bg-green-500/10">
                                            <span className="shrink-0 w-5 text-right pr-1 text-[10px] text-green-500/50 select-none">+</span>
                                            <span className="text-xs font-mono text-green-200 whitespace-pre-wrap break-all py-0.5">
                                                {line || ' '}
                                            </span>
                                        </div>
                                    ))}
                                    {truncateLines(edit.modifiedSegment, MAX_PREVIEW_LINES).truncated && (
                                        <div className="text-[10px] text-gray-500 px-5 py-0.5">...</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Green Highlight on the new content region in textarea */}
                        <div
                            className="rounded-b border-l-4 border-green-500/50 bg-green-500/8"
                            style={{
                                height: Math.max(height, defaultLineHeight),
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
};

export default EditHighlightOverlay;
