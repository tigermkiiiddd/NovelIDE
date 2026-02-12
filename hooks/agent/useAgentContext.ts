
import { useEffect, useMemo, useCallback } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { AIService } from '../../services/geminiService';
import { ProjectMeta, AIProvider } from '../../types';

// 单例 Service 实例 (保持原有的单例模式)
let aiServiceInstance: AIService | null = null;

export const useAgentContext = (project: ProjectMeta | undefined) => {
    const store = useAgentStore();
    const { 
        aiConfig, sessions, currentSessionId, isSessionsLoading,
        createSession, switchSession, loadProjectSessions,
        setLoading, updateMessageMetadata
    } = store;

    const projectId = project?.id;

    // --- 1. AI Service 生命周期管理 ---
    useEffect(() => {
        if (!aiServiceInstance) {
            aiServiceInstance = new AIService(aiConfig);
        } else {
            aiServiceInstance.updateConfig(aiConfig);
        }
    }, [aiConfig]);

    // --- 2. 会话管理 (Session Management) ---
    // Load sessions from IDB when projectId changes
    useEffect(() => {
        if (projectId) {
            loadProjectSessions(projectId);
        }
    }, [projectId, loadProjectSessions]);

    // 由于 Store 现在只包含当前项目的会话，这里的 filter 其实是冗余的，但保留以防万一
    const projectSessions = useMemo(() => {
        if (!projectId) return [];
        return sessions.filter(s => s.projectId === projectId);
    }, [sessions, projectId]);

    const currentSession = projectSessions.find(s => s.id === currentSessionId);

    // 自动会话同步：确保当前选中的会话有效
    useEffect(() => {
        if (!projectId) return;
        if (isSessionsLoading) return; // 等待加载完成，防止数据覆盖

        const hasSessions = projectSessions.length > 0;
        const isCurrentSessionValid = projectSessions.some(s => s.id === currentSessionId);

        if (hasSessions) {
            if (!isCurrentSessionValid) {
                // Switch to the most recent session
                switchSession(projectSessions[0].id);
            }
        } else {
            // 如果加载完成且确实没有会话，则自动创建一个
            if (currentSessionId === null) {
                createSession(projectId);
            }
        }
    }, [projectId, projectSessions, currentSessionId, isSessionsLoading, switchSession, createSession]);

    // 封装创建会话方法
    const handleCreateSession = useCallback(() => {
        if (projectId) {
            createSession(projectId);
        }
    }, [projectId, createSession]);

    return {
        ...store, // 导出 store 的所有方法
        aiServiceInstance,
        projectId,
        projectSessions,
        currentSession,
        handleCreateSession
    };
};
