import { AIService } from '../geminiService';
import { ChapterAnalysis, PlotKeyPoint, CharacterState, ForeshadowingItem } from '../../types';
import { ToolDefinition } from '../agent/types';

// --- Sub-Agent 工具：提交合并计划 ---
const submitMergePlanTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_merge_plan',
    description: '当你完成分析后，调用此工具提交合并计划。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '【必须使用中文】你的思考过程：为什么做出这样的合并决策？'
        },
        action: {
          type: 'string',
          enum: ['replace', 'merge', 'skip'],
          description: '合并动作：replace=完全替换旧数据，merge=智能合并（新增/更新/删除），skip=跳过不处理'
        },
        updatedAnalysis: {
          type: 'object',
          properties: {
            plotSummary: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  description: { type: 'string' },
                  importance: { type: 'string', enum: ['high', 'medium', 'low'] },
                  tags: { type: 'array', items: { type: 'string' } },
                  relatedCharacters: { type: 'array', items: { type: 'string' } }
                },
                required: ['description', 'importance', 'tags', 'relatedCharacters']
              }
            },
            characterStates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  characterName: { type: 'string' },
                  stateDescription: { type: 'string' },
                  emotionalState: { type: 'string' },
                  location: { type: 'string' },
                  changes: { type: 'array', items: { type: 'string' } }
                },
                required: ['characterName', 'stateDescription', 'changes']
              }
            },
            foreshadowing: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string' },
                  type: { type: 'string', enum: ['planted', 'developed', 'resolved'] },
                  tags: { type: 'array', items: { type: 'string' } },
                  notes: { type: 'string' }
                },
                required: ['content', 'type', 'tags']
              }
            }
          },
          description: '最终合并后的分析数据'
        }
      },
      required: ['thinking', 'action', 'updatedAnalysis']
    }
  }
};

const MERGE_AGENT_TOOLS = [submitMergePlanTool];

// --- System Prompt for Merge Agent ---
const getMergeSystemPrompt = (
  newAnalysis: { plotSummary: PlotKeyPoint[]; characterStates: CharacterState[]; foreshadowing: ForeshadowingItem[] },
  existingAnalysis?: ChapterAnalysis,
  chapterTitle?: string
) => `
你是一个【章节分析智能合并专家】。

你的任务是比较新旧分析数据，制定最佳的合并策略。

## 当前章节
**章节标题**: ${chapterTitle || '未知'}

## 新提取的分析数据
\`\`\`
剧情关键点:
${newAnalysis.plotSummary.map(p => `- [${p.importance}] ${p.description}`).join('\n')}

角色状态:
${newAnalysis.characterStates.map(c => `- ${c.characterName}: ${c.stateDescription}`).join('\n')}

伏笔:
${newAnalysis.foreshadowing.map(f => `- [${f.type}] ${f.content}`).join('\n')}
\`\`\`

## 现有分析数据（如果存在）
${existingAnalysis ? `
\`\`\`
剧情关键点:
${existingAnalysis.plotSummary.map(p => `- [${p.importance}] ${p.description}`).join('\n')}

角色状态:
${existingAnalysis.characterStates.map(c => `- ${c.characterName}: ${c.stateDescription}`).join('\n')}

伏笔:
${existingAnalysis.foreshadowing.map(f => `- [${f.type}] ${f.content}`).join('\n')}
\`\*\`
` : '（无现有数据，将创建新记录）'}

## 你的任务
1. 仔细对比新旧数据
2. 分析哪些内容是：
   - **新增的**：新章节引入的新角色、新伏笔、新剧情点
   - **更新的**：同一角色/伏笔的状态变化
   - **过时的**：已不再适用的旧信息
3. 制定合并策略：
   - **replace（替换）**：完全替换，适用于章节内容大幅修改的情况
   - **merge（合并）**：智能合并，保留有价值的旧数据，更新变化的内容
   - **skip（跳过）**：新旧数据基本相同，无需处理
4. 输出最终的合并结果

## 重要提示
- **角色状态变化**：如果同一角色在新旧数据中都有记录，应该保留并更新状态描述
- **伏笔状态变化**：注意伏笔类型的变化（如从 planted 变为 developed 或 resolved）
- **保留关键信息**：即使是过时的信息，只要有用就保留，只删除明显错误或过时的内容

