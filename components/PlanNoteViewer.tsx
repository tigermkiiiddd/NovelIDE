/**
 * PlanNoteViewer.tsx
 * Plan 笔记本查看器组件 - 嵌入式版本（在 Editor 区域显示）
 *
 * 功能：
 * - 查看当前 Plan 笔记本内容
 * - 添加/编辑/删除注释
 * - 审批操作（提交审批、同意、拒绝）
 * - 发送反馈给 AI
 */

import React, { useState, useCallback } from 'react';
import {
  X, Check, XCircle, Send, MessageSquare, Plus, Trash2, Edit2,
  Clock, FileText, AlertCircle, CheckCircle2, ArrowLeft
} from 'lucide-react';
import { PlanNote, PlanNoteLine, PlanNoteAnnotation, ChatMessage } from '../types';
import { generateId } from '../services/fileSystem';

interface PlanNoteViewerProps {
  planNote: PlanNote | null;
  isOpen: boolean;
  onClose: () => void;
  // Annotation actions
  onAddAnnotation: (planId: string, lineId: string, content: string) => void;
  onUpdateAnnotation: (planId: string, annotationId: string, content: string) => void;
  onDeleteAnnotation: (planId: string, annotationId: string) => void;
  // Status actions
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  // Send feedback to AI
  onSendFeedback: (feedback: string) => void;
}

