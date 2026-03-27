import { create } from 'zustand';
import { ChapterAnalysis, ForeshadowingItem, FileType } from '../types';
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

interface ChapterAnalysisState {
  analyses: ChapterAnalysis[];
  isExtracting: boolean;
  extractionError: string | null;

  // Actions
  loadProjectAnalyses: (projectId: string) => Promise<void>;
  setAnalyses: (analyses: ChapterAnalysis[]) => void;
  addAnalysis: (analysis: ChapterAnalysis) => void;
  updateAnalysis: (id: string, updates: Partial<ChapterAnalysis>) => void;
  deleteAnalysis: (id: string) => void;

  // Query methods
  getByPath: (chapterPath: string) => ChapterAnalysis | undefined;
  getByCharacter: (characterName: string) => ChapterAnalysis[];
  getBySession: (sessionId: string) => ChapterAnalysis[];
  getSortedByTime: () => ChapterAnalysis[];

  // Extraction trigger
  triggerExtraction: (
    chapterPath: string,
    sessionId: string,
    projectId: string
  ) => Promise<void>;

  setExtracting: (isExtracting: boolean) => void;
  setExtractionError: (error: string | null) => void;

  // 伏笔操作（唯一入口）
  addForeshadowing: (chapterPath: string, item: Omit<ForeshadowingItem, 'id'>) => string;
  updateForeshadowing: (chapterPath: string, foreshadowingId: string, updates: Partial<ForeshadowingItem>) => void;
  deleteForeshadowing: (chapterPath: string, foreshadowingId: string) => void;

  // 获取所有伏笔（聚合查询）
  getAllForeshadowing: () => ForeshadowingItem[];
  getUnresolvedForeshadowing: () => ForeshadowingItem[];

  // 版本管理
  restoreAnalysisFromVersion: (versionId: string) => boolean;

  // Internal helpers
  _syncToJsonFile: (analyses: ChapterAnalysis[]) => Promise<void>;
  _saveToJsonFile: () => Promise<void>;
}

