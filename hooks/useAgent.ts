
import { useRef, useCallback, useEffect, useState } from 'react';
import { ChatMessage, FileNode, ProjectMeta, PendingChange } from '../types';
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
      isLoading, setLoading,
      pendingChanges, addPendingChange, removePendingChange,
      setTodos
  } = useAgentStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const todos = currentSession?.todos || [];

  const accessedFiles = useRef<Set<string>>(new Set());

  // Default open state based on screen size
  const [isOpen, setIsOpen] = useState(() => {
      if (typeof window !== 'undefined') {
          return window.innerWidth >= 768;
      }
      return false;
  });

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
  const sendMessage = async (text: string) => {
    if (!aiServiceInstance) return;

    // A. Prepare Context for User Message
    const freshTodos = useAgentStore.getState().sessions.find(s => s.id === currentSessionId)?.todos || [];
    const fullSystemInstruction = constructSystemPrompt(files, project, activeFile, freshTodos);

    // B. Add User Message with Debug Metadata
    const userMsg: ChatMessage = { 
        id: generateId(), 
        role: 'user', 
        text, 
        timestamp: Date.now(),
        metadata: {
            systemPrompt: fullSystemInstruction
        }
    };
    addMessage(userMsg);
    setLoading(true);

    try {
        let currentLoopMessages = [...(currentSession?.messages || []), userMsg];
        
        let keepGoing = true;
        let loopCount = 0;
        const MAX_LOOPS = 10; 

        while (keepGoing && loopCount < MAX_LOOPS) {
            loopCount++;

            if (loopCount === 1) {
                // FIXED: Do not JSON.parse, as fullSystemInstruction is now a raw string
                console.log("🤖 [System Prompt Generated]:", fullSystemInstruction);
            }

            // Format History for API
            const apiHistory = currentLoopMessages.map(m => {
                let apiRole = m.role;
                if (m.role === 'system' && m.isToolOutput) apiRole = 'user'; 
                if (m.rawParts) return { role: apiRole, parts: m.rawParts };
                return { role: apiRole === 'system' ? 'user' : apiRole, parts: [{ text: m.text }] };
            });

            // C. Call AI
            // NOTE: We use the SAME system instruction for the whole loop of this turn
            const response = await aiServiceInstance.sendMessage(
                apiHistory, 
                '', 
                fullSystemInstruction, 
                allTools
            );
            
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
                currentLoopMessages.push(agentMsg);
            } else if (toolParts.length > 0) {
                 const toolNames = toolParts.map((p: any) => p.functionCall.name).join(', ');
                 const agentMsg: ChatMessage = { id: generateId(), role: 'model', text: `🛠️ Action: ${toolNames}`, rawParts: parts, timestamp: Date.now() };
                 addMessage(agentMsg);
                 currentLoopMessages.push(agentMsg);
            }

            // E. Handle Tools
            if (toolParts.length > 0) {
                const functionResponses = [];
                let uiLog = '';

                // Helper to buffer UI logs from async tools (like Sub-Agents)
                const logBuffer: string[] = [];

                for (const part of toolParts) {
                    if (!part.functionCall) continue;
                    const { name, args, id } = part.functionCall;

                    // Execute via Runner (Now Awaited)
                    const execResult = await executeTool(name, args, {
                        files,
                        todos: freshTodos,
                        aiService: aiServiceInstance, // Pass Service for Sub-Agents
                        onUiLog: (msg) => {
                            logBuffer.push(msg);
                        },
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
                        // Combine execution log + internal buffered logs
                        const subLogs = logBuffer.length > 0 ? logBuffer.join('\n') + '\n' : '';
                        uiLog += subLogs;
                        uiLog += `[${name}] Done.\n`; 
                    } else {
                        resultString = execResult.message;
                        uiLog += `[${name}] Error: ${resultString}\n`;
                    }

                    functionResponses.push({ functionResponse: { name, id, response: { result: resultString } } });
                }

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
                currentLoopMessages.push(toolMsg);
            } else {
                keepGoing = false; // No tools called, done.
            }
        }
    } catch (error) {
        console.error(error);
        addMessage({ id: generateId(), role: 'system', text: 'Agent Error: ' + (error instanceof Error ? error.message : 'Unknown'), timestamp: Date.now() });
    } finally {
        setLoading(false);
    }
  };

  return {
    messages: currentSession?.messages || [],
    isLoading,
    isOpen,
    setIsOpen,
    sendMessage,
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
    rejectChange
  };
};
