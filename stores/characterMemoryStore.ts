import {
  CharacterGoal,
  CharacterMemoryEntry,
  CharacterProfile,
  CharacterRelationship,
  CharacterStateSnapshot,
  ChapterAnalysis,
  FileType,
  LongTermMemory,
} from '../types';
import { createPersistingStore } from './createPersistingStore';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';
import { dbAPI } from '../services/persistence';

interface CharacterMemoryState {
  profiles: CharacterProfile[];
  isInitialized: boolean;
  loadProfiles: () => Promise<void>;
  loadProjectProfiles: (projectId: string) => Promise<void>;
  getByName: (characterName: string) => CharacterProfile | undefined;
  upsertStateSnapshots: (analysis: ChapterAnalysis) => void;
  upsertMemoryFromLongTerm: (memory: LongTermMemory, characterName: string) => void;
  removeMemoryRef: (memoryId: string, characterName: string) => void;
  _syncToFiles: () => Promise<void>;
}

const CHARACTER_ROOT_FOLDER = '\u0030\u0032_\u89d2\u8272\u6863\u6848';
const PROFILE_FOLDER = '\u89d2\u8272\u72b6\u6001\u4e0e\u8bb0\u5fc6';

const GOAL_HINT_REGEX = /目标|想要|希望|计划|决定|打算|准备|试图|必须|立志|誓要|追查|寻找|保护|复仇|夺回|阻止|查明|完成|赢得|逃离|拯救|成为|守住|调查/;
const HIGH_PRIORITY_REGEX = /必须|誓要|立志|绝不|一定|务必/;
const BLOCKED_GOAL_REGEX = /受阻|失败|无法|未能|卡住|被迫|中断/;
const COMPLETED_GOAL_REGEX = /完成|成功|达成|实现|解决|做到/;

const normalizeName = (name: string) => name.trim().toLowerCase();
const makeProfileId = (characterName: string) =>
  `character-${normalizeName(characterName).replace(/[^\w\u4e00-\u9fa5]+/g, '-')}`;
const makeStableId = (prefix: string, value: string) =>
  `${prefix}-${normalizeName(value).replace(/[^\w\u4e00-\u9fa5]+/g, '-') || 'item'}`;

const uniqueStrings = (values: string[]) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((item) => normalizeName(item) === normalizeName(value)) === index);

const parseTagValue = (tag: string, prefixes: string[]) => {
  const matchedPrefix = prefixes.find((prefix) => tag.startsWith(prefix));
  if (!matchedPrefix) return undefined;
  return tag.slice(matchedPrefix.length).trim();
};

const inferGoalPriority = (description: string): CharacterGoal['priority'] => {
  if (HIGH_PRIORITY_REGEX.test(description)) return 'high';
  if (/计划|决定|准备|追查|保护|调查|寻找/.test(description)) return 'medium';
  return 'low';
};

const inferGoalStatus = (description: string): CharacterGoal['status'] => {
  if (COMPLETED_GOAL_REGEX.test(description)) return 'completed';
  if (BLOCKED_GOAL_REGEX.test(description)) return 'blocked';
  if (/也许|可能|似乎|隐约/.test(description)) return 'latent';
  return 'active';
};

const makeGoal = (
  description: string,
  source: CharacterGoal['source'],
  updatedAt: number,
  evidence?: string
): CharacterGoal => ({
  id: makeStableId('goal', description),
  description: description.trim(),
  priority: inferGoalPriority(description),
  status: inferGoalStatus(description),
  source,
  evidence,
  updatedAt,
});

const extractTraitsFromMemory = (memory: CharacterMemoryEntry) =>
  uniqueStrings(
    memory.tags.flatMap((tag) => {
      const value = parseTagValue(tag, ['特质:', '人设:', '性格:', '标签:']);
      return value ? value.split(/[、,，/]/).map((item) => item.trim()) : [];
    })
  );

const extractAgencyNotesFromMemory = (memory: CharacterMemoryEntry) =>
  uniqueStrings(
    [
      ...memory.tags.flatMap((tag) => {
        const value = parseTagValue(tag, ['动机:', '驱动:', '原则:', '执念:']);
        return value ? [value] : [];
      }),
      ...memory.keywords.filter((keyword) => /目标|原则|底线|执念|动机/.test(keyword)),
    ]
  );

const extractGoalsFromState = (snapshot?: CharacterStateSnapshot) => {
  if (!snapshot) return [] as CharacterGoal[];

  return snapshot.changes
    .filter((change) => GOAL_HINT_REGEX.test(change))
    .map((change) => makeGoal(change, 'state', snapshot.extractedAt, `${snapshot.chapterTitle}: ${change}`));
};

