
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, FileText, Folder, Square, Sparkles, Brain } from 'lucide-react';
import { FileNode, FileType } from '../types';
import { getNodePath } from '../services/fileSystem';
import { getNodeDisplayName } from '../utils/displayUtils';
import { useSkillTriggerStore } from '../stores/skillTriggerStore';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';
import { useMemoryStackStore } from '../stores/memoryStackStore';
import { useAgentStore } from '../stores/agentStore';
import QuestionnairePanel from './QuestionnairePanel';

interface AgentInputProps {
  onSendMessage: (text: string) => void;
  onStop?: () => void;
  isLoading: boolean;
  files: FileNode[];
  autoFocus?: boolean;
  resumeProcessTurn?: () => void;
}

const QuestionnaireSection: React.FC<{ resumeProcessTurn?: () => void }> = ({ resumeProcessTurn }) => {
  const activeQuestionnaire = useAgentStore(state => {
    const session = state.sessions.find(s => s.id === state.currentSessionId);
    return session?.activeQuestionnaire;
  });

  if (!activeQuestionnaire || activeQuestionnaire.status !== 'active') return null;

  return (
    <QuestionnairePanel
      questionnaire={activeQuestionnaire}
      onAnswer={(questionId, optionIds) => {
        useAgentStore.getState().updateQuestionnaireAnswer(questionId, optionIds);
      }}
      onTextAnswer={(questionId, text) => {
        useAgentStore.getState().updateQuestionnaireTextAnswer(questionId, text);
      }}
      onNavigate={(index) => {
        useAgentStore.getState().setQuestionnaireIndex(index);
      }}
      onComplete={() => {
        useAgentStore.getState().completeQuestionnaire();
        resumeProcessTurn?.();
      }}
    />
  );
};

