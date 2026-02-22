
import { useCallback, useMemo } from 'react';
import { ChatMessage, FileNode, ProjectMeta, PendingChange } from '../types';
import { generateId } from '../services/fileSystem';
import { constructSystemPrompt } from '../services/resources/skills/coreProtocol';
import { useAgentContext } from './agent/useAgentContext';
import { useAgentTools, AgentToolsImplementation } from './agent/useAgentTools';
import { useAgentEngine, MAX_CONTEXT_MESSAGES } from './agent/useAgentEngine';
import { executeApprovedChange } from '../services/agent/toolRunner';
import { usePlanStore } from '../stores/planStore';

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
      const total = currentSession?.messages?.length || 0;
      const inContext = Math.min(total, MAX_CONTEXT_MESSAGES);
      const dropped = Math.max(0, total - MAX_CONTEXT_MESSAGES);
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

      const sysPrompt = constructSystemPrompt(files, project, activeFile, todos);
      const msgs = currentSession?.messages || [];
      const msgsText = msgs.reduce((acc, m) => {
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
  }, [aiConfig.modelName, aiConfig.baseUrl, files, project, activeFile, todos, currentSession?.messages]);

  const approveChange = useCallback((change: PendingChange) => {
    // 构造包含追踪功能的 Action 集合
    const fullActions = {
        ...tools,
        setTodos,
        trackFileAccess: (fname: string) => toolsHook.accessedFiles.current.add(fname)
    };

    const result = executeApprovedChange(change, fullActions);
    removePendingChange(change.id);
    
    addMessage({ 
        id: generateId(), role: 'system', 
        text: `✅ User Approved: ${change.description}\nResult: ${result}`, timestamp: Date.now() 
    });
  }, [tools, addMessage, removePendingChange, setTodos, toolsHook.accessedFiles]);

  const rejectChange = useCallback((change: PendingChange) => {
      removePendingChange(change.id);
      addMessage({ 
          id: generateId(), role: 'system', 
          text: `❌ User Rejected: ${change.description}`, timestamp: Date.now() 
      });
  }, [addMessage, removePendingChange]);

  // --- 5. 交互处理 (UI Handlers) ---

  const sendMessage = useCallback(async (text: string) => {
    if (!currentSessionId) return;
    addMessage({ id: generateId(), role: 'user', text, timestamp: Date.now() });
    setTimeout(() => engine.processTurn(), 0);
  }, [addMessage, engine, currentSessionId]);

  const regenerateMessage = useCallback(async (messageId: string) => {
      deleteMessagesFrom(messageId, true);
      setTimeout(() => engine.processTurn(), 0);
  }, [deleteMessagesFrom, engine]);

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
