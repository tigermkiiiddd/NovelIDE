import { AIService } from '../geminiService';
import { BaseSubAgent, SubAgentConfig, runSubAgent } from './BaseSubAgent';
import { executeStoryOutlineTool } from '../agent/tools/outlineTools';
import { ToolDefinition } from '../agent/types';
import { ChapterOutline, VolumeOutline } from '../../types';

// ============================================
// 在outlineAgent中直接定义工具（避免循环依赖）
// ============================================

const getVolumesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'storyOutline_getVolumes',
    description: '获取所有卷纲列表',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' }
      },
      required: ['thinking']
    }
  }
};

const getChaptersTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'storyOutline_getChapters',
    description: '获取指定卷的章纲列表',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        volumeId: { type: 'string', description: '卷ID' }
      },
      required: ['thinking', 'volumeId']
    }
  }
};

const getChapterDetailTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'storyOutline_getChapter',
    description: '获取章节详细大纲',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        chapterId: { type: 'string', description: '章节ID' }
      },
      required: ['thinking', 'chapterId']
    }
  }
};

const batchUpdateOutlineTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'storyOutline_batchUpdate',
    description: `批量操作大纲，支持：
- 添加卷 (addVolumes)
- 添加章节 (addChapters) - 可指定新卷名自动创建
- 更新章节 (updateChapters)

混合操作示例：
{
  addVolumes: [{volumeNumber: 1, title: "第一卷", description: "..."}],
  addChapters: [
    {volumeNumber: 1, chapterNumber: 1, title: "第1章", summary: "..."},
    {volumeNumber: 1, chapterNumber: 2, title: "第2章", summary: "..."}
  ]
}`,
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

const addSceneTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'storyOutline_addScene',
    description: '添加场景节点到章节（每个章节应该有多个场景节点）',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        chapterId: { type: 'string', description: '章节ID' },
        scene: { type: 'object', description: '场景数据: nodeNumber, title, content, location, characters, emotion, purpose' }
      },
      required: ['thinking', 'chapterId', 'scene']
    }
  }
};

const submitOutlineTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'storyOutline_submitOutline',
    description: '提交大纲结果（终止工具）- 必须包含详细的工作报告',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程' },
        success: { type: 'boolean', description: '是否成功' },
        report: { type: 'string', description: '格式化的自然语言工作报告（包含工作方式、统计、详细记录、问题）' }
      },
      required: ['thinking', 'success', 'report']
    }
  }
};

// SubAgent专用的工具列表
const writeTools: ToolDefinition[] = [
  batchUpdateOutlineTool,
  addSceneTool,
  getVolumesTool,
  getChaptersTool,
  getChapterDetailTool,
  submitOutlineTool
];

// ============================================
// SubAgent输入/输出类型
// ============================================

export interface OutlineInput {
  userInput: string;
  projectId: string;
  volumeId?: string;
  mode: 'add' | 'update';
  targetChapterId?: string;
}

export interface OutlineOutput {
  success: boolean;
  report: string;  // 格式化的自然语言报告
}

// ============================================
// SubAgent配置
// ============================================

const outlineSubAgentConfig: SubAgentConfig<OutlineInput, OutlineOutput> = {
  name: 'OutlineSubAgent',
  maxLoops: 5,
  tools: writeTools,
  terminalToolName: 'storyOutline_submitOutline',

  getSystemPrompt: (input: OutlineInput) => `
# 任务：结构化大纲数据

将剧情描述转换为结构化大纲数据。

## 重要：必须创建场景节点
每个章节必须有场景节点（scenes）！这是核心要求。
- 一个章节至少要3-5个场景节点
- 场景节点是章节的细分内容
- 必须调用 storyOutline_addScene 添加场景节点

## 输入（主Agent提供）
- userInput: 完整的章节/卷剧情内容
- volumeId: 添加到哪个卷（可选）
- targetChapterId: 更新哪个章节（可选）
- mode: add 或 update

## 操作流程
1. 解析userInput中的剧情内容
2. 调用 storyOutline_batchUpdate 批量创建/更新卷和章节
3. **必须**调用 addScene 为每个章节添加多个场景节点
4. 提交结果

## 字段
卷：volumeNumber, title, description
章节：chapterNumber, title, pov, summary, driver, conflict, hook, status
场景节点（必须）：nodeNumber, title, content, location, characters(数组), emotion, purpose

## 重要：报告格式要求
完成所有操作后，调用 storyOutline_submitOutline 提交结果。
report 参数必须是格式化的自然语言报告，格式如下：

\`\`\`
工作方式：[批量创建/增量更新/覆盖重写]

创建统计：
- 卷：X个
- 章节：X个
- 场景：X个

更新统计：
- 卷：X个
- 章节：X个

跳过记录：
- [类型]：X个（原因）

详细记录：
- 创建卷：第X卷「名称」
- 创建章节：第X卷-第X章「名称」
- 创建场景：第X卷-第X章-场景X「名称」
- 跳过章节：第X卷-第X章（已存在）
- 更新章节：第X卷-第X章「名称」

遇到的问题：[无/问题描述]
\`\`\`

必须如实记录每个操作，不要遗漏！
`,

  getInitialMessage: (input: OutlineInput) => `
请处理以下大纲输入：

${input.userInput}

${input.mode === 'update' ? `目标：更新章节 ${input.targetChapterId}` : '目标：添加新章节/卷'}
${input.volumeId ? `添加到卷：${input.volumeId}` : ''}

请分析输入，调用相应工具创建/更新大纲，然后提交结果。
`,

  parseTerminalResult: (args: any): OutlineOutput => {
    return {
      success: args.success === true,
      report: args.report || '大纲处理完成，但未提供详细报告'
    };
  },

  executeCustomTool: async (name: string, args: any): Promise<string> => {
    if (name === 'storyOutline_submitOutline') {
      return JSON.stringify(args);
    }
    const result = await executeStoryOutlineTool(name, args);
    return JSON.stringify(result);
  },

  handleTextResponse: (text: string, loopCount: number): string | null => {
    if (loopCount < 3) {
      return `请调用 storyOutline_submitOutline 工具提交结果，不要只输出文字。`;
    }
    return null;
  }
};

// ============================================
// 运行函数
// ============================================

export async function runOutlineSubAgent(
  aiService: AIService,
  input: OutlineInput,
  onLog?: (msg: string) => void
): Promise<OutlineOutput> {
  return runSubAgent(outlineSubAgentConfig, aiService, input, {}, onLog);
}