const extractGoalsFromMemory = (memory: CharacterMemoryEntry) => {
  const fromTags = memory.tags.flatMap((tag) => {
    const value = parseTagValue(tag, ['目标:', '追求:', '执念:']);
    return value ? [makeGoal(value, 'memory', memory.updatedAt, memory.summary)] : [];
  });

  const fromSummary = GOAL_HINT_REGEX.test(memory.summary)
    ? [makeGoal(memory.summary, 'memory', memory.updatedAt, memory.summary)]
    : [];

  return [...fromTags, ...fromSummary];
};

const extractRelationshipsFromStateHistory = (history: CharacterStateSnapshot[]) => {
  const relationshipMap = new Map<string, CharacterRelationship>();

  [...history]
    .sort((left, right) => left.extractedAt - right.extractedAt)
    .forEach((snapshot) => {
      snapshot.relationships?.forEach((relationship) => {
        const key = normalizeName(relationship.with);
        relationshipMap.set(key, {
          characterName: relationship.with,
          status: relationship.status,
          summary: `${snapshot.chapterTitle}: ${relationship.status}`,
          confidence: 'high',
          source: 'state',
          updatedAt: snapshot.extractedAt,
        });
      });
    });

  return Array.from(relationshipMap.values());
};

const extractRelationshipsFromMemory = (memory: CharacterMemoryEntry) =>
  memory.tags.flatMap((tag) => {
    const value = parseTagValue(tag, ['关系:']);
    if (!value) return [];

    const [characterName, status = memory.summary] = value.split(':').map((part) => part.trim());
    if (!characterName) return [];

    return [
      {
        characterName,
        status: status || '相关',
        summary: memory.summary,
        confidence: 'medium' as const,
        source: 'memory' as const,
        updatedAt: memory.updatedAt,
      },
    ];
  });

const mergeGoals = (existingGoals: CharacterGoal[], derivedGoals: CharacterGoal[]) => {
  const goalMap = new Map<string, CharacterGoal>();

  existingGoals.forEach((goal) => {
    goalMap.set(normalizeName(goal.description), goal);
  });

  derivedGoals.forEach((goal) => {
    const key = normalizeName(goal.description);
    const existing = goalMap.get(key);

    if (!existing || existing.source !== 'manual') {
      goalMap.set(key, goal);
    }
  });

  const priorityRank: Record<CharacterGoal['priority'], number> = { high: 0, medium: 1, low: 2 };
  const statusRank: Record<CharacterGoal['status'], number> = {
    active: 0,
    latent: 1,
    blocked: 2,
    completed: 3,
  };

  return Array.from(goalMap.values()).sort((left, right) => {
    const priorityDiff = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDiff !== 0) return priorityDiff;

    const statusDiff = statusRank[left.status] - statusRank[right.status];
    if (statusDiff !== 0) return statusDiff;

    return right.updatedAt - left.updatedAt;
  });
};

const mergeRelationships = (existingRelationships: CharacterRelationship[], derivedRelationships: CharacterRelationship[]) => {
  const relationshipMap = new Map<string, CharacterRelationship>();

  existingRelationships.forEach((relationship) => {
    relationshipMap.set(normalizeName(relationship.characterName), relationship);
  });

  derivedRelationships.forEach((relationship) => {
    const key = normalizeName(relationship.characterName);
    const existing = relationshipMap.get(key);

    if (!existing || existing.source !== 'manual') {
      relationshipMap.set(key, relationship);
    }
  });

  return Array.from(relationshipMap.values()).sort((left, right) => right.updatedAt - left.updatedAt);
};

const derivePersonaSummary = (profile: CharacterProfile) => {
  if (profile.personaSummary?.trim()) return profile.personaSummary.trim();
  if (profile.latestState?.stateDescription?.trim()) return profile.latestState.stateDescription.trim();

  const memorySummary = profile.memories.find((memory) => memory.summary.trim());
  return memorySummary?.summary.trim();
};