现在开始分析并制定合并计划，完成后调用 submit_merge_plan 工具。
`;

// --- Merge Agent ---

export async function runMergeAgent(
  aiService: AIService,
  newAnalysis: { plotSummary: PlotKeyPoint[]; characterStates: CharacterState[]; foreshadowing: ForeshadowingItem[] },
  existingAnalysis?: ChapterAnalysis,
  chapterTitle?: string,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<{
  action: 'replace' | 'merge' | 'skip';
  updatedAnalysis: ChapterAnalysis;
}> {
  const history: any[] = [];
  const MAX_LOOPS = 3;

  const systemPrompt = getMergeSystemPrompt(newAnalysis, existingAnalysis, chapterTitle);

  history.push({
    role: 'user',
    parts: [{ text: '请分析新旧数据，制定合并策略。' }]
  });

  if (onLog) onLog('🔄 [Merge Agent] 开始分析合并策略...');

  for (let loopCount = 0; loopCount < MAX_LOOPS; loopCount++) {
    if (signal?.aborted) {
      throw new Error('Merge Agent Aborted');
    }

    const response = await aiService.sendMessage(
      history,
      '',
      systemPrompt,
      MERGE_AGENT_TOOLS,
      signal
    );

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Merge Agent 无响应');
    }

    const content = candidates[0].content;
    const parts = content.parts;

    // Log thinking
    const textPart = parts.find((p: any) => p.text);
    if (textPart && onLog) {
      onLog(`🔄 [Merge 思考]: ${textPart.text.substring(0, 100)}...`);
    }

    history.push({ role: 'model', parts });

    // Handle tools
    const toolParts = parts.filter((p: any) => p.functionCall);

    if (toolParts.length > 0) {
      for (const part of toolParts) {
        const { name, args } = part.functionCall;

        if (args.thinking && onLog) {
          onLog(`🤔 [Merge 决策]: ${args.thinking}`);
        }

        if (name === 'submit_merge_plan') {
          const action = args.action || 'merge';
          const updated = args.updatedAnalysis || {};

          // 构建完整的 ChapterAnalysis
          const now = Date.now();

          const result: ChapterAnalysis = {
            id: existingAnalysis?.id || `analysis-${now}`,
            chapterPath: existingAnalysis?.chapterPath || '',
            chapterTitle: chapterTitle || '未命名',
            sessionId: existingAnalysis?.sessionId || 'merged',
            projectId: existingAnalysis?.projectId || '',
            plotSummary: (updated.plotSummary || newAnalysis.plotSummary).map((p: any, idx: number) => ({
              id: p.id || `plot-${now}-${idx}`,
              description: p.description || '',
              importance: p.importance || 'medium',
              tags: p.tags || [],
              relatedCharacters: p.relatedCharacters || []
            })),
            characterStates: (updated.characterStates || newAnalysis.characterStates).map((c: any, idx: number) => ({
              id: c.id || `char-${now}-${idx}`,
              characterName: c.characterName || '',
              stateDescription: c.stateDescription || '',
              emotionalState: c.emotionalState,
              location: c.location,
              relationships: c.relationships || [],
              changes: c.changes || []
            })),
            foreshadowing: (updated.foreshadowing || newAnalysis.foreshadowing).map((f: any, idx: number) => ({
              id: f.id || `foreshadow-${now}-${idx}`,
              content: f.content || '',
              type: f.type || 'planted',
              tags: f.tags || [],
              relatedChapters: f.relatedChapters || [],
              notes: f.notes
            })),
            extractedAt: existingAnalysis?.extractedAt || now,
            lastModified: now,
            wordCount: existingAnalysis?.wordCount || 0
          };

          if (onLog) onLog(`✅ [Merge] 决策: ${action === 'replace' ? '完全替换' : action === 'merge' ? '智能合并' : '跳过'}`);

          return { action, updatedAnalysis: result };
        }
      }
    }
  }

  // 如果无法决策，默认使用 merge
  return {
    action: 'merge',
    updatedAnalysis: {
      id: existingAnalysis?.id || `analysis-${Date.now()}`,
      chapterPath: existingAnalysis?.chapterPath || '',
      chapterTitle: chapterTitle || '未命名',
      sessionId: existingAnalysis?.sessionId || 'merged',
      projectId: existingAnalysis?.projectId || '',
      ...newAnalysis,
      extractedAt: existingAnalysis?.extractedAt || Date.now(),
      lastModified: Date.now(),
      wordCount: existingAnalysis?.wordCount || 0
    }
  };
}
