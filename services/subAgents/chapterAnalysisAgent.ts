import { AIService } from '../geminiService';
import { ChapterAnalysis, PlotKeyPoint, CharacterState, ForeshadowingItem } from '../../types';
import { ToolDefinition } from '../agent/types';

// --- Sub-Agent 专用工具：提交分析结果 ---
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
        // 合并操作说明
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

const ANALYSIS_AGENT_TOOLS = [submitAnalysisTool];

// --- System Prompt ---
const getSystemPrompt = (
  chapterContent: string,
  chapterTitle: string,
  existingAnalysis?: ChapterAnalysis
) => `
你是一个专用的【章节结构化分析专家 (Chapter Analysis Sub-Agent)】。
你的任务是从小说章节中提取结构化信息，并与现有分析进行智能合并。

## 你的核心能力
1. **剧情提炼**：识别本章的核心剧情点、转折、冲突，判断重要性等级
2. **角色追踪**：记录主要角色的状态变化、情绪、位置、关系
3. **伏笔识别**：发现新埋下的伏笔、推进中的伏笔、回收的伏笔
4. **智能合并**：对比新旧数据，制定合并方案

## 章节信息
**章节标题**: ${chapterTitle}

## 章节内容
\`\`\`
${chapterContent}
\`\`\`

${existingAnalysis ? `
## 现有分析数据（必须参考）
\`\`\`
剧情关键点:
${existingAnalysis.plotSummary.map(p => `- [${p.id}] [${p.importance}] ${p.description}`).join('\n')}

角色状态:
${existingAnalysis.characterStates.map(c => `- [${c.id}] ${c.characterName}: ${c.stateDescription}`).join('\n')}

伏笔:
${existingAnalysis.foreshadowing.map(f => `- [${f.id}] [${f.type}] ${f.content}`).join('\n')}
\`\*\`

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
`;

interface MergeAction {
  action: 'add' | 'update' | 'remove';
  target: 'plot' | 'character' | 'foreshadowing';
  id?: string;
  data?: any;
  reason: string;
}

// --- Core Loop ---

export async function runChapterAnalysisAgent(
  aiService: AIService,
  chapterContent: string,
  chapterTitle: string,
  existingAnalysis?: ChapterAnalysis,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<{
  mergeActions: MergeAction[];
  plotSummary: PlotKeyPoint[];
  characterStates: CharacterState[];
  foreshadowing: ForeshadowingItem[];
}> {

  const history: any[] = [];
  const MAX_LOOPS = 5;
  let loopCount = 0;

  const systemPrompt = getSystemPrompt(chapterContent, chapterTitle, existingAnalysis);

  history.push({
    role: 'user',
    parts: [{ text: `请分析上述章节内容，并制定合并策略。` }]
  });

  if (onLog) onLog(`📖 [Chapter Analysis] 开始分析章节: "${chapterTitle}"`);

  while (loopCount < MAX_LOOPS) {
    if (signal?.aborted) {
      throw new Error("Chapter Analysis Agent Aborted");
    }

    loopCount++;

    const response = await aiService.sendMessage(
      history,
      '',
      systemPrompt,
      ANALYSIS_AGENT_TOOLS,
      signal
    );

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("Chapter Analysis Agent 无响应");
    }

    const content = candidates[0].content;
    const parts = content.parts;

    // Log thinking
    const textPart = parts.find((p: any) => p.text);
    if (textPart && onLog) {
      onLog(`📖 [Analysis 思考]: ${textPart.text.substring(0, 80)}...`);
    }

    history.push({ role: 'model', parts });

    // Handle tools
    const toolParts = parts.filter((p: any) => p.functionCall);

    if (toolParts.length > 0) {
      for (const part of toolParts) {
        if (signal?.aborted) throw new Error("Chapter Analysis Agent Aborted");

        const { name, args } = part.functionCall;

        // Log thinking
        if (args.thinking && onLog) {
          onLog(`🤔 [分析思考]: ${args.thinking}`);
        }

        // Log merge actions
        if (args.mergeActions && onLog) {
          const actions = args.mergeActions as MergeAction[];
          actions.forEach((action, idx) => {
            onLog(`🔄 [合并操作 ${idx + 1}]: ${action.action} ${action.target} - ${action.reason}`);
          });
        }

        if (name === 'submit_analysis') {
          if (onLog) onLog(`✅ [Chapter Analysis] 分析完成`);

          // Parse merge actions
          const mergeActions: MergeAction[] = (args.mergeActions || []).map((a: any) => ({
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

          return {
            mergeActions,
            plotSummary,
            characterStates,
            foreshadowing
          };
        }
      }
    } else {
      if (!textPart) {
        throw new Error("Chapter Analysis Agent 异常：未提交分析结果");
      }
    }
  }

  throw new Error("Chapter Analysis Agent 超时：达到最大循环次数");
}

// --- Apply Merge Actions ---

export function applyMergeActions(
  existingAnalysis: ChapterAnalysis | undefined,
  newAnalysis: {
    mergeActions: MergeAction[];
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
        // Generate new ID
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
            id: action.id // Keep original ID
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
