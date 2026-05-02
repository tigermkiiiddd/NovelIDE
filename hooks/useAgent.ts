
import { useCallback, useEffect, useMemo } from 'react';
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
import { useSkillTriggerStore } from '../stores/skillTriggerStore';

import { findNodeByPath } from '../services/fileSystem';
import { getWindowedMessages } from '../domains/agentContext/windowing';
import i18n from '../i18n';
import { getAllToolsForLLM } from '../services/agent/tools/indexLazy';
import { useUsageStatsStore } from '../stores/usageStatsStore';
import {
  estimatePromptTokens,
  getPromptCalibrationFactor,
  resolveTokenLimit,
} from '../utils/tokenEstimator';

const isContentWriteTool = (toolName?: string): boolean =>
  toolName === 'write' ||
  toolName === 'edit' ||
  toolName === 'createFile' ||
  toolName === 'updateFile' ||
  toolName === 'patchFile';

// Facade Hook
export const useAgent = (
    files: FileNode[],
    project: ProjectMeta | undefined,
    activeFile: FileNode | null,
    tools: AgentToolsImplementation
) => {

  const usageRecords = useUsageStatsStore(state => state.records);
  const usageStatsLoaded = useUsageStatsStore(state => state.isLoaded);
  const loadUsageStats = useUsageStatsStore(state => state.loadRecords);

  useEffect(() => {
      if (!usageStatsLoaded) loadUsageStats();
  }, [usageStatsLoaded, loadUsageStats]);

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

  // --- 4. 辅助功能 (Token 估算、完整历史与审批逻辑) ---

  // 历史信息：主 Agent 不再按消息数滑动裁剪，只过滤 skipInHistory 与修复工具边界。
  const messageWindowInfo = useMemo(() => {
      const messages = currentSession?.messages || [];
      const total = messages.length;
      const inContext = getWindowedMessages(messages).length;
      const dropped = Math.max(0, total - inContext);
      return {
          total,
          inContext,
          dropped
      };
  }, [currentSession?.messages]);

  const tokenUsage = useMemo(() => {
      const limit = resolveTokenLimit(aiConfig.modelName, aiConfig.baseUrl, aiConfig.contextTokenLimit);

      const knowledgeNodes = useKnowledgeGraphStore.getState().nodes;
      const msgs = currentSession?.messages || [];
      const windowedMessages = getWindowedMessages(msgs);
      const toolsForMode = getAllToolsForLLM();
      const sysPrompt = constructSystemPrompt(
        files,
        project,
        todos,
        msgs,
        planMode,
        knowledgeNodes
      );

      const baseEstimate = estimatePromptTokens({
        systemInstruction: sysPrompt,
        messages: windowedMessages,
        tools: toolsForMode,
      });
      const provider = aiConfig.baseUrl?.toLowerCase().includes('anthropic') ? 'anthropic'
        : aiConfig.baseUrl?.includes('/paas/') ? 'glm'
        : 'openai-compatible';
      const calibration = getPromptCalibrationFactor(usageRecords, aiConfig.modelName, provider);
      const estimatedTokens = Math.ceil(baseEstimate * calibration);
      const percent = Math.min(100, (estimatedTokens / limit) * 100);

      return {
          used: estimatedTokens,
          limit: limit,
          percent: parseFloat(percent.toFixed(2))
      };
  }, [aiConfig.modelName, aiConfig.baseUrl, files, project, todos, currentSession?.messages, planMode, usageRecords]);

  // --- 技能激活由 Agent 自主通过 activate_skill 工具决定 ---
  const triggerSkill = (_text: string) => {
    // no-op: 保留接口兼容性，技能激活已改为 Agent 自主决定
  };

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

    if (change.fileName?.startsWith('05_正文草稿/') && isContentWriteTool(change.toolName)) {

      console.log('[AutoAnalysis] ✅ 触发条件满足，开始章节分析');

      // 添加系统消息通知用户
      addMessage({
        id: generateId(),
        role: 'system',
        text: i18n.t('storeMessages.autoAnalyzing', { fileName: change.fileName }),
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
          text: i18n.t('storeMessages.analysisComplete', { fileName: change.fileName }),
          timestamp: Date.now(),
          metadata: { logType: 'success' }
        });
      }).catch((err: Error) => {
        // 错误处理：记录到系统消息
        console.error('[AutoAnalysis] 分析失败:', err);
        addMessage({
          id: generateId(),
          role: 'system',
          text: i18n.t('storeMessages.analysisFailed', { error: err.message }),
          timestamp: Date.now(),
          metadata: { logType: 'error' }
        });
      });
    } else {
      console.log('[AutoAnalysis] ❌ 触发条件不满足');
    }
    // 记忆宫殿：文档变更自动提取
    const { autoExtraction } = useAgentStore.getState().aiConfig;
    if (autoExtraction?.document !== false &&
        change.fileName &&
        isContentWriteTool(change.toolName)) {
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
              text: i18n.t('storeMessages.knowledgeExtracted', { added: result.added, updated: result.updated, linked: result.linked }),
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

    // 如果用户发送消息时 questionnaire 正在进行中，取消它
    const activeQuestionnaire = useAgentStore.getState().sessions.find(
      s => s.id === currentSessionId
    )?.activeQuestionnaire;
    if (activeQuestionnaire?.status === 'active') {
      useAgentStore.getState().setActiveQuestionnaire(null);
    }

    const userMessage = { id: generateId(), role: 'user' as const, text, timestamp: Date.now() };
    const recentMessages = [...(currentSession?.messages || []), userMessage];

    addMessage(userMessage);

    // --- 技能触发检测：用户消息立即触发一次（不推进轮次） ---
    console.log('[sendMessage] triggerSkill 调用:', userMessage.text);
    triggerSkill(userMessage.text);

    setTimeout(() => engine.processTurn(), 0);
  }, [addMessage, currentSession?.messages, engine, currentSessionId, files, triggerSkill]);

  const regenerateMessage = useCallback(async (messageId: string) => {
      deleteMessagesFrom(messageId, true);
      // 重新校准技能 round（从 store 直接获取最新消息数）
      const newCount = useAgentStore.getState().sessions.find(s => s.id === currentSessionId)?.messages.length || 0;
      useSkillTriggerStore.getState().recalibrate(newCount);
      // 清除所有 pendingChanges，避免孤立的 tool_calls
      pendingChanges.forEach(c => removePendingChange(c.id));
      // 从消息列表取最后一条用户消息，触发技能检测
      const lastUserMsg = useAgentStore.getState().sessions.find(s => s.id === currentSessionId)?.messages.filter((m: ChatMessage) => m.role === 'user').pop();
      if (lastUserMsg) {
        triggerSkill(lastUserMsg.text);
      }
      setTimeout(() => engine.processTurn(), 0);
  }, [deleteMessagesFrom, engine, pendingChanges, removePendingChange, currentSessionId, files, triggerSkill]);

  const editUserMessage = useCallback(async (messageId: string, newText: string) => {
      editMessageContent(messageId, newText);
      deleteMessagesFrom(messageId, false);
      triggerSkill(newText);
      setTimeout(() => engine.processTurn(), 0);
  }, [editMessageContent, deleteMessagesFrom, engine, files, triggerSkill]);

  // Thinking Mode State - 基于当前会话状态
  const thinkingMode = currentSession?.thinkingEnabled ?? false;

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
    rejectPlanNote: usePlanStore.getState().rejectPlan,
    // Thinking Mode
    thinkingMode,
    toggleThinkingMode: useAgentStore.getState().toggleSessionThinking,
    // Questionnaire
    resumeProcessTurn: engine.processTurn,
  };
};
