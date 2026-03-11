
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
import { buildSimpleHistory } from '../../domains/agentContext/historyBuilder';

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

      let prevLoopHadToolCalls = false;  // 追踪上一轮是否调用了工具（用于强制总结）
      let lastExecutedToolName: string | undefined;  // 追踪上一个执行的工具名称
      let forceSummaryRetried = false;   // 强制总结重试只做一次

      // 4. 进入 ReAct 循环
      while (keepGoing && loopCount < MAX_LOOPS) {
        if (signal.aborted) break;
        loopCount++;

        // 4.1 准备历史消息 (LLM Input Part 2: History)
        const currentGlobalSessions = useAgentStore.getState().sessions;
        const currentFreshSession = currentGlobalSessions.find(s => s.id === currentSessionId);
        const currentMessages = currentFreshSession?.messages || [];

        // 滑动窗口：只取最新的 N 条消息，但使用精细化分类器
        const totalMessages = currentMessages.length;
        let windowedMessages = buildSimpleHistory(currentMessages, { maxMessages: MAX_CONTEXT_MESSAGES });

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
            const toolNames = firstMsg.rawParts
              ?.filter((p: any) => p.functionCall)
              .map((p: any) => p.functionCall.name)
              .join(', ');
            console.warn(`[窗口-Start] 丢弃孤立 tool_calls 消息（窗口首条）: [${toolNames}]`);
            return fixWindowStart(msgs.slice(1));
          }

          // 情况3: 第一条是 user/system 但内容是 tool response (rawParts 有 functionResponse)
          // 这种情况是合法的，因为 tool response 可以作为新一轮的起始
          if ((firstMsg.role === 'user' || firstMsg.role === 'system') && firstMsg.rawParts?.some((p: any) => p.functionResponse)) {
            const toolNames = firstMsg.rawParts
              ?.filter((p: any) => p.functionResponse)
              .map((p: any) => p.functionResponse.name)
              .join(', ');
            console.warn(`[窗口-Start] 窗口首条是孤立 tool response（无对应 call），保留作上下文: [${toolNames}]`);
            return msgs;
          }

          return msgs;
        };

        // --- 滑动窗口内部完整性检查（最后防线） ---
        // buildSimpleHistory 已保证工具调用对完整性。
        // 此函数仅处理边界截断导致的孤立消息。
        // ⚠️ 并发工具模式：1条 model 消息 → N条 system 消息（1:N 关系）
        const fixWindowIntegrity = (msgs: any[]): any[] => {
          if (msgs.length === 0) return msgs;

          const result: any[] = [];

          // 用于追踪：最近一个进入 result 的 model/assistant（有 tool_calls）消息
          // 支持 1 model → N system 的并发模式
          let lastToolCallsMsg: any = null;

          for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];

            // 检查是否是 tool response 消息
            const hasToolResponse = (msg.role === 'user' || msg.role === 'system') &&
              msg.rawParts?.some((p: any) => p.functionResponse);

            if (hasToolResponse) {
              // ⚠️ 关键修复：检查 lastToolCallsMsg 而不是 result[-1]
              // 原因：并发工具下多条 system 响应连续出现，result[-1] 是上一个 system 响应，
              // 但它们都属于同一个 model tool_calls 消息，所以需要追踪该 model 消息
              if (!lastToolCallsMsg) {
                const toolNames = msg.rawParts
                  ?.filter((p: any) => p.functionResponse)
                  .map((p: any) => p.functionResponse.name)
                  .join(', ');
                console.warn(`[窗口-Integrity] 丢弃孤立 tool response（i=${i}，工具: [${toolNames}]），前方无 tool_calls`);
                continue;
              }
              // tool response 合法，继续
            } else {
              // 非 tool response 消息出现，重置 lastToolCallsMsg
              lastToolCallsMsg = null;
            }

            // 检查是否是带 tool_calls 的 assistant 消息
            const hasToolCalls = (msg.role === 'model' || msg.role === 'assistant') &&
              msg.rawParts?.some((p: any) => p.functionCall);

            if (hasToolCalls) {
              // 向前扫描：检查是否有对应的 tool response 紧随其后（跳过非 response 消息）
              let hasNextResponse = false;
              for (let j = i + 1; j < msgs.length; j++) {
                const next = msgs[j];
                const isResponse = (next?.role === 'user' || next?.role === 'system') &&
                  next?.rawParts?.some((p: any) => p.functionResponse);
                if (isResponse) {
                  hasNextResponse = true;
                  break;
                }
                // 如果遇到非 response 的实质性消息，就停止扫描
                const isSubstantial = next?.role === 'model' || next?.role === 'assistant' ||
                  (next?.role === 'user' && !next?.rawParts?.some((p: any) => p.functionResponse));
                if (isSubstantial) break;
              }

              if (!hasNextResponse) {
                const toolNames = msg.rawParts
                  ?.filter((p: any) => p.functionCall)
                  .map((p: any) => p.functionCall.name)
                  .join(', ');
                console.warn(`[窗口-Integrity] 丢弃孤立 tool_calls 消息（i=${i}，工具: [${toolNames}]），后方无 tool response`);
                continue;
              }

              // 记录这个有效的 tool_calls 消息
              lastToolCallsMsg = msg;
            }

            result.push(msg);
          }

          return result;
        };

        windowedMessages = fixWindowStart(windowedMessages);
        windowedMessages = fixWindowIntegrity(windowedMessages);
        const inContextCount = windowedMessages.length;
        const droppedCount = totalMessages - inContextCount;

        // ▼ 窗口构建摘要
        const windowSummary = windowedMessages.map((m, idx) => {
          const toolNames = m.rawParts
            ?.filter((p: any) => p.functionCall || p.functionResponse)
            .map((p: any) => p.functionCall?.name || p.functionResponse?.name)
            .join('+');
          return `  [${idx}] ${m.role}${toolNames ? `<${toolNames}>` : ''}`;
        }).join('\n');
        console.log(
          `[窗口-Summary] Loop#${loopCount} | 总消息: ${totalMessages} → 入窗: ${inContextCount}（丢弃: ${droppedCount}）\n${windowSummary}`
        );

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

        // ▼ 【原始 LLM 响应 - 未加工】
        const toolCallNames = toolParts.map((p: any) => p.functionCall.name).join(', ');
        console.log(
          `[LLM-Raw] Loop#${loopCount} | finishReason: ${aiMetadata?.finishReason ?? 'n/a'}` +
          ` | tokens: prompt=${aiMetadata?.promptTokens ?? 'n/a'} completion=${aiMetadata?.completionTokens ?? 'n/a'}` +
          ` | parts: ${parts.length}个` +
          ` | text长度: ${textPart ? textPart.text.length : 0}` +
          ` | tools: [${toolCallNames || '无'}]`
        );
        parts.forEach((p: any, i: number) => {
          if (p.text) {
            const preview = p.text.slice(0, 200).replace(/\n/g, '\u21b5');
            console.log(`[LLM-Raw]   part[${i}] TEXT(${p.text.length}chars): "${preview}${p.text.length > 200 ? '...' : ''}"`);
          } else if (p.functionCall) {
            console.log(`[LLM-Raw]   part[${i}] TOOL_CALL: ${p.functionCall.name}`, p.functionCall.args);
          } else if (p.thought !== undefined) {
            const t = String(p.thought);
            console.log(`[LLM-Raw]   part[${i}] THOUGHT(${t.length}chars): "${t.slice(0, 100).replace(/\n/g, '\u21b5')}${t.length > 100 ? '...' : ''}"`);
          } else {
            console.log(`[LLM-Raw]   part[${i}] UNKNOWN:`, JSON.stringify(p).slice(0, 200));
          }
        });

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

          // 并发执行所有工具调用
          console.log(`[AgentEngine] 并发执行 ${toolParts.length} 个工具: [${toolParts.map((p: any) => p.functionCall.name).join(', ')}]`);

          // 为每个工具预先创建 UI 消息
          const toolMsgIds: string[] = toolParts.map(() => generateId());

          // 创建初始 UI 状态消息（全部先出现）
          toolParts.forEach((toolPart: any, idx: number) => {
            const toolName = toolPart.functionCall.name;
            addMessage({
              id: toolMsgIds[idx],
              role: 'system',
              text: `⏳ Starting execution: ${toolName}...`,
              isToolOutput: true,
              timestamp: Date.now() + idx, // 微小偏移保证顺序
              metadata: { executingTools: toolName }
            });
          });

          // 并发执行所有工具
          const toolResults = await Promise.all(
            toolParts.map(async (toolPart: any, idx: number) => {
              const toolMsgId = toolMsgIds[idx];
              let streamedLog = '';
              let hasError = false;

              const logToUi = (text: string) => {
                streamedLog += (streamedLog ? '\n' : '') + text;
                editMessageContent(toolMsgId, streamedLog);
              };

              if (signal.aborted) {
                const { name, id } = toolPart.functionCall;
                return {
                  toolMsgId,
                  functionResponse: { functionResponse: { name, id, response: { result: '[ABORTED] User stopped execution' } } },
                  hasError: true,
                  streamedLog: '⛔ Execution Aborted',
                  toolName: name,
                };
              }

              const { name, args, id } = toolPart.functionCall;
              const resultString = await runTool(name, args, toolMsgId, signal, logToUi);
              hasError = resultString.startsWith('Error:') || resultString.startsWith('[SYSTEM ERROR]:');

              return {
                toolMsgId,
                functionResponse: { functionResponse: { name, id, response: { result: resultString } } },
                hasError,
                streamedLog: streamedLog.trim() || (hasError ? '❌ Execution Failed' : '✅ Execution Complete'),
                toolName: name,
              };
            })
          );

          // 标记 thinking 完成（如果有任何 thinking 工具）
          if (toolResults.some(r => r.toolName === 'thinking')) {
            hasCalledThinking = true;
          }

          // 标记本轮有工具调用（供下一轮检测是否需要强制总结）
          prevLoopHadToolCalls = true;
          // 记录最后一个执行的工具名称（非 thinking 工具才记录）
          const executedTools = toolResults.map(r => r.toolName).filter(Boolean);
          lastExecutedToolName = executedTools[executedTools.length - 1];
          forceSummaryRetried = false; // 重置：新的工具轮次允许再次重试

          const hasAnyError = toolResults.some(r => r.hasError);

          if (signal.aborted) {
            // 更新所有 UI 消息为已中止
            useAgentStore.getState().updateCurrentSession(session => ({
              ...session,
              messages: session.messages.map(m => {
                const result = toolResults.find(r => r.toolMsgId === m.id);
                if (!result) return m;
                return { ...m, text: result.streamedLog, rawParts: [result.functionResponse], isError: true };
              }),
              lastModified: Date.now()
            }));
            break;
          }

          // 更新所有 UI 消息为完成，并把 functionResponse 挂载到对应 system 消息上
          useAgentStore.getState().updateCurrentSession(session => ({
            ...session,
            messages: session.messages.map(m => {
              const result = toolResults.find(r => r.toolMsgId === m.id);
              if (!result) return m;
              return { ...m, text: result.streamedLog, rawParts: [result.functionResponse], isError: result.hasError };
            }),
            lastModified: Date.now()
          }));

        } else {
          // 没有工具调用
          if (!textPart) {
            // ⚠️ LLM 返回空响应（无 text 无 tools）
            // 注意：只有非 thinking 工具执行完后才能提示总结
            // thinking 只是思考过程，不代表工作完成
            if (prevLoopHadToolCalls && !forceSummaryRetried && lastExecutedToolName && lastExecutedToolName !== 'thinking') {
              forceSummaryRetried = true;
              console.warn(
                `[AgentEngine] ⚠️ Loop#${loopCount} 工作工具完成后 LLM 未输出总结，注入强制提醒并重试。` +
                ` toolName=${lastExecutedToolName} parts=${parts.length}`
              );
              addMessage({
                id: generateId(),
                role: 'system',
                text: '【系统提示】工作已完成，请立即用纯文字向用户汇报工作结果。',
                timestamp: Date.now(),
                metadata: { logType: 'system_reminder' }
              });
              prevLoopHadToolCalls = false;
            } else {
              console.warn(
                `[AgentEngine-EXIT] ❌ 退出原因: LLM空响应（无文本无工具）\n` +
                `  loop#=${loopCount} finishReason=${aiMetadata?.finishReason ?? 'n/a'} tokens=${aiMetadata?.completionTokens ?? 'n/a'}\n` +
                `  prevLoopHadToolCalls=${prevLoopHadToolCalls} forceSummaryRetried=${forceSummaryRetried} parts=${parts.length}\n` +
                `  lastTool=${lastExecutedToolName} (thinking后不强制总结)\n` +
                `  诊断: thinking工具后LLM应继续工作，若返回空响应可能是API问题`
              );
              keepGoing = false;
            }
          } else {
            console.log(
              `[AgentEngine-EXIT] ✅ 退出原因: 正常完成（LLM纯文本回复，无工具调用）\n` +
              `  loop#=${loopCount} text长度=${textPart.text.length} finishReason=${aiMetadata?.finishReason ?? 'n/a'}`
            );
            keepGoing = false;
          }
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
