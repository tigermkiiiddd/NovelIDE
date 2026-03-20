/**
 * Editor Hooks Index
 *
 * 从 Editor.tsx 提取的 hooks 模块
 */

export { useEditorState, type EditorState, type UseEditorStateOptions } from './useEditorState';
export { useEditorSearch, type EditorSearchState, type UseEditorSearchOptions, type SearchResult } from './useEditorSearch';
export { useEditorDiff, type UseEditorDiffOptions, type EditorDiffHookResult } from './useEditorDiff';
export { useEditorSync, type EditorSyncActions, type UseEditorSyncOptions } from './useEditorSync';
export { useEditor, type UseEditorOptions, type EditorHookResult } from './useEditor';
