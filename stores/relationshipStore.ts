import { CharacterRelation, RelationType, RelationStrength } from '../types';
import { createPersistingStore } from './createPersistingStore';
import type { UseBoundStore, StoreApi } from 'zustand';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';
import { dbAPI } from '../services/persistence';
import { FileType } from '../types';
import Fuse from 'fuse.js';

const generateId = (): string => Math.random().toString(36).substring(2, 9);

export interface RelationshipState {
  relations: CharacterRelation[];
  customRelationTypes: string[];
  isLoaded: boolean;

  // 加载
  loadRelations: () => Promise<void>;

  // CRUD
  addRelation: (r: Omit<CharacterRelation, 'id' | 'createdAt' | 'updatedAt'>) => CharacterRelation;
  addRelationsBatch: (rs: Array<Omit<CharacterRelation, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  updateRelation: (id: string, updates: Partial<CharacterRelation>) => void;
  deleteRelation: (id: string) => void;
  deleteRelationsBatch: (ids: string[]) => void;
  deleteAllForCharacter: (characterName: string) => void;

  // 查询
  getRelationsForCharacter: (name: string) => CharacterRelation[];
  getRelationsBetween: (nameA: string, nameB: string) => CharacterRelation[];
  getRelationsByType: (type: RelationType) => CharacterRelation[];
  getAllCharacterNames: () => string[];
  searchRelations: (query: string) => CharacterRelation[];

  // 自定义关系类型
  addCustomRelationType: (type: string) => void;
  removeCustomRelationType: (type: string) => void;

  // 持久化
  _syncToFiles: () => Promise<void>;
}

const RELATION_FILE_NAME = '人际关系.json';
const INFO_FOLDER_NAME = '00_基础信息';

const ensureInfoFolder = () => {
  const fileStore = useFileStore.getState();
  const folder = fileStore.files.find(
    f => f.name === INFO_FOLDER_NAME && f.type === FileType.FOLDER && f.parentId === 'root'
  );
  return folder;
};

const persistToFiles = async (relations: CharacterRelation[], customTypes: string[]) => {
  const fileStore = useFileStore.getState();
  const projectId = useProjectStore.getState().currentProjectId;
  if (!projectId) return;

  const folder = ensureInfoFolder();
  if (!folder) return;

  const existing = fileStore.files.find(
    f => f.name === RELATION_FILE_NAME && f.parentId === folder.id && f.type === FileType.FILE
  );

  const content = JSON.stringify({ relations, customRelationTypes: customTypes }, null, 2);

  if (existing) {
    fileStore.saveFileContent(existing.id, content);
  } else {
    fileStore.createFileById(folder.id, RELATION_FILE_NAME);
    const newFile = fileStore.files.find(
      f => f.name === RELATION_FILE_NAME && f.parentId === folder.id && f.type === FileType.FILE
    );
    if (newFile) fileStore.saveFileContent(newFile.id, content);
  }

  await dbAPI.saveFiles(projectId, fileStore.files);
};

const loadFromFiles = async (): Promise<{ relations: CharacterRelation[]; customTypes: string[] } | null> => {
  const fileStore = useFileStore.getState();
  const folder = ensureInfoFolder();
  if (!folder) return null;

  const file = fileStore.files.find(
    f => f.name === RELATION_FILE_NAME && f.parentId === folder.id && f.type === FileType.FILE
  );
  if (!file) return null;

  try {
    const content = file.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      relations: parsed.relations || [],
      customTypes: parsed.customRelationTypes || [],
    };
  } catch {
    return null;
  }
};