export const useChapterAnalysisStore = createPersistingStore<ChapterAnalysisState>(
  'chapterAnalysisStore',
  {
    analyses: [],
    isExtracting: false,
    extractionError: null,

    loadProjectAnalyses: async (projectId) => {
      try {
        console.log('[ChapterAnalysisStore] 开始加载章节分析, projectId:', projectId);

        // 从 JSON 文件加载
        const fileStore = useFileStore.getState();
        console.log('[ChapterAnalysisStore] fileStore.files 数量:', fileStore.files.length);

        const analysisFile = fileStore.files.find(f => f.name === '章节分析.json');
        console.log('[ChapterAnalysisStore] 找到 analysisFile:', !!analysisFile, 'content:', analysisFile?.content?.substring(0, 50));

        if (analysisFile && analysisFile.content) {
          try {
            const analyses = JSON.parse(analysisFile.content);
            if (Array.isArray(analyses)) {
              useChapterAnalysisStore.setState({ analyses });
              console.log('[ChapterAnalysisStore] 从 JSON 文件加载完成, 分析数量:', analyses.length);
              return;
            }
          } catch (parseError) {
            console.error('[ChapterAnalysisStore] JSON 解析失败:', parseError);
          }
        }

        console.log('[ChapterAnalysisStore] 没有找到章节分析数据');
        useChapterAnalysisStore.setState({ analyses: [] });
      } catch (error) {
        console.error('[ChapterAnalysisStore] 加载章节分析失败:', error);
        useChapterAnalysisStore.setState({ analyses: [] });
      }
    },

    setAnalyses: (analyses) => {
      useChapterAnalysisStore.setState({ analyses });
    },

    // 辅助函数：立即同步更新 JSON 文件内容到内存
    _syncToJsonFile: async (analyses: ChapterAnalysis[]) => {
      console.log('[ChapterAnalysisStore] _syncToJsonFile 开始, 数据:', analyses.length);

      const fileStore = useFileStore.getState();
      const jsonContent = JSON.stringify(analyses, null, 2);
      console.log('[ChapterAnalysisStore] JSON 内容:', jsonContent.substring(0, 100));

      // 查找或创建章节分析文件
      let analysisFile = fileStore.files.find(f => f.name === '章节分析.json');

      if (analysisFile) {
        // 更新现有文件内容
        analysisFile.content = jsonContent;
        analysisFile.lastModified = Date.now();
        console.log('[ChapterAnalysisStore] 更新现有文件');
      } else {
        // 创建新文件
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
          console.log('[ChapterAnalysisStore] 创建新文件');
        } else {
          console.error('[ChapterAnalysisStore] 未找到 00_基础信息 文件夹');
        }
      }

      // 立即保存到数据库
      const projectStore = useProjectStore.getState();
      const projectId = projectStore.currentProjectId;
      console.log('[ChapterAnalysisStore] projectId:', projectId);

      if (projectId) {
        try {
          await dbAPI.saveFiles(projectId, [...fileStore.files]);
          console.log('[ChapterAnalysisStore] ✅ 保存成功');
        } catch (err) {
          console.error('[ChapterAnalysisStore] ❌ 保存失败:', err);
        }
      }
    },

    addAnalysis: (analysis) => {
      console.log('[ChapterAnalysisStore] addAnalysis 被调用', analysis);
      const state = useChapterAnalysisStore.getState();
      const newAnalyses = [...state.analyses, analysis];
      useChapterAnalysisStore.setState({ analyses: newAnalyses });
      console.log('[ChapterAnalysisStore] 新状态:', newAnalyses);
      // 立即同步到 JSON 文件
      useChapterAnalysisStore.getState()._syncToJsonFile(newAnalyses);
    },

    updateAnalysis: (id, updates) => {
      console.log('[ChapterAnalysisStore] updateAnalysis 被调用', id, updates);
      const state = useChapterAnalysisStore.getState();
      const newAnalyses = state.analyses.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      );
      useChapterAnalysisStore.setState({ analyses: newAnalyses });
      // 立即同步到 JSON 文件
      useChapterAnalysisStore.getState()._syncToJsonFile(newAnalyses);
    },

    deleteAnalysis: (id) => {
      console.log('[ChapterAnalysisStore] deleteAnalysis 被调用', id);
      const state = useChapterAnalysisStore.getState();
      const newAnalyses = state.analyses.filter((a) => a.id !== id);
      useChapterAnalysisStore.setState({ analyses: newAnalyses });
      // 立即同步到 JSON 文件
      useChapterAnalysisStore.getState()._syncToJsonFile(newAnalyses);
    },

    getByPath: (chapterPath) => {
      const state = useChapterAnalysisStore.getState();
      return state.analyses.find((a) => a.chapterPath === chapterPath);
    },

    getByCharacter: (characterName) => {
      const state = useChapterAnalysisStore.getState();
      return state.analyses.filter((a) =>
        a.characterStates.some((cs) => cs.characterName === characterName)
      );
    },

    getBySession: (sessionId) => {
      const state = useChapterAnalysisStore.getState();
      return state.analyses.filter((a) => a.sessionId === sessionId);
    },

    getSortedByTime: () => {
      const state = useChapterAnalysisStore.getState();
      return [...state.analyses].sort((a, b) => a.extractedAt - b.extractedAt);
    },

    triggerExtraction: async (chapterPath, sessionId, projectId) => {
      const state = useChapterAnalysisStore.getState();

      // 防止重复提取
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

        // 2. 获取 AIService 实例（使用轻量模型）
        const agentStore = useAgentStore.getState();
        const aiConfig = agentStore.aiConfig;
        // 使用轻量模型，如果没有配置则回退到主模型
        const lightConfig = {
          ...aiConfig,
          modelName: aiConfig.lightweightModelName || aiConfig.modelName
        };
        const aiService = new AIService(lightConfig);

        // 3. 提取章节标题
        const chapterTitle = file.name.replace(/\.md$/, '');

        // 4. 检查是否已存在该章节的分析
        const existingAnalysis = state.getByPath(chapterPath);
        console.log('[ChapterAnalysisStore] 现有分析:', existingAnalysis ? '有' : '无');

        // 5. 获取未完结的伏笔（从所有章节分析中提取 planted 和 developed 状态）
        const unresolvedForeshadowing: ForeshadowingItem[] = state.analyses.flatMap(
          (analysis: ChapterAnalysis) => (analysis.foreshadowing || [])
        ).filter(
          (item: ForeshadowingItem) => item.type === 'planted' || item.type === 'developed'
        );
        console.log('[ChapterAnalysisStore] 未完结伏笔数量:', unresolvedForeshadowing.length);

        // 6. 获取项目元信息
        const projectStore = useProjectStore.getState();
        const project = projectStore.getCurrentProject();

        // 7. 调用分析代理（传入现有分析和未完结伏笔，让 LLM 做决策）
        const analysisResult = await runChapterAnalysisAgent(
          aiService,
          file.content,
          chapterTitle,
          existingAnalysis,
          project,
          unresolvedForeshadowing,
          (msg) => console.log(msg)
        );

        // 8. LLM 决策：如果 mergeActions 中全是 skip 或无操作，则不更新
        const hasChanges = analysisResult.mergeActions.some((action: any) => action.action !== 'skip');
        if (!hasChanges && existingAnalysis) {
          console.log('[ChapterAnalysisStore] LLM 决策：数据无变化，跳过更新');
          return;
        }

        // 9. 应用 LLM 的合并决策
        const finalAnalysis = applyMergeActions(
          existingAnalysis,
          analysisResult,
          chapterTitle,
          chapterPath
        );

        // 10. 更新状态
        if (existingAnalysis) {
          state.updateAnalysis(existingAnalysis.id, finalAnalysis);
          console.log('[ChapterAnalysisStore] 更新章节分析:', chapterPath);
        } else {
          state.addAnalysis(finalAnalysis);
          console.log('[ChapterAnalysisStore] 添加章节分析:', chapterPath);
        }

        useCharacterMemoryStore.getState().upsertStateSnapshots(finalAnalysis);

        // 创建版本记录
        const versionStore = useEntityVersionStore.getState();
        versionStore.createAnalysisVersion(
          finalAnalysis,
          'agent',
          `AI 分析: ${chapterTitle}`
        );

        console.log('[ChapterAnalysisStore] 章节分析完成，最终数据:', finalAnalysis);

      } catch (error: any) {
        console.error('[ChapterAnalysisStore] 提取失败:', error);
        state.setExtractionError(error.message || '未知错误');
        throw error; // 重新抛出错误，让调用方处理
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

    // ========== 伏笔操作（唯一入口） ==========
    addForeshadowing: (chapterPath, item) => {
      const state = useChapterAnalysisStore.getState();
      const id = `foreshadow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const analysis = state.analyses.find(a => a.chapterPath === chapterPath);
      if (analysis) {
        analysis.foreshadowing.push({ ...item, id });
        useChapterAnalysisStore.setState({ analyses: [...state.analyses] });

        // 创建版本记录
        const versionStore = useEntityVersionStore.getState();
        versionStore.createAnalysisVersion(analysis, 'manual', '添加伏笔');
      } else {
        // 如果没有章节分析，创建一个基础的
        const newAnalysis: ChapterAnalysis = {
          id: `analysis-${Date.now()}`,
          chapterPath,
          chapterTitle: chapterPath.split('/').pop() || '',
          sessionId: 'manual',
          projectId: '',
          plotSummary: [],
          characterStates: [],
          foreshadowing: [{ ...item, id }],
          extractedAt: Date.now(),
          lastModified: Date.now(),
          wordCount: 0
        };
        useChapterAnalysisStore.setState({ analyses: [...state.analyses, newAnalysis] });
      }

      // 延迟保存
      setTimeout(() => useChapterAnalysisStore.getState()._saveToJsonFile(), 500);
      return id;
    },

    updateForeshadowing: (chapterPath, foreshadowingId, updates) => {
      const state = useChapterAnalysisStore.getState();
      const analysis = state.analyses.find(a => a.chapterPath === chapterPath);
      if (!analysis) return;

      analysis.foreshadowing = analysis.foreshadowing.map(f =>
        f.id === foreshadowingId ? { ...f, ...updates } : f
      );
      analysis.lastModified = Date.now();

      useChapterAnalysisStore.setState({ analyses: [...state.analyses] });

      // 创建版本记录
      const versionStore = useEntityVersionStore.getState();
      versionStore.createAnalysisVersion(analysis, 'manual', '编辑伏笔');

      setTimeout(() => useChapterAnalysisStore.getState()._saveToJsonFile(), 500);
    },

    deleteForeshadowing: (chapterPath, foreshadowingId) => {
      const state = useChapterAnalysisStore.getState();
      const analysis = state.analyses.find(a => a.chapterPath === chapterPath);
      if (!analysis) return;

      analysis.foreshadowing = analysis.foreshadowing.filter(f => f.id !== foreshadowingId);
      analysis.lastModified = Date.now();

      useChapterAnalysisStore.setState({ analyses: [...state.analyses] });
      setTimeout(() => useChapterAnalysisStore.getState()._saveToJsonFile(), 500);
    },

    // ========== 伏笔查询（聚合） ==========
    getAllForeshadowing: () => {
      const state = useChapterAnalysisStore.getState();
      return state.analyses.flatMap(a => a.foreshadowing || []);
    },

    getUnresolvedForeshadowing: () => {
      const state = useChapterAnalysisStore.getState();
      return state.analyses.flatMap(
        a => (a.foreshadowing || []).filter(f => f.type === 'planted' || f.type === 'developed')
      );
    },

    // 版本恢复
    restoreAnalysisFromVersion: (versionId: string) => {
      const versionStore = useEntityVersionStore.getState();
      const restored = versionStore.restoreAnalysisVersion(versionId);
      if (!restored) {
        console.warn('[ChapterAnalysisStore] 版本不存在:', versionId);
        return false;
      }

      const state = useChapterAnalysisStore.getState();
      const existingIndex = state.analyses.findIndex(a => a.id === restored.id);

      if (existingIndex >= 0) {
        // 更新现有分析
        const newAnalyses = [...state.analyses];
        newAnalyses[existingIndex] = restored;
        useChapterAnalysisStore.setState({ analyses: newAnalyses });
        // 同步到 JSON 文件
        useChapterAnalysisStore.getState()._syncToJsonFile(newAnalyses);
        console.log('[ChapterAnalysisStore] 恢复版本成功:', restored.chapterTitle);
        return true;
      } else {
        // 添加新分析
        const newAnalyses = [...state.analyses, restored];
        useChapterAnalysisStore.setState({ analyses: newAnalyses });
        useChapterAnalysisStore.getState()._syncToJsonFile(newAnalyses);
        console.log('[ChapterAnalysisStore] 恢复版本成功(新增):', restored.chapterTitle);
        return true;
      }
    },

    // 内部方法:保存到 JSON 文件
    _saveToJsonFile: async () => {
      const state = useChapterAnalysisStore.getState();
      const fileStore = useFileStore.getState();

      // 找到或创建章节分析.json 文件
      let analysisFile = fileStore.files.find(f => f.name === '章节分析.json');

      if (!analysisFile) {
        // 需要先找到 00_基础信息 文件夹
        const infoFolder = fileStore.files.find(f => f.name === '00_基础信息' && f.parentId === 'root');
        if (!infoFolder) {
          console.warn('[ChapterAnalysisStore] 无法保存：00_基础信息 文件夹不存在');
          return;
        }

        // 创建文件
        const newFileId = `analysis-${Date.now()}`;
        analysisFile = {
          id: newFileId,
          parentId: infoFolder.id,
          name: '章节分析.json',
          type: FileType.FILE,
          content: JSON.stringify(state.analyses, null, 2),
          lastModified: Date.now()
        };

        fileStore.files.push(analysisFile);
        console.log('[ChapterAnalysisStore] 创建章节分析.json 文件');
      } else {
        // 更新现有文件
        analysisFile.content = JSON.stringify(state.analyses, null, 2);
        analysisFile.lastModified = Date.now();
      }

      // 保存到数据库
      const projectStore = useProjectStore.getState();
      const projectId = projectStore.getCurrentProject()?.id;
      if (projectId) {
        await dbAPI.saveFiles(projectId, fileStore.files);
        console.log('[ChapterAnalysisStore] 已保存到 JSON 文件');
      }
    }
  },
  async (state) => {
    // 保存到 JSON 文件而不是 IndexedDB
    const fileStore = useFileStore.getState();
    let analysisFile = fileStore.files.find(f => f.name === '章节分析.json');

    if (!analysisFile) {
      // 需要先找到 00_基础信息 文件夹
      const infoFolder = fileStore.files.find(f => f.name === '00_基础信息' && f.parentId === 'root');
      if (infoFolder) {
        const newFileId = `analysis-${Date.now()}`;
        analysisFile = {
          id: newFileId,
          parentId: infoFolder.id,
          name: '章节分析.json',
          type: FileType.FILE,
          content: JSON.stringify(state.analyses, null, 2),
          lastModified: Date.now()
        };
        fileStore.files.push(analysisFile);
      }
    } else {
      analysisFile.content = JSON.stringify(state.analyses, null, 2);
      analysisFile.lastModified = Date.now();
    }

    const projectStore = useProjectStore.getState();
    const projectId = projectStore.getCurrentProject()?.id;
    if (projectId) {
      // 直接保存到数据库，绕过 fileStore 的状态更新
      await dbAPI.saveFiles(projectId, [...fileStore.files]);
      console.log('[ChapterAnalysisStore] 已保存到 JSON 文件');
    }
  },
  0  // 立即保存，不延迟
);
