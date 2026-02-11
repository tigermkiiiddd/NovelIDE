
import { useRef, useCallback } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { executeTool, ToolExecutionResult } from '../../services/agent/toolRunner';
import { FileNode, TodoItem, PendingChange, ChatMessage } from '../../types';
import { AIService } from '../../services/geminiService';
import { generateId } from '../../services/fileSystem';
import { BatchEdit } from '../../stores/fileStore';

// 定义工具接口
export interface AgentToolsImplementation {
    createFile: (path: string, content: string) => string;
    updateFile: (path: string, content: string) => string;
    patchFile: (path: string, edits: BatchEdit[]) => string;
    readFile: (path: string, startLine?: number, endLine?: number) => string;
    searchFiles: (query: string) => string;
    listFiles: () => string;
    deleteFile: (path: string) => string;
    renameFile: (oldPath: string, newName: string) => string;
    updateProjectMeta: (updates: any) => string;
}

interface UseAgentToolsProps {
    files: FileNode[];
    todos: TodoItem[];
    tools: AgentToolsImplementation;
    aiServiceInstance: AIService | null;
    addMessage: (msg: ChatMessage) => void;
    editMessageContent: (id: string, text: string) => void;
    addPendingChange: (change: PendingChange) => void;
    setTodos: (todos: TodoItem[]) => void;
}

export const useAgentTools = ({
    files,
    todos,
    tools,
    aiServiceInstance,
    addMessage,
    editMessageContent,
    addPendingChange,
    setTodos
}: UseAgentToolsProps) => {
    
    // --- 状态追踪 ---
    const accessedFiles = useRef<Set<string>>(new Set());
    const errorTracker = useRef<Map<string, number>>(new Map());

    // --- 辅助逻辑：影子读取 (Shadow Read) ---
    // 允许 Agent 读取尚未批准（Pending）的文件内容，这对连续修改至关重要
    const getShadowContent = useCallback((path: string): string | null => {
        const currentPendingChanges = useAgentStore.getState().pendingChanges;
        const relevantChanges = currentPendingChanges.filter(c => c.fileName === path && c.newContent !== null);
        const latestChange = relevantChanges[relevantChanges.length - 1];
        return latestChange ? (latestChange.newContent || null) : null;
    }, []);

    const shadowReadFile = useCallback((path: string, startLine?: number, endLine?: number): string => {
        const shadowContent = getShadowContent(path);
        if (shadowContent !== null) {
            const allLines = shadowContent.split(/\r?\n/);
            const totalLines = allLines.length;
            const start = Math.max(1, startLine || 1);
            const end = Math.min(totalLines, endLine || 200);
            const linesToRead = allLines.slice(start - 1, end);
            const contentWithLineNumbers = linesToRead.map((line, idx) => `${String(start + idx).padEnd(4)} | ${line}`).join('\n');
            return `[Shadow Read - Pending Change]\nFile: ${path}\nTotal Lines: ${totalLines}\nReading Range: ${start} - ${end}\n---\n${contentWithLineNumbers}\n---\n(Content from Pending Approval)`;
        }
        return tools.readFile(path, startLine, endLine);
    }, [getShadowContent, tools]);

    // --- 核心逻辑：执行工具 ---
    const runTool = useCallback(async (
        name: string, 
        args: any, 
        toolMsgId: string, 
        signal: AbortSignal,
        logToUi: (text: string) => void
    ): Promise<string> => {
        
        // 动态构建包含 Shadow Read 的工具集
        const dynamicActions = {
            ...tools,
            setTodos,
            trackFileAccess: (fname: string) => accessedFiles.current.add(fname),
            readFile: shadowReadFile
        };

        // 执行工具
        const execResult = await executeTool(name, args, {
            files,
            todos,
            aiService: aiServiceInstance || undefined,
            onUiLog: logToUi,
            signal,
            getShadowContent,
            actions: dynamicActions
        });

        let resultString = '';

        if (execResult.type === 'APPROVAL_REQUIRED') {
            addPendingChange(execResult.change);
            logToUi(`📝 变更已提交审查 (自动继续): ${execResult.change.description}`);
            // 告诉 Agent 动作已排队，可以假设成功并继续
            resultString = `Action queued (ID: ${execResult.change.id}). You may proceed with subsequent tasks assuming this change will be approved.`;
        } else if (execResult.type === 'EXECUTED') {
            resultString = execResult.result;
        } else {
            // 错误处理
            resultString = `[SYSTEM ERROR]: ${execResult.message}`;
            logToUi(`❌ [${name}] Error: ${execResult.message}`);
        }

        // --- Anti-Loop: 重复错误检测 ---
        const isError = execResult.type === 'ERROR' || resultString.startsWith('Error:') || resultString.startsWith('[SYSTEM ERROR]:');
        if (isError) {
            const errorKey = resultString.trim();
            const currentCount = (errorTracker.current.get(errorKey) || 0) + 1;
            errorTracker.current.set(errorKey, currentCount);

            if (currentCount >= 2) {
                const originalError = resultString;
                // 强制介入
                resultString = `
[SYSTEM INTERVENTION - ANTI-LOOP / 系统防死循环介入]
⚠️ 检测到您已连续 ${currentCount} 次触发相同的错误 (Command: ${name})。
⛔️ 系统已屏蔽本次原始报错，防止您进入死循环。

请严格执行以下指令：
1. **立刻停止** 尝试再次执行该工具。
2. **不要** 试图换个参数继续试错。
3. **向用户报告错误**：用自然语言解释发生了什么。
4. **结束当前任务**。

原始错误信息摘要: ${originalError.slice(0, 200)}...`.trim();
                
                logToUi(`🚫 [Anti-Loop] 检测到重复错误 (${currentCount}次)，已强制打断 Agent 重试。`);
            }
        }

        return resultString;
    }, [files, todos, tools, aiServiceInstance, setTodos, shadowReadFile, addPendingChange, getShadowContent]);

    // 重置错误追踪器（通常在每轮对话开始时调用）
    const resetErrorTracker = useCallback(() => {
        errorTracker.current.clear();
    }, []);

    return {
        runTool,
        resetErrorTracker,
        accessedFiles
    };
};
