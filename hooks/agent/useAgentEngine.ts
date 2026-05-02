
import { useRef, useCallback, useMemo } from 'react';
import { ChatMessage, ChatSession, FileNode, ProjectMeta, TodoItem, PlanNote, ContentPart } from '../../types';
import { generateId } from '../../services/fileSystem';
import { constructSystemPrompt } from '../../services/resources/skills/coreProtocol';
import { getAllToolsForLLM } from '../../services/agent/tools/indexLazy';
import { enhanceL2WithSemantics } from '../../domains/memory/memoryStackService';
import { useAgentStore } from '../../stores/agentStore';
import { usePlanStore } from '../../stores/planStore';
import { useKnowledgeGraphStore } from '../../stores/knowledgeGraphStore';


import { lifecycleManager } from '../../domains/agentContext/toolLifecycle';
import { useAgentContext } from './useAgentContext';
import { useAgentTools } from './useAgentTools';
import {
  fromError,
  checkFinishReason,
  contentError,
  formatErrorForDisplay,
} from '../../services/agent/errorFactory';
import { AgentErrorInfo, AgentErrorCategory } from '../../types/agentErrors';
import { useUsageStatsStore } from '../../stores/usageStatsStore';
import { UsageCallType } from '../../types/usageStats';
import {
  createApiHistoryPreview,
  getWindowedMessages,
} from '../../domains/agentContext/windowing';
import { buildCompressedHistoryView } from '../../domains/agentContext/contextCompression';
import { estimatePromptTokens, resolveTokenLimit } from '../../utils/tokenEstimator';

// read 类工具前缀列表 — 用于对话提取时过滤掉纯查询结果
const READ_TOOL_PREFIXES = [
  'read', 'readFile', 'listFiles', 'glob', 'grep', 'search_',
  'query_', 'get', 'skills_list', 'activate_skill'
];

const ensureFunctionCallIds = (parts: any[]): any[] => parts.map((part: any) => {
  if (!part?.functionCall || part.functionCall.id) return part;
  return {
    ...part,
    functionCall: {
      ...part.functionCall,
      id: generateId(),
    },
  };
});

/**
 * 过滤对话消息，用于知识提取：
 * 1. 范围：从最近一条 user 消息开始到当前（本轮对话）
 * 2. 排除 read/list/search/query/get 类工具结果
 * 3. 保留 write/edit/create/patch/update/manage 类工具结果
 * 4. 始终保留 user 和 model 的文本消息
 */
