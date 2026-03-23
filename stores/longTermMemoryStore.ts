import { ChatMessage, FileNode, FileType, LongTermMemory, LongTermMemoryDraft, MemoryType } from '../types';
import { createPersistingStore } from './createPersistingStore';
import { dbAPI } from '../services/persistence';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';
import { useAgentStore } from './agentStore';
import { AIService } from '../services/geminiService';
import { useCharacterMemoryStore } from './characterMemoryStore';
import {
  applyMemoryEvent,
  createMemoryMetadata,
  normalizeMemory,
  scoreMemoryRecall,
  sortMemoriesForPrompt,
  sortMemoriesForReview,
} from '../utils/memoryIntelligence';
import {
  ConversationMemoryOutput,
  MemoryCandidateAction,
  runConversationMemoryAgent,
} from '../services/subAgents/conversationMemoryAgent';
import { DocumentMemoryOutput, runDocumentMemoryAgent } from '../services/subAgents/documentMemoryAgent';

interface LongTermMemoryState {
  memories: LongTermMemory[];
  currentProjectId: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  isRefreshing: boolean;
  isExtracting: boolean;
  extractionError: string | null;

  loadMemories: (projectId?: string) => Promise<void>;
  loadProjectMemories: (projectId: string) => Promise<void>;
  ensureInitialized: (projectId?: string) => Promise<void>;
  refreshMemories: () => Promise<void>;
  setMemories: (memories: LongTermMemory[]) => void;
  addMemory: (memory: LongTermMemoryDraft) => void;
  updateMemory: (id: string, updates: Partial<LongTermMemory>) => void;
  deleteMemory: (id: string) => void;
  touchMemories: (ids: string[], event?: 'recall' | 'reinforce') => void;
  triggerConversationExtraction: (
    userMessage: ChatMessage,
    recentMessages: ChatMessage[]
  ) => Promise<{ added: number; updated: number; skipped: number; summary: string } | null>;
  triggerDocumentExtraction: (
    filePath: string,
    content: string
  ) => Promise<{ added: number; updated: number; skipped: number; summary: string } | null>;

  getById: (id: string) => LongTermMemory | undefined;
  getByType: (type: MemoryType) => LongTermMemory[];
  getByTag: (tag: string) => LongTermMemory[];
  searchByKeyword: (keyword: string) => LongTermMemory[];
  getByImportance: (importance: 'critical' | 'important') => LongTermMemory[];
  getRelated: (id: string) => LongTermMemory[];
  getResident: () => LongTermMemory[];
  getReviewQueue: (limit?: number) => LongTermMemory[];

  _syncToJsonFile: () => Promise<void>;
}

