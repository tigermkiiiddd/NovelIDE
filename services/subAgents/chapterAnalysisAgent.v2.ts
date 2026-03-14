import { AIService } from '../geminiService';
import { ChapterAnalysis, PlotKeyPoint, CharacterState, ForeshadowingItem } from '../../types';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';

// --- 工具定义 ---
const submitAnalysisTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_analysis',
    description: '当你完成章节分析后，调用此工具提交结构化的分析结果。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '【必须使用中文】最终反思：你对分析结果有信心吗？是否遗漏了重要信息？'
        },
        mergeActions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['add', 'update', 'remove'],
                description: '操作类型：add=新增，update=更新，remove=移除'
              },
              target: {
                type: 'string',
                enum: ['plot', 'character', 'foreshadowing'],
                description: '目标类型'
              },
              id: {
                type: 'string',
                description: '如果 action 是 update 或 remove，需要指定 ID'
              },
              data: {
                type: 'object',
                description: '如果 action 是 add 或 update，需要提供完整数据'
              },
              reason: {
                type: 'string',
                description: '操作原因说明'
              }
            },
            required: ['action', 'target', 'reason']
          },
          description: '【关键】合并操作列表：描述需要执行哪些添加、更新、移除操作'
        },
        plotSummary: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识符，用于追踪和更新' },
              description: { type: 'string', description: '剧情关键点的详细描述' },
              importance: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: '重要性等级：high=核心转折/冲突，medium=重要推进，low=次要情节'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: '标签，如：冲突、转折、揭秘、情感高潮等'
              },
              relatedCharacters: {
                type: 'array',
                items: { type: 'string' },
                description: '相关角色名称列表'
              }
            },
            required: ['description', 'importance', 'tags', 'relatedCharacters']
          },
          description: '本章核心剧情点列表（3-5个关键点）'
        },
        characterStates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识符' },
              characterName: { type: 'string', description: '角色名称' },
              stateDescription: { type: 'string', description: '角色当前状态的综合描述' },
              emotionalState: { type: 'string', description: '情绪状态（可选）' },
              location: { type: 'string', description: '所在位置（可选）' },
              relationships: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    with: { type: 'string', description: '关系对象' },
                    status: { type: 'string', description: '关系状态描述' }
                  }
                },
                description: '人际关系变化（可选）'
              },
              changes: {
                type: 'array',
                items: { type: 'string' },
                description: '本章中该角色的重要变化列表'
              }
            },
            required: ['characterName', 'stateDescription', 'changes']
          },
          description: '主要角色状态列表（至少包含出场的主要角色）'
        },
        foreshadowing: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识符' },
              content: { type: 'string', description: '伏笔内容描述' },
              type: {
                type: 'string',
                enum: ['planted', 'developed', 'resolved'],
                description: 'planted=新埋下的伏笔，developed=推进中的伏笔，resolved=回收的伏笔'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: '伏笔标签，如：身世、宝物、预言等'
              },
              notes: { type: 'string', description: '补充说明（可选）' }
            },
            required: ['content', 'type', 'tags']
          },
          description: '伏笔跟踪列表（如果本章没有伏笔相关内容，可以为空数组）'
        }
      },
      required: ['thinking', 'mergeActions', 'plotSummary', 'characterStates', 'foreshadowing']
    }
  }
};

// --- 输入输出类型 ---
interface ChapterAnalysisInput {
  chapterContent: string;
  chapterTitle: string;
  existingAnalysis?: ChapterAnalysis;
}

interface ChapterAnalysisOutput {
  mergeActions: any[];
  plotSummary: PlotKeyPoint[];
  characterStates: CharacterState[];
  foreshadowing: ForeshadowingItem[];
}

