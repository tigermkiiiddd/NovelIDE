
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, History, Plus, Trash2, MessageSquare, AlertTriangle, ArrowRight, Cpu, Download, Bug, ClipboardList, Layers, Brain, Lightbulb } from 'lucide-react';
import { ChatMessage, TodoItem, ChatSession, FileNode, PendingChange, PlanNote } from '../types';
import AgentMessageList from './AgentMessageList';
import AgentInput from './AgentInput';
import AgentTodoList from './AgentTodoList';
import MemoryDebugPanel from './MemoryDebugPanel';
import { useFileStore } from '../stores/fileStore';
import { useAgentStore } from '../stores/agentStore'; // Import AgentStore
import { useUiStore } from '../stores/uiStore';
import { findNodeByPath, generateId } from '../services/fileSystem';
import { FileType } from '../types';
import { useAgent } from '../hooks/useAgent'; // Note: AgentChat receives hooks props, but we need types
import { downloadChatSession } from '../utils/exportUtils';

// AgentChat receives everything from MainLayout which calls useAgent
// We need to extend props to include the new handlers

// Pure helper - moved outside component to avoid recreation
const formatTokenCount = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
};

interface AgentChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  // New handlers
  onRegenerate?: (id: string) => void;
  onEditMessage?: (id: string, newText: string) => void;
  onStop?: () => void;

  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  todos: TodoItem[];
  // Session Props
  sessions: ChatSession[];
  currentSessionId: string;
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  // File Context
  files: FileNode[];
  // Approval Props
  pendingChanges?: PendingChange[];
  width?: number;
  isMobile: boolean;
  // Token Usage
  tokenUsage?: { used: number; limit: number; percent: number };
  // Message Window Info (滑动窗口)
  messageWindowInfo?: { total: number; inContext: number; dropped: number; windowSize: number };
  // Plan Mode Props
  planMode?: boolean;
  onTogglePlanMode?: () => void;
  currentPlanNote?: PlanNote | null;
  onOpenPlanViewer?: () => void;
  // Thinking Mode Props
  thinkingMode?: boolean;
  onToggleThinkingMode?: () => void;
  // Questionnaire Props
  resumeProcessTurn?: () => void;
}

// --- Thinking Pad Panels (chat 顶部，多话题同时显示) ---
const ThinkingPadTabs: React.FC = () => {
  const { t } = useTranslation();
  const sessions = useAgentStore(state => state.sessions);
  const currentSessionId = useAgentStore(state => state.currentSessionId);
  const setVirtualFile = useFileStore(state => state.setVirtualFile);

  const session = sessions.find(s => s.id === currentSessionId);
  const pads = session?.thinkingPads || [];

  if (pads.length === 0) return null;

  return (
    <div className="border-b border-gray-800/50 bg-gray-900/50 max-h-60 overflow-y-auto shrink-0">
      <div className="flex items-center gap-1 px-3 py-1 sticky top-0 bg-gray-900/90 backdrop-blur-sm z-10">
        <Brain size={11} className="text-amber-400/70 shrink-0" />
        <span className="text-[10px] text-amber-400/60 font-mono">{t('agentChat.deepThinkingTopics', { count: pads.length })}</span>
      </div>
      {pads.map(pad => (
        <ThinkingPadPanel key={pad.id} pad={pad} setVirtualFile={setVirtualFile} />
      ))}
    </div>
  );
};

const pageLabels = [
  { key: 'p1_constraint' as const, name: 'P1', file: '01_约束.md' },
  { key: 'p2_breadth' as const, name: 'P2', file: '02_广度.md' },
  { key: 'p3_depth' as const, name: 'P3', file: '03_深度.md' },
];

const ThinkingPadPanel: React.FC<{
  pad: any;
  setVirtualFile: (f: FileNode | null) => void;
}> = ({ pad, setVirtualFile }) => {
  const { t } = useTranslation();
  const openPage = (key: string, file: string) => {
    const content = pad.pages[key]?.content || '';
    setVirtualFile({
      id: `thinking-${pad.id}-${key}`,
      parentId: null,
      name: `${pad.title}/${file}`,
      type: FileType.FILE,
      content,
      lastModified: pad.updatedAt,
    });
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-amber-900/20">
      <span className="text-xs text-amber-300/80 truncate flex-1">{pad.title}</span>
      {pageLabels.map(({ key, name, file }) => (
        <button
          key={key}
          onClick={() => openPage(key, file)}
          className="px-1.5 py-0.5 text-[10px] font-mono rounded text-blue-400/50 hover:text-blue-400 hover:bg-blue-900/20 transition-colors shrink-0"
          title={t('agentChat.openInEditor', { file })}
        >
          {name} ↗
        </button>
      ))}
    </div>
  );
};

