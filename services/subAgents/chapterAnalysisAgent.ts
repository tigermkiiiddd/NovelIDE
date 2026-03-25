import { AIService } from '../geminiService';
import { ChapterAnalysis, PlotKeyPoint, CharacterState, ForeshadowingItem, ProjectMeta } from '../../types';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import { buildProjectOverviewPrompt } from '../../utils/projectContext';

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
              id: { type: 'string', description: '唯一标识符，用于追踪和更新（如果是新增则留空，系统会自动生成）' },
              description: {
                type: 'string',
                description: '剧情关键点的详细描述（必须详细，至少50字）。例如："苏清月在咖啡厅与秦雨薇见面，当面揭穿她的虚伪面目，并暗示自己已经知道前世的真相。秦雨薇表面镇定，内心慌乱，开始怀疑苏清月是否真的重生了。"'
              },
              importance: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: '重要性等级：high=核心转折/冲突（如主角重生、反派暴露），medium=重要推进（如获得关键信息），low=次要情节（如日常互动）'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: '标签列表（至少2个），如：["冲突", "揭秘"]、["转折", "情感高潮"]、["伏笔", "悬念"]等'
              },
              relatedCharacters: {
                type: 'array',
                items: { type: 'string' },
                description: '相关角色名称列表（至少1个），如：["苏清月", "秦雨薇"]'
              }
            },
            required: ['description', 'importance', 'tags', 'relatedCharacters']
          },
          description: '本章核心剧情点列表（必须3-5个关键点，每个description至少50字）'
        },
        characterStates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识符（如果是新增则留空）' },
              characterName: { type: 'string', description: '角色名称，如："苏清月"' },
              stateDescription: {
                type: 'string',
                description: '角色当前状态的综合描述（必须详细，至少30字）。例如："苏清月此时心态平静而坚定，已经完全接受了重生的事实。她对秦雨薇和林逸充满警惕，决心不再重蹈覆辙。同时，她开始尝试使用玄学能力，对未来充满期待。"'
              },
              emotionalState: { type: 'string', description: '情绪状态（可选），如："冷静而警惕"、"愤怒但克制"' },
              location: { type: 'string', description: '所在位置（可选），如："星巴克咖啡厅"、"自家公寓"' },
              relationships: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    with: { type: 'string', description: '关系对象，如："秦雨薇"' },
                    status: { type: 'string', description: '关系状态描述，如："表面闺蜜，实则敌对"' }
                  },
                  required: ['with', 'status']
                },
                description: '人际关系变化（可选），列出本章中有变化的关系'
              },
              changes: {
                type: 'array',
                items: { type: 'string' },
                description: '本章中该角色的重要变化列表（至少1个），如：["掌握了绘制符咒的能力", "决定与秦雨薇彻底决裂"]'
              }
            },
            required: ['characterName', 'stateDescription', 'changes']
          },
          description: '主要角色状态列表（至少包含本章出场的主要角色，每个stateDescription至少30字）'
        },
        foreshadowing: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识符（如果是新增则留空）' },
              content: {
                type: 'string',
                description: '伏笔内容描述（必须详细，至少30字）。例如："苏清月提到了一个神秘的商业酒会，暗示她将在那里遇到一个改变命运的人。这个人很可能就是男主顾明远，为后续的相遇埋下伏笔。"'
              },
              type: {
                type: 'string',
                enum: ['planted', 'developed', 'resolved'],
                description: 'planted=新埋下的伏笔（本章首次出现），developed=推进中的伏笔（之前埋下，本章有进展），resolved=回收的伏笔（本章揭晓答案）'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: '伏笔标签（至少1个），如：["身世"]、["宝物", "玄学"]、["预言"]、["感情线"]等'
              },
              notes: { type: 'string', description: '补充说明（可选），如："这个伏笔将在第10章回收"' }
            },
            required: ['content', 'type', 'tags']
          },
          description: '伏笔跟踪列表（如果本章有伏笔则必须填写，每个content至少30字；如果确实没有伏笔可以为空数组）'
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
  project?: ProjectMeta;
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

  getSystemPrompt: (input) => {
    const projectOverview = buildProjectOverviewPrompt(input.project);
    return `${projectOverview}

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

## 🚨 输出质量要求（CRITICAL）

### 1. 剧情关键点（plotSummary）
- **数量**：必须3-5个
- **description长度**：每个至少50字
- **示例**：
  \`\`\`json
  {
    "description": "苏清月在咖啡厅与秦雨薇见面，当面揭穿她的虚伪面目，并暗示自己已经知道前世的真相。秦雨薇表面镇定，内心慌乱，开始怀疑苏清月是否真的重生了。两人的对话充满暗流涌动，为后续的正面冲突埋下伏笔。",
    "importance": "high",
    "tags": ["冲突", "揭秘", "心理战"],
    "relatedCharacters": ["苏清月", "秦雨薇"]
  }
  \`\`\`

### 2. 角色状态（characterStates）
- **数量**：至少包含本章出场的主要角色
- **stateDescription长度**：每个至少30字
- **changes数量**：至少1个
- **示例**：
  \`\`\`json
  {
    "characterName": "苏清月",
    "stateDescription": "苏清月此时心态平静而坚定，已经完全接受了重生的事实。她对秦雨薇和林逸充满警惕，决心不再重蹈覆辙。同时，她开始尝试使用玄学能力，对未来充满期待。",
    "emotionalState": "冷静而警惕",
    "location": "星巴克咖啡厅",
    "changes": [
      "掌握了绘制符咒的能力",
      "决定与秦雨薇彻底决裂",
      "开始主动规划复仇计划"
    ]
  }
  \`\`\`

### 3. 伏笔（foreshadowing）
- **content长度**：每个至少30字
- **tags数量**：至少1个
- **示例**：
  \`\`\`json
  {
    "content": "苏清月提到了一个神秘的商业酒会，暗示她将在那里遇到一个改变命运的人。这个人很可能就是男主顾明远，为后续的相遇埋下伏笔。",
    "type": "planted",
    "tags": ["感情线", "男主登场"],
    "notes": "预计在第5章回收"
  }
  \`\`\`

## ❌ 禁止的错误输出

**错误示例1：描述过于简短**
\`\`\`json
{
  "description": "苏清月见秦雨薇",  // ❌ 太短，没有细节
  "importance": "high"
}
\`\`\`

**错误示例2：只有标题没有内容**
\`\`\`json
{
  "characterName": "苏清月",
  "stateDescription": "重生后的状态",  // ❌ 太笼统，没有具体描述
  "changes": []  // ❌ 空数组，必须至少有1个变化
}
\`\`\`

**错误示例3：伏笔描述不清**
\`\`\`json
{
  "content": "提到了酒会",  // ❌ 太简单，没有说明伏笔的意义
  "type": "planted"
}
\`\`\`

## 输出要求总结
- **mergeActions**: 必须详细说明每个合并操作
- **最终数据**: 提供合并后的完整数据（用于替换现有数据）
- **标签使用**: 使用准确的标签帮助后续检索

现在开始分析，完成后调用 submit_analysis 工具提交结果。
`;
  },

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
  project?: ProjectMeta,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<ChapterAnalysisOutput> {
  const agent = new BaseSubAgent(chapterAnalysisConfig);
  return agent.run(
    aiService,
    { chapterContent, chapterTitle, existingAnalysis, project },
    undefined,
    onLog,
    signal
  );
}

