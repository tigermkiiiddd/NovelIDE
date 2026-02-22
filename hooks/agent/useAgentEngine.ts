
import { useRef, useCallback, useMemo } from 'react';
import { ChatMessage, FileNode, ProjectMeta, TodoItem, PlanNote } from '../../types';
import { generateId } from '../../services/fileSystem';
import { constructSystemPrompt } from '../../services/resources/skills/coreProtocol';
import { allTools, getToolsForMode } from '../../services/agent/tools/index';
import { useAgentStore } from '../../stores/agentStore';
import { usePlanStore } from '../../stores/planStore';
import { useAgentContext } from './useAgentContext';
import { useAgentTools } from './useAgentTools';

// 滑动窗口：最多发送给 LLM 的消息数量
export const MAX_CONTEXT_MESSAGES = 30;

interface UseAgentEngineProps {
    context: ReturnType<typeof useAgentContext>;
    toolsHook: ReturnType<typeof useAgentTools>;
    files: FileNode[];
    project: ProjectMeta | undefined;
    activeFile: FileNode | null;
    // Plan Mode
    planMode?: boolean;
    currentPlanNote?: PlanNote | null;
}

export const useAgentEngine = ({
    context,
    toolsHook,
    files,
    project,
    activeFile,
    planMode = false,
    currentPlanNote = null
}: UseAgentEngineProps) => {
    const {
        currentSessionId, addMessage, editMessageContent, updateMessageMetadata,
        setLoading, aiServiceInstance
    } = context;

    const { runTool, resetErrorTracker } = toolsHook;
    const abortControllerRef = useRef<AbortController | null>(null);

    // --- 核心循环: Process Turn ---
    const processTurn = useCallback(async () => {
        if (!aiServiceInstance || !currentSessionId) return;

        // 1. 初始化 AbortController
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        setLoading(true);
        resetErrorTracker(); // 新的一轮对话，重置防死循环计数器

        try {
            // 2. 获取最新上下文
            const globalSessions = useAgentStore.getState().sessions;
            const freshSession = globalSessions.find(s => s.id === currentSessionId);
            const freshTodos = freshSession?.todos || [];

            // 3. 构建 System Prompt (LLM Input Part 1)
            const fullSystemInstruction = constructSystemPrompt(
                files,
                project,
                activeFile,
                freshTodos,
                freshSession?.messages,  // 传递会话消息历史
                planMode  // 传递 Plan 模式状态
            );

            // 根据模式选择工具
            const toolsForMode = getToolsForMode(planMode);

            let loopCount = 0;
            const MAX_LOOPS = 30;
            let keepGoing = true;
            let hasCalledThinking = false;  // 门阀状态：是否已调用 thinking 工具

            // 4. 进入 ReAct 循环
            while (keepGoing && loopCount < MAX_LOOPS) {
                if (signal.aborted) break;
                loopCount++;

                // 4.1 准备历史消息 (LLM Input Part 2: History)
                const currentGlobalSessions = useAgentStore.getState().sessions;
                const currentFreshSession = currentGlobalSessions.find(s => s.id === currentSessionId);
                const currentMessages = currentFreshSession?.messages || [];

                // 滑动窗口：只取最新的 N 条消息
                const totalMessages = currentMessages.length;
                const windowedMessages = currentMessages.slice(-MAX_CONTEXT_MESSAGES);
                const inContextCount = windowedMessages.length;
                const droppedCount = totalMessages - inContextCount;

                // 格式化为 API 需要的结构
                const apiHistory = windowedMessages.map(m => {
                    let apiRole = m.role;
                    // Fix: 这里的 system 是指 UI 上的系统提示（如"User Approved"），给 LLM 看作 User 输入
                    if (m.role === 'system') apiRole = 'user';

                    if (m.rawParts) return { role: apiRole, parts: m.rawParts };
                    return { role: apiRole === 'system' ? 'user' : apiRole, parts: [{ text: m.text }] };
                });

                // --- CRITICAL: IMMEDIATE INPUT VISUALIZATION ---
                // Identify the trigger message for this turn (The User message or the Tool Result message)
                // and attach the generated prompt/history metadata to it IMMEDIATELY.
                const lastMsg = currentMessages[currentMessages.length - 1];
                if (lastMsg) {
                    const debugPayload = {
                        systemInstruction: fullSystemInstruction,
                        apiHistoryPreview: apiHistory, // Show windowed history
                        totalHistoryLength: totalMessages,
                        // 滑动窗口信息
                        slidingWindow: {
                            inContext: inContextCount,
                            dropped: droppedCount,
                            windowSize: MAX_CONTEXT_MESSAGES
                        }
                    };
                    updateMessageMetadata(lastMsg.id, { debugPayload });
                }

                // 4.2 调用 LLM (Network Call)
                const response = await aiServiceInstance.sendMessage(
                    apiHistory,
                    '', // 当前消息已在 apiHistory 中
                    fullSystemInstruction,
                    toolsForMode,  // 使用根据模式选择的工具
                    signal
                );

                // Extract API metadata for debug display
                const apiMetadata = response._metadata;

                if (signal.aborted) break;

                const candidates = response.candidates;
                if (!candidates || candidates.length === 0) throw new Error("No response from Agent");

                const content = candidates[0].content;
                const parts = content.parts;

                // 4.3 处理文本响应
                const textPart = parts.find((p: any) => p.text);
                const toolParts = parts.filter((p: any) => p.functionCall);

                // CRITICAL: Always add a MODEL message if there's any content (text OR tool calls).
                if (textPart || toolParts.length > 0) {
                    const displayText = textPart ? textPart.text : '';
                    addMessage({
                        id: generateId(),
                        role: 'model',
                        text: displayText,
                        rawParts: parts, // Store RAW parts so UI can render Tool Input Args
                        timestamp: Date.now(),
                        metadata: {
                            loopCount: loopCount,
                            apiMetadata: apiMetadata, // Attach API metadata for debug display
                        }
                        // Removed debugPayload from here since it's now on the INPUT message
                    });
                }

                // 4.4 处理工具调用
                if (toolParts.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));

                    const functionResponses: any[] = [];
                    const executingToolNames = toolParts.map((p: any) => p.functionCall.name).join(', ');

                    // 创建 UI 上的工具执行状态消息 (System Role)
                    const toolMsgId = generateId();
                    let streamedLog = '';

                    // Real-time logger callback
                    const logToUi = (text: string) => {
                        streamedLog += (streamedLog ? '\n' : '') + text;
                        editMessageContent(toolMsgId, streamedLog);
                    };

                    addMessage({
                        id: toolMsgId,
                        role: 'system',
                        text: `⏳ Starting execution: ${executingToolNames}...`,
                        isToolOutput: true,
                        timestamp: Date.now(),
                        metadata: { executingTools: executingToolNames }
                    });

                    // 依次执行工具
                    for (const part of toolParts) {
                        if (signal.aborted) break;
                        if (!part.functionCall) continue;
                        const { name, args, id } = part.functionCall;

                        // === 代码门阀：强制首次工具调用必须是 thinking ===
                        if (!hasCalledThinking && name !== 'thinking') {
                            // 拒绝执行，返回错误消息
                            functionResponses.push({
                                functionResponse: {
                                    name,
                                    id,
                                    response: {
                                        result: '❌ [代码门阀拦截] 必须先调用 thinking 工具进行意图推理，才能执行其他工具。'
                                    }
                                }
                            });
                            logToUi(`❌ [代码门阀] 拒绝执行 \`${name}\`：必须先调用 thinking 工具`);
                            continue;  // 跳过此工具，继续处理下一个
                        }

                        // 标记已调用 thinking
                        if (name === 'thinking') {
                            hasCalledThinking = true;
                        }

                        // Execute
                        const resultString = await runTool(name, args, toolMsgId, signal, logToUi);

                        functionResponses.push({
                            functionResponse: { name, id, response: { result: resultString } }
                        });
                    }

                    if (signal.aborted) break;

                    // 更新 UI 消息状态为完成
                    useAgentStore.getState().updateCurrentSession(session => ({
                        ...session,
                        messages: session.messages.map(m => m.id === toolMsgId ? {
                            ...m,
                            text: streamedLog.trim() || '✅ Execution Complete',
                            rawParts: functionResponses
                        } : m),
                        lastModified: Date.now()
                    }));

                } else {
                    keepGoing = false; // 没有工具调用，结束循环
                }
            }

            // 5. 循环次数保护
            if (keepGoing && loopCount >= MAX_LOOPS && !signal.aborted) {
                addMessage({
                    id: generateId(), role: 'system',
                    text: '⚠️ 【系统保护】任务自动终止：已达到最大工具调用轮数限制。', timestamp: Date.now()
                });
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                addMessage({ id: generateId(), role: 'system', text: '⛔ 用户已停止生成。', timestamp: Date.now() });
            } else {
                console.error(error);
                addMessage({ id: generateId(), role: 'system', text: 'Agent Error: ' + error.message, timestamp: Date.now() });
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    }, [
        aiServiceInstance, currentSessionId, files, project, activeFile,
        addMessage, editMessageContent, setLoading, runTool, resetErrorTracker, updateMessageMetadata,
        planMode, currentPlanNote
    ]);

    const stopGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setLoading(false);
        }
    }, [setLoading]);

    return {
        processTurn,
        stopGeneration
    };
};