const PlanNoteViewer: React.FC<PlanNoteViewerProps> = ({
  planNote,
  isOpen,
  onClose,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onApprove,
  onReject,
  onSendFeedback
}) => {
  const [annotatingLineId, setAnnotatingLineId] = useState<string | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  if (!isOpen) return null;

  const statusColors = {
    draft: 'bg-purple-600 text-purple-100',
    reviewing: 'bg-yellow-600 text-yellow-100',
    approved: 'bg-green-600 text-green-100',
    rejected: 'bg-red-600 text-red-100'
  };

  const statusLabels = {
    draft: '等待审批',
    reviewing: '审批中',
    approved: '已批准',
    rejected: '需修改'
  };

  const statusIcons = {
    draft: <Clock size={14} />,
    reviewing: <Clock size={14} />,
    approved: <CheckCircle2 size={14} />,
    rejected: <XCircle size={14} />
  };

  const handleAddAnnotation = (lineId: string) => {
    if (annotationText.trim()) {
      onAddAnnotation(planNote!.id, lineId, annotationText.trim());
      setAnnotationText('');
      setAnnotatingLineId(null);
    }
  };

  const handleUpdateAnnotation = (annotationId: string) => {
    if (annotationText.trim()) {
      onUpdateAnnotation(planNote!.id, annotationId, annotationText.trim());
      setAnnotationText('');
      setEditingAnnotationId(null);
    }
  };

  const handleSendFeedback = () => {
    if (feedbackText.trim()) {
      onSendFeedback(feedbackText.trim());
      setFeedbackText('');
      setShowFeedbackInput(false);
    }
  };

  const handleApprove = () => {
    onApprove(planNote!.id);
    // 同时发送系统消息触发 AI 继续执行
    onSendFeedback('[Plan已批准] 用户已批准当前Plan，Agent可以开始执行。');
    onClose();
  };

  // 返工：直接打开反馈输入框
  const handleRework = () => {
    setShowFeedbackInput(true);
  };

  // 发送返工反馈
  const handleSendReworkFeedback = () => {
    if (feedbackText.trim()) {
      onReject(planNote!.id); // 标记为需要修改
      onSendFeedback(`[Plan需修改] 用户对当前Plan提出以下修改意见：\n\n${feedbackText.trim()}`);
      setFeedbackText('');
      setShowFeedbackInput(false);
      onClose();
    }
  };

  // Empty state when no plan note
  if (!planNote) {
    return (
      <div className="w-full h-full flex flex-col bg-[#0d1117]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="text-purple-400" size={20} />
              <h2 className="text-base font-semibold text-gray-100">Plan 笔记本</h2>
            </div>
          </div>
        </div>
        {/* Empty Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 py-12">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">暂无 Plan 笔记本</p>
            <p className="text-sm mt-2">开启 Plan 模式后，AI 会在这里记录思考内容</p>
          </div>
        </div>
      </div>
    );
  }

  const sortedLines = [...planNote.lines].sort((a, b) => a.order - b.order);

  return (
    <div className="w-full h-full flex flex-col bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <FileText className="text-purple-400" size={20} />
            <h2 className="text-base font-semibold text-gray-100">{planNote.title}</h2>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[planNote.status]}`}>
            {statusIcons[planNote.status]}
            {statusLabels[planNote.status]}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          更新于 {new Date(planNote.updatedAt).toLocaleString('zh-CN')}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedLines.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>Plan 笔记本为空</p>
            <p className="text-sm mt-2">等待 AI 记录思考内容...</p>
          </div>
        ) : (
          sortedLines.map((line, index) => {
            const lineAnnotations = planNote.annotations.filter(a => a.lineId === line.id);

            return (
              <div key={line.id} className="group">
                {/* Line content */}
                <div
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer border border-transparent hover:border-gray-700"
                  onClick={() => setAnnotatingLineId(annotatingLineId === line.id ? null : line.id)}
                >
                  <span className="text-gray-600 font-mono text-sm select-none w-6 shrink-0">
                    {index + 1}.
                  </span>
                  <p className="flex-1 text-gray-200 whitespace-pre-wrap leading-relaxed">{line.text}</p>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-700 rounded text-gray-500 hover:text-blue-400 transition-all shrink-0"
                    title="添加注释"
                  >
                    <MessageSquare size={16} />
                  </button>
                </div>

                {/* Annotation input */}
                {annotatingLineId === line.id && (
                  <div className="ml-9 mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700 animate-in slide-in-from-top-2 duration-200">
                    <textarea
                      value={annotationText}
                      onChange={(e) => setAnnotationText(e.target.value)}
                      placeholder="输入您的注释..."
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => {
                          setAnnotatingLineId(null);
                          setAnnotationText('');
                        }}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleAddAnnotation(line.id)}
                        disabled={!annotationText.trim()}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        添加注释
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing annotations */}
                {lineAnnotations.length > 0 && (
                  <div className="ml-9 mt-2 space-y-2">
                    {lineAnnotations.map(annotation => (
                      <div
                        key={annotation.id}
                        className="p-3 bg-yellow-900/20 border-l-2 border-yellow-500 rounded-r-lg"
                      >
                        {editingAnnotationId === annotation.id ? (
                          <div>
                            <textarea
                              value={annotationText}
                              onChange={(e) => setAnnotationText(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 resize-none"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                onClick={() => {
                                  setEditingAnnotationId(null);
                                  setAnnotationText('');
                                }}
                                className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => handleUpdateAnnotation(annotation.id)}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                              >
                                保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm text-yellow-200">{annotation.content}</p>
                              <p className="text-xs text-yellow-600 mt-1">
                                {new Date(annotation.modifiedAt).toLocaleString('zh-CN')}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingAnnotationId(annotation.id);
                                  setAnnotationText(annotation.content);
                                }}
                                className="p-1 hover:bg-yellow-900/30 rounded text-yellow-500 hover:text-yellow-300"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => onDeleteAnnotation(planNote.id, annotation.id)}
                                className="p-1 hover:bg-red-900/30 rounded text-yellow-500 hover:text-red-400"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Feedback input */}
      {showFeedbackInput && (
        <div className="px-4 py-4 bg-gray-900 border-t border-gray-700 shrink-0">
          <label className="block text-sm text-gray-400 mb-2">
            请输入修改意见（将发送给 AI 重新规划）：
          </label>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="例如：第一章的情节需要更多冲突..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setShowFeedbackInput(false);
                setFeedbackText('');
              }}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSendReworkFeedback}
              disabled={!feedbackText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
              发送修改意见
            </button>
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-t border-gray-700 shrink-0">
        <div className="text-sm text-gray-500">
          {planNote.annotations.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={14} />
              {planNote.annotations.length} 条注释
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {/* 等待审批或返工状态：显示两个核心按钮 */}
          {(planNote.status === 'draft' || planNote.status === 'rejected') && (
            <>
              <button
                onClick={handleRework}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <Edit2 size={16} />
                返工修改
              </button>
              <button
                onClick={handleApprove}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
              >
                <Check size={16} />
                同意并执行
              </button>
            </>
          )}
          {/* 审批中状态（兼容旧逻辑） */}
          {planNote.status === 'reviewing' && (
            <>
              <button
                onClick={handleRework}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <Edit2 size={16} />
                返工修改
              </button>
              <button
                onClick={handleApprove}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
              >
                <Check size={16} />
                同意并执行
              </button>
            </>
          )}
          {/* 已批准：显示完成状态 */}
          {planNote.status === 'approved' && (
            <span className="inline-flex items-center gap-2 px-4 py-2 text-sm text-green-400">
              <CheckCircle2 size={16} />
              已批准执行
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanNoteViewer;
