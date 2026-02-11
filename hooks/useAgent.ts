
import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { ChatMessage, FileNode, ProjectMeta, PendingChange, AIProvider } from '../types';
import { AIService } from '../services/geminiService';
import { generateId } from '../services/fileSystem';
import { constructSystemPrompt } from '../services/agent/tools/promptBuilder';
import { allTools } from '../services/agent/tools/index';
import { useAgentStore } from '../stores/agentStore';
import { executeTool, executeApprovedChange } from '../services/agent/toolRunner';

// Singleton Service Instance
let aiServiceInstance: AIService | null = null;

interface AgentToolsImplementation {
  createFile: (path: string, content: string) => string;
  updateFile: (path: string, content: string) => string;
  patchFile: (path: string, startLine: number, endLine: number, newContent: string) => string;
  readFile: (path: string, startLine?: number, endLine?: number) => string;
  searchFiles: (query: string) => string;
  listFiles: () => string;
  deleteFile: (path: string) => string;
  renameFile: (oldPath: string, newName: string) => string;
  updateProjectMeta: (updates: any) => string;
}

export const useAgent = (
    files: FileNode[], 
    project: ProjectMeta | undefined, 
    activeFile: FileNode | null, 
    tools: AgentToolsImplementation
) => {
  // --- 1. Access State from Store ---
  const { 
      aiConfig, setAiConfig,
      sessions: allSessions, // Rename to allSessions
      currentSessionId, createSession, switchSession, deleteSession,
      addMessage,
      editMessageContent,
      deleteMessagesFrom,
      isLoading, setLoading,
      pendingChanges, addPendingChange, removePendingChange,
      setTodos
  } = useAgentStore();

  // --- 1.5 Filter Sessions by Project ---
  const projectId = project?.id;
  
  // Only show sessions belonging to this project (or sessions with no projectId for backward compatibility if needed, though we force it now)
  const projectSessions = useMemo(() => {
      if (!projectId) return [];
      return allSessions.filter(s => s.projectId === projectId);
  }, [allSessions, projectId]);

  const currentSession = projectSessions.find(s => s.id === currentSessionId);
  const todos = currentSession?.todos || [];

  const accessedFiles = useRef<Set<string>>(new Set());
  
  // Abort Controller Ref
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- 2. Sync AI Service Config ---
  useEffect(() => {
      if (!aiServiceInstance) {
          aiServiceInstance = new AIService(aiConfig);
      } else {
          aiServiceInstance.updateConfig(aiConfig);
      }
  }, [aiConfig]);

  // --- 3. Auto-Session Management (Context Aware) ---
  useEffect(() => {
      if (!projectId) return;

      // Check if current active session ID is valid for this project
      const isCurrentSessionValid = projectSessions.some(s => s.id === currentSessionId);

      if (!isCurrentSessionValid) {
          if (projectSessions.length > 0) {
              // Switch to the most recent session for this project
              switchSession(projectSessions[0].id);
          } else {
              // Create a new session for this project
              createSession(projectId, '新会话');
          }
      }
  }, [projectId, projectSessions, currentSessionId, createSession, switchSession]);

  // Wrapper for Create Session to inject Project ID
  const handleCreateSession = useCallback(() => {
      if (projectId) {
          createSession(projectId);
      }
  }, [projectId, createSession]);

  // --- 3.5 Token Usage Estimation ---
  const tokenUsage = useMemo(() => {
      // Configurable Limits
      const MAX_TOKENS_GEMINI = 1000000; 
      const MAX_TOKENS_DEFAULT = 128000;

      const limit = aiConfig.provider === AIProvider.GOOGLE ? MAX_TOKENS_GEMINI : MAX_TOKENS_DEFAULT;

      // 1. Calculate System Prompt Size
      const sysPrompt = constructSystemPrompt(files, project, activeFile, todos);
      
      // 2. Calculate Messages Size
      const msgs = currentSession?.messages || [];
      const msgsText = msgs.reduce((acc, m) => {
          let content = m.text;
          if (m.rawParts) {
             content += JSON.stringify(m.rawParts);
          }
          return acc + content;
      }, "");

      const totalChars = sysPrompt.length + msgsText.length;

      // Heuristic: Mixed CJK/English content. 
      const estimatedTokens = Math.ceil(totalChars / 2);
      
      const percent = Math.min(100, (estimatedTokens / limit) * 100);

      return {
          used: estimatedTokens,
          limit: limit,
          percent: parseFloat(percent.toFixed(2)) // Keep 2 decimals
      };
  }, [aiConfig.provider, files, project, activeFile, todos, currentSession?.messages]);


  // --- 4. Core Execution Logic (Approval) ---
  const approveChange = useCallback((change: PendingChange) => {
    // Construct full action context
    const fullActions = {
        ...tools,
        setTodos,
        trackFileAccess: (fname: string) => accessedFiles.current.add(fname)
    };

    const result = executeApprovedChange(change, fullActions);
    removePendingChange(change.id);
    
    const confirmMsg: ChatMessage = { 
        id: generateId(), 
        role: 'system', 
        text: `✅ User Approved: ${change.description}\nResult: ${result}`, 
        timestamp: Date.now() 
    };
    addMessage(confirmMsg);
  }, [tools, addMessage, removePendingChange, setTodos]);

  const rejectChange = useCallback((change: PendingChange) => {
      removePendingChange(change.id);
      const rejectMsg: ChatMessage = { 
          id: generateId(), 
          role: 'system', 
          text: `❌ User Rejected: ${change.description}`, 
          timestamp: Date.now() 
      };
      addMessage(rejectMsg);
  }, [addMessage, removePendingChange]);

  // --- 5. Main LLM Interaction Loop ---
  const processTurn = useCallback(async () => {
    if (!aiServiceInstance || !currentSessionId) return;

    // Reset abort controller
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // A. Prepare Context
    // NOTE: We get the LATEST state from store directly inside logic.
    // We must find the specific session object from the store's global list.
    const globalSessions = useAgentStore.getState().sessions;
    const freshSession = globalSessions.find(s => s.id === currentSessionId);
    const freshTodos = freshSession?.todos || [];
    
    const fullSystemInstruction = constructSystemPrompt(files, project, activeFile, freshTodos);

    setLoading(true);

    try {
        let loopCount = 0;
        const MAX_LOOPS = 10; // Restricted to 5 to prevent infinite loops
        let keepGoing = true;

        while (keepGoing && loopCount < MAX_LOOPS) {
            if (signal.aborted) break;

            loopCount++;
            
            // Re-fetch session messages every loop iteration
            const currentGlobalSessions = useAgentStore.getState().sessions;
            const currentFreshSession = currentGlobalSessions.find(s => s.id === currentSessionId);
            const currentMessages = currentFreshSession?.messages || [];

            if (loopCount === 1) {
                 console.log("🤖 [System Prompt Generated]:", fullSystemInstruction);
            }

            // Format History for API
            // This represents the EXACT array we are sending to the LLM (rawParts or text wrapped in parts)
            const apiHistory = currentMessages.map(m => {
                let apiRole = m.role;
                // Important: If a message is a 'system' message but NOT a tool output (e.g. user approval text), map it to user.
                // If it IS a tool output, map it to 'user' temporarily for geminiService to convert to 'tool' role using rawParts.
                // The issue was: geminiService expects 'user' role for tool responses to process rawParts correctly.
                if (m.role === 'system') apiRole = 'user'; 
                
                if (m.rawParts) return { role: apiRole, parts: m.rawParts };
                return { role: apiRole === 'system' ? 'user' : apiRole, parts: [{ text: m.text }] };
            });

            // Capture the Payload for Debugging (Snapshot)
            const debugPayload = {
                systemInstruction: fullSystemInstruction,
                contents: apiHistory
            };

            // C. Call AI
            // Note: we pass '' as message because apiHistory already contains the latest user message
            const response = await aiServiceInstance.sendMessage(
                apiHistory, 
                '', 
                fullSystemInstruction, 
                allTools,
                signal
            );
            
            if (signal.aborted) break;

            const candidates = response.candidates;
            if (!candidates || candidates.length === 0) throw new Error("No response from Agent");

            const content = candidates[0].content;
            const parts = content.parts;

            // D. Handle Model Text Response
            const textPart = parts.find((p: any) => p.text);
            const toolParts = parts.filter((p: any) => p.functionCall);
            
            if (textPart && textPart.text) {
                const agentMsg: ChatMessage = { 
                    id: generateId(), 
                    role: 'model', 
                    text: textPart.text, 
                    rawParts: parts, 
                    timestamp: Date.now(),
                    metadata: { debugPayload } // Attach raw payload snapshot
                };
                addMessage(agentMsg);
            } else if (toolParts.length > 0) {
                 // Model called tools but gave no text explanation.
                 // We create a "Phantom" text message to visualize the action if needed, or just let the tool log handle it.
                 // But for chat continuity, a text header is good.
                 const toolNames = toolParts.map((p: any) => p.functionCall.name).join(', ');
                 const agentMsg: ChatMessage = { 
                    id: generateId(), 
                    role: 'model', 
                    text: `🛠️ Action: ${toolNames}`, 
                    rawParts: parts, 
                    timestamp: Date.now(),
                    metadata: { debugPayload } // Attach raw payload snapshot
                };
                addMessage(agentMsg);
            }

            // E. Handle Tools
            if (toolParts.length > 0) {
                const functionResponses = [];
                
                // --- REAL-TIME LOGGING ---
                // Create placeholder message
                const toolMsgId = generateId();
                let streamedLog = '';
                const logToUi = (text: string) => {
                    streamedLog += (streamedLog ? '\n' : '') + text;
                    editMessageContent(toolMsgId, streamedLog);
                };

                addMessage({ 
                    id: toolMsgId, 
                    role: 'system', 
                    text: '⏳ Agent 正在执行工具...', 
                    isToolOutput: true, 
                    timestamp: Date.now() 
                });

                for (const part of toolParts) {
                    if (signal.aborted) break;
                    if (!part.functionCall) continue;
                    const { name, args, id } = part.functionCall;

                    // Execute via Runner
                    const execResult = await executeTool(name, args, {
                        files,
                        todos: freshTodos,
                        aiService: aiServiceInstance,
                        onUiLog: logToUi,
                        signal, // Pass signal to sub-agents
                        actions: {
                            ...tools,
                            setTodos: setTodos,
                            trackFileAccess: (fname) => accessedFiles.current.add(fname)
                        }
                    });

                    let resultString = '';

                    if (execResult.type === 'APPROVAL_REQUIRED') {
                        addPendingChange(execResult.change);
                        logToUi(`⏸️ 变更请求已排队: ${execResult.change.description}`);
                        resultString = `REQUEST QUEUED (ID: ${execResult.change.id}). Waiting for user approval.`;
                    } else if (execResult.type === 'EXECUTED') {
                        resultString = execResult.result;
                        // Log success implicit in most tools or sub-agent logs
                    } else {
                        // EXPLICIT ERROR FORMATTING
                        resultString = `[SYSTEM ERROR]: ${execResult.message}`;
                        logToUi(`❌ [${name}] Error: ${execResult.message}`);
                    }

                    // Store the ID from the CALL so the response matches
                    functionResponses.push({ functionResponse: { name, id, response: { result: resultString } } });
                }

                if (signal.aborted) break;

                // Finalize Message with RawParts (Critical for Context)
                useAgentStore.getState().updateCurrentSession(session => ({
                    ...session,
                    messages: session.messages.map(m => m.id === toolMsgId ? { 
                        ...m, 
                        text: streamedLog.trim() || '✅ 执行完成', 
                        rawParts: functionResponses // Attach tool outputs for next turn
                    } : m),
                    lastModified: Date.now()
                }));

            } else {
                keepGoing = false; // No tools called, done.
            }
        }
        
        // --- Loop Limit Safety Valve ---
        if (keepGoing && loopCount >= MAX_LOOPS && !signal.aborted) {
            addMessage({ 
                id: generateId(), 
                role: 'system', 
                text: '⚠️ 【系统保护】任务自动终止：已达到最大工具调用轮数限制 (Max Loops)。\n\n这通常是因为 Agent 陷入了重复尝试或死循环。建议：\n1. 请检查您的指令是否过于模糊。\n2. 尝试手动分步执行任务。', 
                timestamp: Date.now() 
            });
        }

    } catch (error: any) {
        if (error.name === 'AbortError') {
             addMessage({ id: generateId(), role: 'system', text: '⛔ 用户已停止生成。', timestamp: Date.now() });
        } else {
             console.error(error);
             addMessage({ id: generateId(), role: 'system', text: 'Agent Error: ' + (error instanceof Error ? error.message : 'Unknown'), timestamp: Date.now() });
        }
    } finally {
        setLoading(false);
        abortControllerRef.current = null;
    }
  }, [currentSessionId, files, project, activeFile, tools, aiConfig, addMessage, addPendingChange, setLoading, setTodos, editMessageContent]);

  // --- 6. Stop Function ---
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setLoading(false); // Force state reset immediately for UI responsiveness
    }
  }, [setLoading]);

  // --- 7. Interaction Handlers ---

  const sendMessage = useCallback(async (text: string) => {
    // Only allow sending if we have a valid session
    if (!currentSessionId) return;

    // IMPORTANT: We do NOT define metadata here anymore to avoid clutter.
    // The "snapshot" is now taken at the moment of API call inside processTurn.
    const userMsg: ChatMessage = { 
        id: generateId(), 
        role: 'user', 
        text, 
        timestamp: Date.now()
    };
    addMessage(userMsg);
    
    // Defer the turn processing to ensure store update is processed
    setTimeout(() => processTurn(), 0);
  }, [addMessage, processTurn, currentSessionId]);

  const regenerateMessage = useCallback(async (messageId: string) => {
      deleteMessagesFrom(messageId, true);
      setTimeout(() => processTurn(), 0);
  }, [deleteMessagesFrom, processTurn]);

  const editUserMessage = useCallback(async (messageId: string, newText: string) => {
      editMessageContent(messageId, newText);
      deleteMessagesFrom(messageId, false);
      setTimeout(() => processTurn(), 0);
  }, [editMessageContent, deleteMessagesFrom, processTurn]);

  return {
    messages: currentSession?.messages || [],
    isLoading,
    sendMessage,
    stopGeneration, // Export
    regenerateMessage, 
    editUserMessage,
    todos,
    sessions: projectSessions, // Return filtered sessions
    currentSessionId,
    createNewSession: handleCreateSession, // Use wrapper
    switchSession,
    deleteSession,
    aiConfig,
    updateAiConfig: setAiConfig,
    pendingChanges,
    approveChange,
    rejectChange,
    tokenUsage // Export token estimation
  };
};
