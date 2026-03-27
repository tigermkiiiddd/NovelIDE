import { create } from 'zustand';
import {
  ChapterAnalysis,
  ChapterAnalysisData,
  ForeshadowingItem,
  ChapterCharacterState,
  ChapterPlotKeyPoint,
  FileType,
  SourceRef,
} from '../types';
import { createPersistingStore } from './createPersistingStore';
import { dbAPI } from '../services/persistence';
import { useFileStore } from './fileStore';
import { useAgentStore } from './agentStore';
import { useProjectStore } from './projectStore';
import { useCharacterMemoryStore } from './characterMemoryStore';
import { useEntityVersionStore } from './entityVersionStore';
import { AIService } from '../services/geminiService';
import { runChapterAnalysisAgent, applyMergeActions } from '../services/subAgents/chapterAnalysisAgent';
import { getNodePath } from '../services/fileSystem';
import { getOfficialCharacterList } from '../utils/characterUtils';

// ============================================
// 数据迁移函数：旧格式 → 新格式
// ============================================

function migrateOldData(oldAnalyses: ChapterAnalysis[]): ChapterAnalysisData {
  const characterStates: ChapterCharacterState[] = [];
  const foreshadowing: ForeshadowingItem[] = [];
  const plotKeyPoints: ChapterPlotKeyPoint[] = [];

  for (const analysis of oldAnalyses) {
    // 扁平化角色状态
    for (const state of analysis.characterStates || []) {
      characterStates.push({
        id: state.id || `state-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        characterName: state.characterName,
        chapterRef: analysis.chapterPath,
        stateDescription: state.stateDescription,
        emotionalState: state.emotionalState,
        location: state.location,
        relationships: state.relationships,
        changes: state.changes || [],
        createdAt: analysis.extractedAt,
      });
    }

    // 扁平化伏笔（添加 source 和 sourceRef）
    for (const f of analysis.foreshadowing || []) {
      // 检查是否已迁移（有 sourceRef 字段）
      if ('sourceRef' in f && f.sourceRef) {
        foreshadowing.push(f as ForeshadowingItem);
      } else {
        // 旧格式迁移 - 使用 any 类型处理旧数据
        const oldF = f as any;
        foreshadowing.push({
          id: oldF.id || `foreshadow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content: oldF.content || '',
          type: oldF.type || 'planted',
          duration: oldF.duration || 'mid_term',
          tags: oldF.tags || [],
          source: 'chapter_analysis' as const,
          sourceRef: analysis.chapterPath,
          // 旧的 developedRefs 不再使用，迁移时不保留
          notes: oldF.notes,
          createdAt: analysis.extractedAt || Date.now(),
        });
      }
    }

    // 扁平化剧情关键点
    for (const point of analysis.plotSummary || []) {
      plotKeyPoints.push({
        id: point.id || `plot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        chapterRef: analysis.chapterPath,
        description: point.description,
        importance: point.importance,
        tags: point.tags,
        relatedCharacters: point.relatedCharacters,
        createdAt: analysis.extractedAt,
      });
    }
  }

  return {
    characterStates,
    foreshadowing,
    plotKeyPoints,
    lastModified: Date.now(),
  };
}

// 判断数据是否为新格式
function isNewFormat(data: any): data is ChapterAnalysisData {
  return data && 'characterStates' in data && 'foreshadowing' in data && 'plotKeyPoints' in data;
}

// ============================================
// Store 接口定义
// ============================================

interface ChapterAnalysisState {
  // 新的扁平化数据结构
  data: ChapterAnalysisData;

  // 兼容：保留旧的 analyses 数组用于过渡
  analyses: ChapterAnalysis[];
  isExtracting: boolean;
  extractionError: string | null;

  // Actions - 数据加载
  loadProjectAnalyses: (projectId: string) => Promise<void>;

  // Actions - 伏笔操作（顶层）
  addForeshadowing: (item: Omit<ForeshadowingItem, 'id'>) => string;
  updateForeshadowing: (id: string, updates: Partial<ForeshadowingItem>) => void;
  deleteForeshadowing: (id: string) => void;

  // Actions - 角色状态操作
  addCharacterState: (state: Omit<ChapterCharacterState, 'id'>) => string;
  updateCharacterState: (id: string, updates: Partial<ChapterCharacterState>) => void;
  deleteCharacterState: (id: string) => void;

  // Actions - 剧情关键点操作
  addPlotKeyPoint: (point: Omit<ChapterPlotKeyPoint, 'id'>) => string;
  updatePlotKeyPoint: (id: string, updates: Partial<ChapterPlotKeyPoint>) => void;
  deletePlotKeyPoint: (id: string) => void;

  // Query methods - 伏笔
  getForeshadowingById: (id: string) => ForeshadowingItem | undefined;
  getAllForeshadowing: () => ForeshadowingItem[];
  getUnresolvedForeshadowing: () => Array<ForeshadowingItem & { children: ForeshadowingItem[] }>;  // 获取未完结伏笔（含子伏笔）
  getForeshadowingByChapter: (chapterRef: string) => ForeshadowingItem[];

  // Query methods - 角色状态
  getCharacterStatesByCharacter: (characterName: string) => ChapterCharacterState[];
  getCharacterStatesByChapter: (chapterRef: string) => ChapterCharacterState[];

  // Query methods - 剧情关键点
  getPlotKeyPointsByChapter: (chapterRef: string) => ChapterPlotKeyPoint[];

  // Extraction trigger
  triggerExtraction: (
    chapterPath: string,
    sessionId: string,
    projectId: string
  ) => Promise<void>;

  setExtracting: (isExtracting: boolean) => void;
  setExtractionError: (error: string | null) => void;

  // 版本管理
  restoreAnalysisFromVersion: (versionId: string) => boolean;

  // Internal helpers
  _syncToJsonFile: () => Promise<void>;
  _saveToJsonFile: () => Promise<void>;
}

// ============================================
// Store 实现
// ============================================

const initialState: ChapterAnalysisData = {
  characterStates: [],
  foreshadowing: [],
  plotKeyPoints: [],
  lastModified: Date.now(),
};

export const useChapterAnalysisStore = createPersistingStore<ChapterAnalysisState>(
  'chapterAnalysisStore',
  {
    data: initialState,
    analyses: [], // 兼容保留
    isExtracting: false,
    extractionError: null,

    loadProjectAnalyses: async (projectId) => {
      try {
        console.log('[ChapterAnalysisStore] 开始加载章节分析, projectId:', projectId);

        const fileStore = useFileStore.getState();
        console.log('[ChapterAnalysisStore] fileStore.files 数量:', fileStore.files.length);

        const analysisFile = fileStore.files.find(f => f.name === '章节分析.json');
        console.log('[ChapterAnalysisStore] 找到 analysisFile:', !!analysisFile);

        if (analysisFile && analysisFile.content) {
          try {
            const parsed = JSON.parse(analysisFile.content);

            // 判断是新格式还是旧格式
            if (isNewFormat(parsed)) {
              // 新格式直接使用
              useChapterAnalysisStore.setState({ data: parsed });
              console.log('[ChapterAnalysisStore] 加载新格式数据:', {
                characterStates: parsed.characterStates.length,
                foreshadowing: parsed.foreshadowing.length,
                plotKeyPoints: parsed.plotKeyPoints.length,
              });
            } else if (Array.isArray(parsed)) {
              // 旧格式，需要迁移
              console.log('[ChapterAnalysisStore] 检测到旧格式，开始迁移...');
              const migrated = migrateOldData(parsed);
              useChapterAnalysisStore.setState({ data: migrated, analyses: parsed });
              console.log('[ChapterAnalysisStore] 迁移完成:', {
                characterStates: migrated.characterStates.length,
                foreshadowing: migrated.foreshadowing.length,
                plotKeyPoints: migrated.plotKeyPoints.length,
              });
              // 立即保存新格式
              useChapterAnalysisStore.getState()._syncToJsonFile();
            }
            return;
          } catch (parseError) {
            console.error('[ChapterAnalysisStore] JSON 解析失败:', parseError);
          }
        }

        console.log('[ChapterAnalysisStore] 没有找到章节分析数据');
        useChapterAnalysisStore.setState({ data: initialState });
      } catch (error) {
        console.error('[ChapterAnalysisStore] 加载章节分析失败:', error);
        useChapterAnalysisStore.setState({ data: initialState });
      }
    },

    // ========== 伏笔操作 ==========

    addForeshadowing: (item) => {
      const state = useChapterAnalysisStore.getState();
      const id = `foreshadow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newItem: ForeshadowingItem = { ...item, id };
      const newData = {
        ...state.data,
        foreshadowing: [...state.data.foreshadowing, newItem],
        lastModified: Date.now(),
      };

      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
      return id;
    },

    updateForeshadowing: (id, updates) => {
      const state = useChapterAnalysisStore.getState();
      const newForeshadowing = state.data.foreshadowing.map(f =>
        f.id === id ? { ...f, ...updates } : f
      );
      const newData = {
        ...state.data,
        foreshadowing: newForeshadowing,
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
    },

    deleteForeshadowing: (id) => {
      const state = useChapterAnalysisStore.getState();
      const newForeshadowing = state.data.foreshadowing.filter(f => f.id !== id);
      const newData = {
        ...state.data,
        foreshadowing: newForeshadowing,
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
    },

    // ========== 角色状态操作 ==========

    addCharacterState: (state) => {
      const storeState = useChapterAnalysisStore.getState();
      const id = `char-state-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newState: ChapterCharacterState = { ...state, id };
      const newData = {
        ...storeState.data,
        characterStates: [...storeState.data.characterStates, newState],
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
      return id;
    },

    updateCharacterState: (id, updates) => {
      const state = useChapterAnalysisStore.getState();
      const newCharacterStates = state.data.characterStates.map(s =>
        s.id === id ? { ...s, ...updates } : s
      );
      const newData = {
        ...state.data,
        characterStates: newCharacterStates,
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
    },

    deleteCharacterState: (id) => {
      const state = useChapterAnalysisStore.getState();
      const newCharacterStates = state.data.characterStates.filter(s => s.id !== id);
      const newData = {
        ...state.data,
        characterStates: newCharacterStates,
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
    },

    // ========== 剧情关键点操作 ==========

    addPlotKeyPoint: (point) => {
      const state = useChapterAnalysisStore.getState();
      const id = `plot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newPoint: ChapterPlotKeyPoint = { ...point, id };
      const newData = {
        ...state.data,
        plotKeyPoints: [...state.data.plotKeyPoints, newPoint],
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
      return id;
    },

    updatePlotKeyPoint: (id, updates) => {
      const state = useChapterAnalysisStore.getState();
      const newPlotKeyPoints = state.data.plotKeyPoints.map(p =>
        p.id === id ? { ...p, ...updates } : p
      );
      const newData = {
        ...state.data,
        plotKeyPoints: newPlotKeyPoints,
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
    },

    deletePlotKeyPoint: (id) => {
      const state = useChapterAnalysisStore.getState();
      const newPlotKeyPoints = state.data.plotKeyPoints.filter(p => p.id !== id);
      const newData = {
        ...state.data,
        plotKeyPoints: newPlotKeyPoints,
        lastModified: Date.now(),
      };
      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
    },

    // ========== 查询方法 ==========

    getForeshadowingById: (id) => {
      return useChapterAnalysisStore.getState().data.foreshadowing.find(f => f.id === id);
    },

    getAllForeshadowing: () => {
      return useChapterAnalysisStore.getState().data.foreshadowing;
    },

    // 获取未完结伏笔（根伏笔 + 子伏笔）
    getUnresolvedForeshadowing: () => {
      const { foreshadowing } = useChapterAnalysisStore.getState().data;
      // 获取根伏笔
      const roots = foreshadowing.filter(f => !f.parentId);
      // 过滤出未收尾的（没有 type='resolved' 的子伏笔）并附加子伏笔
      return roots.filter(root => {
        const hasResolved = foreshadowing.some(
          child => child.parentId === root.id && child.type === 'resolved'
        );
        return !hasResolved;
      }).map(root => ({
        ...root,
        children: foreshadowing.filter(child => child.parentId === root.id)
      }));
    },

    getForeshadowingByChapter: (chapterRef) => {
      const { foreshadowing } = useChapterAnalysisStore.getState().data;
      return foreshadowing.filter(f => f.sourceRef === chapterRef);
    },

    getCharacterStatesByCharacter: (characterName) => {
      const { characterStates } = useChapterAnalysisStore.getState().data;
      return characterStates.filter(s => s.characterName === characterName);
    },

    getCharacterStatesByChapter: (chapterRef) => {
      const { characterStates } = useChapterAnalysisStore.getState().data;
      return characterStates.filter(s => s.chapterRef === chapterRef);
    },

    getPlotKeyPointsByChapter: (chapterRef) => {
      const { plotKeyPoints } = useChapterAnalysisStore.getState().data;
      return plotKeyPoints.filter(p => p.chapterRef === chapterRef);
    },

    // ========== 提取逻辑 ==========

    triggerExtraction: async (chapterPath, sessionId, projectId) => {
      const state = useChapterAnalysisStore.getState();

      if (state.isExtracting) {
        console.log('[ChapterAnalysisStore] 已有提取任务在进行中，跳过');
        return;
      }

      try {
        state.setExtracting(true);
        state.setExtractionError(null);

        console.log('[ChapterAnalysisStore] 开始提取章节分析:', chapterPath);

        // 1. 获取章节内容
        const fileStore = useFileStore.getState();
        const file = fileStore.files.find(f => {
          const fullPath = getNodePath(f, fileStore.files);
          return fullPath === chapterPath;
        });

        if (!file || !file.content) {
          throw new Error(`无法找到章节文件或内容为空: ${chapterPath}`);
        }

        // 2. 获取 AIService 实例
        const agentStore = useAgentStore.getState();
        const aiConfig = agentStore.aiConfig;
        const lightConfig = {
          ...aiConfig,
          modelName: aiConfig.lightweightModelName || aiConfig.modelName
        };
        const aiService = new AIService(lightConfig);

        // 3. 提取章节标题
        const chapterTitle = file.name.replace(/\.md$/, '');

        // 4. 获取现有数据
        const existingCharacterStates = state.data.characterStates.filter(s => s.chapterRef === chapterPath);
        const existingPlotKeyPoints = state.data.plotKeyPoints.filter(p => p.chapterRef === chapterPath);

        // 5. 获取未完结的伏笔
        const unresolvedForeshadowing = state.getUnresolvedForeshadowing();
        console.log('[ChapterAnalysisStore] 未完结伏笔数量:', unresolvedForeshadowing.length);

        // 6. 获取项目元信息
        const projectStore = useProjectStore.getState();
        const project = projectStore.getCurrentProject();

        // 6.5 获取正式角色列表（使用公共方法）
        const characterList = getOfficialCharacterList();
        console.log('[ChapterAnalysisStore] 正式角色列表:', characterList);

        // 7. 调用分析代理（使用新格式）
        const analysisResult = await runChapterAnalysisAgent(
          aiService,
          file.content,
          chapterTitle,
          chapterPath,  // chapterRef
          {
            characterStates: existingCharacterStates,
            plotKeyPoints: existingPlotKeyPoints
          },
          project,
          unresolvedForeshadowing,
          characterList,  // 传递角色列表
          (msg) => console.log(msg)
        );

        // 8. 检查是否有变化
        const hasChanges = analysisResult.mergeActions.some((action: any) => action.action !== 'skip');
        if (!hasChanges && existingCharacterStates.length > 0) {
          console.log('[ChapterAnalysisStore] LLM 决策：数据无变化，跳过更新');
          return;
        }

        // 9. 直接使用 agent 返回的新格式数据
        const { data } = useChapterAnalysisStore.getState();

        // 移除该章节的旧数据
        const filteredCharacterStates = data.characterStates.filter(s => s.chapterRef !== chapterPath);
        const filteredForeshadowing = data.foreshadowing.filter(f => f.sourceRef !== chapterPath);
        const filteredPlotKeyPoints = data.plotKeyPoints.filter(p => p.chapterRef !== chapterPath);

        // 合并新数据（agent 已经返回带 chapterRef 的新格式）
        const newData: ChapterAnalysisData = {
          characterStates: [...filteredCharacterStates, ...analysisResult.characterStates],
          foreshadowing: [...filteredForeshadowing, ...analysisResult.foreshadowing],
          plotKeyPoints: [...filteredPlotKeyPoints, ...analysisResult.plotKeyPoints],
          lastModified: Date.now(),
        };

        useChapterAnalysisStore.setState({ data: newData });

        // 同步到文件
        useChapterAnalysisStore.getState()._syncToJsonFile();

        // 更新角色记忆（需要转换为旧格式兼容）
        // TODO: 更新 useCharacterMemoryStore 以支持新格式
        // useCharacterMemoryStore.getState().upsertStateSnapshots(analysisResult.characterStates);

        console.log('[ChapterAnalysisStore] 章节分析完成:', {
          characterStatesCount: analysisResult.characterStates.length,
          foreshadowingCount: analysisResult.foreshadowing.length,
          plotKeyPointsCount: analysisResult.plotKeyPoints.length
        });

        console.log('[ChapterAnalysisStore] 章节分析完成');

      } catch (error: any) {
        console.error('[ChapterAnalysisStore] 提取失败:', error);
        state.setExtractionError(error.message || '未知错误');
        throw error;
      } finally {
        state.setExtracting(false);
      }
    },

    setExtracting: (isExtracting) => {
      useChapterAnalysisStore.setState({ isExtracting });
    },

    setExtractionError: (error) => {
      useChapterAnalysisStore.setState({ extractionError: error });
    },

    // 版本恢复
    restoreAnalysisFromVersion: (versionId: string) => {
      const versionStore = useEntityVersionStore.getState();
      const restored = versionStore.restoreAnalysisVersion(versionId);
      if (!restored) {
        console.warn('[ChapterAnalysisStore] 版本不存在:', versionId);
        return false;
      }

      // 重新迁移恢复的数据
      const migrated = migrateOldData([restored]);
      const { data } = useChapterAnalysisStore.getState();

      // 合并数据（替换该章节的数据）
      const chapterPath = restored.chapterPath;
      const filteredData: ChapterAnalysisData = {
        characterStates: data.characterStates.filter(s => s.chapterRef !== chapterPath),
        foreshadowing: data.foreshadowing.filter(f => f.sourceRef !== chapterPath),
        plotKeyPoints: data.plotKeyPoints.filter(p => p.chapterRef !== chapterPath),
        lastModified: Date.now(),
      };

      const newData: ChapterAnalysisData = {
        characterStates: [...filteredData.characterStates, ...migrated.characterStates],
        foreshadowing: [...filteredData.foreshadowing, ...migrated.foreshadowing],
        plotKeyPoints: [...filteredData.plotKeyPoints, ...migrated.plotKeyPoints],
        lastModified: Date.now(),
      };

      useChapterAnalysisStore.setState({ data: newData });
      useChapterAnalysisStore.getState()._syncToJsonFile();
      console.log('[ChapterAnalysisStore] 恢复版本成功:', restored.chapterTitle);
      return true;
    },

    // 内部方法：同步到 JSON 文件
    _syncToJsonFile: async () => {
      const state = useChapterAnalysisStore.getState();
      const fileStore = useFileStore.getState();

      // 保存新格式
      const jsonContent = JSON.stringify(state.data, null, 2);

      let analysisFile = fileStore.files.find(f => f.name === '章节分析.json');

      if (analysisFile) {
        analysisFile.content = jsonContent;
        analysisFile.lastModified = Date.now();
      } else {
        const infoFolder = fileStore.files.find(f => f.name === '00_基础信息' && f.parentId === 'root');
        if (infoFolder) {
          analysisFile = {
            id: `analysis-${Date.now()}`,
            parentId: infoFolder.id,
            name: '章节分析.json',
            type: FileType.FILE,
            content: jsonContent,
            lastModified: Date.now()
          };
          fileStore.files.push(analysisFile);
        }
      }

      // 保存到数据库
      const projectStore = useProjectStore.getState();
      const projectId = projectStore.currentProjectId;

      if (projectId) {
        try {
          await dbAPI.saveFiles(projectId, [...fileStore.files]);
          console.log('[ChapterAnalysisStore] ✅ 保存成功');
        } catch (err) {
          console.error('[ChapterAnalysisStore] ❌ 保存失败:', err);
        }
      }
    },

    _saveToJsonFile: async () => {
      const state = useChapterAnalysisStore.getState();
      state._syncToJsonFile();
    },
  },

  // 持久化回调
  async (state) => {
    const fileStore = useFileStore.getState();
    let analysisFile = fileStore.files.find(f => f.name === '章节分析.json');

    if (!analysisFile) {
      const infoFolder = fileStore.files.find(f => f.name === '00_基础信息' && f.parentId === 'root');
      if (infoFolder) {
        analysisFile = {
          id: `analysis-${Date.now()}`,
          parentId: infoFolder.id,
          name: '章节分析.json',
          type: FileType.FILE,
          content: JSON.stringify(state.data, null, 2),
          lastModified: Date.now()
        };
        fileStore.files.push(analysisFile);
      }
    } else {
      analysisFile.content = JSON.stringify(state.data, null, 2);
      analysisFile.lastModified = Date.now();
    }

    const projectStore = useProjectStore.getState();
    const projectId = projectStore.getCurrentProject()?.id;
    if (projectId) {
      await dbAPI.saveFiles(projectId, [...fileStore.files]);
      console.log('[ChapterAnalysisStore] 已保存到 JSON 文件');
    }
  },
  0
);
