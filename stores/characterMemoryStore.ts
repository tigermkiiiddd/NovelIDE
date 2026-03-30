import {
  CharacterCategoryName,
  CharacterCategoryType,
  CharacterProfileV2,
  CharacterProfileUpdateRequest,
  CharacterProfileInitRequest,
  OverwriteEntry,
  AccumulateEntry,
  CHARACTER_CATEGORIES,
  ChapterAnalysis,
  FileType,
  LongTermMemory,
  SkillValue,
  AttributeValue,
} from '../types';
import { createPersistingStore } from './createPersistingStore';
import type { UseBoundStore, StoreApi } from 'zustand';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';
import { dbAPI } from '../services/persistence';
import { toast } from './toastStore';
import { useEntityVersionStore } from './entityVersionStore';

export interface CharacterMemoryState {
  profiles: CharacterProfileV2[];
  isInitialized: boolean;
  loadProfiles: () => Promise<void>;
  loadProjectProfiles: (projectId: string) => Promise<void>;
  getByName: (characterName: string) => CharacterProfileV2 | undefined;
  initializeProfile: (request: CharacterProfileInitRequest) => CharacterProfileV2;
  updateProfile: (request: CharacterProfileUpdateRequest) => void;
  deleteProfile: (characterName: string) => void;
  archiveEntry: (characterName: string, category: CharacterCategoryName, subCategory: string, entryIndex?: number) => void;
  unarchiveEntry: (characterName: string, category: CharacterCategoryName, subCategory: string, entryIndex: number) => void;
  addSubCategory: (characterName: string, category: CharacterCategoryName, subCategory: string) => void;
  removeSubCategory: (characterName: string, category: CharacterCategoryName, subCategory: string) => void;
  upsertStateSnapshots: (analysis: ChapterAnalysis) => void;
  upsertMemoryFromLongTerm: (memory: LongTermMemory, characterName: string) => void;
  removeMemoryRef: (memoryId: string, characterName: string) => void;
  restoreProfileFromVersion: (versionId: string) => boolean;
  _syncToFiles: () => Promise<void>;
}

const CHARACTER_ROOT_FOLDER = '\u0030\u0032_\u89d2\u8272\u6863\u6848';
const PROFILE_FOLDER = '\u89d2\u8272\u72b6\u6001\u4e0e\u8bb0\u5fc6';

const normalizeName = (name: string) => name.trim().toLowerCase();
const makeProfileId = (characterName: string) =>
  `char-${normalizeName(characterName).replace(/[^\w\u4e00-\u9fa5]+/g, '-')}`;

const isOverwriteCategory = (categoryName: string): boolean =>
  CHARACTER_CATEGORIES[categoryName as CharacterCategoryName] === '覆盖';

const isAccumulateCategory = (categoryName: string): boolean =>
  CHARACTER_CATEGORIES[categoryName as CharacterCategoryName] === '累加';

// 创建空分类结构
const createEmptyCategories = (): CharacterProfileV2['categories'] => {
  const categories: CharacterProfileV2['categories'] = {};

  (Object.keys(CHARACTER_CATEGORIES) as CharacterCategoryName[]).forEach((name) => {
    categories[name] = {
      type: CHARACTER_CATEGORIES[name],
      subCategories: {},
    };
  });

  return categories;
};

