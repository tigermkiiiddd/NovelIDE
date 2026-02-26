
import { useRef, useCallback, useMemo } from 'react';
import { ChatMessage, FileNode, ProjectMeta, TodoItem, PlanNote } from '../../types';
import { generateId } from '../../services/fileSystem';
import { constructSystemPrompt } from '../../services/resources/skills/coreProtocol';
import { allTools, getToolsForMode } from '../../services/agent/tools/index';
import { useAgentStore } from '../../stores/agentStore';
import { usePlanStore } from '../../stores/planStore';
import { useAgentContext } from './useAgentContext';
import { useAgentTools } from './useAgentTools';
import {
  fromError,
  checkFinishReason,
  contentError,
  formatErrorForDisplay,
} from '../../services/agent/errorFactory';
import { AgentErrorInfo, AgentErrorCategory } from '../../types/agentErrors';

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
    const isProcessingRef = useRef(false);  // 并发保护

    // --- 核心循环: Process Turn ---
    const processTurn = useCallback(async () => {
        // 并发保护：如果正在处理中，直接返回
        if (isProcessingRef.current) {
            console.log('[AgentEngine] 已有任务在执行中，跳过本次调用');
            return;
        }
        if (!aiServiceInstance || !currentSessionId) return;

        isProcessingRef.current = true;

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

            // 判断是否需要强制 thinking（用户输入或审批结果触发）
            const triggerMsg = freshSession?.messages?.[freshSession.messages.length - 1];
            const isUserInput = triggerMsg?.role === 'user' && !triggerMsg?.rawParts?.some((p: any) => p.functionResponse);
            const isApprovalResult = triggerMsg?.role === 'system';
            const needForceThinking = isUserInput || isApprovalResult;
            let hasCalledThinking = false;  // 标记是否已完成强制 thinking

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
                    if (firstMsg.role === 'system') {
                        // 继续检查剩余消息
                        const fixedRest = fixWindowStart(msgs.slice(1));
                        return [firstMsg, ...fixedRest];
                    }

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

                // --- 滑动窗口内部完整性检查 ---
                // 确保窗口内部没有孤立的 tool_calls（tool response 被截断到窗口外）
                const fixWindowIntegrity = (msgs: any[]): any[] => {
                    if (msgs.length === 0) return msgs;

                    const result: any[] = [];

                    for (let i = 0; i < msgs.length; i++) {
                        const msg = msgs[i];

                        // 检查是否是带 tool_calls 的 assistant 消息
                        const hasToolCalls = (msg.role === 'model' || msg.role === 'assistant') &&
                            msg.rawParts?.some((p: any) => p.functionCall);

                        if (hasToolCalls) {
                            // 检查下一条消息是否是对应的 tool response
                            const nextMsg = msgs[i + 1];
                            const isToolResponse = nextMsg?.role === 'user' &&
                                nextMsg?.rawParts?.some((p: any) => p.functionResponse);

                            if (!isToolResponse) {
                                // 孤立的 tool_calls，跳过这条消息
                                console.warn('[滑动窗口] 跳过孤立的 tool_calls 消息（索引', i, '），下一条不是 tool response');
                                continue;
                            }
                        }

                        result.push(msg);
                    }

                    return result;
                };

                windowedMessages = fixWindowStart(windowedMessages);
                windowedMessages = fixWindowIntegrity(windowedMessages);
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
                // 如果需要强制 thinking 且还没调用过，强制调用 thinking 工具
                const forceToolName = (needForceThinking && !hasCalledThinking) ? 'thinking' : undefined;
                const response = await aiServiceInstance.sendMessage(
                    apiHistory,
                    '', // 当前消息已在 apiHistory 中
                    fullSystemInstruction,
                    toolsForMode,  // 使用根据模式选择的工具
                    signal,
                    forceToolName  // 强制调用指定工具（如果需要）
                );

                // Extract API metadata for debug display
                const apiMetadata = response._metadata;
                const aiMetadata = response._aiMetadata;

                if (signal.aborted) break;

                const candidates = response.candidates;
                if (!candidates || candidates.length === 0) {
                  // 使用错误工厂创建空响应错误
                  throw contentError('empty', aiMetadata, response);
                }

                const content = candidates[0].content;
                const parts = content.parts;

                // 检查 finish_reason 并处理内容问题
                const finishReasonError = checkFinishReason(
                  aiMetadata?.finishReason,
                  aiMetadata,
                  response
                );
                if (finishReasonError) {
                  console.warn('[AgentEngine] finish_reason issue:', finishReasonError);
                  // 如果是截断，记录警告但继续处理（响应仍可用）
                  if (aiMetadata?.finishReason === 'length') {
                    // 将警告添加到消息元数据
                    // 后续会在消息 metadata 中标记
                  }
                }

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
                            // 包含 finish_reason 警告
                            responseWarnings: finishReasonError ? [finishReasonError] : aiMetadata?.warnings,
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
                    let hasAnyError = false;  // 追踪是否有工具执行失败

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

                        // Execute
                        const resultString = await runTool(name, args, toolMsgId, signal, logToUi);

                        // 检测工具执行是否失败
                        if (resultString.startsWith('Error:') || resultString.startsWith('[SYSTEM ERROR]:')) {
                            hasAnyError = true;
                        }

                        functionResponses.push({
                            functionResponse: { name, id, response: { result: resultString } }
                        });

                        // 标记 thinking 已完成
                        if (name === 'thinking') {
                            hasCalledThinking = true;
                        }
                    }

                    if (signal.aborted) break;

                    // 更新 UI 消息状态为完成
                    useAgentStore.getState().updateCurrentSession(session => ({
                        ...session,
                        messages: session.messages.map(m => m.id === toolMsgId ? {
                            ...m,
                            text: streamedLog.trim() || '✅ Execution Complete',
                            rawParts: functionResponses,
                            isError: hasAnyError  // 标记工具执行是否失败
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
            // 检测用户主动取消：多种可能的 AbortError 格式
            const isUserAbort =
                error.name === 'AbortError' ||
                error instanceof DOMException ||
                error.message?.includes('aborted') ||
                error.message?.includes('Aborted');

            if (isUserAbort) {
                addMessage({ id: generateId(), role: 'system', text: '⛔ 用户已停止生成。', timestamp: Date.now() });
            } else {
                // 使用错误工厂创建详细的错误信息
                let errorInfo: AgentErrorInfo;

                try {
                  // fromError 会根据错误类型自动判断
                  errorInfo = fromError(
                    error,
                    error._requestInfo,
                    error._metadata
                  );
                } catch (e) {
                  // 如果 fromError 抛出（如 AbortError 已处理），使用通用错误
                  if (error.category === AgentErrorCategory.CONTENT) {
                    errorInfo = error as AgentErrorInfo;
                  } else {
                    errorInfo = {
                      category: AgentErrorCategory.API,
                      severity: 'medium' as any,
                      title: 'Agent 错误',
                      message: error.message || '未知错误',
                      suggestions: ['请重试', '查看控制台获取详细信息'],
                      recoverable: true,
                      debugData: {
                        rawError: error,
                        stack: error.stack,
                      },
                    };
                  }
                }

                console.error('[AgentEngine] Error:', JSON.stringify({
                  category: errorInfo.category,
                  title: errorInfo.title,
                  message: errorInfo.message,
                  rawError: error,
                  debugData: errorInfo.debugData,
                }, null, 2));

                // 格式化错误信息用于显示
                const errorDisplayText = formatErrorForDisplay(errorInfo);

                addMessage({
                  id: generateId(),
                  role: 'system',
                  text: errorDisplayText,
                  timestamp: Date.now(),
                  metadata: {
                    logType: 'error',
                    errorInfo: errorInfo, // 存储结构化错误信息供 UI 使用
                  },
                });
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
            isProcessingRef.current = false;  // 重置并发保护
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