// 导出配置（用于测试或自定义）
export { chapterAnalysisConfig };

// 导出 applyMergeActions 函数（向后兼容）
export function applyMergeActions(
  existingAnalysis: ChapterAnalysis | undefined,
  newAnalysis: {
    mergeActions: any[];
    plotSummary: PlotKeyPoint[];
    characterStates: CharacterState[];
    foreshadowing: ForeshadowingItem[];
  },
  chapterTitle: string,
  chapterPath: string
): ChapterAnalysis {
  const now = Date.now();

  // Start with existing or empty
  let plotSummary = existingAnalysis ? [...existingAnalysis.plotSummary] : [];
  let characterStates = existingAnalysis ? [...existingAnalysis.characterStates] : [];
  let foreshadowing = existingAnalysis ? [...existingAnalysis.foreshadowing] : [];

  // Apply merge actions
  newAnalysis.mergeActions.forEach(action => {
    if (action.target === 'plot') {
      if (action.action === 'add') {
        const newId = `plot-${now}-${plotSummary.length}`;
        plotSummary.push({
          id: newId,
          description: action.data?.description || '',
          importance: action.data?.importance || 'medium',
          tags: action.data?.tags || [],
          relatedCharacters: action.data?.relatedCharacters || []
        });
      } else if (action.action === 'update') {
        const idx = plotSummary.findIndex(p => p.id === action.id);
        if (idx >= 0) {
          plotSummary[idx] = {
            ...plotSummary[idx],
            ...action.data,
            id: action.id
          };
        }
      } else if (action.action === 'remove') {
        plotSummary = plotSummary.filter(p => p.id !== action.id);
      }
    } else if (action.target === 'character') {
      if (action.action === 'add') {
        const newId = `char-${now}-${characterStates.length}`;
        characterStates.push({
          id: newId,
          characterName: action.data?.characterName || '',
          stateDescription: action.data?.stateDescription || '',
          emotionalState: action.data?.emotionalState,
          location: action.data?.location,
          relationships: action.data?.relationships || [],
          changes: action.data?.changes || []
        });
      } else if (action.action === 'update') {
        const idx = characterStates.findIndex(c => c.id === action.id);
        if (idx >= 0) {
          characterStates[idx] = {
            ...characterStates[idx],
            ...action.data,
            id: action.id
          };
        }
      } else if (action.action === 'remove') {
        characterStates = characterStates.filter(c => c.id !== action.id);
      }
    } else if (action.target === 'foreshadowing') {
      if (action.action === 'add') {
        const newId = `foreshadow-${now}-${foreshadowing.length}`;
        foreshadowing.push({
          id: newId,
          content: action.data?.content || '',
          type: action.data?.type || 'planted',
          tags: action.data?.tags || [],
          relatedChapters: [],
          notes: action.data?.notes
        });
      } else if (action.action === 'update') {
        const idx = foreshadowing.findIndex(f => f.id === action.id);
        if (idx >= 0) {
          foreshadowing[idx] = {
            ...foreshadowing[idx],
            ...action.data,
            id: action.id
          };
        }
      } else if (action.action === 'remove') {
        foreshadowing = foreshadowing.filter(f => f.id !== action.id);
      }
    }
  });

  // If no merge actions, use new data directly
  if (newAnalysis.mergeActions.length === 0) {
    plotSummary = newAnalysis.plotSummary;
    characterStates = newAnalysis.characterStates;
    foreshadowing = newAnalysis.foreshadowing;
  }

  return {
    id: existingAnalysis?.id || `analysis-${now}`,
    chapterPath,
    chapterTitle: chapterTitle || existingAnalysis?.chapterTitle || '未命名',
    sessionId: existingAnalysis?.sessionId || 'extracted',
    projectId: existingAnalysis?.projectId || '',
    plotSummary,
    characterStates,
    foreshadowing,
    extractedAt: existingAnalysis?.extractedAt || now,
    lastModified: now,
    wordCount: existingAnalysis?.wordCount || 0
  };
}
