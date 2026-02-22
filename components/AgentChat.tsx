
import React, { useState } from 'react';
import { Sparkles, X, History, Plus, Trash2, MessageSquare, AlertTriangle, ArrowRight, Cpu, Download, Bug, ClipboardList } from 'lucide-react';
import { ChatMessage, TodoItem, ChatSession, FileNode, PendingChange, PlanNote } from '../types';
import AgentMessageList from './AgentMessageList';
import AgentInput from './AgentInput';
import AgentTodoList from './AgentTodoList';
import { useFileStore } from '../stores/fileStore';
import { useAgentStore } from '../stores/agentStore'; // Import AgentStore
import { useUiStore } from '../stores/uiStore';
import { findNodeByPath } from '../services/fileSystem';
import { useAgent } from '../hooks/useAgent'; // Note: AgentChat receives hooks props, but we need types
import { downloadChatSession } from '../utils/exportUtils';

// AgentChat receives everything from MainLayout which calls useAgent
// We need to extend props to include the new handlers
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
}

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
  onOpenPlanViewer
}) => {
  const [showHistory, setShowHistory] = useState(false);

  // Use file store to navigate
  const setActiveFileId = useFileStore(state => state.setActiveFileId);
  // Use agent store to set reviewing change
  const setReviewingChangeId = useAgentStore(state => state.setReviewingChangeId);
  // Debug mode
  const isDebugMode = useUiStore(state => state.isDebugMode);
  const toggleDebugMode = useUiStore(state => state.toggleDebugMode);

  if (!isOpen) return null;

  const pendingApprovalsCount = pendingChanges.length;

  const handleReviewClick = (change: PendingChange) => {
      // 优先使用 fileId，fallback 到路径查找
      if (change.fileId) {
          setActiveFileId(change.fileId);
      } else {
          const node = findNodeByPath(files, change.fileName);
          if (node) {
              setActiveFileId(node.id);
          } else {
              // If file doesn't exist (New File), clear active file but still trigger review
              setActiveFileId(null);
          }
      }

      // Explicitly set the change ID being reviewed.
      // The Editor will detect this and show DiffViewer even if activeFile is null.
      setReviewingChangeId(change.id);

      // On mobile, close chat to see editor
      if (isMobile) {
          onClose();
      }
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      // Simple confirm is effective for preventing accidental mobile deletions
      if (window.confirm("确定要删除此会话吗？")) {
          onDeleteSession(id);
      }
  };

  const handleExportSession = (e: React.MouseEvent, session: ChatSession) => {
      e.stopPropagation();
      downloadChatSession(session);
  };

  const handleExportCurrentSession = () => {
      const current = sessions.find(s => s.id === currentSessionId);
      if (current) {
          downloadChatSession(current);
      }
  };

  // Helper to format large numbers
  const formatTokenCount = (num: number) => {
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
      return num.toString();
  };

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
                     <div className="flex items-center gap-1" title={`滑动窗口: 发送给 AI 的是最近 ${messageWindowInfo.windowSize} 条消息`}>
                        <span className={messageWindowInfo.dropped > 0 ? 'text-yellow-500' : ''}>
                            📜 {messageWindowInfo.inContext}/{messageWindowInfo.windowSize}
                        </span>
                        {messageWindowInfo.dropped > 0 && (
                            <span className="text-yellow-600" title={`已省略 ${messageWindowInfo.dropped} 条旧消息`}>
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
                  title={planMode ? "关闭 Plan 模式" : "开启 Plan 模式"}
              >
                  <ClipboardList size={18} />
              </button>
            )}
            {/* View Current Plan */}
            {planMode && currentPlanNote && onOpenPlanViewer && (
              <button
                  onClick={onOpenPlanViewer}
                  className="p-2 rounded-lg transition-colors bg-purple-600/20 text-purple-400 hover:bg-purple-600/30"
                  title="查看 Plan 笔记本"
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
                title={isDebugMode ? "关闭调试模式" : "开启调试模式"}
            >
                <Bug size={18} />
            </button>
            {!showHistory && (
                <button
                    onClick={handleExportCurrentSession}
                    className="p-2 rounded-lg transition-colors hover:bg-gray-800 text-gray-500 hover:text-white"
                    title="导出当前会话 (Markdown)"
                >
                    <Download size={18} />
                </button>
            )}
            <button 
                onClick={() => setShowHistory(!showHistory)} 
                className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
                title="历史记录"
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

      {showHistory ? (
        // --- History View ---
        <div className="flex-1 overflow-y-auto bg-gray-950 p-4 animate-in slide-in-from-right-10 fade-in duration-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-gray-300 font-medium">会话历史</h3>
                <button 
                    onClick={() => {
                        onCreateSession();
                        setShowHistory(false);
                    }}
                    className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-900/20 active:scale-95"
                >
                    <Plus size={16} />
                    新会话
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
                                    {session.title || '无标题会话'}
                                </span>
                            </div>
                            
                            <div className="absolute top-3 right-3 flex items-center gap-1">
                                <button 
                                    onClick={(e) => handleExportSession(e, session)}
                                    className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                                    title="导出会话"
                                >
                                    <Download size={16} />
                                </button>
                                <button 
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="删除会话"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 flex justify-between mt-3 px-1">
                            <span>{new Date(session.lastModified).toLocaleString([], {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
                            <span>{session.messages.length} 条消息</span>
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
                                审查 <ArrowRight size={10} />
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
                    <span>Plan 模式已启用</span>
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
                      查看笔记本
                    </button>
                  )}
                </div>
                <p className="text-xs text-purple-500 mt-1">
                  AI 正在规划中，等待审批后才会执行文件操作
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
            />
        </>
      )}
    </div>
  );
};

export default AgentChat;