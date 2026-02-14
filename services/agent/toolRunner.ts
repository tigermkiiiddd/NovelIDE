
import { FileNode, TodoItem, PendingChange, FileType } from '../../types';
import { generateId, findNodeByPath } from '../fileSystem';
import { processManageTodos } from './tools/todoTools';
import { applyPatchInMemory } from '../../utils/diffUtils';
import { runSearchSubAgent } from '../subAgents/searchAgent';
import { AIService } from '../geminiService';
import { BatchEdit } from '../../stores/fileStore';

// Define the interface for the raw tools provided by useAgent/App
export interface ToolContext {
    files: FileNode[];
    todos: TodoItem[];
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

        if (name === 'manageTodos') {
            const op = processManageTodos(context.todos, args.action, args.tasks, args.todoIds, args.updates);
            result = op.result;
            if (op.newTodos) {
                actions.setTodos(op.newTodos); // State update
            }
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
        switch (change.toolName) {
            case 'createFile': return actions.createFile(change.args.path, change.args.content);
            case 'updateFile': return actions.updateFile(change.args.path, change.args.content);
            case 'patchFile': return actions.patchFile(change.args.path, change.args.edits);
            case 'deleteFile': return actions.deleteFile(change.args.path);
            case 'renameFile': return actions.renameFile(change.args.oldPath, change.args.newName);
            default: return 'Error: Unknown tool for approval';
        }
    } catch (e: any) { 
        return `Error executing approved change: ${e.message}`; 
    }
};