const deriveProfileInsights = (profile: CharacterProfile): CharacterProfile => {
  const latestState = profile.stateHistory.length > 0 ? profile.stateHistory[profile.stateHistory.length - 1] : profile.latestState;
  const derivedTraits = profile.memories.flatMap(extractTraitsFromMemory);
  const derivedAgencyNotes = [
    ...(latestState?.changes ?? []),
    ...profile.memories.flatMap(extractAgencyNotesFromMemory),
  ];
  const derivedGoals = [
    ...extractGoalsFromState(latestState),
    ...profile.memories.flatMap(extractGoalsFromMemory),
  ];
  const derivedRelationships = [
    ...extractRelationshipsFromStateHistory(profile.stateHistory),
    ...profile.memories.flatMap(extractRelationshipsFromMemory),
  ];

  return {
    ...profile,
    latestState,
    personaSummary: derivePersonaSummary(profile),
    coreTraits: uniqueStrings([...profile.coreTraits, ...derivedTraits]).slice(0, 12),
    agencyNotes: uniqueStrings([...profile.agencyNotes, ...derivedAgencyNotes]).slice(0, 12),
    goals: mergeGoals(profile.goals, derivedGoals),
    relationships: mergeRelationships(profile.relationships, derivedRelationships),
  };
};

const normalizeProfile = (rawProfile: Partial<CharacterProfile> & { characterName?: string }): CharacterProfile => {
  const characterName = rawProfile.characterName?.trim() || '未命名角色';
  const profile: CharacterProfile = {
    id: rawProfile.id || makeProfileId(characterName),
    characterName,
    aliases: Array.isArray(rawProfile.aliases) ? rawProfile.aliases.filter(Boolean) : [],
    latestState: rawProfile.latestState,
    stateHistory: Array.isArray(rawProfile.stateHistory) ? rawProfile.stateHistory : [],
    memories: Array.isArray(rawProfile.memories) ? rawProfile.memories : [],
    personaSummary: typeof rawProfile.personaSummary === 'string' ? rawProfile.personaSummary : undefined,
    coreTraits: Array.isArray(rawProfile.coreTraits) ? rawProfile.coreTraits.filter(Boolean) : [],
    agencyNotes: Array.isArray(rawProfile.agencyNotes) ? rawProfile.agencyNotes.filter(Boolean) : [],
    goals: Array.isArray(rawProfile.goals) ? rawProfile.goals.filter(Boolean) : [],
    relationships: Array.isArray(rawProfile.relationships) ? rawProfile.relationships.filter(Boolean) : [],
    updatedAt: typeof rawProfile.updatedAt === 'number' ? rawProfile.updatedAt : Date.now(),
  };

  profile.stateHistory = [...profile.stateHistory].sort((left, right) => left.extractedAt - right.extractedAt);
  return deriveProfileInsights(profile);
};

