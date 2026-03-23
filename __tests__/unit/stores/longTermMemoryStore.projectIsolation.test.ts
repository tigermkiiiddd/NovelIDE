import 'openai/shims/node';
import { useLongTermMemoryStore } from '../../../stores/longTermMemoryStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useFileStore } from '../../../stores/fileStore';
import { dbAPI } from '../../../services/persistence';
import { FileNode, FileType, LongTermMemory } from '../../../types';

jest.mock('../../../services/persistence');
jest.mock('../../../services/geminiService', () => ({
  AIService: jest.fn(),
}));
jest.mock('../../../services/subAgents/conversationMemoryAgent', () => ({
  runConversationMemoryAgent: jest.fn(),
}));
jest.mock('../../../services/subAgents/documentMemoryAgent', () => ({
  runDocumentMemoryAgent: jest.fn(),
}));

const mockDbAPI = dbAPI as jest.Mocked<typeof dbAPI>;

const MEMORY_FILE_NAME = '闀挎湡璁板繂.json';
const INFO_FOLDER_NAME = '00_鍩虹淇℃伅';

const createMemory = (id: string, name: string): LongTermMemory => ({
  id,
  name,
  type: 'setting',
  tags: ['test'],
  keywords: [name],
  summary: `${name} summary`,
  content: `${name} content`,
  importance: 'important',
  isResident: false,
  relatedMemories: [],
  metadata: {
    createdAt: 1,
    updatedAt: 1,
    source: 'user',
    lastAccessedAt: 1,
    lastRecalledAt: 1,
    lastReinforcedAt: 1,
    recallCount: 0,
    reinforceCount: 0,
    reviewCount: 0,
    activation: 1,
    strength: 1,
    reviewIntervalHours: 24,
    nextReviewAt: Date.now() + 1000,
  },
});

const createProjectFiles = (memories: LongTermMemory[]): FileNode[] => [
  {
    id: 'info-folder',
    parentId: 'root',
    name: INFO_FOLDER_NAME,
    type: FileType.FOLDER,
    lastModified: Date.now(),
  },
  {
    id: 'memory-file',
    parentId: 'info-folder',
    name: MEMORY_FILE_NAME,
    type: FileType.FILE,
    content: JSON.stringify(memories),
    lastModified: Date.now(),
  },
];

describe('longTermMemoryStore - project isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useProjectStore.setState({
      projects: [],
      currentProjectId: null,
      isLoading: false,
    });

    useFileStore.setState({
      files: [],
      activeFileId: null,
      currentProjectId: null,
    });

    useLongTermMemoryStore.setState({
      memories: [],
      currentProjectId: null,
      isLoading: false,
      isInitialized: false,
      isRefreshing: false,
      isExtracting: false,
      extractionError: null,
    });
  });

  it('reloads memories when the active project changes even if the store was already initialized', async () => {
    const oldMemory = createMemory('memory-old', 'old');
    const newMemory = createMemory('memory-new', 'new');

    useLongTermMemoryStore.setState({
      memories: [oldMemory],
      currentProjectId: 'project-old',
      isInitialized: true,
    });
    useProjectStore.setState({ currentProjectId: 'project-new' });

    mockDbAPI.getFiles.mockImplementation(async (projectId) => {
      if (projectId === 'project-new') {
        return createProjectFiles([newMemory]);
      }
      return [];
    });

    await useLongTermMemoryStore.getState().ensureInitialized();

    const state = useLongTermMemoryStore.getState();
    expect(state.currentProjectId).toBe('project-new');
    expect(state.memories).toHaveLength(1);
    expect(state.memories[0].id).toBe('memory-new');
  });

  it('persists memories to the loaded project instead of the globally selected project id', async () => {
    const memory = createMemory('memory-1', 'isolated');

    useProjectStore.setState({ currentProjectId: 'project-global' });
    useFileStore.setState({
      currentProjectId: 'project-local',
      files: [
        {
          id: 'info-folder',
          parentId: 'root',
          name: INFO_FOLDER_NAME,
          type: FileType.FOLDER,
          lastModified: Date.now(),
        },
      ],
    });
    useLongTermMemoryStore.setState({
      memories: [memory],
      currentProjectId: 'project-local',
      isInitialized: true,
    });

    await useLongTermMemoryStore.getState()._syncToJsonFile();

    expect(mockDbAPI.saveFiles).toHaveBeenCalledWith('project-local', expect.any(Array));
    expect(mockDbAPI.saveFiles).not.toHaveBeenCalledWith('project-global', expect.any(Array));
  });
});