// --- 配置 ---
const chapterAnalysisConfig: SubAgentConfig<ChapterAnalysisInput, ChapterAnalysisOutput> = {
  name: 'Chapter Analysis',
  maxLoops: 5,
  tools: [submitAnalysisTool],
  terminalToolName: 'submit_analysis',

  getSystemPrompt: (input) => `
你是一个专用的【章节结构化分析专家 (Chapter Analysis Sub-Agent)】。
你的任务是从小说章节中提取结构化信息，并与现有分析进行智能合并。

## 你的核心能力
1. **剧情提炼**：识别本章的核心剧情点、转折、冲突，判断重要性等级
2. **角色追踪**：记录主要角色的状态变化、情绪、位置、关系
3. **伏笔识别**：发现新埋下的伏笔、推进中的伏笔、回收的伏笔
4. **智能合并**：对比新旧数据，制定合并方案

## 章节信息
**章节标题**: ${input.chapterTitle}

## 章节内容
\`\`\`
${input.chapterContent}
\`\`\`

${input.existingAnalysis ? `
## 现有分析数据（必须参考）
\`\`\`
剧情关键点:
${input.existingAnalysis.plotSummary.map(p => `- [${p.id}] [${p.importance}] ${p.description}`).join('\n')}

角色状态:
${input.existingAnalysis.characterStates.map(c => `- [${c.id}] ${c.characterName}: ${c.stateDescription}`).join('\n')}

伏笔:
${input.existingAnalysis.foreshadowing.map(f => `- [${f.id}] [${f.type}] ${f.content}`).join('\n')}
\`\`\`

## 重要任务
在提交分析结果时，你必须：
1. **对比新旧数据**：识别哪些是新增、哪些是更新、哪些应该移除
2. **生成 mergeActions**：明确说明每个合并操作
3. **保留 ID**：如果是对现有数据的更新，必须保留原 ID
` : '（无现有数据，将创建新记录）'}

## 合并操作规范
- **add**: 新增内容，需要完整数据
- **update**: 更新现有内容，需要指定 ID 和新数据
- **remove**: 移除内容，需要指定 ID 和原因

## 输出要求
- **mergeActions**: 必须详细说明每个合并操作
- **最终数据**: 提供合并后的完整数据（用于替换现有数据）
- **标签使用**: 使用准确的标签帮助后续检索

现在开始分析，完成后调用 submit_analysis 工具提交结果。
`,

  getInitialMessage: (input) => `请分析上述章节内容，并制定合并策略。`,

  parseTerminalResult: (args) => {
    console.log('[ChapterAnalysisAgent] LLM 返回的完整数据:', JSON.stringify(args, null, 2));

    // Parse merge actions
    const mergeActions = (args.mergeActions || []).map((a: any) => ({
      action: a.action || 'add',
      target: a.target || 'plot',
      id: a.id,
      data: a.data,
      reason: a.reason || ''
    }));

    // Parse plot summary
    const plotSummary: PlotKeyPoint[] = (args.plotSummary || []).map((p: any, idx: number) => ({
      id: p.id || `plot-${Date.now()}-${idx}`,
      description: p.description || '',
      importance: p.importance || 'medium',
      tags: p.tags || [],
      relatedCharacters: p.relatedCharacters || []
    }));

    // Parse character states
    const characterStates: CharacterState[] = (args.characterStates || []).map((c: any, idx: number) => ({
      id: c.id || `char-${Date.now()}-${idx}`,
      characterName: c.characterName || '',
      stateDescription: c.stateDescription || '',
      emotionalState: c.emotionalState,
      location: c.location,
      relationships: c.relationships || [],
      changes: c.changes || []
    }));

    // Parse foreshadowing
    const foreshadowing: ForeshadowingItem[] = (args.foreshadowing || []).map((f: any, idx: number) => ({
      id: f.id || `foreshadow-${Date.now()}-${idx}`,
      content: f.content || '',
      type: f.type || 'planted',
      tags: f.tags || [],
      relatedChapters: [],
      notes: f.notes
    }));

    console.log('[ChapterAnalysisAgent] 解析后的数据:', {
      mergeActionsCount: mergeActions.length,
      plotSummaryCount: plotSummary.length,
      characterStatesCount: characterStates.length,
      foreshadowingCount: foreshadowing.length
    });

    return {
      mergeActions,
      plotSummary,
      characterStates,
      foreshadowing
    };
  },

  handleTextResponse: (text, loopCount) => {
    return '请立即调用 submit_analysis 工具提交你的分析结果，不要只输出文字。';
  }
};

// --- 导出函数（保持向后兼容） ---
export async function runChapterAnalysisAgent(
  aiService: AIService,
  chapterContent: string,
  chapterTitle: string,
  existingAnalysis?: ChapterAnalysis,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<ChapterAnalysisOutput> {
  const agent = new BaseSubAgent(chapterAnalysisConfig);
  return agent.run(
    aiService,
    { chapterContent, chapterTitle, existingAnalysis },
    undefined,
    onLog,
    signal
  );
}

// 导出配置（用于测试或自定义）
export { chapterAnalysisConfig };
