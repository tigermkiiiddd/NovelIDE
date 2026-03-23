
import { AIService } from '../../geminiService';
import { ToolDefinition } from '../types';
import { runOutlineSubAgent, OutlineInput } from '../../subAgents/outlineAgent';
import { runTimelineSubAgent, TimelineInput } from '../../subAgents/timelineAgent';
import { useAgentStore } from '../../../stores/agentStore';
import { useStoryOutlineStore } from '../../../stores/storyOutlineStore';
import { useWorldTimelineStore } from '../../../stores/worldTimelineStore';
import { useProjectStore } from '../../../stores/projectStore';
import { ChapterOutline, VolumeOutline } from '../../../types';

// ============================================
// 已废弃：读取工具 - 迁移到 timelineTools.ts
// ============================================
// getVolumesTool, getChaptersTool, getChapterDetailTool 已移至 Timeline 系统
// 保留 executeStoryOutlineTool 用于 outlineAgent 内部调用

// ============================================
// 批量写入工具（保留用于 outlineAgent 内部）
// ============================================

/**
 * 批量操作大纲（内部使用，通过 SubAgent 调用）
 */
export const batchUpdateOutlineTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'storyOutline_batchUpdate',
    description: `批量操作大纲（内部工具，通过 processOutlineInput 调用）`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        addVolumes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              volumeNumber: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['volumeNumber', 'title', 'description']
          },
          description: '要添加的卷列表'
        },
        addChapters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              volumeId: { type: 'string', description: '卷ID（可选，用volumeNumber也可以）' },
              volumeNumber: { type: 'number', description: '卷号（可选，用于自动创建卷）' },
              chapterNumber: { type: 'number' },
              title: { type: 'string' },
              pov: { type: 'string' },
              summary: { type: 'string' },
              driver: { type: 'string' },
              conflict: { type: 'string' },
              hook: { type: 'string' },
              status: { type: 'string' }
            },
            required: ['chapterNumber', 'title', 'summary']
          },
          description: '要添加的章节列表'
        },
        updateChapters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chapterId: { type: 'string' },
              updates: { type: 'object' }
            },
            required: ['chapterId', 'updates']
          },
          description: '要更新的章节列表'
        }
      },
      required: ['thinking']
    }
  }
};

// ============================================
// 主Agent调用工具
// ============================================

export const processOutlineInputTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'processOutlineInput',
    description: `将剧情内容写入结构化大纲。

## ⚠️ 重要说明
1. **可以传入大量内容**：支持一次性传入整卷甚至多卷的大纲
2. **Subagent 会自动分段处理**：内容量大时会分批次写入
3. **禁止脑补**：Subagent 只做结构化转换，不会创作原文没有的内容

## 参数说明
- userInput: 剧情内容（可以是单章、整卷或多卷）
  - 卷纲格式：卷名、章节标题和概要
  - 细纲格式：包含详细的场景/情节描述
- volumeId: 添加到哪个卷（mode=add时可选，不填则自动创建）
- targetChapterId: 更新哪个章节（mode=update时必填）
- mode: add（添加新内容）或 update（更新现有内容）

## 使用示例
- 添加整卷：userInput 包含完整卷纲，Subagent 会解析并批量创建
- 添加单章：userInput 包含单章内容
- 更新章节：mode=update + targetChapterId
`,
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        userInput: { type: 'string', description: '剧情内容' },
        mode: { type: 'string', enum: ['add', 'update'], description: 'add=添加, update=更新' },
        targetChapterId: { type: 'string', description: 'update时指定' },
        volumeId: { type: 'string', description: 'add时指定' }
      },
      required: ['thinking', 'userInput', 'mode']
    }
  }
};

// ============================================
// 工具执行函数
// ============================================

export const executeProcessOutlineInput = async (
  args: any,
  onUiLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  const agentStore = useAgentStore.getState();
  const aiConfig = agentStore.aiConfig;

  if (!aiConfig.apiKey) {
    return JSON.stringify({ success: false, error: 'AI配置未设置' });
  }

  // 创建AI服务实例
  const aiService = new AIService(aiConfig);

  // 确保 Timeline 已加载
  let timelineStore = useWorldTimelineStore.getState();
  const projectStore = useProjectStore.getState();
  const currentProject = projectStore.getCurrentProject();
  if (!timelineStore.timeline && currentProject?.id) {
    await timelineStore.loadTimeline(currentProject.id);
    timelineStore = useWorldTimelineStore.getState();
  }

  // 自动注入上下文
  let contextInfo = '';

  if (args.mode === 'update' && args.targetChapterId) {
    const chapter = timelineStore.getChapter(args.targetChapterId);
    if (chapter) {
      contextInfo = `\n\n【当前章节内容】\n${JSON.stringify(chapter, null, 2)}`;
    }
  } else if (args.mode === 'add' && args.volumeId) {
    const chapters = timelineStore.getChapters(args.volumeId);
    if (chapters.length > 0) {
      contextInfo = `\n\n【该卷现有章节】\n${JSON.stringify(chapters, null, 2)}`;
    }
  }

  const input: TimelineInput = {
    userInput: args.userInput + contextInfo,
    projectId: currentProject?.id || '',
    mode: args.mode,
    targetChapterId: args.targetChapterId,
    volumeId: args.volumeId
  };

  try {
    // 使用 Timeline SubAgent 替代 Outline SubAgent
    const result = await runTimelineSubAgent(aiService, input, (msg) => {
      if (onUiLog) {
        onUiLog(msg);  // 传递给 UI
      }
      console.log('[TimelineSubAgent]', msg);
    }, signal);

    // 直接返回格式化的自然语言报告
    return result.report;
  } catch (error: any) {
    console.error('[processOutlineInput] 错误:', error);
    return `大纲处理失败：${error.message}`;
  }
};