// 创建空档案
const createEmptyProfile = (characterName: string, baseProfilePath?: string): CharacterProfileV2 => ({
  characterId: makeProfileId(characterName),
  characterName: characterName.trim(),
  baseProfilePath,
  categories: createEmptyCategories(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// 规范化档案（确保所有分类存在）
const normalizeProfile = (rawProfile: Partial<CharacterProfileV2> & { characterName?: string }): CharacterProfileV2 => {
  const characterName = rawProfile.characterName?.trim() || '未命名角色';
  const now = Date.now();

  // 确保所有预设分类存在
  const categories = createEmptyCategories();
  if (rawProfile.categories) {
    Object.entries(rawProfile.categories).forEach(([catName, catData]) => {
      if (categories[catName]) {
        categories[catName] = {
          type: catData.type || CHARACTER_CATEGORIES[catName as CharacterCategoryName],
          subCategories: catData.subCategories || {},
        };
      }
    });
  }

  return {
    characterId: rawProfile.characterId || makeProfileId(characterName),
    characterName,
    baseProfilePath: rawProfile.baseProfilePath,
    categories,
    createdAt: rawProfile.createdAt || now,
    updatedAt: rawProfile.updatedAt || now,
    lastChapterRef: rawProfile.lastChapterRef,
  };
};

// 确保档案文件夹存在
const ensureProfileFolder = () => {
  const fileStore = useFileStore.getState();
  const characterFolder = fileStore.files.find((file) => file.name === CHARACTER_ROOT_FOLDER && file.parentId === 'root');
  if (!characterFolder) {
    console.log('[CharacterMemoryStore] 未找到角色档案根目录:', CHARACTER_ROOT_FOLDER);
    return null;
  }

  let profileFolder = fileStore.files.find((file) => file.name === PROFILE_FOLDER && file.parentId === characterFolder.id);
  if (!profileFolder) {
    console.log('[CharacterMemoryStore] 创建档案子目录:', PROFILE_FOLDER);
    profileFolder = {
      id: `character-memory-folder-${Date.now()}`,
      parentId: characterFolder.id,
      name: PROFILE_FOLDER,
      type: FileType.FOLDER,
      lastModified: Date.now(),
    };
    fileStore.files.push(profileFolder);
  }

  return profileFolder;
};

// 保存档案到文件和 IndexedDB 表
const saveProfilesToFiles = async (profiles: CharacterProfileV2[]) => {
  console.log('[CharacterMemoryStore] 开始保存档案，数量:', profiles.length);
  const projectId = useProjectStore.getState().currentProjectId;

  // 1. 保存到 IndexedDB 专用表（主要存储）
  if (projectId) {
    try {
      // 获取现有档案 ID 列表
      const existingIds = new Set(profiles.map(p => p.characterId));

      // 保存所有档案
      for (const profile of profiles) {
        const normalized = normalizeProfile(profile);
        await dbAPI.saveCharacterProfile(normalized, projectId);
      }

      // 删除不在列表中的档案
      const allProfiles = await dbAPI.getCharacterProfiles(projectId);
      for (const oldProfile of allProfiles) {
        if (!existingIds.has(oldProfile.characterId)) {
          await dbAPI.deleteCharacterProfile(oldProfile.characterId);
        }
      }

      console.log('[CharacterMemoryStore] 已保存到 IndexedDB 表');
    } catch (error) {
      console.error('[CharacterMemoryStore] 保存到 IndexedDB 表失败:', error);
    }
  }

  // 2. 同步到文件系统（兼容/导出用）
  const folder = ensureProfileFolder();
  if (!folder) {
    console.log('[CharacterMemoryStore] 无法获取档案文件夹，跳过文件同步');
    return;
  }

  const fileStore = useFileStore.getState();
  const existingFiles = fileStore.files.filter((file) => file.parentId === folder.id && file.type === FileType.FILE);
  const seen = new Set<string>();

  profiles.forEach((rawProfile) => {
    const profile = normalizeProfile(rawProfile);
    const fileName = `${profile.characterName}.json`;
    const content = JSON.stringify(profile, null, 2);
    const target = existingFiles.find((file) => file.name === fileName);

    seen.add(fileName);
    console.log('[CharacterMemoryStore] 保存档案文件:', fileName, '字节数:', content.length);

    if (target) {
      target.content = content;
      target.lastModified = Date.now();
    } else {
      fileStore.files.push({
        id: `character-memory-${Date.now()}-${profile.characterId}`,
        parentId: folder.id,
        name: fileName,
        type: FileType.FILE,
        content,
        lastModified: Date.now(),
      });
    }
  });

  // 删除不在列表中的文件
  existingFiles
    .filter((file) => !seen.has(file.name))
    .forEach((file) => {
      const index = fileStore.files.findIndex((item) => item.id === file.id);
      if (index >= 0) {
        fileStore.files.splice(index, 1);
      }
    });

  if (projectId) {
    await dbAPI.saveFiles(projectId, [...fileStore.files]);
    console.log('[CharacterMemoryStore] 已同步到文件系统');
  }
};

// 更新或创建档案
const upsertProfile = (
  profiles: CharacterProfileV2[],
  characterName: string,
  updater: (profile: CharacterProfileV2) => CharacterProfileV2
): CharacterProfileV2[] => {
  const index = profiles.findIndex(
    (profile) => normalizeName(profile.characterName) === normalizeName(characterName)
  );

  if (index === -1) {
    const newProfile = updater(createEmptyProfile(characterName));
    return [...profiles, normalizeProfile(newProfile)];
  }

  const nextProfiles = [...profiles];
  nextProfiles[index] = normalizeProfile(updater(normalizeProfile(nextProfiles[index])));
  return nextProfiles;
};

export const useCharacterMemoryStore: UseBoundStore<StoreApi<CharacterMemoryState>> = createPersistingStore<CharacterMemoryState>(
  'characterMemoryStore',
  {
    profiles: [],
    isInitialized: false,

    loadProfiles: async () => {
      const projectId = useProjectStore.getState().currentProjectId;
      const fileStore = useFileStore.getState();

      // 1. 尝试从 IndexedDB 专用表读取
      if (projectId) {
        try {
          // 检查是否需要迁移
          const migrated = await dbAPI.getProjectMeta(projectId, 'memoriesMigrated');
          if (!migrated) {
            console.log('[CharacterMemoryStore] 检测到旧数据。执行迁移...');
            await dbAPI.migrateMemoriesFromFiles(projectId);
          }

          let profiles = await dbAPI.getCharacterProfiles(projectId);

          // 同步检查：删除 IndexedDB 中存在但文件已不存在的档案
          const folder = ensureProfileFolder();
          if (folder && profiles.length > 0) {
            const existingFileNames = new Set(
              fileStore.files
                .filter((f) => f.parentId === folder.id && f.type === FileType.FILE)
                .map((f) => f.name.replace(/\.json$/i, ''))
            );

            const validProfiles: CharacterProfileV2[] = [];
            const orphanedCharacterIds: string[] = [];

            for (const profile of profiles) {
              const normalized = normalizeName(profile.characterName);
              // 检查是否有对应的文件（角色名.json）
              const hasFile = Array.from(existingFileNames).some(
                (name) => normalizeName(name) === normalized
              );

              if (hasFile) {
                validProfiles.push(profile);
              } else {
                console.log(`[CharacterMemoryStore] 发现已删除的档案，从 IndexedDB 清理: ${profile.characterName}`);
                orphanedCharacterIds.push(profile.characterId);
              }
            }

            // 删除孤立的 IndexedDB 数据
            for (const characterId of orphanedCharacterIds) {
              await dbAPI.deleteCharacterProfile(characterId);
            }

            profiles = validProfiles;
          }

          if (profiles.length > 0) {
            useCharacterMemoryStore.setState({
              profiles: profiles.map(p => normalizeProfile(p)),
              isInitialized: true
            });
            console.log(`[CharacterMemoryStore] 从表加载了 ${profiles.length} 个档案`);
            return;
          }
        } catch (error) {
          console.error('[CharacterMemoryStore] 从表加载失败:', error);
          // 降级到文件读取
        }
      }

      // 2. 降级：从文件读取
      const folder = ensureProfileFolder();

      if (!folder) {
        useCharacterMemoryStore.setState({ profiles: [], isInitialized: true });
        return;
      }

      let failedFiles: string[] = [];

      const profiles = fileStore.files
        .filter((file) => file.parentId === folder.id && file.type === FileType.FILE && file.content)
        .map((file) => {
          try {
            const parsed = JSON.parse(file.content!);
            if (!parsed || typeof parsed !== 'object') {
              console.warn(`[CharacterMemoryStore] 无效的档案数据: ${file.name}`);
              failedFiles.push(file.name);
              return null;
            }
            return normalizeProfile(parsed as CharacterProfileV2);
          } catch (e) {
            console.error(`[CharacterMemoryStore] 解析档案失败: ${file.name}`, e);
            console.error(`[CharacterMemoryStore] 损坏内容前200字符:`, file.content?.slice(0, 200));
            failedFiles.push(file.name);
            return null;
          }
        })
        .filter(Boolean) as CharacterProfileV2[];

      // 如果有解析失败的文件，显示警告
      if (failedFiles.length > 0) {
        toast.error('角色档案加载失败', `${failedFiles.length} 个档案解析失败: ${failedFiles.join(', ')}`, 0);
      }

      useCharacterMemoryStore.setState({ profiles, isInitialized: true });
    },

    loadProjectProfiles: async (_projectId) => {
      await useCharacterMemoryStore.getState().loadProfiles();
    },

    getByName: (characterName) =>
      useCharacterMemoryStore
        .getState()
        .profiles.find((profile) => normalizeName(profile.characterName) === normalizeName(characterName)),

    // 初始化角色档案（AI生成小分类）
    initializeProfile: (request: CharacterProfileInitRequest) => {
      const { characterName, baseProfilePath, initialSubCategories, initialValues } = request;
      console.log('[CharacterMemoryStore] initializeProfile 被调用');
      console.log('[CharacterMemoryStore] 角色名:', characterName);
      console.log('[CharacterMemoryStore] 小分类数量:', initialSubCategories ? Object.keys(initialSubCategories).length : 0);
      console.log('[CharacterMemoryStore] 初始值数量:', initialValues?.length || 0);

      const now = Date.now();
      const chapterRef = '初始设定';

      const profile = createEmptyProfile(characterName, baseProfilePath);

      // 应用AI生成的小分类
      if (initialSubCategories) {
        (Object.entries(initialSubCategories) as [CharacterCategoryName, string[] | undefined][]).forEach(
          ([categoryName, subCategories]) => {
            if (subCategories && profile.categories[categoryName]) {
              subCategories.forEach((subCat) => {
                if (isOverwriteCategory(categoryName)) {
                  // 覆盖型：初始化空值
                  profile.categories[categoryName].subCategories[subCat] = {
                    value: '',
                    chapterRef: '',
                    updatedAt: now,
                  };
                } else {
                  // 累加型：初始化空数组
                  profile.categories[categoryName].subCategories[subCat] = [];
                }
              });
            }
          }
        );
      }

      // 应用AI提取的初始值
      if (initialValues && initialValues.length > 0) {
        let appliedCount = 0;
        initialValues.forEach(({ category, subCategory, value }) => {
          if (!profile.categories[category]) {
            console.log('[CharacterMemoryStore] 跳过无效分类:', category);
            return;
          }

          // 确保小分类存在
          if (!profile.categories[category].subCategories[subCategory]) {
            if (isOverwriteCategory(category)) {
              profile.categories[category].subCategories[subCategory] = {
                value: '',
                chapterRef: '',
                updatedAt: now,
              };
            } else {
              profile.categories[category].subCategories[subCategory] = [];
            }
          }

          // 将 value 转换为存储格式（保持结构化对象）
          let storedValue: string | SkillValue | AttributeValue;
          if (typeof value === 'object' && value !== null) {
            // 结构化值：直接保持对象格式
            const v = value as any;
            if ('quality' in v && ('description' in v || 'unlockCondition' in v)) {
              // 技能格式 {quality, description, unlockCondition}
              storedValue = {
                quality: v.quality,
                description: v.description || '',
                unlockCondition: v.unlockCondition || '',
              } as SkillValue;
              console.log('[CharacterMemoryStore] 技能结构化值:', subCategory, JSON.stringify(storedValue));
            } else if ('level' in v && 'description' in v) {
              // 属性格式 {level, description}
              storedValue = {
                level: v.level,
                description: v.description,
              } as AttributeValue;
              console.log('[CharacterMemoryStore] 属性结构化值:', subCategory, JSON.stringify(storedValue));
            } else {
              // 其他对象格式，JSON序列化
              storedValue = JSON.stringify(value);
              console.log('[CharacterMemoryStore] 其他对象值:', subCategory, storedValue);
            }
          } else {
            storedValue = String(value);
            console.log('[CharacterMemoryStore] 字符串值:', subCategory, String(storedValue).substring(0, 50));
          }

          if (isOverwriteCategory(category)) {
            // 覆盖型：设置值
            profile.categories[category].subCategories[subCategory] = {
              value: storedValue,
              chapterRef,
              updatedAt: now,
            };
            appliedCount++;
          } else {
            // 累加型：添加初始记录
            (profile.categories[category].subCategories[subCategory] as AccumulateEntry[]).push({
              value: storedValue,
              chapterRef,
              updatedAt: now,
              archived: false,
            });
            appliedCount++;
          }
        });
        console.log('[CharacterMemoryStore] 应用了', appliedCount, '个初始值');
      }

      console.log('[CharacterMemoryStore] 更新 state，角色:', profile.characterName);
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, () => profile),
      }));

      // 创建版本记录
      const versionStore = useEntityVersionStore.getState();
      const normalizedProfile = normalizeProfile(profile);
      versionStore.createProfileVersion(
        normalizedProfile,
        'agent',
        'AI 初始化角色档案',
        Object.keys(request.initialSubCategories || {}) as CharacterCategoryName[]
      );

      console.log('[CharacterMemoryStore] 当前 profiles 数量:', useCharacterMemoryStore.getState().profiles.length);
      return profile;
    },

    // 更新档案条目
    updateProfile: (request: CharacterProfileUpdateRequest) => {
      const { characterName, chapterRef, updates } = request;

      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          const now = Date.now();

          updates.forEach(({ category, subCategory, value, action }) => {
            if (!profile.categories[category]) return;

            if (isOverwriteCategory(category)) {
              // 覆盖型：直接替换
              profile.categories[category].subCategories[subCategory] = {
                value,
                chapterRef,
                updatedAt: now,
              };
            } else {
              // 累加型：更新或追加
              const entries = profile.categories[category].subCategories[subCategory] as AccumulateEntry[];

              if (action === 'add' || !entries || entries.length === 0) {
                // 新增条目
                if (!profile.categories[category].subCategories[subCategory]) {
                  profile.categories[category].subCategories[subCategory] = [];
                }
                (profile.categories[category].subCategories[subCategory] as AccumulateEntry[]).push({
                  value,
                  chapterRef,
                  updatedAt: now,
                  archived: false,
                });
              } else {
                // 更新最后一个未归档条目，或追加新条目
                const lastActiveIndex = entries.findIndex((e) => !e.archived);
                if (lastActiveIndex >= 0) {
                  entries[lastActiveIndex] = {
                    ...entries[lastActiveIndex],
                    value,
                    chapterRef,
                    updatedAt: now,
                  };
                } else {
                  entries.push({
                    value,
                    chapterRef,
                    updatedAt: now,
                    archived: false,
                  });
                }
              }
            }
          });

          return { ...profile, updatedAt: now, lastChapterRef: chapterRef };
        }),
      }));

      // 创建版本记录
      const versionStore = useEntityVersionStore.getState();
      const updatedProfile = useCharacterMemoryStore.getState().getByName(characterName);
      if (updatedProfile) {
        const changedCategories = [...new Set(request.updates.map(u => u.category))] as CharacterCategoryName[];
        versionStore.createProfileVersion(
          updatedProfile,
          'agent',
          `AI 更新: ${request.chapterRef}`,
          changedCategories
        );
      }
    },

    // 删除角色档案
    deleteProfile: (characterName) => {
      console.log('[CharacterMemoryStore] 删除档案:', characterName);
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => {
        const normalized = normalizeName(characterName);
        const newProfiles = state.profiles.filter(
          (profile: CharacterProfileV2) => normalizeName(profile.characterName) !== normalized
        );
        console.log('[CharacterMemoryStore] 删除后剩余档案数量:', newProfiles.length);

        // 同时从 IndexedDB 删除
        const projectId = useProjectStore.getState().currentProjectId;
        if (projectId) {
          const profileToDelete = state.profiles.find(
            (p: CharacterProfileV2) => normalizeName(p.characterName) === normalized
          );
          if (profileToDelete) {
            dbAPI.deleteCharacterProfile(profileToDelete.characterId).catch((err) => {
              console.error('[CharacterMemoryStore] 从 IndexedDB 删除失败:', err);
            });
          }
        }

        return { profiles: newProfiles };
      });
    },

    // 归档条目
    archiveEntry: (characterName, category, subCategory, entryIndex) => {
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          if (!isAccumulateCategory(category)) return profile;

          const entries = profile.categories[category]?.subCategories[subCategory] as AccumulateEntry[] | undefined;
          if (!entries) return profile;

          const now = Date.now();
          if (entryIndex !== undefined && entries[entryIndex]) {
            entries[entryIndex].archived = true;
            entries[entryIndex].updatedAt = now;
          } else {
            // 归档最后一个未归档条目
            const lastActive = entries.filter((e) => !e.archived).pop();
            if (lastActive) {
              lastActive.archived = true;
              lastActive.updatedAt = now;
            }
          }

          return { ...profile, updatedAt: now };
        }),
      }));
    },

    // 取消归档
    unarchiveEntry: (characterName, category, subCategory, entryIndex) => {
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          if (!isAccumulateCategory(category)) return profile;

          const entries = profile.categories[category]?.subCategories[subCategory] as AccumulateEntry[] | undefined;
          if (!entries || !entries[entryIndex]) return profile;

          entries[entryIndex].archived = false;
          entries[entryIndex].updatedAt = Date.now();

          return { ...profile, updatedAt: Date.now() };
        }),
      }));
    },

    // 添加小分类
    addSubCategory: (characterName, category, subCategory) => {
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          if (!profile.categories[category]) return profile;

          const now = Date.now();
          if (!profile.categories[category].subCategories[subCategory]) {
            if (isOverwriteCategory(category)) {
              profile.categories[category].subCategories[subCategory] = {
                value: '',
                chapterRef: '',
                updatedAt: now,
              };
            } else {
              profile.categories[category].subCategories[subCategory] = [];
            }
          }

          return { ...profile, updatedAt: now };
        }),
      }));
    },

    // 删除小分类
    removeSubCategory: (characterName, category, subCategory) => {
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          if (!profile.categories[category]) return profile;

          delete profile.categories[category].subCategories[subCategory];
          return { ...profile, updatedAt: Date.now() };
        }),
      }));
    },

    // 从章节分析更新状态快照
    upsertStateSnapshots: (analysis) => {
      const chapterRef = analysis.chapterTitle || analysis.chapterPath;

      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: analysis.characterStates.reduce((profiles, charState) => {
          return upsertProfile(profiles, charState.characterName, (profile) => {
            const now = Date.now();

            // 更新位置（状态分类）
            if (charState.location) {
              profile.categories['状态'].subCategories['位置'] = {
                value: charState.location,
                chapterRef,
                updatedAt: now,
              };
            }

            // 更新情绪（状态分类）
            if (charState.emotionalState) {
              profile.categories['状态'].subCategories['情绪'] = {
                value: charState.emotionalState,
                chapterRef,
                updatedAt: now,
              };
            }

            // 更新关系
            charState.relationships?.forEach((rel) => {
              const entries = profile.categories['关系'].subCategories[rel.with] as AccumulateEntry[] | undefined;
              if (entries) {
                entries.push({
                  value: rel.status,
                  chapterRef,
                  updatedAt: now,
                  archived: false,
                });
              } else {
                profile.categories['关系'].subCategories[rel.with] = [{
                  value: rel.status,
                  chapterRef,
                  updatedAt: now,
                  archived: false,
                }];
              }
            });

            // 记录变化作为经历
            charState.changes?.forEach((change) => {
              const entries = profile.categories['经历'].subCategories['事件'] as AccumulateEntry[] | undefined;
              if (entries) {
                entries.push({
                  value: change,
                  chapterRef,
                  updatedAt: now,
                  archived: false,
                });
              } else {
                profile.categories['经历'].subCategories['事件'] = [{
                  value: change,
                  chapterRef,
                  updatedAt: now,
                  archived: false,
                }];
              }
            });

            return { ...profile, updatedAt: now, lastChapterRef: chapterRef };
          });
        }, state.profiles),
      }));

      // 为每个更新的角色创建版本记录
      const versionStore = useEntityVersionStore.getState();
      const currentState = useCharacterMemoryStore.getState();
      for (const charState of analysis.characterStates) {
        const profile = currentState.getByName(charState.characterName);
        if (profile) {
          versionStore.createProfileVersion(
            profile,
            'auto',
            `章节分析同步: ${chapterRef}`
          );
        }
      }
    },

    // 从长期记忆添加记忆条目
    upsertMemoryFromLongTerm: (memory, characterName) => {
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          const now = Date.now();
          const entries = profile.categories['记忆'].subCategories['重要信息'] as AccumulateEntry[] | undefined;

          const newEntry: AccumulateEntry = {
            value: memory.summary,
            chapterRef: memory.metadata.sourceRef || '',
            updatedAt: now,
            archived: false,
          };

          if (entries) {
            // 检查是否已存在相同记忆
            const existingIndex = entries.findIndex(
              (e) => e.value === memory.summary || e.chapterRef === memory.id
            );
            if (existingIndex >= 0) {
              entries[existingIndex] = newEntry;
            } else {
              entries.push(newEntry);
            }
          } else {
            profile.categories['记忆'].subCategories['重要信息'] = [newEntry];
          }

          return { ...profile, updatedAt: now };
        }),
      }));
    },

    // 移除记忆引用
    removeMemoryRef: (memoryId, characterName) => {
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          const entries = profile.categories['记忆'].subCategories['重要信息'] as AccumulateEntry[] | undefined;
          if (entries) {
            const index = entries.findIndex((e) => e.chapterRef === memoryId);
            if (index >= 0) {
              entries.splice(index, 1);
            }
          }
          return { ...profile, updatedAt: Date.now() };
        }),
      }));
    },

    // 从版本恢复角色档案
    restoreProfileFromVersion: (versionId: string) => {
      const versionStore = useEntityVersionStore.getState();
      const snapshot = versionStore.restoreProfileVersion(versionId);
      if (!snapshot) return false;

      // 创建当前状态的备份版本
      const currentProfile = useCharacterMemoryStore.getState().getByName(snapshot.characterName);
      if (currentProfile) {
        versionStore.createProfileVersion(
          currentProfile,
          'manual',
          `恢复前备份 (恢复到 ${new Date(snapshot.updatedAt).toLocaleString()})`
        );
      }

      // 应用快照
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: state.profiles.map((p: CharacterProfileV2) =>
          p.characterId === snapshot.characterId ? { ...snapshot, updatedAt: Date.now() } : p
        ),
      }));

      console.log(`[CharacterMemoryStore] 已恢复角色档案版本: ${snapshot.characterName}`);
      return true;
    },

    _syncToFiles: async () => {
      await saveProfilesToFiles(useCharacterMemoryStore.getState().profiles);
    },
  },
  async (state: CharacterMemoryState) => {
    await saveProfilesToFiles(state.profiles);
  },
  0
);