function filterMessagesForExtraction(
  messages: ChatMessage[]
): Array<{ role: string; text: string }> {
  if (!messages || messages.length === 0) return [];

  // 找到最近一条 user 消息的位置（作为本轮对话起点）
  let startIndex = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      startIndex = i;
      break;
    }
  }

  const roundMessages = messages.slice(startIndex);

  return roundMessages
    .filter((m) => {
      // 始终保留 user 和 model 的文本消息
      if (m.role === 'user' || m.role === 'model') return true;

      // 排除非工具输出的 system 消息（如系统提示、停止通知）
      if (!m.isToolOutput) return false;

      // 获取工具名（rawParts[0] 是 FunctionResponsePart）
      const firstPart = m.rawParts?.[0];
      const toolName = firstPart && 'functionResponse' in firstPart
        ? (firstPart as Extract<ContentPart, { functionResponse: unknown }>).functionResponse?.name
        : undefined;
      if (!toolName) return true; // 无法判断时保留

      // 判断是否为 read 类工具
      const isReadTool = READ_TOOL_PREFIXES.some(
        (prefix) => toolName === prefix || toolName.startsWith(prefix)
      );

      if (isReadTool) {
        console.log(`[ConversationMemory] 过滤 read 工具结果: ${toolName}`);
        return false;
      }

      return true;
    })
    .map((m) => ({ role: m.role, text: m.text }));
}

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

    // 轮次递增（每条用户消息只递增一次）
    lifecycleManager.advanceRound();

    const llmCallStartTime = Date.now();

    try {
      // 2. 获取最新上下文
      const globalSessions = useAgentStore.getState().sessions;
      const freshSession = globalSessions.find(s => s.id === currentSessionId);
      const freshTodos = freshSession?.todos || [];

      // 3. 构建 System Prompt (LLM Input Part 1)
      // 获取记忆宫殿数据
      const knowledgeNodes = useKnowledgeGraphStore.getState().nodes;
      const fullSystemInstruction = constructSystemPrompt(
        files,
        project,
        freshTodos,
        freshSession?.messages,  // 传递会话消息历史（用于 L2 按需话题检测）
        planMode,  // 传递 Plan 模式状态
        knowledgeNodes  // 传递记忆宫殿节点
      );

      // 后台语义增强 L2（为下一轮准备，不阻塞当前轮）
      enhanceL2WithSemantics(
        knowledgeNodes,
        freshSession?.messages?.filter((m: any) => m.role === 'user').slice(-1)[0]?.text || '',
      ).catch(() => {}); // 静默失败，不影响主流程

      let loopCount = 0;
      const MAX_LOOPS = 90;
      let keepGoing = true;


      // 4. 进入 ReAct 循环
      while (keepGoing && loopCount < MAX_LOOPS) {
        if (signal.aborted) break;
        loopCount++;

        // --- 检测进行中的 questionnaire，有则暂停循环等待用户 ---
        const session = useAgentStore.getState().sessions.find(s => s.id === currentSessionId);
        if (session?.activeQuestionnaire?.status === 'active') {
          keepGoing = false;
          break;
        }

        // 4.1 准备历史消息 (LLM Input Part 2: History)
        const currentGlobalSessions = useAgentStore.getState().sessions;
        const currentFreshSession = currentGlobalSessions.find(s => s.id === currentSessionId);
        const currentMessages = currentFreshSession?.messages || [];

        // Lazy loading must be evaluated per loop so search_tools/activate_skill
        // changes are visible to the very next model call in this user turn.
        const toolsForMode = getAllToolsForLLM();
        // 完整历史：不按消息数裁剪，只过滤 skipInHistory 并修复工具调用边界。
        const totalMessages = currentMessages.length;
        const windowedMessages = getWindowedMessages(currentMessages);
        const currentAiConfig = useAgentStore.getState().aiConfig;
        const tokenLimit = resolveTokenLimit(
          currentAiConfig.modelName,
          currentAiConfig.baseUrl,
          currentAiConfig.contextTokenLimit
        );
        const compressionResult = buildCompressedHistoryView({
          messages: windowedMessages,
          systemInstruction: fullSystemInstruction,
          tools: toolsForMode,
          tokenLimit,
        });
        const historyMessages = compressionResult.messages;

        const inContextCount = historyMessages.length;
        const droppedCount = totalMessages - inContextCount;

        // ▼ 窗口构建摘要
        const windowSummary = historyMessages.map((m, idx) => {
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
        const apiHistory = createApiHistoryPreview(historyMessages);
        const estimatedPromptTokens = estimatePromptTokens({
          systemInstruction: fullSystemInstruction,
          messages: historyMessages,
          tools: toolsForMode,
        });

        // --- CRITICAL: IMMEDIATE INPUT VISUALIZATION ---
        // Identify the trigger message for this turn (The User message or the Tool Result message)
        // and attach the generated prompt/history metadata to it IMMEDIATELY.
        const lastMsg = currentMessages[currentMessages.length - 1];
        if (lastMsg) {
          const debugPayload = {
            systemInstruction: fullSystemInstruction,
            apiHistoryPreview: apiHistory,
            totalHistoryLength: totalMessages,
            // 历史上下文信息
            historyContext: {
              inContext: inContextCount,
              dropped: droppedCount,
              total: totalMessages
            },
            contextCompression: {
              compressed: compressionResult.compressed,
              compressedUntilMessageId: compressionResult.compressedUntilMessageId,
              originalMessageCount: compressionResult.debug.originalMessageCount,
              sentMessageCount: compressionResult.debug.sentMessageCount,
              compressedMessageCount: compressionResult.debug.compressedMessageCount,
              originalEstimatedTokens: compressionResult.debug.originalEstimatedTokens,
              compressedEstimatedTokens: compressionResult.debug.compressedEstimatedTokens,
              thresholdTokens: compressionResult.debug.thresholdTokens,
              compressionNodePreview: compressionResult.debug.compressionNodePreview,
              recentDocumentRefs: compressionResult.debug.recentDocumentRefs,
            },
          };
          updateMessageMetadata(lastMsg.id, { debugPayload });
        }

        // 4.2 调用 LLM (Network Call)
        // 动态设置 max_tokens：
        // - 如果有工具可用，使用默认值（不限制，因为工具参数可能很长）
        // - 如果没有工具（纯文字回复），限制为 800 tokens（约 400-600 字）
        const maxTokensForTextReply = 800;
        const shouldLimitTokens = toolsForMode.length === 0;

        // 读取当前会话的思考模式设置（会话级覆盖全局配置）
        const currentSessionForThinking = useAgentStore.getState().sessions.find(s => s.id === currentSessionId);
        const thinkingEnabled = currentSessionForThinking?.thinkingEnabled;

        const response = await aiServiceInstance.sendMessage(
          apiHistory,
          '', // 当前消息已在 apiHistory 中
          fullSystemInstruction,
          toolsForMode,  // 使用根据模式选择的工具
          signal,
          undefined,  // forceToolName
          shouldLimitTokens ? maxTokensForTextReply : undefined,  // maxTokensOverride
          undefined,  // temperatureOverride
          undefined,  // modelOverride
          thinkingEnabled  // thinkingEnabledOverride（会话级覆盖）
        );

        // Extract API metadata for debug display
        const apiMetadata = response._metadata;
        const aiMetadata = response._aiMetadata;

        // 记录成功调用统计
        if (aiMetadata?.usage) {
          const callType: UsageCallType = planMode ? 'outline'
            : toolsForMode.some(t => t.function?.name?.includes('extract') || t.function?.name?.includes('analyze')) ? 'extraction'
            : 'main';
          const provider = (() => {
            const baseUrl = useAgentStore.getState().aiConfig.baseUrl || '';
            if (baseUrl.toLowerCase().includes('anthropic')) return 'anthropic';
            if (baseUrl.includes('/paas/')) return 'glm';
            return 'openai-compatible';
          })();
          useUsageStatsStore.getState().addRecord({
            id: generateId(),
            timestamp: Date.now(),
            projectId: project?.id,
            sessionId: currentSessionId,
            callType,
            model: aiMetadata.model || useAgentStore.getState().aiConfig.modelName || 'unknown',
            provider,
            promptTokens: aiMetadata.usage.prompt_tokens || 0,
            estimatedPromptTokens,
            completionTokens: aiMetadata.usage.completion_tokens || 0,
            totalTokens: aiMetadata.usage.total_tokens || 0,
            cacheHitTokens: aiMetadata.usage.cache_hit_tokens,
            cacheMissTokens: aiMetadata.usage.cache_miss_tokens,
            durationMs: aiMetadata.duration || (Date.now() - llmCallStartTime),
            status: 'success',
          });
        }

        if (signal.aborted) break;

        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
          // 使用错误工厂创建空响应错误
          throw contentError('empty', aiMetadata, response);
        }

        const content = candidates[0].content;
        const rawParts = content.parts;

        // 防御性保护：部分提供方可能返回空 parts，避免“无工具调用→直接退出”的静默失败
        if (!rawParts || rawParts.length === 0) {
          throw contentError('empty', aiMetadata, response);
        }
        const parts = ensureFunctionCallIds(rawParts);

        // 检查 finish_reason 并处理内容问题
        const finishReasonError = checkFinishReason(
          aiMetadata?.finishReason,
          aiMetadata,
          response
        );
        if (finishReasonError) {
          console.warn('[AgentEngine] finish_reason issue:', finishReasonError);
        }

        // --- P0: 截断保护 ---
        // 当 finishReason='length' 且有 tool_calls 时，验证每个 args 的 JSON 完整性
        // 不完整的工具调用不执行，合成 error tool response 替代
        if (aiMetadata?.finishReason === 'length') {
          const rawToolParts = parts.filter((p: any) => p.functionCall);
          if (rawToolParts.length > 0) {
            const truncatedTools: string[] = [];
            for (const tp of rawToolParts) {
              const args = tp.functionCall.args;
              // 尝试 JSON 序列化验证完整性
              try {
                if (args !== undefined && args !== null) {
                  JSON.stringify(args); // 如果 args 是对象，能 stringify 说明完整
                }
              } catch {
                truncatedTools.push(tp.functionCall.name);
              }
              // args 为 undefined 或空字符串也视为截断
              if (args === undefined || args === null || args === '') {
                truncatedTools.push(tp.functionCall.name);
              }
            }

            if (truncatedTools.length > 0) {
              console.warn(`[AgentEngine] 截断检测：${truncatedTools.join(', ')} 参数不完整，跳过执行`);
              // 为截断的工具生成错误响应（不执行）
              // 保留 reasoning part 仅用于 UI 展示；发送 API 历史时会过滤 reasoning_content。
              const reasoningParts = parts.filter((p: any) => p.reasoning);
              addMessage({
                id: generateId(),
                role: 'model',
                text: '',
                rawParts: [
                  ...reasoningParts,
                  ...rawToolParts.map((tp: any) => ({
                    functionCall: tp.functionCall
                  }))
                ],
                timestamp: Date.now(),
                metadata: { loopCount, responseWarnings: [`⚠️ 参数被截断，工具未执行: ${truncatedTools.join(', ')}`] },
              });
              // 合成 error tool response
              for (const tp of rawToolParts) {
                addMessage({
                  id: generateId(),
                  role: 'system',
                  text: `❌ 参数被截断，未执行。请缩短参数后重试。`,
                  rawParts: [{ functionResponse: { name: tp.functionCall.name, id: tp.functionCall.id, response: { result: 'Error: 参数被截断，请重试' } } }],
                  isToolOutput: true,
                  timestamp: Date.now(),
                });
              }
              continue; // 继续循环，让 LLM 重试
            }
          }
        }

        // 4.3 处理文本响应
        const textPart = parts.find((p: any) => p.text);
        const toolParts = parts.filter((p: any) => p.functionCall);
        const reasoningParts = parts.filter((p: any) => p.reasoning);

        // 二次防御：parts 存在但既无文本也无工具也无推理（例如 provider 返回空字符串/空工具数组）
        if (!textPart && toolParts.length === 0 && reasoningParts.length === 0) {
          throw contentError('empty', aiMetadata, response);
        }

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
          } else if (p.reasoning !== undefined) {
            const r = String(p.reasoning);
            console.log(`[LLM-Raw]   part[${i}] REASONING(${r.length}chars): "${r.slice(0, 100).replace(/\n/g, '\u21b5')}${r.length > 100 ? '...' : ''}"`);
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

          // --- 检测 final_answer：提取 answer 并终止循环 ---
          const finalAnswerPart = toolParts.find((p: any) => p.functionCall.name === 'final_answer');
          if (finalAnswerPart) {
            const args = finalAnswerPart.functionCall.args || {};
            const answerText = args.answer || textPart?.text || '';

            // 如果 answer 非空，更新最后一条 model 消息为最终回复
            if (answerText) {
              const currentMsgs = useAgentStore.getState().sessions.find(s => s.id === currentSessionId)?.messages || [];
              const lastModelMsg = [...currentMsgs].reverse().find(m => m.role === 'model');
              if (lastModelMsg) {
                editMessageContent(lastModelMsg.id, answerText);
              }
            }

            // 生成标准 tool response（让 historyBuilder 不丢弃）
            addMessage({
              id: generateId(),
              role: 'system',
              text: '',
              rawParts: [{ functionResponse: { name: 'final_answer', id: finalAnswerPart.functionCall.id, response: { result: 'ok', status: args.status || 'completed' } } }],
              isToolOutput: true,
              timestamp: Date.now(),
            });

            console.log(`[AgentEngine-EXIT] final_answer 调用，状态: ${args.status}`);

            // 对话结束，触发知识提取（过滤 read 类工具，保留 write 类产出）
            const { autoExtraction } = useAgentStore.getState().aiConfig;
            if (autoExtraction?.conversation !== false) {
              const session = useAgentStore.getState().sessions.find(s => s.id === currentSessionId);
              if (session?.messages && session.messages.length > 0) {
                const recentMessages = session.messages.slice(-20);
                useKnowledgeGraphStore
                  .getState()
                  .triggerConversationExtraction(
                    textPart?.text || '',
                    filterMessagesForExtraction(recentMessages)
                  )
                  .then((result) => {
                    if (!result) return;
                    const hasExtracted = result.added + result.updated + result.linked > 0;
                    if (hasExtracted) {
                      addMessage({
                        id: generateId(),
                        role: 'system',
                        text: `🧠 已自动沉淀知识：新增 ${result.added} 条，更新 ${result.updated} 条，关联 ${result.linked} 条`,
                        timestamp: Date.now(),
                        metadata: { logType: 'success', extractionSummary: result.summary },
                      });
                    }
                  })
                  .catch((error: Error) => {
                    console.error('[ConversationMemory] final_answer extraction failed', error);
                  });
              }
            }

            keepGoing = false;
            continue;
          }

          // --- 内部工具：thinking + reflection 静默记录（deep_thinking 走正常工具执行路径） ---
          const internalToolNames = ['reflection'];
          const internalParts = toolParts.filter((p: any) =>
            internalToolNames.includes(p.functionCall.name)
          );
          const actionParts = toolParts.filter((p: any) =>
            !internalToolNames.includes(p.functionCall.name)
          );

          // 为内部工具生成 function response（保留在历史中，UI 通过 ToolCallBlock 显示）
          if (internalParts.length > 0) {
            internalParts.forEach((tp: any) => {
              const args = tp.functionCall.args || {};
              const toolName = tp.functionCall.name;

              if (toolName === 'reflection') {
                console.log(
                  `[AgentEngine] reflection:\n` +
                  `  焦点: ${args.focus}\n` +
                  `  置信度: ${args.confidence ?? 'N/A'}\n` +
                  `  观察: ${(args.observation || '').slice(0, 150)}\n` +
                  `  分析: ${(args.analysis || '').slice(0, 200)}\n` +
                  `  结论: ${(args.conclusion || '').slice(0, 150)}`
                );
              }

              addMessage({
                id: generateId(),
                role: 'system',
                text: '',
                rawParts: [{ functionResponse: { name: toolName, id: tp.functionCall.id, response: { result: 'ok' } } }],
                isToolOutput: true,
                timestamp: Date.now(),
              });
            });
          }

          // 如果只有内部工具没有其他工具，继续循环
          if (actionParts.length === 0) {
            continue;
          }

          // 并发执行剩余工具调用
          console.log(`[AgentEngine] 并发执行 ${actionParts.length} 个工具: [${actionParts.map((p: any) => p.functionCall.name).join(', ')}]`);

          // 为每个工具预先创建 UI 消息
          const toolMsgIds: string[] = actionParts.map(() => generateId());

          // 创建初始 UI 状态消息（全部先出现）
          actionParts.forEach((toolPart: any, idx: number) => {
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
            actionParts.map(async (toolPart: any, idx: number) => {
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
                  thinking: toolPart.functionCall.args?.thinking,
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
                thinking: args?.thinking,
              };
            })
          );

          const hasAnyError = toolResults.some(r => r.hasError);

          if (signal.aborted) {
            // 更新所有 UI 消息为已中止
            useAgentStore.getState().updateCurrentSession((session: ChatSession) => ({
              ...session,
              messages: session.messages.map((m: ChatMessage) => {
                const result = toolResults.find(r => r.toolMsgId === m.id);
                if (!result) return m;
                return { ...m, text: result.streamedLog, rawParts: [result.functionResponse], isError: true };
              }),
              lastModified: Date.now()
            }));
            break;
          }

          // 更新所有 UI 消息为完成，并把 functionResponse 挂载到对应 system 消息上
          console.log('[ToolResult挂载] step1 - toolResults:', toolResults.length);
          try {
            useAgentStore.getState().updateCurrentSession((session: ChatSession) => {
              console.log('[ToolResult挂载] step2 - session.messages:', session.messages.length, 'sysIds:', session.messages.filter(m => m.role === 'system').map(m => m.id).join(','));
              const newMsgs = session.messages.map((m: ChatMessage) => {
                const result = toolResults.find(r => r.toolMsgId === m.id);
                if (!result) return m;
                console.log('[ToolResult挂载] step3 - matched msgId:', m.id, 'fnResp:', JSON.stringify(result.functionResponse).slice(0, 100));
                return { ...m, text: result.streamedLog, rawParts: [result.functionResponse], isError: result.hasError };
              });
              return { ...session, messages: newMsgs, lastModified: Date.now() };
            });
            console.log('[ToolResult挂载] step4 - update done');
          } catch (e) {
            console.error('[ToolResult挂载] error:', e, String(e));
          }

          // AI thinking 独立显示，技能激活由 Agent 通过 activate_skill 工具自主决定

        } else {
          // 没有工具调用，直接结束
          console.warn(
            `[AgentEngine-EXIT] 退出: 无工具调用\n` +
            `  loop#=${loopCount} textPart=${!!textPart} parts=${parts.length}`
          );
          keepGoing = false;
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
        addMessage({ id: generateId(), role: 'system', text: '⛔ 用户已停止生成。', timestamp: Date.now(), skipInHistory: true });
        // 记录中断统计
        useUsageStatsStore.getState().addRecord({
          id: generateId(),
          timestamp: Date.now(),
          projectId: project?.id,
          sessionId: currentSessionId,
          callType: planMode ? 'outline' : 'main',
          model: useAgentStore.getState().aiConfig.modelName || 'unknown',
          provider: 'openai-compatible',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          durationMs: Date.now() - llmCallStartTime,
          status: 'aborted',
        });
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
          skipInHistory: true,
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
    }
    isProcessingRef.current = false;  // P1: 防止状态锁死
    setLoading(false);

    // 用户主动中断，触发知识提取（总结已产生的对话内容）
    const { autoExtraction } = useAgentStore.getState().aiConfig;
    if (autoExtraction?.conversation !== false) {
      const session = useAgentStore.getState().sessions.find(s => s.id === currentSessionId);
      if (session?.messages && session.messages.length > 0) {
        const recentMessages = session.messages.slice(-20);
        useKnowledgeGraphStore
          .getState()
          .triggerConversationExtraction(
            '[用户中断]',
            filterMessagesForExtraction(recentMessages)
          )
          .then((result) => {
            if (!result) return;
            const hasExtracted = result.added + result.updated + result.linked > 0;
            if (hasExtracted) {
              addMessage({
                id: generateId(),
                role: 'system',
                text: `🧠 已自动沉淀知识：新增 ${result.added} 条，更新 ${result.updated} 条，关联 ${result.linked} 条`,
                timestamp: Date.now(),
                metadata: { logType: 'success', extractionSummary: result.summary },
              });
            }
          })
          .catch((error: Error) => {
            console.error('[ConversationMemory] stopGeneration extraction failed', error);
          });
      }
    }
  }, [setLoading, currentSessionId, addMessage]);

  return {
    processTurn,
    stopGeneration
  };
};