// 执行大纲工具（读取/写入）
export const executeStoryOutlineTool = async (
  toolName: string,
  args: any
): Promise<string> => {
  let store = useStoryOutlineStore.getState();
  const projectStore = useProjectStore.getState();
  const currentProject = projectStore.getCurrentProject();

  // 确保大纲已加载
  if (!store.outline && currentProject?.id) {
    await store.loadOutline(currentProject.id);
    store = useStoryOutlineStore.getState();
  }

  if (!store.outline) {
    return JSON.stringify({ success: false, error: '大纲未初始化' });
  }

  switch (toolName) {
    case 'storyOutline_getVolumes': {
      const volumes = store.getVolumes();
      return JSON.stringify({
        volumes: volumes.map((v: VolumeOutline) => ({
          id: v.id,
          volumeNumber: v.volumeNumber,
          title: v.title,
          description: v.description,
          chapterCount: v.chapters.length
        }))
      });
    }

    case 'storyOutline_getChapters': {
      const { volumeId } = args;
      const chapters = store.getChapters(volumeId);
      return JSON.stringify({
        volumeId,
        chapters: chapters.map((c: ChapterOutline) => ({
          id: c.id,
          chapterNumber: c.chapterNumber,
          title: c.title,
          summary: c.summary,
          driver: c.driver,
          conflict: c.conflict,
          hook: c.hook,
          status: c.status
        }))
      });
    }

    case 'storyOutline_getChapter': {
      const { chapterId } = args;
      const chapter = store.getChapter(chapterId);
      return JSON.stringify(chapter || { error: '章节不存在' });
    }

    case 'storyOutline_batchUpdate': {
      const results: any = {
        addedVolumes: [],
        addedChapters: [],
        updatedChapters: [],
        errors: []
      };

      // 1. 先添加卷（记录卷号和ID的映射）
      const volumeIdMap = new Map<number, string>();
      if (args.addVolumes && Array.isArray(args.addVolumes)) {
        for (const v of args.addVolumes) {
          try {
            const id = store.addVolume(v);
            volumeIdMap.set(v.volumeNumber, id);
            results.addedVolumes.push({ ...v, id });
          } catch (e: any) {
            results.errors.push({ type: 'addVolume', data: v, error: e.message });
          }
        }
      }

      // 2. 添加章节（支持volumeNumber自动查找或创建卷）
      if (args.addChapters && Array.isArray(args.addChapters)) {
        for (const c of args.addChapters) {
          try {
            let targetVolumeId = c.volumeId;

            // 如果没有volumeId，尝试用volumeNumber查找
            if (!targetVolumeId && c.volumeNumber) {
              targetVolumeId = volumeIdMap.get(c.volumeNumber);
              // 如果还没创建，尝试从大纲中查找
              if (!targetVolumeId && store.outline) {
                const existingVol = store.outline.volumes.find(v => v.volumeNumber === c.volumeNumber);
                if (existingVol) {
                  targetVolumeId = existingVol.id;
                }
              }
            }

            if (!targetVolumeId) {
              throw new Error(`找不到卷: ${c.volumeNumber}`);
            }

            const { volumeId, volumeNumber, ...chapterData } = c;
            const id = store.addChapter(targetVolumeId, chapterData);
            results.addedChapters.push({ ...c, id });
          } catch (e: any) {
            results.errors.push({ type: 'addChapter', data: c, error: e.message });
          }
        }
      }

      // 3. 更新章节
      if (args.updateChapters && Array.isArray(args.updateChapters)) {
        for (const u of args.updateChapters) {
          try {
            store.updateChapter(u.chapterId, u.updates);
            results.updatedChapters.push(u);
          } catch (e: any) {
            results.errors.push({ type: 'updateChapter', data: u, error: e.message });
          }
        }
      }

      return JSON.stringify({
        success: results.errors.length === 0,
        ...results
      });
    }

    case 'storyOutline_addScene': {
      const { chapterId, scene } = args;
      const sceneId = store.addScene(chapterId, scene);
      return JSON.stringify({ success: true, sceneId, chapterId });
    }

    default:
      return JSON.stringify({ error: `未知工具: ${toolName}` });
  }
};