export const useRelationshipStore: UseBoundStore<StoreApi<RelationshipState>> = createPersistingStore<RelationshipState>(
  'relationshipStore',
  {
    relations: [],
    customRelationTypes: [],
    isLoaded: false,

    loadRelations: async () => {
      // 先加载，再原子替换——避免中间状态的空数据被 saver 写入
      const data = await loadFromFiles();
      if (data) {
        useRelationshipStore.setState({
          relations: data.relations,
          customRelationTypes: data.customTypes,
          isLoaded: true,
        });
      } else {
        useRelationshipStore.setState({ isLoaded: true });
      }
      (useRelationshipStore as any)._markLoaded?.();
    },

    addRelation: (r) => {
      const now = Date.now();
      const relation: CharacterRelation = {
        ...r,
        id: `rel-${generateId()}`,
        createdAt: now,
        updatedAt: now,
      };
      useRelationshipStore.setState((state) => ({
        relations: [...state.relations, relation],
      }));
      return relation;
    },

    addRelationsBatch: (rs) => {
      const now = Date.now();
      const newRelations = rs.map(r => ({
        ...r,
        id: `rel-${generateId()}`,
        createdAt: now,
        updatedAt: now,
      }));
      useRelationshipStore.setState((state) => ({
        relations: [...state.relations, ...newRelations],
      }));
    },

    updateRelation: (id, updates) => {
      useRelationshipStore.setState((state) => ({
        relations: state.relations.map(r =>
          r.id === id ? { ...r, ...updates, updatedAt: Date.now() } : r
        ),
      }));
    },

    deleteRelation: (id) => {
      useRelationshipStore.setState((state) => ({
        relations: state.relations.filter(r => r.id !== id),
      }));
    },

    deleteRelationsBatch: (ids) => {
      const idSet = new Set(ids);
      useRelationshipStore.setState((state) => ({
        relations: state.relations.filter(r => !idSet.has(r.id)),
      }));
    },

    deleteAllForCharacter: (characterName) => {
      const name = characterName.trim().toLowerCase();
      useRelationshipStore.setState((state) => ({
        relations: state.relations.filter(
          r => r.from.trim().toLowerCase() !== name && r.to.trim().toLowerCase() !== name
        ),
      }));
    },

    getRelationsForCharacter: (name) => {
      const n = name.trim().toLowerCase();
      return useRelationshipStore.getState().relations.filter(
        r => r.from.trim().toLowerCase() === n || r.to.trim().toLowerCase() === n
      );
    },

    getRelationsBetween: (nameA, nameB) => {
      const a = nameA.trim().toLowerCase();
      const b = nameB.trim().toLowerCase();
      return useRelationshipStore.getState().relations.filter(r => {
        const from = r.from.trim().toLowerCase();
        const to = r.to.trim().toLowerCase();
        return (from === a && to === b) || (from === b && to === a);
      });
    },

    getRelationsByType: (type) => {
      return useRelationshipStore.getState().relations.filter(r => r.type === type);
    },

    getAllCharacterNames: () => {
      const names = new Set<string>();
      useRelationshipStore.getState().relations.forEach(r => {
        names.add(r.from);
        names.add(r.to);
      });
      return [...names];
    },

    searchRelations: (query) => {
      if (!query.trim()) return useRelationshipStore.getState().relations;

      const fuse = new Fuse(useRelationshipStore.getState().relations, {
        keys: [
          { name: 'from', weight: 0.3 },
          { name: 'to', weight: 0.3 },
          { name: 'type', weight: 0.2 },
          { name: 'description', weight: 0.2 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      });

      return fuse.search(query).map(result => result.item);
    },

    addCustomRelationType: (type) => {
      const t = type.trim();
      if (!t) return;
      useRelationshipStore.setState((state) => {
        if (state.customRelationTypes.includes(t)) return state;
        return { customRelationTypes: [...state.customRelationTypes, t] };
      });
    },

    removeCustomRelationType: (type) => {
      useRelationshipStore.setState((state) => ({
        customRelationTypes: state.customRelationTypes.filter(t => t !== type),
      }));
    },

    _syncToFiles: async () => {
      const { relations, customRelationTypes } = useRelationshipStore.getState();
      await persistToFiles(relations, customRelationTypes);
    },
  },
  async (state) => {
    await persistToFiles(state.relations, state.customRelationTypes);
  }
);
