
import { FileNode, TodoItem, PendingChange, FileType, PlanNote, EditDiff } from '../../types';
import { generateId, findNodeByPath } from '../fileSystem';
import { processManageTodos } from './tools/todoTools';
import { processManagePlanNote } from './tools/planTools';
import { formatThinkingResult } from './tools/thinkingTools';
import { executeRecallMemory, executeManageMemory } from './tools/longTermMemoryTools';
import { executeStoryOutlineTool, executeProcessOutlineInput } from './tools/outlineTools';
import { executeTimelineTool, executeProcessTimelineInput } from './tools/timelineTools';
import { applyPatchInMemory } from '../../utils/diffUtils';
import { runSearchSubAgent } from '../subAgents/searchAgent';
import { AIService } from '../geminiService';
import { BatchEdit } from '../../stores/fileStore';
import { useVersionStore } from '../../stores/versionStore';

/**
 * Extract character names from 02_角色档案 folder.
 * Uses file name (strips prefix like 主角_/配角_) and metadata.name as fallback.
 */
const extractCharacterNames = (files: FileNode[]): string[] => {
    const charFolder = files.find(f => f.name === '02_角色档案' && f.type === FileType.FOLDER);
    if (!charFolder) return [];

    return files
        .filter(f => f.parentId === charFolder.id && f.type === FileType.FILE)
        .flatMap(f => {
            const names: string[] = [];
            // Strip prefix: [任意前缀]_姓名.md -> 姓名
            const baseName = f.name.replace(/\.md$/, '').replace(/^[^_]+_/, '');
            if (baseName) names.push(baseName);
            // Also use metadata.name if present
            if (f.metadata?.name && f.metadata.name !== baseName) names.push(f.metadata.name);
            return names;
        })
        .filter(Boolean);
};

/**
 * For draft files (05_正文草稿/), auto-detect characters mentioned in content
 * and inject them into the frontmatter `characters` field.
 * If the agent already provided characters, merge and deduplicate.
 */
const injectMatchedCharacters = (content: string, files: FileNode[]): string => {
    const allNames = extractCharacterNames(files);
    if (allNames.length === 0) return content;

    // Match names against content body (after frontmatter)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    const bodyStart = frontmatterMatch ? frontmatterMatch[0].length : 0;
    const body = content.slice(bodyStart);

    const matched = allNames.filter(name => body.includes(name));
    if (matched.length === 0) return content;

    if (frontmatterMatch) {
        // Frontmatter exists — merge into characters field
        const fm = frontmatterMatch[1];
        const existingMatch = fm.match(/^characters:\s*\[([^\]]*)\]/m);
        if (existingMatch) {
            // Parse existing, merge, deduplicate
            const existing = existingMatch[1]
                .split(',')
                .map(s => s.trim().replace(/^["']|["']$/g, ''))
                .filter(Boolean);
            const merged = [...new Set([...existing, ...matched])];
            const newField = `characters: [${merged.map(n => `"${n}"`).join(', ')}]`;
            return content.replace(/^characters:\s*\[[^\]]*\]/m, newField);
        } else {
            // No characters field yet — insert after tags line
            const newFm = fm.replace(/(tags:\s*\[[^\]]*\])/, `$1\ncharacters: [${matched.map(n => `"${n}"`).join(', ')}]`);
            return content.replace(frontmatterMatch[1], newFm);
        }
    } else {
        // No frontmatter at all — prepend a minimal one
        const header = `---\nsummarys: []\ntags: ["正文"]\ncharacters: [${matched.map(n => `"${n}"`).join(', ')}]\n---\n`;
        return header + content;
    }
};

/**
 * Generate EditDiffs for each edit in a patchFile operation.
 * This enables granular approval/rejection of individual edits.
 */
const generateEditDiffs = (originalContent: string, edits: BatchEdit[], changeId: string): EditDiff[] => {
    const originalLines = originalContent.split('\n');

    return edits.map((edit, index) => {
        const startLine = edit.startLine;
        const endLine = edit.endLine;

        // Extract original segment (0-indexed slice)
        const originalSegment = originalLines
            .slice(Math.max(0, startLine - 1), Math.min(originalLines.length, endLine))
            .join('\n');

        return {
            id: `edit_${changeId}_${index}`,
            editIndex: index,
            startLine,
            endLine,
            originalSegment,
            modifiedSegment: edit.newContent || '',
            status: 'pending' as const
        };
    });
};

