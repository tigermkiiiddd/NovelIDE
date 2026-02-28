/**
 * EditHighlightOverlay - Diff Highlight Overlay for Edit Mode
 *
 * Displays diff highlights directly in the editor, allowing users to:
 * 1. See pending changes highlighted in the editor
 * 2. Click on highlighted regions to approve/reject individual edits
 * 3. Continue editing while viewing diffs
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, Edit3 } from 'lucide-react';
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
    const [activeEditId, setActiveEditId] = useState<string | null>(null);

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

                // Check if region is visible in viewport
                const viewportHeight = overlayRef.current?.clientHeight || 800;
                const visible = top + height > scrollTop - 50 && top < scrollTop + viewportHeight + 50;

                return { edit, top, height, visible };
            });
    }, [adjustedEdits, processedEditIds, lineHeights, defaultLineHeight, paddingTop, scrollTop]);

    // Close active menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (activeEditId && overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
                setActiveEditId(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeEditId]);

    const handleEditClick = useCallback((editId: string) => {
        setActiveEditId(prev => prev === editId ? null : editId);
    }, []);

    const handleAction = useCallback((editId: string, action: 'accept' | 'reject') => {
        onEditClick(editId, action);
        setActiveEditId(null);
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
            {editRegions.map(({ edit, top, height, visible }) => (
                <div
                    key={edit.id}
                    className={`absolute pointer-events-auto transition-all duration-150 ${
                        visible ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                        top: top,
                        left: 0,
                        right: 16,
                        height: Math.max(height, 24),
                        minHeight: 24
                    }}
                >
                    {/* Highlight Background */}
                    <div
                        className={`absolute inset-0 rounded cursor-pointer border-l-4 transition-colors ${
                            activeEditId === edit.id
                                ? 'bg-blue-500/20 border-blue-400'
                                : 'bg-yellow-500/10 border-yellow-500/50 hover:bg-yellow-500/20'
                        }`}
                        onClick={() => handleEditClick(edit.id)}
                    />

                    {/* Edit Number Badge */}
                    <div
                        className={`absolute -left-1 top-0 transform -translate-x-full pr-2 ${
                            activeEditId === edit.id ? 'opacity-100' : 'opacity-60'
                        }`}
                    >
                        <span className="text-[10px] font-mono bg-yellow-900/50 text-yellow-300 px-1.5 py-0.5 rounded">
                            #{edit.editIndex + 1}
                        </span>
                    </div>

                    {/* Action Menu (shown when clicked) */}
                    {activeEditId === edit.id && (
                        <div
                            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-gray-900/95 rounded-lg p-1 border border-gray-700 shadow-lg z-50"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => handleAction(edit.id, 'accept')}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-900/30 text-green-400 hover:bg-green-900/50 rounded border border-green-900/30 transition-colors"
                                title="批准此变更"
                            >
                                <Check size={10} />
                                <span>批准</span>
                            </button>
                            <button
                                onClick={() => handleAction(edit.id, 'reject')}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded border border-red-900/30 transition-colors"
                                title="拒绝此变更"
                            >
                                <X size={10} />
                                <span>拒绝</span>
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default EditHighlightOverlay;
