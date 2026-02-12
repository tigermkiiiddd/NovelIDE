
import { create } from 'zustand';
import { ChatSession, ChatMessage, TodoItem, PendingChange, AIConfig, DEFAULT_AI_CONFIG } from '../types';
import { generateId } from '../services/fileSystem';
import { dbAPI } from '../services/persistence';

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
    dbAPI.saveSessions(`novel-chat-sessions-${projectId}`, sessions);
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
          set({ sessions: [], currentSessionId: null, isSessionsLoading: true }); // Start loading
          try {
            const sessions = await dbAPI.getSessions(`novel-chat-sessions-${projectId}`);
            if (sessions) {
                // Sort by last modified desc
                sessions.sort((a, b) => b.lastModified - a.lastModified);
                set({ 
                    sessions,
                    currentSessionId: sessions.length > 0 ? sessions[0].id : null
                });
            }
          } finally {
            set({ isSessionsLoading: false }); // End loading
          }
      },

      createSession: (projectId, initialTitle = '新会话') => {
        const newSession: ChatSession = {
          id: generateId(),
          projectId, 
          title: initialTitle,
          messages: [],
          todos: [],
          lastModified: Date.now()
        };
        
        const newSessions = [newSession, ...get().sessions];
        set({
          sessions: newSessions,
          currentSessionId: newSession.id,
          pendingChanges: [],
          reviewingChangeId: null
        });
        
        syncSessionsToDB(projectId, newSessions);
        return newSession.id;
      },

      switchSession: (id) => {
        set({ currentSessionId: id, pendingChanges: [], reviewingChangeId: null });
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