// Define the interface for the raw tools provided by useAgent/App
export interface ToolContext {
    files: FileNode[];
    todos: TodoItem[];
    // Plan Mode
    planMode?: boolean;
    currentPlanNote?: PlanNote | null;
    sessionId?: string;
    projectId?: string;
    // Inject AI Service for Sub-Agents
    aiService?: AIService;
    onUiLog?: (msg: string) => void;
    // Add Signal
    signal?: AbortSignal;
    // Helper to resolve content from pending changes
    getShadowContent?: (path: string) => string | null;
    actions: {
        createFile: (path: string, content: string) => string;
        updateFile: (path: string, content: string) => string;
        patchFile: (path: string, edits: BatchEdit[]) => string;
        readFile: (path: string, startLine?: number, endLine?: number) => string;
        searchFiles: (query: string) => string;
        listFiles: () => string;
        deleteFile: (path: string) => string;
        renameFile: (oldPath: string, newName: string) => string;
        updateProjectMeta: (updates: any) => string;
        setTodos: (todos: TodoItem[]) => void;
        trackFileAccess: (path: string) => void;
        // Plan Note Actions
        createPlanNote?: (sessionId: string, projectId: string, title?: string) => PlanNote;
        updatePlanNote?: (planId: string, updates: Partial<PlanNote>) => void;
        addLine?: (planId: string, text: string) => any;
        updateLine?: (planId: string, lineId: string, text: string) => void;
        replaceAllLines?: (planId: string, lines: string[]) => void;
    }
}

export type ToolExecutionResult = 
  | { type: 'EXECUTED'; result: string }
  | { type: 'APPROVAL_REQUIRED'; change: PendingChange; uiLog: string }
  | { type: 'ERROR'; message: string };

/**
 * Executes a single tool call or prepares it for approval.
 * NOW ASYNC to support Sub-Agents.
 */
