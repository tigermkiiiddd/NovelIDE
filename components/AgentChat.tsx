
import React, { useState } from 'react';
import { Sparkles, X, History, Plus, Trash2, MessageSquare, AlertTriangle, ArrowRight, Bug } from 'lucide-react';
import { ChatMessage, TodoItem, ChatSession, FileNode, PendingChange } from '../types';
import AgentMessageList from './AgentMessageList';
import AgentInput from './AgentInput';
import AgentTodoList from './AgentTodoList';
import { useFileStore } from '../stores/fileStore';
import { findNodeByPath } from '../services/fileSystem';

interface AgentChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
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
}

const AgentChat: React.FC<AgentChatProps> = ({ 
  messages, 
  onSendMessage, 
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
  pendingChanges = []
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  
  // Use file store to navigate
  const setActiveFileId = useFileStore(state => state.setActiveFileId);

  if (!isOpen) return null;

  const pendingApprovalsCount = pendingChanges.length;

  const handleReviewClick = (change: PendingChange) => {
      // Find file by name/path and open it. 
      // The Editor will automatically detect the pending change and show Diff UI.
      const node = findNodeByPath(files, change.fileName);
      if (node) {
          setActiveFileId(node.id);
      } else {
          // If file doesn't exist (creation), we might need to handle differently or 
          // Editor logic handles "Pending Creation". 
          // Currently Editor expects an active file.
          // For 'createFile', we don't have an ID yet. 
          // Ideally, we should create a temporary node or the Agent logic 
          // should have created a placeholder.
          alert("此文件尚未创建，无法预览 Diff。(当前 Diff 模式仅支持修改现有文件)");
      }
      // On mobile, maybe close chat to see editor
      if (window.innerWidth < 768) {
          onClose();
      }
  };

  return (
    <div className={`
      fixed inset-0 z-50 flex flex-col bg-gray-900 
      md:relative md:inset-auto md:w-96 md:h-full md:border-l md:border-gray-700 md:shadow-none md:z-0
      shadow-2xl transition-all duration-300 h-[100dvh] md:h-auto
    `}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700 shrink-0 safe-area-top">
        <div className="flex items-center space-x-2 text-blue-400">
          <Sparkles size={20} />
          <span className="font-bold text-white">Novel Agent</span>
        </div>
        <div className="flex items-center space-x-1">
            <button 
                onClick={() => setIsDebugMode(!isDebugMode)} 
                className={`p-1.5 rounded-lg transition-colors ${isDebugMode ? 'bg-purple-900/50 text-purple-400' : 'hover:bg-gray-700 text-gray-500'}`}
                title="开发者调试模式"
            >
                <Bug size={16} />
            </button>
            <button 
                onClick={() => setShowHistory(!showHistory)} 
                className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                title="历史记录"
            >
                <History size={18} />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white md:hidden">
                <X size={20} />
            </button>
        </div>
      </div>

      {showHistory ? (
        // --- History View ---
        <div className="flex-1 overflow-y-auto bg-gray-900 p-4 animate-in slide-in-from-right-10 fade-in duration-200">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-gray-300 font-medium">会话历史</h3>
                <button 
                    onClick={() => {
                        onCreateSession();
                        setShowHistory(false);
                    }}
                    className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full transition-colors"
                >
                    <Plus size={14} />
                    新会话
                </button>
            </div>
            
            <div className="space-y-3">
                {sessions.map(session => (
                    <div 
                        key={session.id}
                        onClick={() => {
                            onSwitchSession(session.id);
                            setShowHistory(false);
                        }}
                        className={`group p-3 rounded-lg border cursor-pointer transition-all ${
                            session.id === currentSessionId 
                                ? 'bg-blue-900/30 border-blue-500/50' 
                                : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                        }`}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2 mb-1">
                                <MessageSquare size={14} className={session.id === currentSessionId ? "text-blue-400" : "text-gray-500"} />
                                <span className={`font-medium text-sm truncate max-w-[180px] ${session.id === currentSessionId ? 'text-blue-100' : 'text-gray-300'}`}>
                                    {session.title || '无标题会话'}
                                </span>
                            </div>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(session.id);
                                }}
                                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        <div className="text-xs text-gray-500 flex justify-between mt-2">
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

            <AgentTodoList todos={todos} />
            <AgentMessageList messages={messages} isLoading={isLoading} isDebugMode={isDebugMode} />
            <AgentInput onSendMessage={onSendMessage} isLoading={isLoading} files={files} autoFocus={isOpen} />
        </>
      )}
    </div>
  );
};

export default AgentChat;