const AgentChat: React.FC<AgentChatProps> = ({
  messages,
  onSendMessage,
  onRegenerate,
  onEditMessage,
  onStop,
  isLoading,
  isOpen,
  onClose,
  todos,
  sessions,
  currentSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  files,
  pendingChanges = [],
  width = 384,
  isMobile,
  tokenUsage,
  messageWindowInfo,
  planMode = false,
  onTogglePlanMode,
  currentPlanNote,
  onOpenPlanViewer,
  thinkingMode = false,
  onToggleThinkingMode,
  resumeProcessTurn,
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showMemoryDebug, setShowMemoryDebug] = useState(false);
  const { t } = useTranslation();
  // Reset memory debug panel when project/session changes
  const prevSessionIdRef = useRef(currentSessionId);
  useEffect(() => {
    if (prevSessionIdRef.current !== currentSessionId) {
      prevSessionIdRef.current = currentSessionId;
      setShowMemoryDebug(false);
    }
  }, [currentSessionId]);

  // Use file store to navigate
  const setActiveFileId = useFileStore(state => state.setActiveFileId);
  const setVirtualFile = useFileStore(state => state.setVirtualFile);
  // Use agent store to set reviewing change
  const setReviewingChangeId = useAgentStore(state => state.setReviewingChangeId);
  // Debug mode
  const isDebugMode = useUiStore(state => state.isDebugMode);
  const toggleDebugMode = useUiStore(state => state.toggleDebugMode);

  const pendingApprovalsCount = pendingChanges.length;

  const handleReviewClick = useCallback((change: PendingChange) => {
      // Navigate to the file
      if (change.fileId) {
          setActiveFileId(change.fileId);
      } else {
          const node = findNodeByPath(files, change.fileName);
          if (node) {
              setActiveFileId(node.id);
          } else if (change.newContent !== null) {
              // For any write-type operation creating a new file, create virtual file for preview
              // (covers 'write', 'createFile' and any future tools that can create new files)
              const fileName = change.fileName.split('/').pop() || 'New File';
              const virtualFile: FileNode = {
                  id: `virtual_${change.id}`,
                  parentId: 'root',
                  name: fileName,
                  type: FileType.FILE,
                  content: change.newContent,
                  metadata: {
                      ...change.metadata,
                      virtualFilePath: change.fileName  // 保存完整路径用于匹配
                  },
                  lastModified: Date.now()
              };
              console.log('[AgentChat] Creating virtual file:', {
                  id: virtualFile.id,
                  name: virtualFile.name,
                  virtualFilePath: virtualFile.metadata?.virtualFilePath,
                  changeFileName: change.fileName
              });
              setVirtualFile(virtualFile);
          }
      }

      // Set reviewing change ID to trigger DiffViewer
      setReviewingChangeId(change.id);

      // On mobile, close chat to see editor
      if (isMobile) {
          onClose();
      }
  }, [files, setActiveFileId, setVirtualFile, setReviewingChangeId, isMobile, onClose]);

  const handleDeleteSession = useCallback((e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      // Simple confirm is effective for preventing accidental mobile deletions
      if (window.confirm(t('agentChat.confirmDeleteSession'))) {
          onDeleteSession(id);
      }
  }, [onDeleteSession]);

  const handleExportSession = useCallback((e: React.MouseEvent, session: ChatSession) => {
      e.stopPropagation();
      downloadChatSession(session);
  }, []);

  const handleExportCurrentSession = useCallback(() => {
      const current = sessions.find(s => s.id === currentSessionId);
      if (current) {
          downloadChatSession(current);
      }
  }, [sessions, currentSessionId]);

  if (!isOpen) return null;

  return (
    <div 
      className={`
        fixed inset-0 z-50 flex flex-col bg-gray-950
        md:relative md:inset-auto md:h-full md:border-l md:border-gray-800 md:shadow-none md:z-0
        shadow-2xl transition-all duration-300 h-[100dvh] md:h-auto
      `}
      style={{ 
        width: isMobile ? '100%' : width 
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0 safe-area-top select-none">
        <div className="flex items-center space-x-2 text-blue-400 overflow-hidden">
          <Sparkles size={20} className="shrink-0" />
          <div className="flex flex-col min-w-0">
             <span className="font-bold text-gray-100 truncate text-sm">NovelGenie</span>
             <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono leading-none mt-0.5">
                 {tokenUsage && (
                     <div className="flex items-center gap-1">
                        <Cpu size={10} />
                        <span>{formatTokenCount(tokenUsage.used)} / {formatTokenCount(tokenUsage.limit)}</span>
                        <span>({tokenUsage.percent}%)</span>
                     </div>
                 )}
                 {messageWindowInfo && (
                     <div className="flex items-center gap-1" title={t('agentChat.slidingWindowTooltip', { size: messageWindowInfo.windowSize })}>
                        <span className={messageWindowInfo.dropped > 0 ? 'text-yellow-500' : ''}>
                            📜 {messageWindowInfo.inContext}/{messageWindowInfo.windowSize}
                        </span>
                        {messageWindowInfo.dropped > 0 && (
                            <span className="text-yellow-600" title={t('agentChat.droppedMessagesTooltip', { count: messageWindowInfo.dropped })}>
                                (-{messageWindowInfo.dropped})
                            </span>
                        )}
                     </div>
                 )}
             </div>
          </div>
        </div>

        {/* Token Progress Bar (Visual) */}
        {tokenUsage && (
             <div 
                className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                style={{ width: `${tokenUsage.percent}%` }}
                title={`Context Usage: ${tokenUsage.percent}%`}
             />
        )}

        <div className="flex items-center gap-2">
            {/* Plan Mode Toggle */}
            {onTogglePlanMode && (
              <button
                  onClick={onTogglePlanMode}
                  className={`p-2 rounded-lg transition-colors ${
                      planMode
                          ? 'bg-purple-600/20 text-purple-400'
                          : 'hover:bg-gray-800 text-gray-500 hover:text-white'
                  }`}
                  title={planMode ? t('agentChat.closePlanMode') : t('agentChat.openPlanMode')}
              >
                  <ClipboardList size={18} />
              </button>
            )}
            {/* Thinking Mode Toggle */}
            {onToggleThinkingMode && (
              <button
                  onClick={onToggleThinkingMode}
                  className={`p-2 rounded-lg transition-colors ${
                      thinkingMode
                          ? 'bg-amber-600/20 text-amber-400'
                          : 'hover:bg-gray-800 text-gray-500 hover:text-white'
                  }`}
                  title={thinkingMode ? t('agentChat.closeThinkingMode') : t('agentChat.openThinkingMode')}
              >
                  <Lightbulb size={18} />
              </button>
            )}
            {/* View Current Plan */}
            {planMode && currentPlanNote && onOpenPlanViewer && (
              <button
                  onClick={onOpenPlanViewer}
                  className="p-2 rounded-lg transition-colors bg-purple-600/20 text-purple-400 hover:bg-purple-600/30"
                  title={t('agentChat.viewPlanNotebook')}
              >
                  <MessageSquare size={18} />
              </button>
            )}
            {/* Debug Mode Toggle */}
            <button
                onClick={toggleDebugMode}
                className={`p-2 rounded-lg transition-colors ${
                    isDebugMode
                        ? 'bg-orange-600/20 text-orange-400'
                        : 'hover:bg-gray-800 text-gray-500 hover:text-white'
                }`}
                title={isDebugMode ? t('agentChat.closeDebugMode') : t('agentChat.openDebugMode')}
            >
                <Bug size={18} />
            </button>
            {/* Memory Debug Panel Toggle */}
            {isDebugMode && (
                <button
                    onClick={() => setShowMemoryDebug(true)}
                    className="p-2 rounded-lg bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 transition-colors"
                    title={t('agentChat.memoryDecay')}
                >
                    <Layers size={18} />
                </button>
            )}
            {!showHistory && (
                <button
                    onClick={handleExportCurrentSession}
                    className="p-2 rounded-lg transition-colors hover:bg-gray-800 text-gray-500 hover:text-white"
                    title={t('agentChat.exportSession')}
                >
                    <Download size={18} />
                </button>
            )}
            <button 
                onClick={() => setShowHistory(!showHistory)} 
                className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
                title={t('agentChat.history')}
            >
                <History size={20} />
            </button>
            <button 
                onClick={onClose} 
                className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white md:hidden active:bg-gray-700"
            >
                <X size={22} />
            </button>
        </div>
      </div>

      {/* Deep Thinking File Tabs */}
      <ThinkingPadTabs />

      {showHistory ? (
        // --- History View ---
        <div className="flex-1 overflow-y-auto bg-gray-950 p-4 animate-in slide-in-from-right-10 fade-in duration-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-gray-300 font-medium">{t('agentChat.sessionHistory')}</h3>
                <button 
                    onClick={() => {
                        onCreateSession();
                        setShowHistory(false);
                    }}
                    className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-900/20 active:scale-95"
                >
                    <Plus size={16} />
                    {t('agentChat.newSession')}
                </button>
            </div>
            
            <div className="space-y-3 pb-20">
                {sessions.map(session => (
                    <div 
                        key={session.id}
                        onClick={() => {
                            onSwitchSession(session.id);
                            setShowHistory(false);
                        }}
                        className={`group relative p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${
                            session.id === currentSessionId 
                                ? 'bg-blue-900/20 border-blue-500/50' 
                                : 'bg-gray-900 border-gray-800 hover:bg-gray-800'
                        }`}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3 mb-1 pr-16">
                                <MessageSquare size={16} className={`shrink-0 ${session.id === currentSessionId ? "text-blue-400" : "text-gray-600"}`} />
                                <span className={`font-medium text-base truncate ${session.id === currentSessionId ? 'text-blue-100' : 'text-gray-300'}`}>
                                    {session.title || t('agentChat.untitledSession')}
                                </span>
                            </div>
                            
                            <div className="absolute top-3 right-3 flex items-center gap-1">
                                <button 
                                    onClick={(e) => handleExportSession(e, session)}
                                    className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                                    title={t('agentChat.exportSessionShort')}
                                >
                                    <Download size={16} />
                                </button>
                                <button 
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                    title={t('agentChat.deleteSession')}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 flex justify-between mt-3 px-1">
                            <span>{new Date(session.lastModified).toLocaleString([], {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
                            <span>{t('agentChat.messageCount', { count: session.messages.length })}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      ) : (
        // --- Chat View ---
        <>
            {/* PENDING CHANGES ALERT LIST */}
            {pendingApprovalsCount > 0 && (
                <div className="bg-yellow-900/10 border-b border-yellow-800/50 shrink-0 max-h-40 overflow-y-auto">
                    {pendingChanges.map(change => (
                        <button 
                            key={change.id}
                            onClick={() => handleReviewClick(change)}
                            className="w-full flex items-center justify-between p-3 text-sm text-yellow-200 hover:bg-yellow-900/30 transition-colors border-b border-yellow-900/20 last:border-0"
                        >
                            <div className="flex flex-col items-start gap-1 overflow-hidden">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
                                    <span className="font-bold truncate text-xs">{change.toolName}</span>
                                </div>
                                <span className="text-xs text-yellow-500/70 truncate w-full text-left">{change.fileName}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs bg-yellow-900/40 px-2 py-1 rounded border border-yellow-700/30 whitespace-nowrap">
                                {t('agentChat.review')} <ArrowRight size={10} />
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Plan Mode Indicator */}
            {planMode && (
              <div className="bg-purple-900/20 border-b border-purple-800/50 px-4 py-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-300 text-sm">
                    <ClipboardList size={16} className="text-purple-400" />
                    <span>{t('agentChat.planModeEnabled')}</span>
                    {currentPlanNote && (
                      <span className="text-purple-500 text-xs">
                        - {currentPlanNote.title}
                      </span>
                    )}
                  </div>
                  {currentPlanNote && onOpenPlanViewer && (
                    <button
                      onClick={onOpenPlanViewer}
                      className="text-xs text-purple-400 hover:text-purple-300 underline"
                    >
                      {t('agentChat.viewNotebook')}
                    </button>
                  )}
                </div>
                <p className="text-xs text-purple-500 mt-1">
                  {t('agentChat.planModeHint')}
                </p>
              </div>
            )}

            {/* Thinking Mode Indicator */}
            {thinkingMode && (
              <div className="bg-amber-900/20 border-b border-amber-800/50 px-4 py-2 shrink-0">
                <div className="flex items-center gap-2 text-amber-300 text-sm">
                  <Lightbulb size={16} className="text-amber-400" />
                  <span>{t('agentChat.thinkingModeEnabled')}</span>
                </div>
                <p className="text-xs text-amber-500 mt-1">
                  {t('agentChat.thinkingModeHint')}
                </p>
              </div>
            )}

            <AgentTodoList todos={todos} />
            <AgentMessageList
                messages={messages}
                isLoading={isLoading}
                onRegenerate={onRegenerate}
                onEditMessage={onEditMessage}
            />
            <AgentInput
                onSendMessage={onSendMessage}
                onStop={onStop}
                isLoading={isLoading}
                files={files}
                autoFocus={isOpen}
                resumeProcessTurn={resumeProcessTurn}
            />
        </>
      )}

      {/* Memory Debug Panel */}
      {showMemoryDebug && (
        <MemoryDebugPanel
          session={sessions.find(s => s.id === currentSessionId) || null}
          onClose={() => setShowMemoryDebug(false)}
        />
      )}
    </div>
  );
};

export default React.memo(AgentChat);