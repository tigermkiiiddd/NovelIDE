/**
 * 实体版本历史组件
 * 用于查看和恢复角色档案/章节分析的历史版本
 */

import React, { useState, useMemo } from 'react';
import { X, Clock, RotateCcw, Trash2, Camera, User, Bot, RefreshCw, FileText } from 'lucide-react';
import {
  CharacterProfileVersion,
  ChapterAnalysisVersion,
  EntityVersionSource,
  CharacterProfileV2,
  ChapterAnalysis,
} from '../types';
import { useEntityVersionStore } from '../stores/entityVersionStore';

interface EntityVersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'character_profile' | 'chapter_analysis';
  entityId: string;
  entityName: string;
  onRestore: (versionId: string) => void;
}

const SOURCE_CONFIG: Record<EntityVersionSource, { icon: React.ReactNode; label: string; color: string }> = {
  user: { icon: <User size={14} />, label: '用户修改', color: '#38bdf8' },
  agent: { icon: <Bot size={14} />, label: 'AI 更新', color: '#a78bfa' },
  auto: { icon: <RefreshCw size={14} />, label: '自动备份', color: '#94a3b8' },
  manual: { icon: <Camera size={14} />, label: '手动快照', color: '#34d399' },
};

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const EntityVersionHistory: React.FC<EntityVersionHistoryProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  onRestore,
}) => {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const {
    getProfileVersions,
    getAnalysisVersions,
    deleteProfileVersion,
    deleteAnalysisVersion,
    createProfileVersion,
    createAnalysisVersion,
  } = useEntityVersionStore();

  const versions = useMemo(() => {
    if (entityType === 'character_profile') {
      return getProfileVersions(entityId);
    } else {
      return getAnalysisVersions(entityId);
    }
  }, [entityType, entityId, getProfileVersions, getAnalysisVersions]);

  const selectedVersion = useMemo(() => {
    if (!selectedVersionId) return null;
    return versions.find((v) => v.id === selectedVersionId) || null;
  }, [versions, selectedVersionId]);

  const handleRestore = () => {
    if (!selectedVersionId) return;
    if (confirm('确定要恢复到此版本吗？当前状态将被备份为新版本。')) {
      onRestore(selectedVersionId);
      onClose();
    }
  };

  const handleDelete = (versionId: string) => {
    if (confirm('确定要删除此版本吗？此操作不可撤销。')) {
      if (entityType === 'character_profile') {
        deleteProfileVersion(versionId);
      } else {
        deleteAnalysisVersion(versionId);
      }
      if (selectedVersionId === versionId) {
        setSelectedVersionId(null);
      }
    }
  };

  const handleCreateSnapshot = () => {
    if (entityType === 'character_profile') {
      // 创建手动快照需要从 store 获取当前数据
      const { createProfileVersion } = useEntityVersionStore.getState();
      // 这里简化处理，实际应该从外部传入当前数据
      alert('请先保存当前修改，然后再创建快照');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90%',
          maxWidth: 900,
          height: '80vh',
          backgroundColor: '#1e1e1e',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#252526',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Clock size={20} style={{ color: '#38bdf8' }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>版本历史</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {entityType === 'character_profile' ? '角色档案' : '章节分析'}: {entityName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Version List */}
          <div
            style={{
              width: 320,
              borderRight: '1px solid #333',
              overflowY: 'auto',
              backgroundColor: '#1a1a1a',
            }}
          >
            {versions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                <Clock size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                <div>暂无历史版本</div>
              </div>
            ) : (
              versions.map((version) => {
                const config = SOURCE_CONFIG[version.source];
                const isSelected = selectedVersionId === version.id;

                return (
                  <div
                    key={version.id}
                    onClick={() => setSelectedVersionId(version.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #2a2a2a',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#264653' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ color: config.color }}>{config.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>
                        {config.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                      {formatTime(version.timestamp)}
                    </div>
                    {version.description && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>{version.description}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Preview Panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedVersion ? (
              <>
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#252526',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    版本快照 · {formatTime(selectedVersion.timestamp)}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleRestore}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        backgroundColor: '#0ea5e9',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <RotateCcw size={14} />
                      恢复此版本
                    </button>
                    <button
                      onClick={() => handleDelete(selectedVersion.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        border: '1px solid #ef4444',
                        borderRadius: 6,
                        color: '#ef4444',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: 16,
                    backgroundColor: '#1a1a1a',
                  }}
                >
                  <pre
                    style={{
                      fontSize: 12,
                      color: '#94a3b8',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                      fontFamily: 'Consolas, Monaco, monospace',
                    }}
                  >
                    {JSON.stringify(selectedVersion.snapshot, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <FileText size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
                  <div>选择一个版本查看详情</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