const ensureProfileFolder = () => {
  const fileStore = useFileStore.getState();
  const characterFolder = fileStore.files.find((file) => file.name === CHARACTER_ROOT_FOLDER && file.parentId === 'root');
  if (!characterFolder) return null;

  let profileFolder = fileStore.files.find((file) => file.name === PROFILE_FOLDER && file.parentId === characterFolder.id);
  if (!profileFolder) {
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

const saveProfilesToFiles = async (profiles: CharacterProfile[]) => {
  const folder = ensureProfileFolder();
  if (!folder) return;

  const fileStore = useFileStore.getState();
  const existingFiles = fileStore.files.filter((file) => file.parentId === folder.id && file.type === FileType.FILE);
  const seen = new Set<string>();

  profiles.forEach((rawProfile) => {
    const profile = normalizeProfile(rawProfile);
    const fileName = `${profile.characterName}.json`;
    const content = JSON.stringify(profile, null, 2);
    const target = existingFiles.find((file) => file.name === fileName);

    seen.add(fileName);

    if (target) {
      target.content = content;
      target.lastModified = Date.now();
    } else {
      fileStore.files.push({
        id: `character-memory-${Date.now()}-${profile.id}`,
        parentId: folder.id,
        name: fileName,
        type: FileType.FILE,
        content,
        lastModified: Date.now(),
      });
    }
  });

  existingFiles
    .filter((file) => !seen.has(file.name))
    .forEach((file) => {
      const index = fileStore.files.findIndex((item) => item.id === file.id);
      if (index >= 0) {
        fileStore.files.splice(index, 1);
      }
    });

  const projectId = useProjectStore.getState().currentProjectId;
  if (projectId) {
    await dbAPI.saveFiles(projectId, [...fileStore.files]);
  }
};

const createEmptyProfile = (characterName: string): CharacterProfile =>
  normalizeProfile({
    id: makeProfileId(characterName),
    characterName,
    aliases: [],
    latestState: undefined,
    stateHistory: [],
    memories: [],
    personaSummary: undefined,
    coreTraits: [],
    agencyNotes: [],
    goals: [],
    relationships: [],
    updatedAt: Date.now(),
  });

const upsertProfile = (
  profiles: CharacterProfile[],
  characterName: string,
  updater: (profile: CharacterProfile) => CharacterProfile
) => {
  const index = profiles.findIndex((profile) => normalizeName(profile.characterName) === normalizeName(characterName));

  if (index === -1) {
    return [...profiles, normalizeProfile(updater(createEmptyProfile(characterName)))];
  }

  const nextProfiles = [...profiles];
  nextProfiles[index] = normalizeProfile(updater(normalizeProfile(nextProfiles[index])));
  return nextProfiles;
};

export const useCharacterMemoryStore = createPersistingStore<CharacterMemoryState>(
  'characterMemoryStore',
  {
    profiles: [],
    isInitialized: false,

    loadProfiles: async () => {
      const folder = ensureProfileFolder();
      const fileStore = useFileStore.getState();

      if (!folder) {
        useCharacterMemoryStore.setState({ profiles: [], isInitialized: true });
        return;
      }

      const profiles = fileStore.files
        .filter((file) => file.parentId === folder.id && file.type === FileType.FILE && file.content)
        .map((file) => {
          try {
            return normalizeProfile(JSON.parse(file.content!) as CharacterProfile);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as CharacterProfile[];

      useCharacterMemoryStore.setState({ profiles, isInitialized: true });
    },

    loadProjectProfiles: async (_projectId) => {
      await useCharacterMemoryStore.getState().loadProfiles();
    },

    getByName: (characterName) =>
      useCharacterMemoryStore
        .getState()
        .profiles.find((profile) => normalizeName(profile.characterName) === normalizeName(characterName)),

    upsertStateSnapshots: (analysis) => {
      useCharacterMemoryStore.setState((state) => ({
        profiles: analysis.characterStates.reduce((profiles, rawState) => {
          const snapshot: CharacterStateSnapshot = {
            ...rawState,
            chapterPath: analysis.chapterPath,
            chapterTitle: analysis.chapterTitle,
            extractedAt: analysis.extractedAt,
          };

          return upsertProfile(profiles, snapshot.characterName, (profile) => {
            const existingIndex = profile.stateHistory.findIndex(
              (item) =>
                item.chapterPath === snapshot.chapterPath &&
                normalizeName(item.characterName) === normalizeName(snapshot.characterName)
            );

            const stateHistory = [...profile.stateHistory];
            if (existingIndex >= 0) {
              stateHistory[existingIndex] = snapshot;
            } else {
              stateHistory.push(snapshot);
            }

            stateHistory.sort((left, right) => left.extractedAt - right.extractedAt);

            return {
              ...profile,
              latestState: stateHistory[stateHistory.length - 1],
              stateHistory,
              updatedAt: Date.now(),
            };
          });
        }, state.profiles),
      }));
    },

    upsertMemoryFromLongTerm: (memory, characterName) => {
      const entry: CharacterMemoryEntry = {
        memoryId: memory.id,
        name: memory.name,
        summary: memory.summary,
        content: memory.content,
        importance: memory.importance,
        keywords: memory.keywords,
        tags: memory.tags,
        sourceRef: memory.metadata.sourceRef,
        updatedAt: memory.metadata.updatedAt,
      };

      useCharacterMemoryStore.setState((state) => ({
        profiles: upsertProfile(state.profiles, characterName, (profile) => {
          const memories = [...profile.memories];
          const index = memories.findIndex((item) => item.memoryId === memory.id);

          if (index >= 0) {
            memories[index] = entry;
          } else {
            memories.push(entry);
          }

          memories.sort((left, right) => right.updatedAt - left.updatedAt);

          return {
            ...profile,
            memories,
            updatedAt: Date.now(),
          };
        }),
      }));
    },

    removeMemoryRef: (memoryId, characterName) => {
      useCharacterMemoryStore.setState((state) => ({
        profiles: state.profiles.map((profile) => {
          if (normalizeName(profile.characterName) !== normalizeName(characterName)) {
            return profile;
          }

          return normalizeProfile({
            ...profile,
            memories: profile.memories.filter((item) => item.memoryId !== memoryId),
            goals: profile.goals.filter((goal) => goal.source === 'manual'),
            relationships: profile.relationships.filter((relationship) => relationship.source === 'manual'),
            updatedAt: Date.now(),
          });
        }),
      }));
    },

    _syncToFiles: async () => {
      await saveProfilesToFiles(useCharacterMemoryStore.getState().profiles);
    },
  },
  async (state) => {
    await saveProfilesToFiles(state.profiles);
  },
  0
);
