
import { create } from 'zustand';
import {
  AIConfig,
  ChatSession,
  ChatMessage,
  TodoItem,
  PendingChange,
  DEFAULT_AI_CONFIG,
} from '../types';
import { dbAPI } from '../services/persistence';
import { generateId } from '../services/fileSystem';
import { useSkillTriggerStore } from './skillTriggerStore';
import i18n from '../i18n';

// 简单的 debounce 工具函数
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Lazy tool loading categories
type ToolCategory = 'memory' | 'character' | 'relationship' | 'outline';

interface AgentState {
  // Config
  aiConfig: AIConfig;
  setAiConfig: (config: AIConfig) => void;
  loadAIConfig: () => Promise<void>;

  // Sessions (Specific to the ACTIVE project)
  sessions: ChatSession[];
  currentSessionId: string | null;
  isSessionsLoading: boolean; // Added loading state for sessions

  // Active State
  isLoading: boolean;
  pendingChanges: PendingChange[];

  // Lazy Tool Loading State
  activatedCategories: ToolCategory[];
  setActivatedCategories: (categories: ToolCategory[]) => void;

  // UI State for Reviewing
  reviewingChangeId: string | null;
  setReviewingChangeId: (id: string | null) => void;
  
  // Actions
  loadProjectSessions: (projectId: string) => Promise<void>;
  createSession: (projectId: string, initialTitle?: string) => string;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => void;
  updateCurrentSession: (updater: (session: ChatSession) => ChatSession) => void;
  addRecalledKnowledgeNode: (nodeId: string) => void;
  removeRecalledKnowledgeNode: (nodeId: string) => void;
  addHiddenKnowledgeNode: (nodeId: string) => void;
  removeHiddenKnowledgeNode: (nodeId: string) => void;
  getCurrentSessionKnowledgeState: () => { recalledIds: string[]; hiddenIds: string[] };
  toggleSessionThinking: () => void;

  // Questionnaire Helpers
  setActiveQuestionnaire: (q: import('../types').Questionnaire | null) => void;
  updateQuestionnaireAnswer: (questionId: string, optionIds: string[]) => void;
  updateQuestionnaireTextAnswer: (questionId: string, text: string) => void;
  setQuestionnaireIndex: (index: number) => void;
  completeQuestionnaire: () => void;

  // Message Helpers
  addMessage: (message: ChatMessage) => void;
  editMessageContent: (messageId: string, newText: string) => void;
  updateMessageMetadata: (messageId: string, metadata: any) => void; // NEW
  deleteMessagesFrom: (startMessageId: string, inclusive: boolean) => void;

  setLoading: (loading: boolean) => void;
  
  // Todo Helpers
  setTodos: (todos: TodoItem[]) => void;

  // Plan Mode Helpers
  setPlanModeEnabled: (enabled: boolean) => void;

  // Approval Workflow
  addPendingChange: (change: PendingChange) => void;
  updatePendingChange: (id: string, updates: Partial<PendingChange>) => void;
  removePendingChange: (id: string) => void;
  clearPendingChanges: () => void;
}

// Helper to sync specific project sessions to IDB
const syncSessionsToDB = (projectId: string, sessions: ChatSession[]) => {
    console.log('[syncSessionsToDB] 保存会话到 IndexedDB, projectId:', projectId, '会话数量:', sessions.length);
    dbAPI.saveSessions(`novel-chat-sessions-${projectId}`, sessions);
};

// 创建防抖版本（1秒防抖）
const debouncedSyncSessionsToDB = debounce(syncSessionsToDB, 1000);

// Helper to sync pending changes to IDB
const syncPendingChangesToDB = (sessionId: string, changes: PendingChange[]) => {
    console.log('[syncPendingChangesToDB] 保存待审变更到 IndexedDB, sessionId:', sessionId, '变更数量:', changes.length);
    dbAPI.savePendingChanges(sessionId, changes);
};

// 创建防抖版本（500ms防抖）
const debouncedSyncPendingChangesToDB = debounce(syncPendingChangesToDB, 500);

// 全局加载标记，用于防止竞态条件
export const sessionLoadingState = {
    isLoading: false
};

