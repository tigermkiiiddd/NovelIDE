import { create } from 'zustand';
import { StoryOutline, VolumeOutline, ChapterOutline, SceneNode } from '../types';
import { createPersistingStore } from './createPersistingStore';
import { dbAPI } from '../services/persistence';
import { useFileStore } from './fileStore';
import { useProjectStore } from './projectStore';

interface StoryOutlineState {
  outline: StoryOutline | null;
  isLoading: boolean;

  // Actions
  loadOutline: (projectId: string) => Promise<void>;
  setOutline: (outline: StoryOutline) => void;

  // Volume operations
  addVolume: (volume: Omit<VolumeOutline, 'id' | 'chapters'>) => string;  // 返回JSON: {id, created, existing}
  updateVolume: (volumeId: string, updates: Partial<VolumeOutline>) => void;
  deleteVolume: (volumeId: string) => void;

  // Chapter operations
  addChapter: (volumeId: string, chapter: Omit<ChapterOutline, 'id'>) => string;  // 返回JSON: {id, created, existing}
  updateChapter: (chapterId: string, updates: Partial<ChapterOutline>) => void;
  deleteChapter: (chapterId: string) => void;

  // Scene operations
  addScene: (chapterId: string, scene: Omit<SceneNode, 'id'>) => string;  // 返回JSON: {id, created, existing}
  updateScene: (chapterId: string, sceneId: string, updates: Partial<SceneNode>) => void;
  deleteScene: (chapterId: string, sceneId: string) => void;

  // Query methods
  getVolumes: () => VolumeOutline[];
  getChapters: (volumeId: string) => ChapterOutline[];
  getChapter: (chapterId: string) => ChapterOutline | undefined;
}

