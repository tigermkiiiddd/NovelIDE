
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ChatSession, ChatMessage, TodoItem, PendingChange, AIConfig, DEFAULT_AI_CONFIG } from '../types';
import { generateId } from '../services/fileSystem';

interface AgentState {
  // Config
  aiConfig: AIConfig;
  setAiConfig: (config: AIConfig) => void;

  // Sessions
  sessions: ChatSession[];
  currentSessionId: string | null;
  
  // Active State (Derived from current session usually, but kept hot for UI)
  isLoading: boolean;
  pendingChanges: PendingChange[];
  
  // UI State for Reviewing
  reviewingChangeId: string | null;
  setReviewingChangeId: (id: string | null) => void;
  
  // Actions
  createSession: (initialTitle?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateCurrentSession: (updater: (session: ChatSession) => ChatSession) => void;
  
  // Message Helpers (Shortcuts to update current session)
  addMessage: (message: ChatMessage) => void;
  // 新增：修改特定消息内容
  editMessageContent: (messageId: string, newText: string) => void;
  // 新增：删除指定消息ID之后（包含该消息或不包含）的所有消息，用于回滚上下文
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

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      aiConfig: DEFAULT_AI_CONFIG,
      setAiConfig: (config) => set({ aiConfig: config }),

      sessions: [],
      currentSessionId: null,
      isLoading: false,
      pendingChanges: [],
      reviewingChangeId: null,

      setReviewingChangeId: (id) => set({ reviewingChangeId: id }),

      createSession: (initialTitle = '新会话') => {
        const newSession: ChatSession = {
          id: generateId(),
          title: initialTitle,
          messages: [],
          todos: [],
          lastModified: Date.now()
        };
        set(state => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: newSession.id,
          pendingChanges: [], // Clear pending changes on new session
          reviewingChangeId: null
        }));
        return newSession.id;
      },

      switchSession: (id) => {
        set({ currentSessionId: id, pendingChanges: [], reviewingChangeId: null });
      },

      deleteSession: (id) => {
        set(state => {
          const newSessions = state.sessions.filter(s => s.id !== id);
          let newCurrentId = state.currentSessionId;
          
          if (state.currentSessionId === id) {
             newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
          }
          
          return { sessions: newSessions, currentSessionId: newCurrentId };
        });
        
        // If no sessions left, create one automatically
        if (get().sessions.length === 0) {
            get().createSession();
        }
      },

      updateCurrentSession: (updater) => {
        set(state => {
           if (!state.currentSessionId) return state;
           const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSessionId);
           if (sessionIndex === -1) return state;

           const updatedSessions = [...state.sessions];
           updatedSessions[sessionIndex] = updater(updatedSessions[sessionIndex]);
           // Sort by last modified
           updatedSessions.sort((a, b) => b.lastModified - a.lastModified);
           
           return { sessions: updatedSessions };
        });
      },

      addMessage: (message) => {
        get().updateCurrentSession(session => {
            // Auto-update title if it's the first user message
            let title = session.title;
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
          // Clear reviewing state if the removed change was the one being viewed
          reviewingChangeId: state.reviewingChangeId === id ? null : state.reviewingChangeId
      })),

      clearPendingChanges: () => set({ pendingChanges: [], reviewingChangeId: null })
    }),
    {
      name: 'novel-genie-agent-storage',
      storage: createJSONStorage(() => localStorage), // IDB is better, but keep simple for refactor first
      partialize: (state) => ({ 
          sessions: state.sessions, 
          currentSessionId: state.currentSessionId,
          aiConfig: state.aiConfig
      }), 
    }
  )
);
