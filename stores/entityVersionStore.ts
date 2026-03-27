/**
 * 实体版本管理 Store
 *
 * 功能：
 * - 管理角色档案和章节分析的版本历史
 * - 自动创建版本快照
 * - 支持版本恢复
 */

import { create } from 'zustand';
import { dbAPI } from '../services/persistence';
import { useProjectStore } from './projectStore';
import {
  CharacterProfileVersion,
  ChapterAnalysisVersion,
  EntityVersionSource,
  CharacterProfileV2,
  ChapterAnalysis,
  CharacterCategoryName,
} from '../types';

interface EntityVersionState {
  profileVersions: Map<string, CharacterProfileVersion[]>;
  analysisVersions: Map<string, ChapterAnalysisVersion[]>;
  isLoading: boolean;
  maxVersionsPerEntity: number;

  // === 生命周期 ===
  loadVersions: (projectId: string) => Promise<void>;

  // === 角色档案版本操作 ===
  createProfileVersion: (
    profile: CharacterProfileV2,
    source: EntityVersionSource,
    description?: string,
    changedCategories?: CharacterCategoryName[]
  ) => string;
  getProfileVersions: (characterId: string) => CharacterProfileVersion[];
  getProfileVersion: (versionId: string) => CharacterProfileVersion | undefined;
  restoreProfileVersion: (versionId: string) => CharacterProfileV2 | null;
  deleteProfileVersion: (versionId: string) => void;
  clearProfileVersions: (characterId: string) => void;

  // === 章节分析版本操作 ===
  createAnalysisVersion: (
    analysis: ChapterAnalysis,
    source: EntityVersionSource,
    description?: string
  ) => string;
  getAnalysisVersions: (analysisId: string) => ChapterAnalysisVersion[];
  getAnalysisVersion: (versionId: string) => ChapterAnalysisVersion | undefined;
  restoreAnalysisVersion: (versionId: string) => ChapterAnalysis | null;
  deleteAnalysisVersion: (versionId: string) => void;
  clearAnalysisVersions: (analysisId: string) => void;

  // === 内部方法 ===
  _pruneOldVersions: (entityType: 'profile' | 'analysis', entityId: string) => void;
  _saveToDB: () => void;
}

