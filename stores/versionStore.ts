/**
 * 文档版本管理 Store
 *
 * 功能：
 * - 自动保存文件修改前的版本
 * - 支持手动创建版本快照
 * - Agent 修改前自动创建备份
 * - 版本恢复功能
 */

import { create } from 'zustand';
import { dbAPI } from '../services/persistence';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';

// 版本来源类型
export type VersionSource = 'user' | 'agent' | 'auto' | 'manual';

// 单个版本记录
export interface FileVersion {
  id: string;
  fileId: string;
  fileName: string;
  filePath: string;
  content: string;
  timestamp: number;
  source: VersionSource;
  description?: string;
  // 元数据
  wordCount?: number;
  lineCount?: number;
}

// 版本管理状态
interface VersionState {
  versions: Map<string, FileVersion[]>; // fileId -> versions
  isLoading: boolean;
  maxVersionsPerFile: number; // 每个文件最大版本数

  // === 生命周期 ===
  loadVersions: (projectId: string) => Promise<void>;

  // === 版本操作 ===
  createVersion: (
    fileId: string,
    fileName: string,
    filePath: string,
    content: string,
    source: VersionSource,
    description?: string
  ) => string;
  getVersions: (fileId: string) => FileVersion[];
  getVersion: (versionId: string) => FileVersion | undefined;
  restoreVersion: (versionId: string) => FileVersion | null;
  deleteVersion: (versionId: string) => void;
  clearFileVersions: (fileId: string) => void;

  // === Agent 专用 ===
  createAgentBackup: (fileId: string) => string | null; // Agent 修改前创建备份

  // === 内部方法 ===
  _pruneOldVersions: (fileId: string) => void;
  _saveToDB: () => void;
}

