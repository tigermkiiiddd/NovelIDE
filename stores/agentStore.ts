
import { create } from 'zustand';
import { DEFAULT_AI_CONFIG } from '../types';

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
  
  // UI State for Reviewing
  reviewingChangeId: string | null;
  setReviewingChangeId: (id: string | null) => void;
  
  // Actions
  loadProjectSessions: (projectId: string) => Promise<void>; 
  createSession: (projectId: string, initialTitle?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateCurrentSession: (updater: (session: ChatSession) => ChatSession) => void;
  
  // Message Helpers
  addMessage: (message: ChatMessage) => void;
  editMessageContent: (messageId: string, newText: string) => void;
  updateMessageMetadata: (messageId: string, metadata: any) => void; // NEW
  deleteMessagesFrom: (startMessageId: string, inclusive: boolean) => void;

  setLoading: (loading: boolean) => void;
  
  // Todo Helpers
  setTodos: (todos: TodoItem[]) => void;
  
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
                  activeOpenAIBackendId: config.activeOpenAIBackendId || DEFAULT_AI_CONFIG.activeOpenAIBackendId
              };
              set({ aiConfig: mergedConfig });
          }
      },

      sessions: [],
      currentSessionId: null,
      isSessionsLoading: false, // Initial state
      isLoading: false,
      pendingChanges: [],
      reviewingChangeId: null,

      setReviewingChangeId: (id) => set({ reviewingChangeId: id }),

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
                set({
                    sessions,
                    currentSessionId: sessionId
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

      createSession: (projectId, initialTitle = '新会话') => {
        const currentSessions = get().sessions || [];
        const newSession: ChatSession = {
          id: generateId(),
          projectId,
          title: initialTitle,
          messages: [],
          todos: [],
          lastModified: Date.now()
        };

        const newSessions = [newSession, ...currentSessions];
        set({
          sessions: newSessions,
          currentSessionId: newSession.id,
          pendingChanges: [],
          reviewingChangeId: null
        });

        syncSessionsToDB(projectId, newSessions);
        // Persist current session ID
        dbAPI.saveCurrentSessionId(projectId, newSession.id);
        return newSession.id;
      },

      switchSession: (id) => {
        const { currentSessionId } = get();
        // Find the project ID from the current session
        const sessions = get().sessions;
        const session = sessions.find(s => s.id === id);
        if (session) {
          set({ currentSessionId: id, pendingChanges: [], reviewingChangeId: null });
          // Persist current session ID
          dbAPI.saveCurrentSessionId(session.projectId, id);
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
        get().updateCurrentSession(session => ({
            ...session,
            messages: session.messages.map(m => m.id === messageId ? { ...m, text: newText } : m),
            lastModified: Date.now()
        }));
      },

      // NEW: Allow updating metadata without changing text content
      updateMessageMetadata: (messageId, metadata) => {
        get().updateCurrentSession(session => ({
            ...session,
            messages: session.messages.map(m => m.id === messageId ? { ...m, metadata: { ...m.metadata, ...metadata } } : m),
            lastModified: Date.now()
        }));
      },

      deleteMessagesFrom: (startMessageId, inclusive) => {
        get().updateCurrentSession(session => {
            const index = session.messages.findIndex(m => m.id === startMessageId);
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

      addPendingChange: (change) => set(state => ({ pendingChanges: [...state.pendingChanges, change] })),
      
      updatePendingChange: (id, updates) => set(state => ({
          pendingChanges: state.pendingChanges.map(c => c.id === id ? { ...c, ...updates } : c)
      })),

      removePendingChange: (id) => set(state => ({ 
          pendingChanges: state.pendingChanges.filter(c => c.id !== id),
          reviewingChangeId: state.reviewingChangeId === id ? null : state.reviewingChangeId
      })),

      clearPendingChanges: () => set({ pendingChanges: [], reviewingChangeId: null })
}));
