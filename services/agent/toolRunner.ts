
import { FileNode, TodoItem, PendingChange, FileType, PlanNote } from '../../types';
import { generateId, findNodeByPath } from '../fileSystem';
import { processManageTodos } from './tools/todoTools';
import { processManagePlanNote } from './tools/planTools';
import { formatThinkingResult } from './tools/thinkingTools';
import { applyPatchInMemory } from '../../utils/diffUtils';
import { runSearchSubAgent } from '../subAgents/searchAgent';
import { AIService } from '../geminiService';
import { BatchEdit } from '../../stores/fileStore';

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
    if (onUiLog && name !== 'call_search_agent') {
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
                description = `Create file: ${filePath}`;
                originalContent = '';
                newContent = args.content;
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
                description = `Delete: ${filePath}`;
                originalContent = baseContent || '(File Content)';
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
                description: `${description}\n${args.thinking ? `思考: ${args.thinking}` : ''}`
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

        // --- THINKING TOOL ---
        if (name === 'thinking') {
            const { mode, content, confidence, nextAction, thinking } = args;

            // 格式化结果用于前端显示
            result = formatThinkingResult(mode, content, confidence, nextAction, thinking);

            // Log to UI immediately
            if (onUiLog) {
                onUiLog(result);
            }

            return { type: 'EXECUTED', result };
        }
        else if (name === 'manageTodos') {
            const op = processManageTodos(context.todos, args.action, args.tasks, args.todoIds, args.updates);
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
                default: 
                    result = `Error: Unknown tool ${name}`;
            }
        }
        
        // Log Completion (Append to the start log)
        if (onUiLog && name !== 'call_search_agent') {
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
                result = actions.createFile(change.args.path, change.args.content);
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
