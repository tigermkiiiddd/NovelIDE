
import { useRef, useCallback } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { usePlanStore } from '../../stores/planStore';
import { useCharacterMemoryStore } from '../../stores/characterMemoryStore';
import { useRelationshipStore } from '../../stores/relationshipStore';
import { executeTool, ToolExecutionResult } from '../../services/agent/toolRunner';
import { FileNode, TodoItem, PendingChange, ChatMessage, PlanNote, BatchEdit } from '../../types';
import { AIService } from '../../services/geminiService';
import { generateId } from '../../services/fileSystem';

// 定义工具接口
export interface AgentToolsImplementation {
    createFile: (path: string, content: string) => string;
    updateFile: (path: string, content: string) => string;
    patchFile: (path: string, edits: BatchEdit[]) => string;
    readFile: (path: string, startLine?: number, endLine?: number) => string;
    searchFiles: (query: string) => string;
    listFiles: () => string;
    globFiles: (pattern: string, basePath?: string, headLimit?: number) => string;
    grepFiles: (pattern: string, basePath?: string, context?: number, outputMode?: string, globFilter?: string, headLimit?: number, ignoreCase?: boolean, multiline?: boolean) => string;
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
    // Plan Mode
    planMode?: boolean;
    currentPlanNote?: PlanNote | null;
    sessionId?: string;
    projectId?: string;
}