const generateId = () => `ver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const SOURCE_LABELS: Record<EntityVersionSource, string> = {
  user: '用户修改',
  agent: 'AI 更新',
  auto: '自动备份',
  manual: '手动快照',
};

export const useEntityVersionStore = create<EntityVersionState>((set, get) => ({
  profileVersions: new Map(),
  analysisVersions: new Map(),
  isLoading: false,
  maxVersionsPerEntity: 30,

  loadVersions: async (projectId: string) => {
    set({ isLoading: true });
    try {
      // 加载角色档案版本
      const profileVersions = await dbAPI.getCharacterProfileVersions(projectId);
      const profileMap = new Map<string, CharacterProfileVersion[]>();
      for (const version of profileVersions) {
        const existing = profileMap.get(version.entityId) || [];
        existing.push(version);
        profileMap.set(version.entityId, existing.sort((a, b) => b.timestamp - a.timestamp));
      }

      // 加载章节分析版本
      const analysisVersions = await dbAPI.getChapterAnalysisVersions(projectId);
      const analysisMap = new Map<string, ChapterAnalysisVersion[]>();
      for (const version of analysisVersions) {
        const existing = analysisMap.get(version.entityId) || [];
        existing.push(version);
        analysisMap.set(version.entityId, existing.sort((a, b) => b.timestamp - a.timestamp));
      }

      set({ profileVersions: profileMap, analysisVersions: analysisMap });
      console.log(`[EntityVersionStore] 加载完成: ${profileVersions.length} 个角色版本, ${analysisVersions.length} 个分析版本`);
    } catch (e) {
      console.error('[EntityVersionStore] 加载版本失败:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  createProfileVersion: (profile, source, description, changedCategories) => {
    const { profileVersions, maxVersionsPerEntity, _pruneOldVersions, _saveToDB } = get();

    const newVersion: CharacterProfileVersion = {
      id: generateId(),
      entityId: profile.characterId,
      entityName: profile.characterName,
      snapshot: JSON.parse(JSON.stringify(profile)), // 深拷贝
      timestamp: Date.now(),
      source,
      description: description || `${SOURCE_LABELS[source]}`,
      changedCategories,
    };

    const existingVersions = profileVersions.get(profile.characterId) || [];
    const newVersions = [newVersion, ...existingVersions];

    set(state => {
      const newMap = new Map(state.profileVersions);
      newMap.set(profile.characterId, newVersions);
      return { profileVersions: newMap };
    });

    // 清理旧版本
    _pruneOldVersions('profile', profile.characterId);
    _saveToDB();

    console.log(`[EntityVersionStore] 创建角色档案版本: ${profile.characterName} (${source}) - ${description || '无描述'}`);
    return newVersion.id;
  },

  getProfileVersions: (characterId: string) => {
    return get().profileVersions.get(characterId) || [];
  },

  getProfileVersion: (versionId: string) => {
    const { profileVersions } = get();
    for (const [, versions] of profileVersions) {
      const found = versions.find(v => v.id === versionId);
      if (found) return found;
    }
    return undefined;
  },

  restoreProfileVersion: (versionId: string) => {
    const version = get().getProfileVersion(versionId);
    if (!version) {
      console.error('[EntityVersionStore] 角色档案版本不存在:', versionId);
      return null;
    }

    console.log(`[EntityVersionStore] 恢复角色档案版本: ${version.entityName} @ ${new Date(version.timestamp).toLocaleString()}`);
    return JSON.parse(JSON.stringify(version.snapshot)); // 返回深拷贝
  },

  deleteProfileVersion: (versionId: string) => {
    const { profileVersions, _saveToDB } = get();

    set(state => {
      const newMap = new Map(state.profileVersions);
      for (const [characterId, versions] of newMap) {
        const idx = versions.findIndex(v => v.id === versionId);
        if (idx !== -1) {
          const newVersions = [...versions];
          newVersions.splice(idx, 1);
          newMap.set(characterId, newVersions);
          break;
        }
      }
      return { profileVersions: newMap };
    });

    dbAPI.deleteCharacterProfileVersion(versionId);
    console.log(`[EntityVersionStore] 删除角色档案版本: ${versionId}`);
  },

  clearProfileVersions: (characterId: string) => {
    const { _saveToDB } = get();

    set(state => {
      const newMap = new Map(state.profileVersions);
      newMap.delete(characterId);
      return { profileVersions: newMap };
    });

    dbAPI.clearCharacterProfileVersions(characterId);
    console.log(`[EntityVersionStore] 清除角色档案所有版本: ${characterId}`);
  },

  createAnalysisVersion: (analysis, source, description) => {
    const { analysisVersions, maxVersionsPerEntity, _pruneOldVersions, _saveToDB } = get();

    const newVersion: ChapterAnalysisVersion = {
      id: generateId(),
      entityId: analysis.id,
      entityName: analysis.chapterTitle,
      chapterPath: analysis.chapterPath,
      snapshot: JSON.parse(JSON.stringify(analysis)), // 深拷贝
      timestamp: Date.now(),
      source,
      description: description || `${SOURCE_LABELS[source]}`,
    };

    const existingVersions = analysisVersions.get(analysis.id) || [];
    const newVersions = [newVersion, ...existingVersions];

    set(state => {
      const newMap = new Map(state.analysisVersions);
      newMap.set(analysis.id, newVersions);
      return { analysisVersions: newMap };
    });

    // 清理旧版本
    _pruneOldVersions('analysis', analysis.id);
    _saveToDB();

    console.log(`[EntityVersionStore] 创建章节分析版本: ${analysis.chapterTitle} (${source}) - ${description || '无描述'}`);
    return newVersion.id;
  },

  getAnalysisVersions: (analysisId: string) => {
    return get().analysisVersions.get(analysisId) || [];
  },

  getAnalysisVersion: (versionId: string) => {
    const { analysisVersions } = get();
    for (const [, versions] of analysisVersions) {
      const found = versions.find(v => v.id === versionId);
      if (found) return found;
    }
    return undefined;
  },

  restoreAnalysisVersion: (versionId: string) => {
    const version = get().getAnalysisVersion(versionId);
    if (!version) {
      console.error('[EntityVersionStore] 章节分析版本不存在:', versionId);
      return null;
    }

    console.log(`[EntityVersionStore] 恢复章节分析版本: ${version.entityName} @ ${new Date(version.timestamp).toLocaleString()}`);
    return JSON.parse(JSON.stringify(version.snapshot)); // 返回深拷贝
  },

  deleteAnalysisVersion: (versionId: string) => {
    set(state => {
      const newMap = new Map(state.analysisVersions);
      for (const [analysisId, versions] of newMap) {
        const idx = versions.findIndex(v => v.id === versionId);
        if (idx !== -1) {
          const newVersions = [...versions];
          newVersions.splice(idx, 1);
          newMap.set(analysisId, newVersions);
          break;
        }
      }
      return { analysisVersions: newMap };
    });

    dbAPI.deleteChapterAnalysisVersion(versionId);
    console.log(`[EntityVersionStore] 删除章节分析版本: ${versionId}`);
  },

  clearAnalysisVersions: (analysisId: string) => {
    set(state => {
      const newMap = new Map(state.analysisVersions);
      newMap.delete(analysisId);
      return { analysisVersions: newMap };
    });

    dbAPI.clearChapterAnalysisVersions(analysisId);
    console.log(`[EntityVersionStore] 清除章节分析所有版本: ${analysisId}`);
  },

  _pruneOldVersions: (entityType, entityId) => {
    const { maxVersionsPerEntity } = get();

    if (entityType === 'profile') {
      const { profileVersions } = get();
      const versions = profileVersions.get(entityId);
      if (!versions || versions.length <= maxVersionsPerEntity) return;

      // 保留最近的版本 + 手动创建的版本
      const manualVersions = versions.filter(v => v.source === 'manual');
      const autoVersions = versions.filter(v => v.source !== 'manual');

      const keptAutoVersions = autoVersions.slice(0, maxVersionsPerEntity - manualVersions.length);
      const finalVersions = [...manualVersions, ...keptAutoVersions].sort((a, b) => b.timestamp - a.timestamp);

      set(state => {
        const newMap = new Map(state.profileVersions);
        newMap.set(entityId, finalVersions);
        return { profileVersions: newMap };
      });
    } else {
      const { analysisVersions } = get();
      const versions = analysisVersions.get(entityId);
      if (!versions || versions.length <= maxVersionsPerEntity) return;

      const manualVersions = versions.filter(v => v.source === 'manual');
      const autoVersions = versions.filter(v => v.source !== 'manual');

      const keptAutoVersions = autoVersions.slice(0, maxVersionsPerEntity - manualVersions.length);
      const finalVersions = [...manualVersions, ...keptAutoVersions].sort((a, b) => b.timestamp - a.timestamp);

      set(state => {
        const newMap = new Map(state.analysisVersions);
        newMap.set(entityId, finalVersions);
        return { analysisVersions: newMap };
      });
    }
  },

  _saveToDB: () => {
    const { profileVersions, analysisVersions } = get();
    const projectStore = useProjectStore.getState();
    const projectId = projectStore.getCurrentProject()?.id;

    if (!projectId) return;

    // 保存角色档案版本
    for (const [, versions] of profileVersions) {
      for (const version of versions) {
        dbAPI.saveCharacterProfileVersion(version, projectId);
      }
    }

    // 保存章节分析版本
    for (const [, versions] of analysisVersions) {
      for (const version of versions) {
        dbAPI.saveChapterAnalysisVersion(version, projectId);
      }
    }
  },
}));
