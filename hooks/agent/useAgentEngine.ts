
import { useRef, useCallback } from 'react';
import { ChatMessage, FileNode, ProjectMeta, TodoItem } from '../../types';
import { generateId } from '../../services/fileSystem';
import { constructSystemPrompt } from '../../services/resources/skills/coreProtocol';
import { allTools } from '../../services/agent/tools/index';
import { useAgentStore } from '../../stores/agentStore';
import { useAgentContext } from './useAgentContext';
import { useAgentTools } from './useAgentTools';

interface UseAgentEngineProps {
    context: ReturnType<typeof useAgentContext>;
    toolsHook: ReturnType<typeof useAgentTools>;
    files: FileNode[];
    project: ProjectMeta | undefined;
    activeFile: FileNode | null;
}

export const useAgentEngine = ({
    context,
    toolsHook,
    files,
    project,
    activeFile
}: UseAgentEngineProps) => {
    const { 
        currentSessionId, addMessage, editMessageContent, 
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
            // 注意：必须直接从 Store 获取最新状态，因为闭包中的 state 可能不是最新的
            const globalSessions = useAgentStore.getState().sessions;
            const freshSession = globalSessions.find(s => s.id === currentSessionId);
            const freshTodos = freshSession?.todos || [];
            
            // 3. 构建 System Prompt
            const fullSystemInstruction = constructSystemPrompt(files, project, activeFile, freshTodos);
            
            let loopCount = 0;
            const MAX_LOOPS = 10;
            let keepGoing = true;

            // 4. 进入 ReAct 循环
            while (keepGoing && loopCount < MAX_LOOPS) {
                if (signal.aborted) break;
                loopCount++;

                // 4.1 准备历史消息
                const currentGlobalSessions = useAgentStore.getState().sessions;
                const currentFreshSession = currentGlobalSessions.find(s => s.id === currentSessionId);
                const currentMessages = currentFreshSession?.messages || [];

                // 格式化为 API 需要的结构
                const apiHistory = currentMessages.map(m => {
                    let apiRole = m.role;
                    // Fix: 这里的 system 是指 UI 上的系统提示（如"User Approved"），给 LLM 看作 User 输入
                    if (m.role === 'system') apiRole = 'user'; 
                    
                    if (m.rawParts) return { role: apiRole, parts: m.rawParts };
                    return { role: apiRole === 'system' ? 'user' : apiRole, parts: [{ text: m.text }] };
                });

                // 4.2 调用 LLM
                // if (loopCount === 1) console.log("🤖 [System Prompt]:", fullSystemInstruction);

                const response = await aiServiceInstance.sendMessage(
                    apiHistory, 
                    '', // 当前消息已在 apiHistory 中
                    fullSystemInstruction, 
                    allTools,
                    signal
                );

                if (signal.aborted) break;

                const candidates = response.candidates;
                if (!candidates || candidates.length === 0) throw new Error("No response from Agent");

                const content = candidates[0].content;
                const parts = content.parts;
                
                // 4.3 处理文本响应
                const textPart = parts.find((p: any) => p.text);
                const toolParts = parts.filter((p: any) => p.functionCall);
                
                // Construct Debug Payload for UI
                const debugPayload = { 
                    systemInstruction: fullSystemInstruction, 
                    apiHistoryPreview: apiHistory.slice(-3), // Only show last 3 for perf, full history in raw
                    totalHistoryLength: apiHistory.length
                };

                // CRITICAL: Always add a MODEL message if there's any content (text OR tool calls).
                // This allows the UI to render the "Input" (Arguments) block.
                if (textPart || toolParts.length > 0) {
                    const displayText = textPart ? textPart.text : ''; // Don't fake "Action:..." text, let UI handle empty text
                    addMessage({ 
                        id: generateId(), 
                        role: 'model', 
                        text: displayText, 
                        rawParts: parts, // Store RAW parts so UI can render Tool Input Args
                        timestamp: Date.now(), 
                        metadata: { debugPayload } 
                    });
                }

                // 4.4 处理工具调用
                if (toolParts.length > 0) {
                    // UI UX OPTIMIZATION:
                    // Force a small delay between the "Model Planning" (Input) message and the "System Execution" (Output) message.
                    // This breaks React's render batching and ensures the user sees the Input bubble APPEAR FIRST,
                    // satisfying the feeling of "Sequential Operations".
                    await new Promise(resolve => setTimeout(resolve, 50));

                    const functionResponses: any[] = [];
                    const executingToolNames = toolParts.map((p: any) => p.functionCall.name).join(', ');
                    
                    // 创建 UI 上的工具执行状态消息 (System Role)
                    const toolMsgId = generateId();
                    let streamedLog = '';
                    
                    // Real-time logger callback
                    const logToUi = (text: string) => {
                        streamedLog += (streamedLog ? '\n' : '') + text;
                        // Force update the UI message content immediately
                        editMessageContent(toolMsgId, streamedLog);
                    };

                    addMessage({ 
                        id: toolMsgId, 
                        role: 'system', 
                        text: `⏳ Starting execution: ${executingToolNames}...`, 
                        isToolOutput: true, 
                        timestamp: Date.now(),
                        // Inject names immediately so UI can show "Executing: readFile..." instead of generic loading
                        metadata: { executingTools: executingToolNames }
                    });

                    // 依次执行工具
                    for (const part of toolParts) {
                        if (signal.aborted) break;
                        if (!part.functionCall) continue;
                        const { name, args, id } = part.functionCall;

                        // Execute
                        const resultString = await runTool(name, args, toolMsgId, signal, logToUi);

                        functionResponses.push({ 
                            functionResponse: { name, id, response: { result: resultString } } 
                        });
                    }

                    if (signal.aborted) break;

                    // 更新 UI 消息状态为完成，并附带 rawParts 以便下一轮 API 调用使用
                    // IMPORTANT: We must store the functionResponses in rawParts so the NEXT turn includes them in history
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
        addMessage, editMessageContent, setLoading, runTool, resetErrorTracker
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