export const executeTool = async (
    name: string, 
    args: any, 
    context: ToolContext
): Promise<ToolExecutionResult> => {
    const { files, actions, aiService, onUiLog, signal } = context;

    // 0. Check Signal
    if (signal?.aborted) {
        throw new Error("Tool execution aborted by user.");
    }

    // --- Prepare Logging Data ---
    // Extract Thinking specifically for better visibility
    const { thinking, ...restArgs } = args;

    // Construct Log Elements
    const logTimestamp = new Date().toLocaleTimeString();
    let startLog = `[${logTimestamp}] ▶️ **调用工具**: \`${name}\`\n`;

    if (thinking) {
        startLog += `🧠 **思考**: ${thinking}\n`;
    }

    if (Object.keys(restArgs).length > 0) {
        const argsJson = JSON.stringify(restArgs, null, 2);
        // Truncate overly long args for the UI log (but keep them in raw metadata)
        const displayArgs = argsJson.length > 500 ? argsJson.substring(0, 500) + '... (truncated)' : argsJson;
        startLog += `📋 **参数**: \n${displayArgs}\n`;
    }

    // Log Start (Immediate Feedback) - Except for SubAgent which handles its own internal logging
    if (onUiLog && name !== 'call_search_agent' && name !== 'processOutlineInput' && name !== 'processTimelineInput') {
        onUiLog(`${startLog}`);
    }

    // --- 1. Check for Approval Requirements (Write Operations) ---
    const requiresApproval = ['createFile', 'updateFile', 'patchFile', 'deleteFile', 'renameFile'];
    
    if (requiresApproval.includes(name)) {
        try {
            const changeId = generateId();
            let description = `Request to ${name}`;
            let originalContent = null;
            let newContent = null;
            
            // Normalize path arg
            const filePath = args.path || args.oldPath;
            
            // Resolve file for diff preview (Physical File)
            const existingFile = findNodeByPath(files, filePath);
            
            // Resolve Base Content (Shadow Aware - supports optimistic stacking)
            let baseContent = existingFile?.content || '';
            if (context.getShadowContent) {
                const shadow = context.getShadowContent(filePath);
                if (shadow !== null) baseContent = shadow;
            }

            // Pre-calculate Diff Metadata for UI
            if (name === 'createFile') {
                // Check if file already exists - this is an error
                if (existingFile) {
                    return {
                        type: 'ERROR',
                        message: `❌ 文件已存在: "${filePath}"。createFile 只能用于创建新文件。如需更新已存在的文件，请使用 updateFile 或 patchFile。`
                    };
                }
                // Enforce character file naming convention: [前缀]_[姓名].md
                if (filePath.includes('02_角色档案/')) {
                    const fileName = filePath.split('/').pop() || '';
                    const validFormat = /^[^_]+_[^_].+\.md$/;
                    if (!validFormat.test(fileName)) {
                        return {
                            type: 'ERROR',
                            message: `❌ 角色档案命名不合规: "${fileName}"。\n必须使用 [前缀]_[姓名].md 格式，例如：主角_陈浩.md、配角_林晓月.md`
                        };
                    }
                }
                description = `Create file: ${filePath}`;
                originalContent = '';
                // Auto-inject matched characters for draft files
                newContent = filePath.includes('05_正文草稿/')
                    ? injectMatchedCharacters(args.content, files)
                    : args.content;
            } else if (name === 'updateFile') {
                description = `Overwrite: ${filePath}`;
                originalContent = baseContent;
                newContent = args.content;
            } else if (name === 'patchFile') {
                description = `Patch: ${filePath} (${args.edits.length} edits)`;
                originalContent = baseContent;
                // Simulate patch using the SHADOW-AWARE base content
                let allLines = baseContent.split(/\r?\n/);
                const sortedEdits = [...args.edits].sort((a: any, b: any) => b.startLine - a.startLine);
                for (const edit of sortedEdits) {
                    const { startLine, endLine, newContent } = edit;
                    const startIdx = Math.max(0, startLine - 1);
                    const deleteCount = Math.max(0, endLine - startLine + 1);
                    const newLines = newContent ? newContent.split(/\r?\n/) : [];
                    if (startIdx <= allLines.length) {
                        allLines.splice(startIdx, deleteCount, ...newLines);
                    }
                }
                newContent = allLines.join('\n');
            } else if (name === 'deleteFile') {
                // 验证文件存在
                if (!existingFile) {
                    return {
                        type: 'ERROR',
                        message: `❌ 无法删除: 文件 "${filePath}" 不存在。请检查路径是否正确。`
                    };
                }
                description = `Delete: ${filePath}`;
                originalContent = baseContent;
                newContent = null;
            } else if (name === 'renameFile') {
                description = `Rename ${args.oldPath} -> ${args.newName}`;
                originalContent = `Name: ${existingFile?.name || 'Unknown'}`;
                newContent = `Name: ${args.newName}`;
            }

            const change: PendingChange = {
                id: changeId,
                toolName: name,
                args,
                fileName: filePath, // Used for display
                fileId: existingFile?.id, // 用于可靠关联文件
                originalContent,
                newContent,
                timestamp: Date.now(),
                description: `${description}\n${args.thinking ? `思考: ${args.thinking}` : ''}`,
                // Generate editDiffs for patchFile operations
                editDiffs: name === 'patchFile' ? generateEditDiffs(baseContent, args.edits, changeId) : undefined
            };

            return {
                type: 'APPROVAL_REQUIRED',
                change,
                // We return the full log so far + waiting status
                uiLog: `${startLog}⏸️ **状态**: 等待审批 "${filePath}"...`
            };

        } catch (e: any) {
             return { type: 'ERROR', message: `Failed to prepare approval: ${e.message}` };
        }
    }

    // --- 2. Immediate Execution (Read, Memory & Sub-Agents) ---
    try {
        let result = '';

        // --- TODO TOOL ---
        if (name === 'manageTodos') {
            const op = processManageTodos(context.todos, args.action, args.tasks, args.indices, args.updates);
            result = op.result;
            if (op.newTodos) {
                actions.setTodos(op.newTodos); // State update
            }
        }
        // --- PLAN NOTE TOOL ---
        else if (name === 'managePlanNote') {
            // planMode 检查移到 processManagePlanNote 内部，允许普通模式只读访问

            // 检查必要的 actions
            if (!actions.createPlanNote || !actions.updatePlanNote || !actions.addLine ||
                !actions.updateLine || !actions.replaceAllLines) {
                return { type: 'ERROR', message: 'Plan Note actions not available' };
            }

            const op = processManagePlanNote(
                context.currentPlanNote || null,
                args.action,
                args.thinking,
                context.planMode || false,
                actions.createPlanNote,
                actions.updatePlanNote,
                actions.addLine,
                actions.updateLine,
                actions.replaceAllLines,
                context.sessionId || '',
                context.projectId || '',
                args.title,
                args.lines,
                args.lineIds,
                args.newContent
            );
            result = op.result;
        } 
        // --- SUB AGENT ENTRY POINT ---
        else if (name === 'call_search_agent') {
            if (!aiService) return { type: 'ERROR', message: 'AI Service not available for Sub-Agent' };
            
            // Log thinking and request for sub-agent call (Sub Agent handles its own detailed logging)
            if(onUiLog) {
                 const reqDesc = args.request_description ? `📋 **任务**: ${args.request_description}\n` : '';
                 onUiLog(`${startLog}${reqDesc}`);
            }

            result = await runSearchSubAgent(
                aiService,
                args.request_description,
                files,
                actions, // Pass the read-only tools
                onUiLog,
                signal // Pass signal to sub-agent
            );
        }
        else {
            // Map generic tools to implementation props
            switch (name) {
                case 'readFile':
                    result = actions.readFile(args.path, args.startLine, args.endLine);
                    if (!result.startsWith('Error')) actions.trackFileAccess(args.path);
                    break;
                case 'searchFiles': 
                    result = actions.searchFiles(args.query); 
                    break;
                case 'listFiles': 
                    result = actions.listFiles(); 
                    break;
                case 'updateProjectMeta':
                    result = actions.updateProjectMeta(args);
                    break;
                // --- LONG TERM MEMORY TOOLS ---
                case 'recall_memory':
                    result = await executeRecallMemory(args);
                    break;
                case 'manage_memory':
                    result = await executeManageMemory(args);
                    break;
                // --- STORY OUTLINE TOOLS ---
                case 'processOutlineInput':
                    result = await executeProcessOutlineInput(args, onUiLog);
                    break;
                case 'storyOutline_batchUpdate':
                case 'storyOutline_getVolumes':
                case 'storyOutline_getChapters':
                case 'storyOutline_getChapter':
                case 'storyOutline_addScene':
                    result = await executeStoryOutlineTool(name, args);
                    break;
                // --- TIMELINE TOOLS ---
                case 'processTimelineInput':
                    result = await executeProcessTimelineInput(args, onUiLog);
                    break;
                case 'timeline_batchUpdate':
                case 'timeline_getEvents':
                case 'timeline_getEvent':
                case 'timeline_getChapters':
                case 'timeline_getVolumes':
                case 'timeline_getStoryLines':
                case 'timeline_getTimeRange':
                    result = await executeTimelineTool(name, args);
                    break;
                default:
                    result = `Error: Unknown tool ${name}`;
            }
        }
        
        // Log Completion (Append to the start log) - Except for SubAgent which handles its own internal logging
        if (onUiLog && name !== 'call_search_agent' && name !== 'processOutlineInput' && name !== 'processTimelineInput') {
            // Truncate output for UI performance if it's too massive (the full result is still returned to the Agent)
            const MAX_UI_LENGTH = 1000;
            let displayResult = result;
            if (!result) displayResult = "(No output or empty result)";
            
            if (result.length > MAX_UI_LENGTH) {
                displayResult = result.slice(0, MAX_UI_LENGTH) + `\n\n... (Output truncated for UI view, full content loaded to Agent)`;
            }
            
            // Ensure clear separation for readability
            onUiLog(`✅ **Result**:\n${displayResult}`);
        }

        return { type: 'EXECUTED', result };

    } catch (e: any) {
        if (e.message === "Tool execution aborted by user.") throw e;
        return { type: 'ERROR', message: `Tool Execution Error: ${e.message}` };
    }
};

/**
 * Executes a previously approved change.
 */
export const executeApprovedChange = (change: PendingChange, actions: ToolContext['actions']): string => {
    try {
        let result = '';

        switch (change.toolName) {
            case 'createFile':
                // Use newContent (may have been enriched, e.g. auto-injected characters)
                result = actions.createFile(change.args.path, change.newContent ?? change.args.content);
                break;
            case 'updateFile':
                result = actions.updateFile(change.args.path, change.args.content);
                break;
            case 'patchFile':
                result = actions.patchFile(change.args.path, change.args.edits);
                break;
            case 'deleteFile':
                result = actions.deleteFile(change.args.path);
                break;
            case 'renameFile':
                result = actions.renameFile(change.args.oldPath, change.args.newName);
                break;
            default:
                return 'Error: Unknown tool for approval';
        }

        return result;
    } catch (e: any) {
        return `Error executing approved change: ${e.message}`;
    }
};