export const useAgentStore = create<AgentState>((set, get) => ({
      aiConfig: DEFAULT_AI_CONFIG,
      
      setAiConfig: (config) => {
          set({ aiConfig: config });
          dbAPI.saveAIConfig(config);
      },

      loadAIConfig: async () => {
          const config = await dbAPI.getAIConfig();
          if (config) {
              // Merge with default to ensure new fields exists (e.g. if loading old config structure)
              const mergedConfig = {
                  ...DEFAULT_AI_CONFIG,
                  ...config,
                  openAIBackends: config.openAIBackends || DEFAULT_AI_CONFIG.openAIBackends,
                  activeOpenAIBackendId: config.activeOpenAIBackendId || DEFAULT_AI_CONFIG.activeOpenAIBackendId,
                  modelRoutes: config.modelRoutes || DEFAULT_AI_CONFIG.modelRoutes,
              };
              set({ aiConfig: mergedConfig });
          }
      },

      sessions: [],
      currentSessionId: null,
      isSessionsLoading: false, // Initial state
      isLoading: false,
      pendingChanges: [],
      activatedCategories: [],
      reviewingChangeId: null,

      setReviewingChangeId: (id) => set({ reviewingChangeId: id }),

      // Lazy Tool Loading
      setActivatedCategories: (categories) => {
        set({ activatedCategories: categories });
        dbAPI.saveActivatedCategories(categories);
      },

      loadProjectSessions: async (projectId: string) => {
          // 设置全局加载标记
          sessionLoadingState.isLoading = true;
          console.log('[loadProjectSessions] 开始加载会话, projectId:', projectId, '当前 isSessionsLoading:', get().isSessionsLoading);
          set({ isSessionsLoading: true });

          try {
            const sessions = await dbAPI.getSessions(`novel-chat-sessions-${projectId}`);
            console.log('[loadProjectSessions] 从 IndexedDB 读取到的会话:', sessions);

            if (sessions && sessions.length > 0) {
                // 只在有数据时才更新
                sessions.sort((a, b) => b.lastModified - a.lastModified);

                // 恢复上次保存的会话ID
                const savedSessionId = await dbAPI.getCurrentSessionId(projectId);
                console.log('[loadProjectSessions] 保存的会话ID:', savedSessionId);
                const sessionId = savedSessionId && sessions.find(s => s.id === savedSessionId)
                    ? savedSessionId
                    : sessions[0].id;

                console.log('[loadProjectSessions] 设置会话, sessionId:', sessionId, '会话数量:', sessions.length, '消息数量:', sessions[0]?.messages?.length || 0);

                // 恢复当前会话的 pendingChanges
                const savedPendingChanges = await dbAPI.getPendingChanges(sessionId);
                console.log('[loadProjectSessions] 恢复待审变更:', savedPendingChanges?.length || 0);

                set({
                    sessions,
                    currentSessionId: sessionId,
                    pendingChanges: savedPendingChanges || []
                });
            } else {
                console.log('[loadProjectSessions] 没有找到会话数据');
                // 没有数据时，保持 sessions 不变或设置为空数组
                set({ sessions: [], currentSessionId: null });
            }
          } catch (error) {
            console.error('[loadProjectSessions] 加载会话失败:', error);
            // 加载失败时，保留现有状态或设置为空
            set({ sessions: [], currentSessionId: null });
          } finally {
            console.log('[loadProjectSessions] 加载完成, isSessionsLoading = false');
            sessionLoadingState.isLoading = false; // 重置全局标记
            set({ isSessionsLoading: false }); // End loading
          }
      },

      createSession: (projectId: string, initialTitle = i18n.t('storeMessages.newSession')) => {
        const currentSessions: ChatSession[] = get().sessions || [];
        const newSession: ChatSession = {
          id: generateId(),
          projectId,
          title: initialTitle,
          messages: [],
          todos: [],
          lastModified: Date.now(),
          recalledKnowledgeNodeIds: [],
          hiddenKnowledgeNodeIds: [],
          thinkingPads: [],
        };

        // 新建会话时重置技能触发状态
        useSkillTriggerStore.getState().reset();

        const newSessions = [newSession, ...currentSessions];
        set({
          sessions: newSessions,
          currentSessionId: newSession.id,
          pendingChanges: [],
          activatedCategories: [],
          reviewingChangeId: null
        });

        syncSessionsToDB(projectId, newSessions);
        // Persist current session ID
        dbAPI.saveCurrentSessionId(projectId, newSession.id);
        return newSession.id;
      },

      switchSession: async (id) => {
        const { currentSessionId } = get();
        // Find the project ID from the current session
        const sessions = get().sessions;
        const session = sessions.find(s => s.id === id);
        if (session) {
          // 加载新会话的 pendingChanges
          const savedPendingChanges = await dbAPI.getPendingChanges(id);
          console.log('[switchSession] 加载待审变更:', savedPendingChanges?.length || 0);

          set({
            currentSessionId: id,
            pendingChanges: savedPendingChanges || [],
            reviewingChangeId: null
          });
          // Persist current session ID
          dbAPI.saveCurrentSessionId(session.projectId, id);

          // 恢复深度思考虚拟文件到 fileStore
          if (session.thinkingPads && session.thinkingPads.length > 0) {
            import('../services/agent/tools/deepThinkingTools').then(({ syncAllPadsToFileStore }) => {
              syncAllPadsToFileStore(session);
            });
          }
        }
      },

      deleteSession: (id) => {
        const { sessions, currentSessionId } = get();
        const sessionToDelete = sessions.find(s => s.id === id);
        if (!sessionToDelete) return;

        const projectId = sessionToDelete.projectId;
        const newSessions = sessions.filter(s => s.id !== id);

        let newCurrentId = currentSessionId;
        if (currentSessionId === id) {
             newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
        }

        set({ sessions: newSessions, currentSessionId: newCurrentId });
        syncSessionsToDB(projectId, newSessions);

        // Update or clear saved session ID
        dbAPI.saveCurrentSessionId(projectId, newCurrentId);
      },

      updateCurrentSession: (updater) => {
        const { currentSessionId, sessions } = get();
        if (!currentSessionId) return;
        
        const sessionIndex = sessions.findIndex(s => s.id === currentSessionId);
        if (sessionIndex === -1) return;

        const currentSession = sessions[sessionIndex];
        const updatedSession = updater(currentSession);
        
        const updatedSessions = [...sessions];
        updatedSessions[sessionIndex] = updatedSession;
        // Sort
        updatedSessions.sort((a, b) => b.lastModified - a.lastModified);
        
        set({ sessions: updatedSessions });
        syncSessionsToDB(currentSession.projectId, updatedSessions);
      },

      addRecalledKnowledgeNode: (nodeId) => {
        get().updateCurrentSession(session => ({
          ...session,
          recalledKnowledgeNodeIds: session.recalledKnowledgeNodeIds.includes(nodeId)
            ? session.recalledKnowledgeNodeIds
            : [...session.recalledKnowledgeNodeIds, nodeId],
        }));
      },

      removeRecalledKnowledgeNode: (nodeId) => {
        get().updateCurrentSession(session => ({
          ...session,
          recalledKnowledgeNodeIds: session.recalledKnowledgeNodeIds.filter(id => id !== nodeId),
        }));
      },

      addHiddenKnowledgeNode: (nodeId) => {
        get().updateCurrentSession(session => ({
          ...session,
          hiddenKnowledgeNodeIds: session.hiddenKnowledgeNodeIds.includes(nodeId)
            ? session.hiddenKnowledgeNodeIds
            : [...session.hiddenKnowledgeNodeIds, nodeId],
        }));
      },

      removeHiddenKnowledgeNode: (nodeId) => {
        get().updateCurrentSession(session => ({
          ...session,
          hiddenKnowledgeNodeIds: session.hiddenKnowledgeNodeIds.filter(id => id !== nodeId),
        }));
      },

      getCurrentSessionKnowledgeState: () => {
        const { sessions, currentSessionId } = get();
        const session = sessions.find(s => s.id === currentSessionId);
        return {
          recalledIds: session?.recalledKnowledgeNodeIds || [],
          hiddenIds: session?.hiddenKnowledgeNodeIds || [],
        };
      },

      toggleSessionThinking: () => {
        const { currentSessionId, sessions } = get();
        if (!currentSessionId) return;
        const session = sessions.find(s => s.id === currentSessionId);
        if (!session) return;

        const newEnabled = !session.thinkingEnabled;
        get().updateCurrentSession(s => ({
          ...s,
          thinkingEnabled: newEnabled,
        }));
      },

      setActiveQuestionnaire: (q) => {
        get().updateCurrentSession(session => ({
          ...session,
          activeQuestionnaire: q,
        }));
      },

      updateQuestionnaireAnswer: (questionId, optionIds) => {
        get().updateCurrentSession(session => {
          if (!session.activeQuestionnaire) return session;
          return {
            ...session,
            activeQuestionnaire: {
              ...session.activeQuestionnaire,
              questions: session.activeQuestionnaire.questions.map(q =>
                q.id === questionId ? { ...q, userSelectedOptionIds: optionIds } : q
              ),
            },
          };
        });
      },

      updateQuestionnaireTextAnswer: (questionId, text) => {
        get().updateCurrentSession(session => {
          if (!session.activeQuestionnaire) return session;
          return {
            ...session,
            activeQuestionnaire: {
              ...session.activeQuestionnaire,
              questions: session.activeQuestionnaire.questions.map(q =>
                q.id === questionId ? { ...q, userTextAnswer: text } : q
              ),
            },
          };
        });
      },

      setQuestionnaireIndex: (index) => {
        get().updateCurrentSession(session => {
          if (!session.activeQuestionnaire) return session;
          return {
            ...session,
            activeQuestionnaire: {
              ...session.activeQuestionnaire,
              currentIndex: index,
            },
          };
        });
      },

      completeQuestionnaire: () => {
        const { currentSessionId, sessions } = get();
        if (!currentSessionId) return;
        const session = sessions.find(s => s.id === currentSessionId);
        if (!session?.activeQuestionnaire) return;

        const q = session.activeQuestionnaire;

        // 汇总答案为 user 消息文本
        const lines: string[] = ['[澄清回答]'];
        q.questions.forEach((question, idx) => {
          const selected = question.userSelectedOptionIds || [];
          const textAnswer = question.userTextAnswer?.trim();

          lines.push(`\nQ${idx + 1}: ${question.text}`);

          // 过滤掉 __other__，用自由输入替代
          const selectedLabels = selected
            .filter(sid => sid !== '__other__')
            .map(sid => {
              const opt = question.options.find(o => o.id === sid);
              return opt ? opt.label : sid;
            });
          const hasOther = selected.includes('__other__');

          if (selectedLabels.length > 0 && hasOther && textAnswer) {
            lines.push(`A: ${selectedLabels.join(', ')} + 其他: ${textAnswer}`);
          } else if (selectedLabels.length > 0 && hasOther) {
            lines.push(`A: ${selectedLabels.join(', ')} + 其他（未填写）`);
          } else if (selectedLabels.length > 0) {
            lines.push(`A: ${selectedLabels.join(', ')}`);
          } else if (hasOther && textAnswer) {
            lines.push(`A: ${textAnswer}`);
          } else if (hasOther) {
            lines.push('A: 其他（未填写）');
          } else {
            lines.push('A: （未作答）');
          }
        });
        const answerText = lines.join('\n');

        const answerMessage = {
          id: generateId(),
          role: 'user' as const,
          text: answerText,
          timestamp: Date.now(),
        };

        get().updateCurrentSession(s => ({
          ...s,
          messages: [...s.messages, answerMessage],
          activeQuestionnaire: null,
          lastModified: Date.now(),
        }));
      },

      addMessage: (message) => {
        get().updateCurrentSession(session => {
            let title = session.title;
            // First user message sets title
            if (session.messages.length === 0 && message.role === 'user') {
                title = message.text.slice(0, 15) + (message.text.length > 15 ? '...' : '');
            }
            return {
                ...session,
                title,
                messages: [...session.messages, message],
                lastModified: Date.now()
            };
        });
      },

      editMessageContent: (messageId, newText) => {
        const session = get().sessions.find(s => s.id === get().currentSessionId);
        const msgExists = session?.messages.some((m: ChatMessage) => m.id === messageId);
        if (!msgExists) {
          console.warn('[editMessageContent] 消息不存在:', messageId, '当前消息IDs:', session?.messages.map((m: ChatMessage) => m.id));
        }
        get().updateCurrentSession(session => ({
            ...session,
            messages: session.messages.map((m: ChatMessage) => m.id === messageId ? { ...m, text: newText } : m),
            lastModified: Date.now()
        }));
      },

      // NEW: Allow updating metadata without changing text content
      updateMessageMetadata: (messageId, metadata) => {
        get().updateCurrentSession(session => ({
            ...session,
            messages: session.messages.map((m: ChatMessage) => m.id === messageId ? { ...m, metadata: { ...m.metadata, ...metadata } } : m),
            lastModified: Date.now()
        }));
      },

      deleteMessagesFrom: (startMessageId, inclusive) => {
        get().updateCurrentSession(session => {
            const index = session.messages.findIndex((m: ChatMessage) => m.id === startMessageId);
            if (index === -1) return session;

            const cutIndex = inclusive ? index : index + 1;
            const newMessages = session.messages.slice(0, cutIndex);

            return {
                ...session,
                messages: newMessages,
                lastModified: Date.now()
            };
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setTodos: (todos) => {
          get().updateCurrentSession(session => ({
              ...session,
              todos,
              lastModified: Date.now()
          }));
      },

      setPlanModeEnabled: (enabled) => {
          get().updateCurrentSession(session => ({
              ...session,
              planModeEnabled: enabled,
              lastModified: Date.now()
          }));
      },

      addPendingChange: (change) => {
        const { currentSessionId, pendingChanges } = get();
        const newPendingChanges = [...pendingChanges, change];
        // 不再自动设置 reviewingChangeId
        // DiffViewer 现在只基于当前文件的 mergedPendingChange 触发
        // 避免跨文件的 change 显示在错误的编辑器中
        set({ pendingChanges: newPendingChanges });
        // 持久化到 IndexedDB
        if (currentSessionId) {
          debouncedSyncPendingChangesToDB(currentSessionId, newPendingChanges);
        }
      },
      
      updatePendingChange: (id, updates) => {
        const { currentSessionId, pendingChanges } = get();
        const newPendingChanges = pendingChanges.map((c: PendingChange) => c.id === id ? { ...c, ...updates } : c);
        set({ pendingChanges: newPendingChanges });
        // 持久化到 IndexedDB
        if (currentSessionId) {
          debouncedSyncPendingChangesToDB(currentSessionId, newPendingChanges);
        }
      },

      removePendingChange: (id) => {
        const { currentSessionId, pendingChanges, reviewingChangeId } = get();
        const newPendingChanges = pendingChanges.filter((c: PendingChange) => c.id !== id);
        set({
          pendingChanges: newPendingChanges,
          reviewingChangeId: reviewingChangeId === id ? null : reviewingChangeId
        });
        // 持久化到 IndexedDB
        if (currentSessionId) {
          debouncedSyncPendingChangesToDB(currentSessionId, newPendingChanges);
        }
      },

      clearPendingChanges: () => {
        const { currentSessionId } = get();
        set({ pendingChanges: [], reviewingChangeId: null });
        // 清除 IndexedDB 中的数据
        if (currentSessionId) {
          dbAPI.deletePendingChanges(currentSessionId);
        }
      }
}));

// 恢复持久化的 activatedCategories
const VALID_CATEGORIES: ToolCategory[] = ['memory', 'character', 'relationship', 'outline'];
dbAPI.getActivatedCategories().then(categories => {
  if (categories && categories.length > 0) {
    const valid = categories.filter((c): c is ToolCategory => VALID_CATEGORIES.includes(c as ToolCategory));
    if (valid.length > 0) {
      useAgentStore.setState({ activatedCategories: valid });
      console.log('[AgentStore] 恢复已激活工具类别:', valid);
    }
  }
});

// 导出 ToolCategory 类型供其他模块使用
export type { ToolCategory };
