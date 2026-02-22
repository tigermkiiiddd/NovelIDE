
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
            let isFirstLoop = true;  // 标记是否是第一轮循环

            // 4. 进入 ReAct 循环
            while (keepGoing && loopCount < MAX_LOOPS) {
                if (signal.aborted) break;
                loopCount++;

                // 4.1 准备历史消息 (LLM Input Part 2: History)
                const currentGlobalSessions = useAgentStore.getState().sessions;
                const currentFreshSession = currentGlobalSessions.find(s => s.id === currentSessionId);
                const currentMessages = currentFreshSession?.messages || [];

                // === 判断是否需要强制 thinking ===
                // 只在第一轮循环时判断：触发本次 processTurn 的是用户输入还是 tool response
                // 用户输入（包括审批结果）必须先 thinking，tool response 不需要
                let requireThinking = false;
                if (isFirstLoop) {
                    const lastMsg = currentMessages[currentMessages.length - 1];
                    if (lastMsg) {
                        const isUserInput = lastMsg.role === 'user' && !lastMsg.rawParts?.some((p: any) => p.functionResponse);
                        const isApprovalResult = lastMsg.role === 'system';  // 审批结果（如 "User Approved"）
                        requireThinking = isUserInput || isApprovalResult;
                        console.log('[Thinking 门阀] 触发类型判断', {
                            lastRole: lastMsg.role,
                            hasFunctionResponse: lastMsg.rawParts?.some((p: any) => p.functionResponse),
                            requireThinking
                        });
                    }
                    isFirstLoop = false;
                }

                // 滑动窗口：只取最新的 N 条消息
                const totalMessages = currentMessages.length;
                let windowedMessages = currentMessages.slice(-MAX_CONTEXT_MESSAGES);

                // --- 滑动窗口完整性修正 ---
                // OpenAI API 要求：tool_calls 必须紧跟 tool response
                // 如果窗口从中间截断，可能导致消息序列不合法
                // 检查并修正窗口起始位置，确保消息序列完整
                const fixWindowStart = (msgs: any[]): any[] => {
                    if (msgs.length === 0) return msgs;

                    // 检查第一条消息
                    const firstMsg = msgs[0];

                    // 情况1: 第一条是 system (UI系统消息) -> 视为 user，合法
                    if (firstMsg.role === 'system') return msgs;

                    // 情况2: 第一条是 model/assistant 且有 tool_calls -> 非法（缺少对应的 user 或 tool response）
                    if ((firstMsg.role === 'model' || firstMsg.role === 'assistant') && firstMsg.rawParts?.some((p: any) => p.functionCall)) {
                        // 跳过这条消息，从下一条开始
                        console.warn('[滑动窗口] 跳过孤立的 tool_calls 消息，避免 API 格式错误');
                        return fixWindowStart(msgs.slice(1));
                    }

                    // 情况3: 第一条是 user 但内容是 tool response (rawParts 有 functionResponse)
                    // 这种情况是合法的，因为 tool response 可以作为新一轮的起始
                    if (firstMsg.role === 'user' && firstMsg.rawParts?.some((p: any) => p.functionResponse)) {
                        return msgs;
                    }

                    return msgs;
                };

                windowedMessages = fixWindowStart(windowedMessages);
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

                        // === 代码门阀：用户输入后必须先 thinking 确认意图 ===
                        // 只在 requireThinking=true（用户输入/审批结果触发）时强制要求
                        // tool response 触发的不需要强制 thinking
                        if (requireThinking && !hasCalledThinking && name !== 'thinking') {
                            // 拒绝执行，返回错误消息
                            functionResponses.push({
                                functionResponse: {
                                    name,
                                    id,
                                    response: {
                                        result: '❌ [代码门阀拦截] 用户输入后必须先调用 thinking 工具确认意图，才能执行其他工具。'
                                    }
                                }
                            });
                            logToUi(`❌ [代码门阀] 拒绝执行 \`${name}\`：用户输入后必须先调用 thinking 工具`);
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