const generateId = () => `outline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useStoryOutlineStore = createPersistingStore<StoryOutlineState>(
  'storyOutlineStore',
  {
    outline: null,
    isLoading: false,

    loadOutline: async (projectId: string) => {
      console.log('[StoryOutlineStore] 开始加载大纲, projectId:', projectId);
      useStoryOutlineStore.setState({ isLoading: true });

      try {
        const fileStore = useFileStore.getState();
        const projectStore = useProjectStore.getState();
        // 查找 03_剧情大纲 目录
        const outlineFolder = fileStore.files.find(f => f.name === '03_剧情大纲' && f.parentId === 'root');

        if (!outlineFolder) {
          console.warn('[StoryOutlineStore] 未找到 03_剧情大纲 目录');
          useStoryOutlineStore.setState({ outline: null, isLoading: false });
          return;
        }

        // 查找 outline.json 文件
        const outlineFile = fileStore.files.find(f => f.name === 'outline.json' && f.parentId === outlineFolder.id);

        if (outlineFile && outlineFile.content) {
          try {
            const outline = JSON.parse(outlineFile.content) as StoryOutline;
            useStoryOutlineStore.setState({ outline, isLoading: false });
            console.log('[StoryOutlineStore] 加载完成');
            return;
          } catch (parseError) {
            console.error('[StoryOutlineStore] JSON解析失败:', parseError);
          }
        }

        // 没有大纲数据，创建空的并保存到文件
        const emptyOutline: StoryOutline = {
          id: generateId(),
          projectId,
          volumes: [],
          lastModified: Date.now()
        };

        // 保存到文件
        const jsonContent = JSON.stringify(emptyOutline, null, 2);
        if (outlineFile) {
          outlineFile.content = jsonContent;
          outlineFile.lastModified = Date.now();
        } else {
          const newFile = {
            id: `outline-${Date.now()}`,
            parentId: outlineFolder.id,
            name: 'outline.json',
            type: 'FILE' as const,
            content: jsonContent,
            lastModified: Date.now()
          };
          fileStore.files.push(newFile);
        }

        // 保存到数据库
        if (projectStore.project?.id) {
          await dbAPI.saveFiles(projectStore.project.id, [...fileStore.files]);
        }

        useStoryOutlineStore.setState({ outline: emptyOutline, isLoading: false });
        console.log('[StoryOutlineStore] 创建空大纲并保存');
      } catch (error) {
        console.error('[StoryOutlineStore] 加载失败:', error);
        useStoryOutlineStore.setState({ isLoading: false });
      }
    },

    setOutline: (outline: StoryOutline) => {
      useStoryOutlineStore.setState({ outline });
    },

    addVolume: (volumeData) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return JSON.stringify({ id: '', created: false, error: '大纲未初始化' });

      // 检查是否已存在相同卷号的卷
      const existingVolume = state.outline.volumes.find(v => v.volumeNumber === volumeData.volumeNumber);
      if (existingVolume) {
        console.log('[StoryOutlineStore] 卷已存在，返回现有ID:', existingVolume.id);
        return JSON.stringify({ id: existingVolume.id, created: false, existing: true });
      }

      const newVolume: VolumeOutline = {
        id: generateId(),
        ...volumeData,
        chapters: []
      };

      const newOutline = {
        ...state.outline,
        volumes: [...state.outline.volumes, newVolume],
        lastModified: Date.now()
      };

      useStoryOutlineStore.setState({ outline: newOutline });
      console.log('[StoryOutlineStore] 添加卷:', newVolume.title);
      return JSON.stringify({ id: newVolume.id, created: true, existing: false });
    },

    updateVolume: (volumeId: string, updates: Partial<VolumeOutline>) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return;

      const newVolumes = state.outline.volumes.map(v =>
        v.id === volumeId ? { ...v, ...updates } : v
      );

      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 更新卷:', volumeId);
    },

    deleteVolume: (volumeId: string) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return;

      const newVolumes = state.outline.volumes.filter(v => v.id !== volumeId);
      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 删除卷:', volumeId);
    },

    addChapter: (volumeId: string, chapterData: Omit<ChapterOutline, 'id'>) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return JSON.stringify({ id: '', created: false, error: '大纲未初始化' });

      // 查找目标卷
      const targetVolume = state.outline.volumes.find(v => v.id === volumeId);
      if (!targetVolume) return JSON.stringify({ id: '', created: false, error: '卷不存在' });

      // 检查是否已存在相同章节号的章节
      const existingChapter = targetVolume.chapters.find(c => c.chapterNumber === chapterData.chapterNumber);
      if (existingChapter) {
        console.log('[StoryOutlineStore] 章节已存在，返回现有ID:', existingChapter.id);
        return JSON.stringify({ id: existingChapter.id, created: false, existing: true });
      }

      const newChapter: ChapterOutline = {
        id: generateId(),
        ...chapterData,
        scenes: chapterData.scenes || []  // 确保有 scenes 数组
      };

      const newVolumes = state.outline.volumes.map(v => {
        if (v.id === volumeId) {
          return { ...v, chapters: [...v.chapters, newChapter] };
        }
        return v;
      });

      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 添加章节:', newChapter.title);
      return JSON.stringify({ id: newChapter.id, created: true, existing: false });
    },

    updateChapter: (chapterId: string, updates: Partial<ChapterOutline>) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return;

      const newVolumes = state.outline.volumes.map(v => ({
        ...v,
        chapters: v.chapters.map(c =>
          c.id === chapterId ? { ...c, ...updates } : c
        )
      }));

      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 更新章节:', chapterId);
    },

    deleteChapter: (chapterId: string) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return;

      const newVolumes = state.outline.volumes.map(v => ({
        ...v,
        chapters: v.chapters.filter(c => c.id !== chapterId)
      }));

      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 删除章节:', chapterId);
    },

    // Scene operations
    addScene: (chapterId: string, sceneData: Omit<SceneNode, 'id'>) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return JSON.stringify({ id: '', created: false, error: '大纲未初始化' });

      // 查找目标章节
      let targetChapter: ChapterOutline | undefined;
      for (const v of state.outline.volumes) {
        targetChapter = v.chapters.find(c => c.id === chapterId);
        if (targetChapter) break;
      }
      if (!targetChapter) return JSON.stringify({ id: '', created: false, error: '章节不存在' });

      // 检查是否已存在相同节点号的场景
      const existingScene = targetChapter.scenes?.find(s => s.nodeNumber === sceneData.nodeNumber);
      if (existingScene) {
        console.log('[StoryOutlineStore] 场景已存在，返回现有ID:', existingScene.id);
        return JSON.stringify({ id: existingScene.id, created: false, existing: true });
      }

      const newScene: SceneNode = {
        id: generateId(),
        ...sceneData
      };

      const newVolumes = state.outline.volumes.map(v => ({
        ...v,
        chapters: v.chapters.map(c => {
          if (c.id === chapterId) {
            return { ...c, scenes: [...(c.scenes || []), newScene] };
          }
          return c;
        })
      }));

      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 添加场景:', newScene.title);
      return JSON.stringify({ id: newScene.id, created: true, existing: false });
    },

    updateScene: (chapterId: string, sceneId: string, updates: Partial<SceneNode>) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return;

      const newVolumes = state.outline.volumes.map(v => ({
        ...v,
        chapters: v.chapters.map(c => {
          if (c.id === chapterId) {
            return {
              ...c,
              scenes: (c.scenes || []).map(s => s.id === sceneId ? { ...s, ...updates } : s)
            };
          }
          return c;
        })
      }));

      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 更新场景:', sceneId);
    },

    deleteScene: (chapterId: string, sceneId: string) => {
      const state = useStoryOutlineStore.getState();
      if (!state.outline) return;

      const newVolumes = state.outline.volumes.map(v => ({
        ...v,
        chapters: v.chapters.map(c => {
          if (c.id === chapterId) {
            return { ...c, scenes: (c.scenes || []).filter(s => s.id !== sceneId) };
          }
          return c;
        })
      }));

      useStoryOutlineStore.setState({
        outline: { ...state.outline, volumes: newVolumes, lastModified: Date.now() }
      });
      console.log('[StoryOutlineStore] 删除场景:', sceneId);
    },

    getVolumes: () => {
      const state = useStoryOutlineStore.getState();
      return state.outline?.volumes || [];
    },

    getChapters: (volumeId: string) => {
      const state = useStoryOutlineStore.getState();
      const volume = state.outline?.volumes.find(v => v.id === volumeId);
      return volume?.chapters || [];
    },

    getChapter: (chapterId: string) => {
      const state = useStoryOutlineStore.getState();
      for (const volume of (state.outline?.volumes || [])) {
        const chapter = volume.chapters.find(c => c.id === chapterId);
        if (chapter) return chapter;
      }
      return undefined;
    }
  },
  async (state) => {
    // 保存到 03_剧情大纲/outline.json
    console.log('[StoryOutlineStore] 开始保存, outline volumes:', state.outline?.volumes?.length);
    const fileStore = useFileStore.getState();
    const projectStore = useProjectStore.getState();
    const currentProject = projectStore.getCurrentProject();
    const projectId = currentProject?.id;

    if (!projectId || !state.outline) {
      console.log('[StoryOutlineStore] 保存跳过: projectId or outline missing', { projectId, hasOutline: !!state.outline, currentProject });
      return;
    }

    // 查找 03_剧情大纲 目录
    const outlineFolder = fileStore.files.find(f => f.name === '03_剧情大纲' && f.parentId === 'root');

    if (!outlineFolder) {
      console.warn('[StoryOutlineStore] 未找到 03_剧情大纲 目录, 查找所有文件夹:', fileStore.files.filter(f => f.type === 'FOLDER').map(f => f.name));
      return;
    }

    // 查找或创建 outline.json 文件
    let outlineFile = fileStore.files.find(f => f.name === 'outline.json' && f.parentId === outlineFolder.id);

    const jsonContent = JSON.stringify(state.outline, null, 2);

    if (outlineFile) {
      outlineFile.content = jsonContent;
      outlineFile.lastModified = Date.now();
      console.log('[StoryOutlineStore] 更新 outline.json');
    } else {
      outlineFile = {
        id: `outline-${Date.now()}`,
        parentId: outlineFolder.id,
        name: 'outline.json',
        type: 'FILE' as const,
        content: jsonContent,
        lastModified: Date.now()
      };
      fileStore.files.push(outlineFile);
      console.log('[StoryOutlineStore] 创建 outline.json 文件');
    }

    // 保存到数据库
    await dbAPI.saveFiles(projectId, [...fileStore.files]);
    console.log('[StoryOutlineStore] 已保存大纲数据');
  },
  0  // 立即保存
);
