/**
 * VersionHistory.tsx
 * 文档版本历史管理组件
 *
 * 功能：
 * - 显示当前文件的版本历史
 * - 预览历史版本
 * - 恢复到指定版本
 * - 手动创建版本快照
 */

import React, { useState, useEffect, useMemo } from 'react';
import { History, RotateCcw, Eye, Plus, Trash2, X, Clock, User, Bot, FileText } from 'lucide-react';
import { useVersionStore, FileVersion, VersionSource } from '../stores/versionStore';
import { useFileStore } from '../stores/fileStore';
import { formatWordCount } from '../utils/wordCount';

interface VersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string | null;
}

// 版本来源图标
const SourceIcon = ({ source }: { source: VersionSource }) => {
  switch (source) {
    case 'agent':
      return <Bot size={14} className="text-purple-400" />;
    case 'manual':
      return <Plus size={14} className="text-green-400" />;
    case 'auto':
      return <Clock size={14} className="text-blue-400" />;
    default:
      return <User size={14} className="text-gray-400" />;
  }
};

// 版本来源文本
const sourceText: Record<VersionSource, string> = {
  user: '用户编辑',
  agent: 'Agent 修改',
  auto: '自动备份',
  manual: '手动快照'
};

const VersionHistory: React.FC<VersionHistoryProps> = ({ isOpen, onClose, fileId }) => {
  const [selectedVersion, setSelectedVersion] = useState<FileVersion | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const versionStore = useVersionStore();
  const restoreVersion = versionStore.restoreVersion;
  const deleteVersion = versionStore.deleteVersion;
  const createVersion = versionStore.createVersion;

  // 使用 useMemo 缓存版本列表，避免无限循环
  const versions = useMemo(() => {
    return fileId ? versionStore.getVersions(fileId) : [];
  }, [fileId, versionStore]);

  const files = useFileStore(state => state.files);
  const saveFileContent = useFileStore(state => state.saveFileContent);

  const currentFile = files.find(f => f.id === fileId);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 恢复版本
  const handleRestore = (version: FileVersion) => {
    if (!fileId) return;

    // 先保存当前版本
    if (currentFile?.content) {
      createVersion(
        fileId,
        currentFile.name,
        version.filePath,
        currentFile.content,
        'manual',
        `恢复前备份 (恢复到 ${formatTime(version.timestamp)})`
      );
    }

    // 恢复内容
    saveFileContent(fileId, version.content);
    setShowPreview(false);
    setSelectedVersion(null);

    console.log(`[VersionHistory] 已恢复版本: ${formatTime(version.timestamp)}`);
  };

  // 创建手动快照
  const handleCreateSnapshot = () => {
    if (!fileId || !currentFile) return;

    createVersion(
      fileId,
      currentFile.name,
      '', // path will be filled
      currentFile.content || '',
      'manual',
      '手动创建快照'
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-lg w-[800px] max-h-[80vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <History size={20} className="text-blue-400" />
            <span className="font-semibold text-lg text-gray-200">版本历史</span>
            {currentFile && (
              <span className="text-sm text-gray-400">- {currentFile.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateSnapshot}
              disabled={!fileId || !currentFile}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded"
              title="创建当前版本快照"
            >
              <Plus size={14} />
              创建快照
            </button>
            <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
              <X size={20} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Version List */}
          <div className="w-1/2 border-r border-gray-700 overflow-y-auto">
            {versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <History size={48} className="mb-4 opacity-30" />
                <p>暂无版本历史</p>
                <p className="text-sm mt-2">修改文件时会自动创建版本</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    onClick={() => {
                      setSelectedVersion(version);
                      setShowPreview(true);
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedVersion?.id === version.id
                        ? 'bg-blue-900/30 border border-blue-500'
                        : 'bg-gray-800/50 hover:bg-gray-700/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <SourceIcon source={version.source} />
                        <span className="text-sm text-gray-300">{sourceText[version.source]}</span>
                      </div>
                      <span className="text-xs text-gray-500">{formatTime(version.timestamp)}</span>
                    </div>
                    {version.description && (
                      <p className="text-xs text-gray-400 mb-1">{version.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileText size={12} />
                        {formatWordCount(version.content)}
                      </span>
                      <span>{version.lineCount} 行</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 flex flex-col">
            {showPreview && selectedVersion ? (
              <>
                {/* Preview Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800/30">
                  <span className="text-sm text-gray-400">预览版本内容</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestore(selectedVersion)}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
                    >
                      <RotateCcw size={14} />
                      恢复此版本
                    </button>
                    <button
                      onClick={() => deleteVersion(selectedVersion.id)}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600/50 hover:bg-red-600 text-white rounded"
                      title="删除此版本"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Preview Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-900/50">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                    {selectedVersion.content || '(空文件)'}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                <Eye size={48} className="mb-4 opacity-30" />
                <p>选择一个版本查看内容</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionHistory;