const AgentInput: React.FC<AgentInputProps> = ({ onSendMessage, onStop, isLoading, files, autoFocus, resumeProcessTurn }) => {
  const [input, setInput] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const { t } = useTranslation();

  // 获取当前激活的技能（订阅 records 变化）
  const records = useSkillTriggerStore(state => state.records);
  const activeSkills = useMemo(() => useSkillTriggerStore.getState().getActiveSkills(), [records]);

  // 获取知识节点状态 — 从 memoryStackStore 读取实际注入的节点，不重复判断
  const sessions = useAgentStore(state => state.sessions);
  const currentSessionId = useAgentStore(state => state.currentSessionId);
  const allNodes = useKnowledgeGraphStore(state => state.nodes);
  const stackLayers = useMemoryStackStore(state => state.layers);

  const knowledgeState = useMemo(() => {
    const session = sessions.find(s => s.id === currentSessionId);
    const hiddenIds = session?.hiddenKnowledgeNodeIds || [];

    // 常驻记忆 = L1 实际注入的节点（critical）
    const l1Sources = stackLayers.L1?.sources || [];
    const residentDisplay = l1Sources
      .map(id => allNodes.find(n => n.id === id))
      .filter(n => n && !hiddenIds.includes(n!.id))
      .map(n => ({ id: n!.id, name: n!.name }));

    // 活跃文档 = 对话中 read/readFile 过的文件（去重，保留最近的）
    const messages = session?.messages || [];
    const seenPaths = new Set<string>();
    const activeFiles: Array<{ path: string; name: string }> = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.rawParts) {
        for (const part of msg.rawParts) {
          if ('functionCall' in part && (part.functionCall.name === 'read' || part.functionCall.name === 'readFile')) {
            const args = typeof part.functionCall.args === 'string'
              ? JSON.parse(part.functionCall.args)
              : part.functionCall.args;
            const filePath = args?.path as string;
            if (filePath && !seenPaths.has(filePath)) {
              seenPaths.add(filePath);
              const fileName = filePath.split('/').pop() || filePath;
              activeFiles.push({ path: filePath, name: fileName });
            }
          }
        }
      }
    }
    activeFiles.reverse(); // 恢复时间正序

    return { residentDisplay, activeFiles };
  }, [sessions, currentSessionId, allNodes, stackLayers]);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && window.innerWidth > 768) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Detect mobile and keyboard height using visualViewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Monitor visualViewport for keyboard detection
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const keyboardHeight = Math.max(0, windowHeight - viewportHeight);
        setKeyboardHeight(keyboardHeight);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      }
    };
  }, []);

  // Auto-resize logic
  useEffect(() => {
    if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // --- Filter Files for Mention ---
  const filteredFiles = useMemo(() => {
      if (!showMentionList) return [];
      const lowerQuery = mentionQuery.toLowerCase();
      
      return files
          .filter(f => f.name.toLowerCase().includes(lowerQuery) && f.id !== 'root')
          .sort((a, b) => {
               if (a.type !== b.type) return a.type === FileType.FILE ? -1 : 1;
               return a.name.localeCompare(b.name);
          })
          .slice(10);
  }, [showMentionList, mentionQuery, files]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const selectionStart = e.target.selectionStart || 0;
    setInput(val);
    setCursorPos(selectionStart);

    // Detect @ mention
    const textBeforeCursor = val.slice(0, selectionStart);
    const mentionMatch = textBeforeCursor.match(/@([^@\s]*)$/);

    if (mentionMatch) {
        setShowMentionList(true);
        setMentionQuery(mentionMatch[1]);
        setMentionIndex(0);
    } else {
        setShowMentionList(false);
    }
  };

  const insertMention = (file: FileNode) => {
      // Use system utility to get standardized path
      const fullPath = getNodePath(file, files);
      const textBeforeCursor = input.slice(0, cursorPos);
      const textAfterCursor = input.slice(cursorPos);
      
      const lastAtPos = textBeforeCursor.lastIndexOf('@');
      const newTextBefore = textBeforeCursor.slice(0, lastAtPos) + `@${fullPath} `;
      
      const newValue = newTextBefore + textAfterCursor;
      setInput(newValue);
      setShowMentionList(false);
      
      setTimeout(() => {
          if (inputRef.current) {
              inputRef.current.focus();
              const newCursorPos = newTextBefore.length;
              inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
      }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMentionList && filteredFiles.length > 0) {
          if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMentionIndex(prev => (prev > 0 ? prev - 1 : filteredFiles.length - 1));
              return;
          }
          if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMentionIndex(prev => (prev < filteredFiles.length - 1 ? prev + 1 : 0));
              return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insertMention(filteredFiles[mentionIndex]);
              return;
          }
          if (e.key === 'Escape') {
              e.preventDefault();
              setShowMentionList(false);
              return;
          }
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !showMentionList) {
          e.preventDefault();
          handleSubmit();
      }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
    setShowMentionList(false);
    // Reset height
    if (inputRef.current) {
        inputRef.current.style.height = 'auto';
    }
  };

  return (
    <div
      className="p-3 bg-gray-800 border-t border-gray-700 shrink-0 safe-area-bottom relative"
      style={isMobile && keyboardHeight > 0 ? { paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px))` } : {}}
    >
        {/* Mention Autocomplete List - Desktop: popup above, Mobile: bottom modal */}
        {showMentionList && filteredFiles.length > 0 && (
            <>
              {/* Mobile: Full-width bottom modal */}
              {isMobile ? (
                <div
                  className="fixed inset-x-0 bg-gray-800 border-t border-gray-700 z-50 flex flex-col rounded-t-xl shadow-2xl"
                  style={{
                    bottom: `${keyboardHeight}px`,
                    maxHeight: '40vh'
                  }}
                >
                    <div className="p-3 bg-gray-850 text-xs text-gray-500 border-b border-gray-700 font-medium flex items-center justify-between rounded-t-xl">
                        <span>{t('agentInput.selectFileRef')}</span>
                        <button
                          onClick={() => setShowMentionList(false)}
                          className="text-gray-400 hover:text-white"
                        >
                          {t('common.close')}
                        </button>
                    </div>
                    <ul className="overflow-y-auto p-2">
                        {filteredFiles.map((file, index) => {
                            const fullPath = getNodePath(file, files);
                            return (
                                <li
                                    key={file.id}
                                    onClick={() => insertMention(file)}
                                    className={`px-3 py-3 text-sm cursor-pointer flex items-center justify-between rounded-lg ${
                                        index === mentionIndex ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        {file.type === FileType.FOLDER ? <Folder size={14} className="text-yellow-500" /> : <FileText size={14} className="text-blue-400" />}
                                        <span className="truncate font-medium">{getNodeDisplayName(file)}</span>
                                    </div>
                                    <span className={`text-xs ml-4 truncate max-w-[40%] ${index === mentionIndex ? 'text-blue-200' : 'text-gray-500'}`}>
                                        {fullPath}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
              ) : (
                /* Desktop: popup above input */
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden z-50 max-h-60 flex flex-col">
                    <div className="p-2 bg-gray-850 text-xs text-gray-500 border-b border-gray-700 font-medium">
                        {t('agentInput.selectFileRefDesktop')}
                    </div>
                    <ul className="overflow-y-auto">
                        {filteredFiles.map((file, index) => {
                            const fullPath = getNodePath(file, files);
                            return (
                                <li
                                    key={file.id}
                                    onClick={() => insertMention(file)}
                                    className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between group ${
                                        index === mentionIndex ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        {file.type === FileType.FOLDER ? <Folder size={14} className="text-yellow-500" /> : <FileText size={14} className="text-blue-400 group-hover:text-blue-300" />}
                                        <span className="truncate font-medium">{getNodeDisplayName(file)}</span>
                                    </div>
                                    <span className={`text-xs ml-4 truncate max-w-[40%] ${index === mentionIndex ? 'text-blue-200' : 'text-gray-500'}`}>
                                        {fullPath}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
              )}
            </>
        )}

        {/* 激活技能显示 */}
        {activeSkills.length > 0 && (
            <div className="mb-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Sparkles size={12} className="text-yellow-400" />
                    {t('agentInput.activeSkills')}
                </span>
                {activeSkills.map(skill => (
                    <span
                        key={skill.skillId}
                        className="text-xs px-2 py-0.5 pr-1 bg-yellow-500/20 text-yellow-300 rounded-full border border-yellow-500/30 flex items-center gap-1"
                        title={t('agentInput.matchKeyword', { text: skill.matchText })}
                    >
                        <span>{skill.name.replace(/\s*\(.*?\)\s*$/, '')}</span>
                        <button
                            onClick={() => useSkillTriggerStore.getState().removeSkill(skill.skillId)}
                            className="ml-1 text-yellow-300/60 hover:text-yellow-300 leading-none"
                            title={t('common.close')}
                        >×</button>
                    </span>
                ))}
            </div>
        )}

        {/* 记忆 + 活跃文档，默认折叠只显示数量 */}
        {(knowledgeState.residentDisplay.length > 0 || knowledgeState.activeFiles.length > 0) && (
            <div className="mb-2">
                <button
                    onClick={() => setMemoryExpanded(prev => !prev)}
                    className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-300 transition-colors"
                >
                    <Brain size={12} className="text-cyan-400" />
                    {t('agentInput.memoryCount', { count: knowledgeState.residentDisplay.length })}
                    {knowledgeState.activeFiles.length > 0 && (
                      <span className="text-gray-500">· {t('agentInput.docCount', { count: knowledgeState.activeFiles.length })}</span>
                    )}
                    <span className={`transition-transform ${memoryExpanded ? 'rotate-90' : ''}`}>▸</span>
                </button>
                {memoryExpanded && (
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        {knowledgeState.residentDisplay.map(node => (
                            <span
                                key={node.id}
                                className="text-xs px-2 py-0.5 pr-1 bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30 flex items-center gap-1"
                            >
                                <span>{node.name}</span>
                                <button
                                    onClick={() => useAgentStore.getState().addHiddenKnowledgeNode(node.id)}
                                    className="ml-1 text-cyan-300/60 hover:text-cyan-300 leading-none"
                                    title={t('agentInput.hideThisConversation')}
                                >×</button>
                            </span>
                        ))}
                        {knowledgeState.activeFiles.map(f => (
                            <span
                                key={f.path}
                                className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30 flex items-center gap-1"
                                title={f.path}
                            >
                                <FileText size={10} className="shrink-0" />
                                <span>{f.name}</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* Questionnaire Panel */}
        <QuestionnaireSection resumeProcessTurn={resumeProcessTurn} />

        <form onSubmit={handleSubmit} className="flex items-end space-x-2">
        <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? t('agentInput.placeholderGenerating') : t('agentInput.placeholder')}
            className="flex-1 bg-gray-900 text-white placeholder-gray-500 border border-gray-600 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm disabled:opacity-70 resize-none overflow-y-auto min-h-[40px] max-h-[200px]"
            autoComplete="off"
            disabled={isLoading}
        />
        
        {isLoading ? (
            <button
                type="button"
                onClick={onStop}
                className="p-2 mb-0.5 bg-red-600 text-white rounded-full hover:bg-red-500 transition-colors shadow-lg animate-in zoom-in-50 duration-200"
                title={t('agentInput.stopGenerating')}
            >
                <Square size={18} fill="currentColor" />
            </button>
        ) : (
            <button
                type="submit"
                disabled={!input.trim()}
                className="p-2 mb-0.5 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={t('agentInput.send')}
            >
                <Send size={18} />
            </button>
        )}
        </form>
    </div>
  );
};

export default AgentInput;