const generateId = () => `memory-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
const documentExtractionSignatureCache = new Map<string, string>();
const MEMORY_FILE_NAME = '闀挎湡璁板繂.json';
const MEMORY_INFO_FOLDER_NAME = '00_鍩虹淇℃伅';

const normalizeMemories = (memories: LongTermMemory[], now = Date.now()) =>
  memories.map((memory) => normalizeMemory(memory, now));

const dedupeStrings = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const mergeMemoryDraft = (
  existing: LongTermMemory,
  incoming: LongTermMemoryDraft,
  sourceRef: string,
  evidence: string[]
): Partial<LongTermMemory> => ({
  ...incoming,
  tags: dedupeStrings([...(existing.tags || []), ...(incoming.tags || [])]),
  keywords: dedupeStrings([...(existing.keywords || []), ...(incoming.keywords || [])]),
  relatedMemories: dedupeStrings([
    ...(existing.relatedMemories || []),
    ...(incoming.relatedMemories || []),
  ]),
  summary: incoming.summary || existing.summary,
  content: incoming.content || existing.content,
  importance: incoming.importance || existing.importance,
  isResident: incoming.isResident ?? existing.isResident,
  metadata: {
    ...existing.metadata,
    sourceKind: incoming.metadata?.sourceKind || existing.metadata.sourceKind || 'dialogue',
    sourceRef,
    evidence: dedupeStrings([...(existing.metadata.evidence || []), ...evidence]),
  },
});

const findMemoryByName = (memories: LongTermMemory[], name: string) => {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return memories.find((memory) => memory.name.trim().toLowerCase() === normalized);
};

export const isDocumentMemorySourcePath = (filePath: string) => {
  const eligiblePrefixes = ['00_', '01_', '02_', '03_'];
  const eligibleExtension = /\.(md|txt)$/i.test(filePath);
  const excludedNames = ['长期记忆.json', '章节分析.json', 'outline.json'];

  return (
    eligiblePrefixes.some((prefix) => filePath.startsWith(prefix)) &&
    eligibleExtension &&
    !excludedNames.some((name) => filePath.endsWith(name))
  );
};

const buildDocumentEvidence = (content: string) =>
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

const createDocumentSignature = (content: string) => {
  const normalized = content.trim();
  return `${normalized.length}:${normalized.slice(0, 180)}:${normalized.slice(-180)}`;
};

const shouldSkipLongTermMemoryDraft = (memory: LongTermMemoryDraft) => {
  // Long-term memory is now project-level only. Character-specific knowledge
  // should live in character archives/profiles instead of the shared memory pool.
  return memory.type === 'character_rule';
};

const resolveActiveProjectId = () =>
  useProjectStore.getState().currentProjectId || useFileStore.getState().currentProjectId || null;

const buildDocumentExtractionCacheKey = (projectId: string, filePath: string) => `${projectId}::${filePath}`;

const upsertMemoryFile = (files: FileNode[], memories: LongTermMemory[]) => {
  const nextFiles = files.map((file) => ({ ...file }));
  let memoryFile = nextFiles.find((file) => file.name === MEMORY_FILE_NAME);

  if (!memoryFile) {
    const infoFolder = nextFiles.find((file) => file.name === MEMORY_INFO_FOLDER_NAME && file.parentId === 'root');
    if (!infoFolder) return nextFiles;

    memoryFile = {
      id: `memory-file-${Date.now()}`,
      parentId: infoFolder.id,
      name: MEMORY_FILE_NAME,
      type: FileType.FILE,
      content: JSON.stringify(memories, null, 2),
      lastModified: Date.now(),
    };
    nextFiles.push(memoryFile);
    return nextFiles;
  }

  memoryFile.content = JSON.stringify(memories, null, 2);
  memoryFile.lastModified = Date.now();
  return nextFiles;
};

export const extractCharacterNameFromMemory = (memory: Pick<LongTermMemory, 'type' | 'tags' | 'keywords' | 'name'>) => {
  if (memory.type !== 'character_rule') return null;

  const tagged = memory.tags.find((tag) => tag.startsWith('角色:') || tag.startsWith('character:'));
  if (tagged) return tagged.split(':').slice(1).join(':').trim() || null;

  const keywordTagged = memory.keywords.find((keyword) => keyword.startsWith('角色:'));
  if (keywordTagged) return keywordTagged.split(':').slice(1).join(':').trim() || null;

  const nameMatch = memory.name.match(/[\u4e00-\u9fa5A-Za-z0-9_·]{2,}/);
  return nameMatch ? nameMatch[0] : null;
};

const applyMemoryExtractionResult = (
  result: ConversationMemoryOutput | DocumentMemoryOutput,
  options: {
    sourceKind: 'dialogue' | 'document';
    sourceRef: string;
    evidence: string[];
  }
) => {
  const store = useLongTermMemoryStore.getState();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  const appliedIds: string[] = [];

  result.actions.forEach((action: MemoryCandidateAction) => {
    if (action.action === 'skip' || !action.memory || action.confidence < 0.55) {
      skipped += 1;
      return;
    }

    if (shouldSkipLongTermMemoryDraft(action.memory)) {
      skipped += 1;
      return;
    }

    const memoryId =
      action.memoryId || findMemoryByName(useLongTermMemoryStore.getState().memories, action.memory.name)?.id;

    if (action.action === 'update' && memoryId) {
      const existing = useLongTermMemoryStore.getState().getById(memoryId);
      if (!existing) {
        skipped += 1;
        return;
      }

      store.updateMemory(
        memoryId,
        mergeMemoryDraft(existing, action.memory, options.sourceRef, options.evidence)
      );
      store.touchMemories([memoryId], 'reinforce');
      updated += 1;
      appliedIds.push(memoryId);
      return;
    }

    if (memoryId) {
      const existing = useLongTermMemoryStore.getState().getById(memoryId);
      if (!existing) {
        skipped += 1;
        return;
      }

      store.updateMemory(
        memoryId,
        mergeMemoryDraft(existing, action.memory, options.sourceRef, options.evidence)
      );
      store.touchMemories([memoryId], 'reinforce');
      updated += 1;
      appliedIds.push(memoryId);
      return;
    }

    store.addMemory({
      ...action.memory,
      metadata: {
        source: 'agent',
        sourceKind: options.sourceKind,
        sourceRef: options.sourceRef,
        evidence: options.evidence,
      },
    });
    added += 1;
  });

  return {
    added,
    updated,
    skipped,
    appliedIds,
  };
};

const legacySaveMemoriesToJson = async (memories: LongTermMemory[], _projectId?: string | null) => {
  const fileStore = useFileStore.getState();
  let memoryFile = fileStore.files.find((file) => file.name === '长期记忆.json');

  if (!memoryFile) {
    const infoFolder = fileStore.files.find((file) => file.name === '00_基础信息' && file.parentId === 'root');
    if (infoFolder) {
      memoryFile = {
        id: `memory-file-${Date.now()}`,
        parentId: infoFolder.id,
        name: '长期记忆.json',
        type: FileType.FILE,
        content: JSON.stringify(memories, null, 2),
        lastModified: Date.now(),
      };
      fileStore.files.push(memoryFile);
    }
  } else {
    memoryFile.content = JSON.stringify(memories, null, 2);
    memoryFile.lastModified = Date.now();
  }

  const activeProjectId = useProjectStore.getState().currentProjectId;
  if (activeProjectId) {
    await dbAPI.saveFiles(activeProjectId, [...fileStore.files]);
  }
};

const saveMemoriesToJson = async (memories: LongTermMemory[], projectId?: string | null) => {
  void legacySaveMemoriesToJson;

  const targetProjectId = projectId ?? useLongTermMemoryStore.getState().currentProjectId ?? resolveActiveProjectId();
  if (!targetProjectId) return;

  const fileStore = useFileStore.getState();
  const sourceFiles =
    fileStore.currentProjectId === targetProjectId
      ? fileStore.files
      : (await Promise.resolve(dbAPI.getFiles(targetProjectId)).catch(() => [])) || [];

  const nextFiles = upsertMemoryFile(sourceFiles, memories);

  if (fileStore.currentProjectId === targetProjectId) {
    useFileStore.setState({ files: nextFiles });
  }

  await dbAPI.saveFiles(targetProjectId, nextFiles);
};

const loadMemoriesForProject = async (projectId: string) => {
  useLongTermMemoryStore.setState({
    isLoading: true,
    currentProjectId: projectId,
  });

  try {
    const fileStore = useFileStore.getState();
    const files =
      fileStore.currentProjectId === projectId
        ? fileStore.files
        : (await Promise.resolve(dbAPI.getFiles(projectId)).catch(() => [])) || [];
    const memoryFile = files.find((file) => file.name === MEMORY_FILE_NAME);

    if (memoryFile?.content) {
      const rawMemories = JSON.parse(memoryFile.content);

      if (Array.isArray(rawMemories)) {
        if (useLongTermMemoryStore.getState().currentProjectId !== projectId) return;
        useLongTermMemoryStore.setState({
          memories: normalizeMemories(rawMemories as LongTermMemory[]),
          currentProjectId: projectId,
          isInitialized: true,
          isLoading: false,
        });
        return;
      }
    }

    if (useLongTermMemoryStore.getState().currentProjectId !== projectId) return;
    useLongTermMemoryStore.setState({
      memories: [],
      currentProjectId: projectId,
      isInitialized: true,
      isLoading: false,
    });
  } catch (error) {
    console.error('[LongTermMemoryStore] Failed to load memories', error);
    if (useLongTermMemoryStore.getState().currentProjectId !== projectId) return;
    useLongTermMemoryStore.setState({
      memories: [],
      currentProjectId: projectId,
      isInitialized: true,
      isLoading: false,
    });
  }
};

export const useLongTermMemoryStore = createPersistingStore<LongTermMemoryState>(
  'longTermMemoryStore',
  {
    memories: [],
    currentProjectId: null,
    isLoading: false,
    isInitialized: false,
    isRefreshing: false,
    isExtracting: false,
    extractionError: null,

    loadProjectMemories: async (projectId) => {
      const state = useLongTermMemoryStore.getState();
      if (state.currentProjectId !== projectId) {
        useLongTermMemoryStore.setState({
          currentProjectId: projectId,
          memories: [],
          isInitialized: false,
          isLoading: true,
          extractionError: null,
        });
      }

      await useLongTermMemoryStore.getState().loadMemories(projectId);
    },

    ensureInitialized: async (projectId) => {
      const activeProjectId = projectId ?? resolveActiveProjectId();
      const state = useLongTermMemoryStore.getState();
      if (!activeProjectId) {
        if (state.currentProjectId !== null || state.memories.length > 0 || !state.isInitialized) {
          useLongTermMemoryStore.setState({
            memories: [],
            currentProjectId: null,
            isInitialized: true,
            isLoading: false,
          });
        }
        return;
      }

      if (!state.isInitialized || state.currentProjectId !== activeProjectId) {
        await state.loadProjectMemories(activeProjectId);
      }
    },

    refreshMemories: async () => {
      const state = useLongTermMemoryStore.getState();
      if (state.isRefreshing) return;

      useLongTermMemoryStore.setState({ isRefreshing: true });
      try {
        await state.loadMemories(state.currentProjectId ?? resolveActiveProjectId() ?? undefined);
      } finally {
        useLongTermMemoryStore.setState({ isRefreshing: false });
      }
    },

    loadMemories: async (projectId) => {
      const targetProjectId = projectId ?? useLongTermMemoryStore.getState().currentProjectId ?? resolveActiveProjectId();

      if (!targetProjectId) {
        useLongTermMemoryStore.setState({
          memories: [],
          currentProjectId: null,
          isInitialized: true,
          isLoading: false,
        });
        return;
      }

      await loadMemoriesForProject(targetProjectId);
      return;

      useLongTermMemoryStore.setState({
        isLoading: true,
        currentProjectId: targetProjectId,
      });

      try {
        const fileStore = useFileStore.getState();
        const memoryFile = fileStore.files.find((file) => file.name === '长期记忆.json');

        if (memoryFile?.content) {
          const rawMemories = JSON.parse(memoryFile.content);

          if (Array.isArray(rawMemories)) {
            useLongTermMemoryStore.setState({
              memories: normalizeMemories(rawMemories as LongTermMemory[]),
              isInitialized: true,
              isLoading: false,
            });
            return;
          }
        }

        useLongTermMemoryStore.setState({
          memories: [],
          isInitialized: true,
          isLoading: false,
        });
      } catch (error) {
        console.error('[LongTermMemoryStore] Failed to load memories', error);
        useLongTermMemoryStore.setState({
          memories: [],
          isInitialized: true,
          isLoading: false,
        });
      }
    },

    setMemories: (memories) => {
      useLongTermMemoryStore.setState({ memories: normalizeMemories(memories) });
    },

    _syncToJsonFile: async () => {
      const state = useLongTermMemoryStore.getState();
      await saveMemoriesToJson(state.memories, state.currentProjectId);
    },

    addMemory: (memory) => {
      const now = Date.now();
      const source = memory.metadata?.source ?? 'agent';

      const nextMemory = normalizeMemory(
        {
          ...memory,
          id: generateId(),
          metadata: {
            ...createMemoryMetadata(
              memory.importance,
              memory.isResident,
              source,
              {
                sourceKind: memory.metadata?.sourceKind,
                sourceRef: memory.metadata?.sourceRef,
                evidence: memory.metadata?.evidence,
              },
              now
            ),
            ...memory.metadata,
            updatedAt: now,
          },
        } as LongTermMemory,
        now
      );

      useLongTermMemoryStore.setState((state) => ({
        memories: [...state.memories, nextMemory],
      }));

      const characterName = extractCharacterNameFromMemory(nextMemory);
      if (characterName) {
        useCharacterMemoryStore.getState().upsertMemoryFromLongTerm(nextMemory, characterName);
      }
    },

    updateMemory: (id, updates) => {
      const now = Date.now();

      let updatedMemory: LongTermMemory | null = null;
      useLongTermMemoryStore.setState((state) => ({
        memories: state.memories.map((memory) => {
          if (memory.id !== id) return memory;

          updatedMemory = normalizeMemory(
            {
              ...memory,
              ...updates,
              metadata: {
                ...memory.metadata,
                ...updates.metadata,
                updatedAt: now,
              },
            },
            now
          );
          return updatedMemory;
        }),
      }));

      if (updatedMemory) {
        const characterName = extractCharacterNameFromMemory(updatedMemory);
        if (characterName) {
          useCharacterMemoryStore.getState().upsertMemoryFromLongTerm(updatedMemory, characterName);
        }
      }
    },

    deleteMemory: (id) => {
      const existing = useLongTermMemoryStore.getState().getById(id);
      useLongTermMemoryStore.setState((state) => ({
        memories: state.memories.filter((memory) => memory.id !== id),
      }));

      if (existing) {
        const characterName = extractCharacterNameFromMemory(existing);
        if (characterName) {
          useCharacterMemoryStore.getState().removeMemoryRef(id, characterName);
        }
      }
    },

    touchMemories: (ids, event = 'recall') => {
      if (ids.length === 0) return;

      const idSet = new Set(ids);
      const now = Date.now();

      useLongTermMemoryStore.setState((state) => ({
        memories: state.memories.map((memory) =>
          idSet.has(memory.id) ? applyMemoryEvent(memory, event, now) : memory
        ),
      }));
    },

    triggerConversationExtraction: async (userMessage, recentMessages) => {
      const state = useLongTermMemoryStore.getState();
      if (state.isExtracting) return null;
      const projectId = state.currentProjectId ?? resolveActiveProjectId();
      if (!projectId) return null;

      try {
        useLongTermMemoryStore.setState({ isExtracting: true, extractionError: null });

        const agentStore = useAgentStore.getState();
        const aiConfig = agentStore.aiConfig;
        const lightConfig = {
          ...aiConfig,
          modelName: aiConfig.lightweightModelName || aiConfig.modelName,
        };
        const aiService = new AIService(lightConfig);

        const result = await runConversationMemoryAgent(
          aiService,
          {
            userMessage,
            recentMessages,
            existingMemories: state.memories.map((memory) => ({
              id: memory.id,
              name: memory.name,
              type: memory.type,
              tags: memory.tags,
              keywords: memory.keywords,
              summary: memory.summary,
              importance: memory.importance,
              isResident: memory.isResident,
            })),
          },
          (msg) => console.log(`[ConversationMemory] ${msg}`)
        );

        if (!result.shouldExtract || result.actions.length === 0) {
          return {
            added: 0,
            updated: 0,
            skipped: result.actions.length,
            summary: result.summary,
          };
        }

        if (useLongTermMemoryStore.getState().currentProjectId !== projectId) {
          console.warn('[LongTermMemoryStore] Discarded conversation extraction after project switch', projectId);
          return null;
        }

        const applied = applyMemoryExtractionResult(result, {
          sourceKind: 'dialogue',
          sourceRef: userMessage.id,
          evidence: [userMessage.text],
        });

        return {
          added: applied.added,
          updated: applied.updated,
          skipped: applied.skipped,
          summary: result.summary,
        };
      } catch (error: any) {
        console.error('[LongTermMemoryStore] Conversation extraction failed', error);
        useLongTermMemoryStore.setState({ extractionError: error?.message || '对话记忆抽取失败' });
        return null;
      } finally {
        useLongTermMemoryStore.setState({ isExtracting: false });
      }
    },

    triggerDocumentExtraction: async (filePath, content) => {
      const state = useLongTermMemoryStore.getState();
      if (state.isExtracting || !isDocumentMemorySourcePath(filePath) || !content.trim()) return null;
      const projectId = state.currentProjectId ?? resolveActiveProjectId();
      if (!projectId) return null;

      const signature = createDocumentSignature(content);
      const cacheKey = buildDocumentExtractionCacheKey(projectId, filePath);
      if (documentExtractionSignatureCache.get(cacheKey) === signature) return null;

      try {
        useLongTermMemoryStore.setState({ isExtracting: true, extractionError: null });

        const agentStore = useAgentStore.getState();
        const aiConfig = agentStore.aiConfig;
        const lightConfig = {
          ...aiConfig,
          modelName: aiConfig.lightweightModelName || aiConfig.modelName,
        };
        const aiService = new AIService(lightConfig);

        const result = await runDocumentMemoryAgent(
          aiService,
          {
            filePath,
            content,
            existingMemories: state.memories.map((memory) => ({
              id: memory.id,
              name: memory.name,
              type: memory.type,
              tags: memory.tags,
              keywords: memory.keywords,
              summary: memory.summary,
              importance: memory.importance,
              isResident: memory.isResident,
            })),
          },
          (msg) => console.log(`[DocumentMemory] ${msg}`)
        );

        if (!result.shouldExtract || result.actions.length === 0) {
          return {
            added: 0,
            updated: 0,
            skipped: result.actions.length,
            summary: result.summary,
          };
        }

        if (useLongTermMemoryStore.getState().currentProjectId !== projectId) {
          console.warn('[LongTermMemoryStore] Discarded document extraction after project switch', projectId, filePath);
          return null;
        }

        const applied = applyMemoryExtractionResult(result, {
          sourceKind: 'document',
          sourceRef: filePath,
          evidence: buildDocumentEvidence(content),
        });

        documentExtractionSignatureCache.set(cacheKey, signature);

        return {
          added: applied.added,
          updated: applied.updated,
          skipped: applied.skipped,
          summary: result.summary,
        };
      } catch (error: any) {
        console.error('[LongTermMemoryStore] Document extraction failed', error);
        useLongTermMemoryStore.setState({ extractionError: error?.message || '文档记忆抽取失败' });
        return null;
      } finally {
        useLongTermMemoryStore.setState({ isExtracting: false });
      }
    },

    getById: (id) => useLongTermMemoryStore.getState().memories.find((memory) => memory.id === id),

    getByType: (type) => useLongTermMemoryStore.getState().memories.filter((memory) => memory.type === type),

    getByTag: (tag) => useLongTermMemoryStore.getState().memories.filter((memory) => memory.tags.includes(tag)),

    searchByKeyword: (keyword) => {
      const now = Date.now();

      return [...useLongTermMemoryStore.getState().memories]
        .filter((memory) => scoreMemoryRecall(memory, keyword, now).lexical > 0)
        .sort((left, right) => scoreMemoryRecall(right, keyword, now).total - scoreMemoryRecall(left, keyword, now).total);
    },

    getByImportance: (importance) =>
      useLongTermMemoryStore.getState().memories.filter((memory) => memory.importance === importance),

    getRelated: (id) => {
      const state = useLongTermMemoryStore.getState();
      const memory = state.memories.find((item) => item.id === id);
      if (!memory) return [];

      const relatedIds = new Set(memory.relatedMemories);
      return state.memories.filter((item) => relatedIds.has(item.id));
    },

    getResident: () => sortMemoriesForPrompt(useLongTermMemoryStore.getState().memories.filter((memory) => memory.isResident)),

    getReviewQueue: (limit = 6) =>
      sortMemoriesForReview(
        useLongTermMemoryStore
          .getState()
          .memories.filter((memory) => memory.metadata.nextReviewAt <= Date.now() || memory.metadata.reviewCount === 0)
      ).slice(0, limit),
  },
  async (state) => {
    if (!state.isInitialized || !state.currentProjectId) return;
    await saveMemoriesToJson(state.memories, state.currentProjectId);
  },
  0
);