export const useAgentTools = ({
    files,
    todos,
    tools,
    aiServiceInstance,
    addMessage,
    editMessageContent,
    addPendingChange,
    setTodos,
    planMode = false,
    currentPlanNote = null,
    sessionId,
    projectId
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

    // 构建角色动态状态摘要
    const buildCharacterStatusSummary = useCallback((profile: any): string => {
        const lines: string[] = [];
        lines.push(`角色名: ${profile.characterName}`);
        lines.push(`最后更新: ${new Date(profile.updatedAt).toLocaleString('zh-CN')}`);
        lines.push('');

        // 累加型分类的显示数量配置
        const cumulativeLimits: Record<string, number> = {
            '关系': 3,    // 关系显示最近3条
            '经历': 10,   // 经历显示最近10条
            '记忆': 10,   // 记忆显示最近10条
        };

        // 遍历所有分类
        if (profile.categories) {
            Object.entries(profile.categories).forEach(([catName, catData]: [string, any]) => {
                if (!catData || !catData.subCategories) return;

                const subCatEntries = Object.entries(catData.subCategories);
                if (subCatEntries.length === 0) return;

                const isCumulative = catData.type === '累加';
                lines.push(`【${catName}】(${catData.type || '未知'})`);

                subCatEntries.forEach(([subCatName, value]) => {
                    if (Array.isArray(value)) {
                        // 累加型：显示未归档的条目（按配置数量）
                        const activeEntries = value.filter((e: any) => !e.archived);
                        if (activeEntries.length > 0) {
                            const limit = cumulativeLimits[catName] || 5;
                            const entriesToShow = activeEntries.slice(-limit); // 取最后N条

                            if (entriesToShow.length === 1) {
                                // 只有一条时，简洁显示
                                const entry = entriesToShow[0];
                                const valueStr = typeof entry.value === 'object'
                                    ? JSON.stringify(entry.value)
                                    : String(entry.value);
                                lines.push(`  - ${subCatName}: ${valueStr} (来源: ${entry.chapterRef})`);
                            } else {
                                // 多条时，显示历史列表
                                lines.push(`  - ${subCatName}:`);
                                entriesToShow.forEach((entry: any) => {
                                    const valueStr = typeof entry.value === 'object'
                                        ? JSON.stringify(entry.value)
                                        : String(entry.value);
                                    lines.push(`      • ${entry.chapterRef}: ${valueStr}`);
                                });
                            }
                        }
                    } else if (value && (value as any).value) {
                        // 覆盖型：只显示最新值
                        const entry = value as { value: any; chapterRef: string };
                        const valueStr = typeof entry.value === 'object'
                            ? JSON.stringify(entry.value)
                            : String(entry.value);
                        lines.push(`  - ${subCatName}: ${valueStr} (来源: ${entry.chapterRef})`);
                    }
                });
                lines.push('');
            });
        }

        return lines.join('\n');
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

        // 检查是否为角色文件
        const normalizedPath = path.replace(/\\/g, '/');
        const isCharacterFile = normalizedPath.includes('02_角色档案') &&
            (normalizedPath.endsWith('.md') || normalizedPath.endsWith('.txt'));

        // 获取文件内容
        let content = tools.readFile(path, startLine, endLine);

        // 如果是角色文件，尝试注入动态状态
        if (isCharacterFile) {
            // 从文件名提取角色名 (格式: 前缀_角色名.md 或 角色名.md)
            const fileName = normalizedPath.split('/').pop() || '';
            let characterName = fileName.replace(/\.(md|txt)$/i, '').trim();
            // 如果有前缀（如 "主角_"），移除前缀
            if (characterName.includes('_')) {
                characterName = characterName.substring(characterName.indexOf('_') + 1);
            }

            // 获取角色动态档案
            const profile = useCharacterMemoryStore.getState().getByName(characterName);

            if (profile) {
                // 构建动态状态摘要
                const statusSummary = buildCharacterStatusSummary(profile);
                content += `\n\n---\n【角色动态状态】\n${statusSummary}`;
            }

            // 注入人际关系
            const relations = useRelationshipStore.getState().getRelationsForCharacter(characterName);
            if (relations.length > 0) {
                const relLines = relations.map(r => {
                    const other = r.from === characterName ? r.to : r.from;
                    const dir = r.isBidirectional ? '⇄' : '→';
                    let line = `  - ${other} ${dir} ${characterName}: ${r.type}(${r.strength})`;
                    if (r.description) line += ` — ${r.description}`;
                    return line;
                });
                content += `\n\n【人际关系】(${relations.length}条)\n${relLines.join('\n')}`;
            }
        }

        return content;
    }, [getShadowContent, tools]);

    // --- 核心逻辑：执行工具 ---
    const runTool = useCallback(async (
        name: string,
        args: any,
        toolMsgId: string,
        signal: AbortSignal,
        logToUi: (text: string) => void
    ): Promise<string> => {

        // 获取 planStore actions
        const planStore = usePlanStore.getState();

        // 动态获取最新的 todos（避免闭包陷阱）
        const agentStore = useAgentStore.getState();
        const currentSession = agentStore.sessions.find(s => s.id === sessionId);
        const latestTodos = currentSession?.todos || [];

        // 动态构建包含 Shadow Read 的工具集
        const dynamicActions = {
            ...tools,
            setTodos,
            trackFileAccess: (fname: string) => accessedFiles.current.add(fname),
            readFile: shadowReadFile,
            // Plan Note Actions
            createPlanNote: planStore.createPlanNote,
            updatePlanNote: planStore.updatePlanNote,
            addLine: planStore.addLine,
            updateLine: planStore.updateLine,
            replaceAllLines: planStore.replaceAllLines
        };

        // 执行工具
        const execResult = await executeTool(name, args, {
            files,
            todos: latestTodos,  // 使用动态获取的最新值
            aiService: aiServiceInstance || undefined,
            onUiLog: logToUi,
            signal,
            getShadowContent,
            actions: dynamicActions,
            // Deep Thinking: session accessor
            getSession: () => {
                const store = useAgentStore.getState();
                return store.sessions.find(s => s.id === sessionId) || null;
            },
            updateThinkingPads: (pads) => {
                useAgentStore.getState().updateCurrentSession(session => ({
                    ...session,
                    thinkingPads: pads,
                    lastModified: Date.now(),
                }));
            },
            // Plan Mode
            planMode,
            currentPlanNote,
            sessionId,
            projectId
        });

        // --- 技能触发：提取 thinking 并检测 ---
        // thinking 检测在 useAgentEngine 中进行，这里不需要操作

        let resultString = '';

        if (execResult.type === 'APPROVAL_REQUIRED') {
            addPendingChange(execResult.change);
            logToUi(`📝 变更已提交审查 (自动继续): ${execResult.change.description}`);
            // 告诉 Agent 动作已排队，可以假设成功并继续
            resultString = `Change queued for user approval (ID: ${execResult.change.id}). You may proceed with subsequent tasks assuming this change will be approved.`;
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
    }, [files, tools, aiServiceInstance, setTodos, shadowReadFile, addPendingChange, getShadowContent, planMode, currentPlanNote, sessionId, projectId]);

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