const generateId = () => `ver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 计算字数和行数
const calculateStats = (content: string) => {
  const lines = content.split('\n');
  const chars = content.replace(/\s/g, '').length;
  return {
    wordCount: chars,
    lineCount: lines.length
  };
};

export const useVersionStore = create<VersionState>((set, get) => ({
  versions: new Map(),
  isLoading: false,
  maxVersionsPerFile: 50, // 默认保留50个版本

  loadVersions: async (projectId: string) => {
    set({ isLoading: true });
    try {
      const data = await dbAPI.getVersions(projectId);
      if (data) {
        const versionMap = new Map<string, FileVersion[]>();
        for (const version of data) {
          const existing = versionMap.get(version.fileId) || [];
          existing.push(version);
          versionMap.set(version.fileId, existing.sort((a, b) => b.timestamp - a.timestamp));
        }
        set({ versions: versionMap });
      }
    } catch (e) {
      console.error('[VersionStore] 加载版本失败:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  createVersion: (fileId, fileName, filePath, content, source, description) => {
    const { versions, maxVersionsPerFile, _pruneOldVersions, _saveToDB } = get();

    // 对于 user 类型的版本，检查时间间隔（避免频繁输入时创建过多版本）
    if (source === 'user') {
      const fileVersions = versions.get(fileId) || [];
      const lastUserVersion = fileVersions.find(v => v.source === 'user');

      if (lastUserVersion) {
        const timeDiff = Date.now() - lastUserVersion.timestamp;
        // 如果 60 秒内有 user 版本，跳过
        if (timeDiff < 60000) {
          console.log('[VersionStore] 跳过 user 版本（60秒内已有备份）');
          return lastUserVersion.id;
        }
      }
    }

    const stats = calculateStats(content);
    const newVersion: FileVersion = {
      id: generateId(),
      fileId,
      fileName,
      filePath,
      content,
      timestamp: Date.now(),
      source,
      description,
      ...stats
    };

    const fileVersions = versions.get(fileId) || [];
    const newVersions = [newVersion, ...fileVersions];

    set(state => {
      const newMap = new Map(state.versions);
      newMap.set(fileId, newVersions);
      return { versions: newMap };
    });

    // 清理旧版本
    _pruneOldVersions(fileId);
    _saveToDB();

    console.log(`[VersionStore] 创建版本: ${fileName} (${source}) - ${description || '无描述'}`);
    return newVersion.id;
  },

  getVersions: (fileId: string) => {
    return get().versions.get(fileId) || [];
  },

  getVersion: (versionId: string) => {
    const { versions } = get();
    for (const [, vers] of versions) {
      const found = vers.find(v => v.id === versionId);
      if (found) return found;
    }
    return undefined;
  },

  restoreVersion: (versionId: string) => {
    const version = get().getVersion(versionId);
    if (!version) {
      console.error('[VersionStore] 版本不存在:', versionId);
      return null;
    }

    // 返回版本内容，由调用方（如 fileStore）负责恢复
    console.log(`[VersionStore] 恢复版本: ${version.fileName} @ ${new Date(version.timestamp).toLocaleString()}`);
    return version;
  },

  deleteVersion: (versionId: string) => {
    const { versions, _saveToDB } = get();

    set(state => {
      const newMap = new Map(state.versions);
      for (const [fileId, vers] of newMap) {
        const idx = vers.findIndex(v => v.id === versionId);
        if (idx !== -1) {
          const newVers = [...vers];
          newVers.splice(idx, 1);
          newMap.set(fileId, newVers);
          break;
        }
      }
      return { versions: newMap };
    });

    _saveToDB();
  },

  clearFileVersions: (fileId: string) => {
    const { versions, _saveToDB } = get();

    set(state => {
      const newMap = new Map(state.versions);
      newMap.delete(fileId);
      return { versions: newMap };
    });

    _saveToDB();
  },

  createAgentBackup: (fileId: string) => {
    const fileStore = useFileStore.getState();
    const file = fileStore.files.find(f => f.id === fileId);

    if (!file || !file.content) {
      return null;
    }

    // 检查是否最近已经有 Agent 备份（避免重复）
    const { versions } = get();
    const fileVersions = versions.get(fileId) || [];
    const lastAgentVersion = fileVersions.find(v => v.source === 'agent');

    if (lastAgentVersion) {
      const timeDiff = Date.now() - lastAgentVersion.timestamp;
      // 如果 30 秒内有 Agent 备份，跳过
      if (timeDiff < 30000) {
        console.log('[VersionStore] 跳过 Agent 备份（30秒内已有备份）');
        return lastAgentVersion.id;
      }
    }

    const { getNodePath } = require('../services/fileSystem');
    const filePath = getNodePath(file, fileStore.files);

    return get().createVersion(
      fileId,
      file.name,
      filePath,
      file.content,
      'agent',
      'Agent 修改前自动备份'
    );
  },

  _pruneOldVersions: (fileId: string) => {
    const { versions, maxVersionsPerFile } = get();
    const fileVersions = versions.get(fileId);

    if (!fileVersions || fileVersions.length <= maxVersionsPerFile) return;

    // 保留最近的版本 + 手动创建的版本
    const manualVersions = fileVersions.filter(v => v.source === 'manual');
    const autoVersions = fileVersions.filter(v => v.source !== 'manual');

    // 按时间排序，保留最近的
    const keptAutoVersions = autoVersions.slice(0, maxVersionsPerFile - manualVersions.length);
    const finalVersions = [...manualVersions, ...keptAutoVersions].sort((a, b) => b.timestamp - a.timestamp);

    set(state => {
      const newMap = new Map(state.versions);
      newMap.set(fileId, finalVersions);
      return { versions: newMap };
    });
  },

  _saveToDB: () => {
    const { versions } = get();
    const allVersions: FileVersion[] = [];
    for (const [, vers] of versions) {
      allVersions.push(...vers);
    }

    // 保存到 IndexedDB
    try {
      const projectStore = useProjectStore.getState();
      const projectId = projectStore.getCurrentProject()?.id;

      if (projectId) {
        dbAPI.saveVersions(projectId, allVersions);
      }
    } catch (e) {
      console.error('[VersionStore] 保存失败:', e);
    }
  }
}));
