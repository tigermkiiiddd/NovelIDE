
import { useCallback, useMemo } from 'react';
import { ChatMessage, FileNode, ProjectMeta, PendingChange } from '../types';
import { generateId } from '../services/fileSystem';
import { constructSystemPrompt } from '../services/resources/skills/coreProtocol';
import { useAgentContext } from './agent/useAgentContext';
import { useAgentTools, AgentToolsImplementation } from './agent/useAgentTools';
import { useAgentEngine } from './agent/useAgentEngine';
import { executeApprovedChange } from '../services/agent/toolRunner';
import { usePlanStore } from '../stores/planStore';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';
import { useAgentStore } from '../stores/agentStore';
import { useFileStore } from '../stores/fileStore';
import { findNodeByPath } from '../services/fileSystem';
import { getWindowedMessages, MAX_CONTEXT_MESSAGES } from '../domains/agentContext/windowing';

// Facade Hook
export const useAgent = (
    files: FileNode[],
    project: ProjectMeta | undefined,
    activeFile: FileNode | null,
    tools: AgentToolsImplementation
) => {
  // 1. 初始化上下文 (Store & AI Service)
  const context = useAgentContext(project);
  const {
      currentSession, currentSessionId,
      addMessage, deleteMessagesFrom, editMessageContent,
      pendingChanges, removePendingChange, setTodos,
      aiConfig, setAiConfig,
      isLoading,
      handleCreateSession, switchSession, deleteSession,
      projectSessions
  } = context;

  const todos = currentSession?.todos || [];

  // Plan Mode State - 使用 useMemo 根据当前会话动态计算 currentPlanNote
  const planMode = usePlanStore(state => state.planMode.isEnabled);
  const planNotes = usePlanStore(state => state.planNotes);
  const currentPlanNote = useMemo(() => {
    return planNotes.find(n => n.sessionId === currentSessionId) || null;
  }, [planNotes, currentSessionId]);

  // 2. 初始化工具层 (Tools & Shadow Read & Anti-Loop)
  const toolsHook = useAgentTools({
      files,
      todos,
      tools,
      aiServiceInstance: context.aiServiceInstance,
      addMessage,
      editMessageContent,
      addPendingChange: context.addPendingChange,
      setTodos,
      // Plan Mode
      planMode,
      currentPlanNote,
      sessionId: currentSessionId || undefined,
      projectId: project?.id
  });

  // 3. 初始化引擎层 (Core Loop)
  const engine = useAgentEngine({
      context,
      toolsHook,
      files,
      project,
      activeFile,
      // Plan Mode
      planMode,
      currentPlanNote
  });

  // --- 4. 辅助功能 (Token 估算 & 滑动窗口 & 审批逻辑) ---

  // 滑动窗口信息：用于 UI 显示
  const messageWindowInfo = useMemo(() => {
      const messages = currentSession?.messages || [];
      const total = messages.length;
      const inContext = getWindowedMessages(messages, MAX_CONTEXT_MESSAGES).length;
      const dropped = Math.max(0, total - inContext);
      return {
          total,
          inContext,
          dropped,
          windowSize: MAX_CONTEXT_MESSAGES
      };
  }, [currentSession?.messages]);

  const tokenUsage = useMemo(() => {
      const MAX_TOKENS_GEMINI = 1000000;
      const MAX_TOKENS_DEFAULT = 128000;
      // Check if using Gemini via OpenAI-compatible endpoint
      const isGemini = aiConfig.modelName?.toLowerCase().includes('gemini') ||
                       aiConfig.baseUrl?.includes('generativelanguage.googleapis.com');
      const limit = isGemini ? MAX_TOKENS_GEMINI : MAX_TOKENS_DEFAULT;

      const knowledgeNodes = useKnowledgeGraphStore.getState().nodes;
      const msgs = currentSession?.messages || [];
      const windowedMessages = getWindowedMessages(msgs, MAX_CONTEXT_MESSAGES);
      const sysPrompt = constructSystemPrompt(
        files,
        project,
        todos,
        msgs,
        planMode,
        knowledgeNodes
      );
      const msgsText = windowedMessages.reduce((acc: string, m: ChatMessage) => {
          let content = m.text;
          if (m.rawParts) content += JSON.stringify(m.rawParts);
          return acc + content;
      }, "");

      const estimatedTokens = Math.ceil((sysPrompt.length + msgsText.length) / 2);
      const percent = Math.min(100, (estimatedTokens / limit) * 100);

      return {
          used: estimatedTokens,
          limit: limit,
          percent: parseFloat(percent.toFixed(2))
      };
  }, [aiConfig.modelName, aiConfig.baseUrl, files, project, todos, currentSession?.messages, planMode]);

  const approveChange = useCallback((change: PendingChange) => {
    // 构造包含追踪功能的 Action 集合
    const fullActions = {
        ...tools,
        setTodos,
        trackFileAccess: (fname: string) => toolsHook.accessedFiles.current.add(fname)
    };

    const result = executeApprovedChange(change, fullActions);
    removePendingChange(change.id);

    // Clear virtual file if this was a createFile operation
    if (change.toolName === 'createFile') {
      useFileStore.getState().setVirtualFile(null);
    }

    addMessage({
        id: generateId(), role: 'system',
        text: `✅ User Approved: ${change.description}\nResult: ${result}`, timestamp: Date.now()
    });

    // 新增：检测是否为"05_正文草稿"文件的写入操作
    console.log('[AutoAnalysis] 检查文件:', change.fileName, '工具:', change.toolName);

    if (change.fileName?.startsWith('05_正文草稿/') &&
        (change.toolName === 'createFile' || change.toolName === 'updateFile' || change.toolName === 'patchFile')) {

      console.log('[AutoAnalysis] ✅ 触发条件满足，开始章节分析');

      // 添加系统消息通知用户
      addMessage({
        id: generateId(),
        role: 'system',
        text: `🔍 正在自动分析章节: ${change.fileName}`,
        timestamp: Date.now(),
        metadata: { logType: 'info' }
      });

      // 异步触发提取（非阻塞）
      const { useChapterAnalysisStore } = require('../stores/chapterAnalysisStore');
      const chapterAnalysisStore = useChapterAnalysisStore.getState();

      chapterAnalysisStore.triggerExtraction(
        change.fileName,
        currentSessionId || '',
        project?.id || ''
      ).then(() => {
        // 成功后通知用户
        addMessage({
          id: generateId(),
          role: 'system',
          text: `✅ 章节分析完成: ${change.fileName}`,
          timestamp: Date.now(),
          metadata: { logType: 'success' }
        });
      }).catch((err: Error) => {
        // 错误处理：记录到系统消息
        console.error('[AutoAnalysis] 分析失败:', err);
        addMessage({
          id: generateId(),
          role: 'system',
          text: `⚠️ 章节分析失败: ${err.message}`,
          timestamp: Date.now(),
          metadata: { logType: 'error' }
        });
      });
    } else {
      console.log('[AutoAnalysis] ❌ 触发条件不满足');
    }
    // 知识图谱：文档变更自动提取
    const { autoExtraction } = useAgentStore.getState().aiConfig;
    if (autoExtraction?.document !== false &&
        change.fileName &&
        (change.toolName === 'createFile' || change.toolName === 'updateFile' || change.toolName === 'patchFile')) {
      const currentFiles = useFileStore.getState().files;
      const targetFile = findNodeByPath(currentFiles, change.fileName);

      if (targetFile?.content) {
        useKnowledgeGraphStore
          .getState()
          .triggerDocumentExtraction(change.fileName, targetFile.content)
          .then((result) => {
            if (!result || result.added + result.updated + result.linked === 0) return;
            addMessage({
              id: generateId(),
              role: 'system',
              text: `🧠 已从文档提取知识：新增 ${result.added} 条，更新 ${result.updated} 条，关联 ${result.linked} 条`,
              timestamp: Date.now(),
              metadata: { logType: 'success', extractionSummary: result.summary, filePath: change.fileName }
            });
          })
          .catch((error: Error) => {
            console.error('[DocumentMemory] approveChange extraction failed', error);
          });
      }
    }
  }, [tools, addMessage, removePendingChange, setTodos, toolsHook.accessedFiles, currentSessionId, project]);

  const rejectChange = useCallback((change: PendingChange) => {
      removePendingChange(change.id);

      // Clear virtual file if this was a createFile operation
      if (change.toolName === 'createFile') {
        useFileStore.getState().setVirtualFile(null);
      }

      addMessage({
          id: generateId(), role: 'system',
          text: `❌ User Rejected: ${change.description}`, timestamp: Date.now()
      });
  }, [addMessage, removePendingChange]);

  // --- 5. 交互处理 (UI Handlers) ---

  const sendMessage = useCallback(async (text: string) => {
    if (!currentSessionId) return;
    const userMessage = { id: generateId(), role: 'user' as const, text, timestamp: Date.now() };
    const recentMessages = [...(currentSession?.messages || []), userMessage];

    addMessage(userMessage);

    // 对话自动提取
    const { autoExtraction } = useAgentStore.getState().aiConfig;
    if (autoExtraction?.conversation !== false) {
      setTimeout(() => {
        useKnowledgeGraphStore
          .getState()
          .triggerConversationExtraction(userMessage.text, recentMessages.map(m => ({ role: m.role, text: m.text })))
          .then((result) => {
            if (!result || result.added + result.updated + result.linked === 0) return;

            addMessage({
              id: generateId(),
              role: 'system',
              text: `🧠 已自动沉淀知识：新增 ${result.added} 条，更新 ${result.updated} 条，关联 ${result.linked} 条`,
              timestamp: Date.now(),
              metadata: { logType: 'success', extractionSummary: result.summary },
            });
          })
          .catch((error: Error) => {
            console.error('[ConversationMemory] trigger failed', error);
          });
      }, 0);
    }

    setTimeout(() => engine.processTurn(), 0);
  }, [addMessage, currentSession?.messages, engine, currentSessionId]);

  const regenerateMessage = useCallback(async (messageId: string) => {
      deleteMessagesFrom(messageId, true);
      // 清除所有 pendingChanges，避免孤立的 tool_calls
      pendingChanges.forEach(c => removePendingChange(c.id));
      setTimeout(() => engine.processTurn(), 0);
  }, [deleteMessagesFrom, engine, pendingChanges, removePendingChange]);

  const editUserMessage = useCallback(async (messageId: string, newText: string) => {
      editMessageContent(messageId, newText);
      deleteMessagesFrom(messageId, false);
      setTimeout(() => engine.processTurn(), 0);
  }, [editMessageContent, deleteMessagesFrom, engine]);

  return {
    messages: currentSession?.messages || [],
    isLoading,
    sendMessage,
    stopGeneration: engine.stopGeneration,
    regenerateMessage,
    editUserMessage,
    todos,
    sessions: projectSessions,
    currentSessionId,
    createNewSession: handleCreateSession,
    switchSession,
    deleteSession,
    aiConfig,
    updateAiConfig: setAiConfig,
    pendingChanges,
    approveChange,
    rejectChange,
    tokenUsage,
    messageWindowInfo,
    // Plan Mode
    planMode,
    togglePlanMode: usePlanStore.getState().togglePlanMode,
    setPlanModeEnabled: usePlanStore.getState().setPlanModeEnabled,
    planNotes,
    currentPlanNote,
    submitPlanForReview: usePlanStore.getState().submitForReview,
    approvePlanNote: usePlanStore.getState().approvePlan,
    rejectPlanNote: usePlanStore.getState().rejectPlan
  };
};
