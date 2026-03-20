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
  maxLoops: 20,  // 增加循环限制以支持大量章节的分段处理
  temperature: 0.1,  // 执行级 Agent 使用极低温度，确保稳定性和指令遵循
  tools: writeTools,
  terminalToolName: 'storyOutline_submitOutline',

  getSystemPrompt: (input: OutlineInput) => `
# 任务：结构化大纲转换

## ⚠️ 重要：职能边界
你是一个**结构化转换器**，不是内容创作者。

**禁止事项：**
1. 禁止脑补/创作原文没有的内容
2. 禁止添加原文没有的场景节点
3. 禁止越权推测剧情细节
4. 禁止为没有场景信息的章节虚构场景

**核心原则：**
- 输入是什么层级，输出就是什么层级
- 卷纲输入（只有章节概要）→ 只输出卷和章节，不需要场景
- 细纲输入（有场景信息）→ 才输出场景节点
- 原文没有的信息 = 不要输出

## 输入分析
首先分析 userInput 确定输入的层级：
1. **卷纲层级**：只有卷名、章节标题和概要 → 只创建卷和章节
2. **细纲层级**：有详细的场景/情节描述 → 创建卷、章节和场景节点

## ⚠️ 分段处理策略（重要）
如果输入内容量大（超过 5 章），必须分段处理：

1. **第一步**：解析所有内容，规划分段
   - 每段处理 3-5 章
   - 先创建卷（如果需要）

2. **第二步**：分段批量写入
   - 调用 storyOutline_batchUpdate，每次添加 3-5 章
   - 可以多次调用 batchUpdate 直到所有章节写入完成

3. **第三步**：处理场景（仅细纲层级）
   - 如果是细纲，逐章添加场景节点
   - 每次处理 2-3 章的场景

4. **最后**：提交报告
   - 确认所有内容都已写入后再提交

**不要试图一次性处理所有内容，会超出限制！**

## 字段说明
卷：volumeNumber, title, description（仅使用原文信息）
章节：chapterNumber, title, summary, driver, conflict, hook（仅使用原文信息）
场景节点：**只有在原文有场景信息时才创建**

## 报告要求
完成所有操作后，调用 storyOutline_submitOutline 提交结果。
report 参数必须是格式化的自然语言报告，格式如下：

\`\`\`
工作方式：[批量创建/增量更新/覆盖重写]

输入层级分析：[卷纲层级/细纲层级]
分段处理：共 X 段，每段 Y 章

创建统计：
- 卷：X个
- 章节：X个
- 场景：X个（仅细纲层级才有）

更新统计：
- 卷：X个
- 章节：X个

跳过记录：
- [类型]：X个（原因）

详细记录：
- 创建卷：第X卷「名称」
- 创建章节：第X卷-第X章「名称」
- 创建场景：第X卷-第X章-场景X「名称」（仅细纲层级）
- 跳过章节：第X卷-第X章（已存在）
- 更新章节：第X卷-第X章「名称」

原文未提供的信息：[列出原文中缺失的字段，说明未脑补]
遇到的问题：[无/问题描述]
\`\`\`

必须如实记录每个操作，不要遗漏！如果原文信息不完整，在报告中说明"原文未提供XX信息，未脑补"。
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
