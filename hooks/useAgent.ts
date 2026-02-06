
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
  // --- 1. Access State from Store (Single Source of Truth) ---
  const { 
      aiConfig, setAiConfig,
      sessions, currentSessionId, createSession, switchSession, deleteSession,
      addMessage,
      editMessageContent,
      deleteMessagesFrom,
      isLoading, setLoading,
      pendingChanges, addPendingChange, removePendingChange,
      setTodos
  } = useAgentStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);
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

  // --- 3. Auto-Create Session if none ---
  useEffect(() => {
      if (!currentSessionId && sessions.length === 0) {
          createSession();
      } else if (!currentSessionId && sessions.length > 0) {
          switchSession(sessions[0].id);
      }
  }, [currentSessionId, sessions.length, createSession, switchSession]);

  // --- 3.5 Token Usage Estimation ---
  const tokenUsage = useMemo(() => {
      // Configurable Limits
      // Gemini 1.5 Pro/Flash typically supports 1M or 2M tokens. User requested 100m (Assuming 1M for practical UI display, or 100M if technically valid but 1M is standard high context)
      // Setting 1M as a safe huge number for "Gemini"
      const MAX_TOKENS_GEMINI = 1000000; 
      const MAX_TOKENS_DEFAULT = 128000; // GPT-4o approx

      const limit = aiConfig.provider === AIProvider.GOOGLE ? MAX_TOKENS_GEMINI : MAX_TOKENS_DEFAULT;

      // 1. Calculate System Prompt Size
      const sysPrompt = constructSystemPrompt(files, project, activeFile, todos);
      
      // 2. Calculate Messages Size
      // Basic JSON stringify approximation for structure overhead + raw text
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
      // English is ~4 chars/token, Chinese is ~1 char/0.7 token.
      // We use a conservative estimate: 1 token ~= 2 chars on average for mixed code/chinese
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

  // --- 5. Main LLM Interaction Loop (Extracted for Re-run) ---
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
    // NOTE: We get the LATEST state from store directly inside logic or via refs if needed.
    const freshTodos = useAgentStore.getState().sessions.find(s => s.id === currentSessionId)?.todos || [];
    const fullSystemInstruction = constructSystemPrompt(files, project, activeFile, freshTodos);

    setLoading(true);

    try {
        let loopCount = 0;
        const MAX_LOOPS = 10; 
        let keepGoing = true;

        while (keepGoing && loopCount < MAX_LOOPS) {
            if (signal.aborted) break;

            loopCount++;
            
            // Re-fetch session messages every loop iteration to ensure we have the latest (including tools added in previous loop)
            const currentMessages = useAgentStore.getState().sessions.find(s => s.id === currentSessionId)?.messages || [];

            if (loopCount === 1) {
                 console.log("🤖 [System Prompt Generated]:", fullSystemInstruction);
            }

            // Format History for API
            const apiHistory = currentMessages.map(m => {
                let apiRole = m.role;
                if (m.role === 'system' && m.isToolOutput) apiRole = 'user'; 
                if (m.rawParts) return { role: apiRole, parts: m.rawParts };
                return { role: apiRole === 'system' ? 'user' : apiRole, parts: [{ text: m.text }] };
            });

            // C. Call AI
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
                const agentMsg: ChatMessage = { id: generateId(), role: 'model', text: textPart.text, rawParts: parts, timestamp: Date.now() };
                addMessage(agentMsg);
            } else if (toolParts.length > 0) {
                 const toolNames = toolParts.map((p: any) => p.functionCall.name).join(', ');
                 const agentMsg: ChatMessage = { id: generateId(), role: 'model', text: `🛠️ Action: ${toolNames}`, rawParts: parts, timestamp: Date.now() };
                 addMessage(agentMsg);
            }

            // E. Handle Tools
            if (toolParts.length > 0) {
                const functionResponses = [];
                let uiLog = '';
                const logBuffer: string[] = [];

                for (const part of toolParts) {
                    if (signal.aborted) break;
                    if (!part.functionCall) continue;
                    const { name, args, id } = part.functionCall;

                    // Execute via Runner
                    const execResult = await executeTool(name, args, {
                        files,
                        todos: freshTodos,
                        aiService: aiServiceInstance,
                        onUiLog: (msg) => logBuffer.push(msg),
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
                        uiLog += execResult.uiLog + '\n';
                        resultString = `REQUEST QUEUED (ID: ${execResult.change.id}). Waiting for user approval.`;
                    } else if (execResult.type === 'EXECUTED') {
                        resultString = execResult.result;
                        const subLogs = logBuffer.length > 0 ? logBuffer.join('\n') + '\n' : '';
                        uiLog += subLogs;
                        uiLog += `[${name}] Done.\n`; 
                    } else {
                        resultString = execResult.message;
                        uiLog += `[${name}] Error: ${resultString}\n`;
                    }

                    functionResponses.push({ functionResponse: { name, id, response: { result: resultString } } });
                }

                if (signal.aborted) break;

                // Add System/Tool Message
                const toolMsg: ChatMessage = { 
                    id: generateId(), 
                    role: 'system', 
                    text: uiLog.trim(), 
                    isToolOutput: true, 
                    rawParts: functionResponses, 
                    timestamp: Date.now() 
                };
                addMessage(toolMsg);
            } else {
                keepGoing = false; // No tools called, done.
            }
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
  }, [currentSessionId, files, project, activeFile, tools, aiConfig, addMessage, addPendingChange, setLoading, setTodos]);

  // --- 6. Stop Function ---
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setLoading(false); // Force state reset immediately for UI responsiveness
    }
  }, [setLoading]);

  // --- 7. Interaction Handlers ---

  const sendMessage = useCallback(async (text: string) => {
    const fullSystemInstruction = constructSystemPrompt(files, project, activeFile, todos);
    const userMsg: ChatMessage = { 
        id: generateId(), 
        role: 'user', 
        text, 
        timestamp: Date.now(),
        metadata: { systemPrompt: fullSystemInstruction }
    };
    addMessage(userMsg);
    
    // Defer the turn processing to ensure store update is processed
    setTimeout(() => processTurn(), 0);
  }, [addMessage, processTurn, files, project, activeFile, todos]);

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
    sessions,
    currentSessionId,
    createNewSession: createSession,
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
