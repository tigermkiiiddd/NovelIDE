
import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useAgentStore, sessionLoadingState } from '../../stores/agentStore';
import { usePlanStore } from '../../stores/planStore';
import { AIService } from '../../services/geminiService';
import { ProjectMeta, AIProvider } from '../../types';

// 单例 Service 实例 (保持原有的单例模式)
let aiServiceInstance: AIService | null = null;

export const useAgentContext = (project: ProjectMeta | undefined) => {
    const store = useAgentStore();
    const {
        aiConfig, sessions, currentSessionId, isSessionsLoading,
        createSession, switchSession,
        setLoading, updateMessageMetadata
    } = store;

    const projectId = project?.id;
    const loadingProjectIdRef = useRef<string | null>(null);

    // 使用 useRef 保存函数引用，避免依赖变化
    const switchSessionRef = useRef(switchSession);
    const createSessionRef = useRef(createSession);

    // 确保引用始终是最新的
    useEffect(() => {
        switchSessionRef.current = switchSession;
        createSessionRef.current = createSession;
    }, [switchSession, createSession]);

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
        console.log('[useAgentContext] loadProjectSessions useEffect triggered, projectId:', projectId, 'loadingProjectIdRef:', loadingProjectIdRef.current);
        if (projectId && projectId !== loadingProjectIdRef.current) {
            console.log('[useAgentContext] 调用 loadProjectSessions');
            loadingProjectIdRef.current = projectId;
            // 调用加载函数（loadProjectSessions 内部会设置 sessionLoadingState）
            useAgentStore.getState().loadProjectSessions(projectId);
            // 同时加载 Plan 笔记
            usePlanStore.getState().loadPlanNotes(projectId);
        }
    }, [projectId]); // Only depend on projectId

    // 由于 Store 现在只包含当前项目的会话，这里的 filter 其实是冗余的，但保留以防万一
    const projectSessions = useMemo(() => {
        if (!projectId) return [];
        return sessions.filter(s => s.projectId === projectId);
    }, [sessions, projectId]);

    const currentSession = projectSessions.find(s => s.id === currentSessionId);

    // 自动会话同步：确保当前选中的会话有效
    useEffect(() => {
        console.log('[useAgentContext] session sync useEffect triggered', {
            projectId,
            isSessionsLoading,
            sessionLoadingState: sessionLoadingState.isLoading,
            projectSessionsLength: projectSessions.length,
            currentSessionId
        });
        if (!projectId) return;
        if (isSessionsLoading || sessionLoadingState.isLoading) {
            console.log('[useAgentContext] 等待加载完成, 跳过');
            return; // 等待加载完成，防止数据覆盖
        }

        const hasSessions = projectSessions.length > 0;
        const isCurrentSessionValid = projectSessions.some(s => s.id === currentSessionId);

        console.log('[useAgentContext] hasSessions:', hasSessions, 'isCurrentSessionValid:', isCurrentSessionValid);

        if (hasSessions) {
            if (!isCurrentSessionValid) {
                // Switch to the most recent session
                console.log('[useAgentContext] 切换到最新会话:', projectSessions[0].id);
                switchSessionRef.current(projectSessions[0].id);
            }
        } else {
            // 如果加载完成且确实没有会话，则自动创建一个
            if (currentSessionId === null) {
                console.log('[useAgentContext] 没有会话, 创建新会话');
                createSessionRef.current(projectId);
            }
        }
    }, [projectId, projectSessions, currentSessionId, isSessionsLoading]);
    // ^^^^ 移除 switchSession, createSession 依赖

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
