import { AIService } from '../geminiService';
import {
  ChapterAnalysis,
  PlotKeyPoint,
  CharacterState,
  ChapterCharacterState,
  ChapterPlotKeyPoint,
  ForeshadowingItem,
  ProjectMeta
} from '../../types';
import { ToolDefinition } from '../agent/types';
import { BaseSubAgent, SubAgentConfig } from './BaseSubAgent';
import { buildProjectOverviewPrompt } from '../../utils/projectContext';
import { formatCharacterListForPrompt } from '../../utils/characterUtils';

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
                description: '伏笔内容的简洁描述（30字以内）。必须精炼概括伏笔核心。示例："苏清月捡到神秘玉佩，暗藏家族秘密" 或 "梦境预言：不要相信身边最亲近的人"'
              },
              type: {
                type: 'string',
                enum: ['planted', 'developed', 'resolved'],
                description: '伏笔类型：planted=新埋下（本章首次出现的线索、暗示、未解释的细节），developed=推进中（之前埋下的伏笔本章有新进展、新信息），resolved=已回收（本章揭晓答案、谜底揭开、预言成真）'
              },
              duration: {
                type: 'string',
                enum: ['short_term', 'mid_term', 'long_term'],
                description: '伏笔时长类型：short_term=短期伏笔（预计1-5章内回收），mid_term=中期伏笔（预计10-20章回收），long_term=长期伏笔（预计100章以上回收，如身世之谜、世界观秘密）'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: '伏笔标签（至少1个）。常见类型：["身世"]、["物品/宝物"]、["能力/力量"]、["关系/恩怨"]、["事件/阴谋"]、["预言/梦境"]、["感情线"]、["反转铺垫"]等'
              },
              notes: {
                type: 'string',
                description: '补充说明（可选）。如：预计回收时间、与其他伏笔的关联、重要性评估等。示例："预计在第10章回收"、"与第3章的梦境伏笔呼应"、"这是全文最重要的身世伏笔"'
              }
            },
            required: ['content', 'type', 'duration', 'tags']
          },
          description: '伏笔跟踪列表。仔细识别：1) 角色提到但未出场的人物 2) 神秘物品/未解释的现象 3) 反常行为/未说明的动机 4) 预言/梦境/暗示 5) 刻意强调的细节。如果本章确实没有伏笔，可以为空数组。content必须30字以内！'
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
  chapterRef: string;  // 章节路径（如 "01_正文/第1章.md"）
  existingData?: {
    characterStates: ChapterCharacterState[];
    plotKeyPoints: ChapterPlotKeyPoint[];
  };
  project?: ProjectMeta;
  unresolvedForeshadowing?: ForeshadowingItem[]; // 未完结的伏笔列表
  characterList?: string[]; // 项目中的正式角色列表（用于约束角色提取）
}

interface ChapterAnalysisOutput {
  mergeActions: any[];
  plotKeyPoints: ChapterPlotKeyPoint[];
  characterStates: ChapterCharacterState[];
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

${input.characterList && input.characterList.length > 0 ? `
## ⚠️ 角色提取约束（CRITICAL）
**只允许提取以下列表中的角色，禁止提取其他任何角色！**

### 允许提取的角色列表（共 ${input.characterList.length} 个）
${formatCharacterListForPrompt(input.characterList)}

### 🚨 严禁提取的角色类型
以下类型的"角色"**绝对不能**出现在 characterStates 中：
- **泛指群体**：如"流氓们"、"路人"、"年轻女孩"、"村民们"、"士兵们"等
- **描述性称呼**：如"神秘人"、"老者"、"年轻女子"、"黑衣人"等
- **一次性龙套**：只在一个场景出现、没有后续剧情意义的角色
- **未在上述列表中的任何角色**

如果章节中出现了不在列表中的角色，**直接忽略**，不要提取其状态。
` : '（未提供角色列表，请谨慎提取主要角色）'}

${input.existingData ? `
## 当前章节已有数据（${input.chapterRef}）
\`\`\`
剧情关键点:
${input.existingData.plotKeyPoints.map(p => `- [${p.id}] [${p.importance}] ${p.description}`).join('\n')}

角色状态:
${input.existingData.characterStates.map(c => `- [${c.id}] ${c.characterName}: ${c.stateDescription}`).join('\n')}
\`\`\`

## 重要任务
在提交分析结果时，你必须：
1. **对比新旧数据**：识别哪些是新增、哪些是更新、哪些应该移除
2. **生成 mergeActions**：明确说明每个合并操作
3. **保留 ID**：如果是对现有数据的更新，必须保留原 ID
` : '（当前章节无现有数据，将创建新记录）'}

${input.unresolvedForeshadowing && input.unresolvedForeshadowing.length > 0 ? `
## ⚠️ 待回收/推进的伏笔（重要参考）
以下是项目中尚未完结的伏笔，请仔细阅读本章内容，判断是否有相关进展：

\`\`\`
${input.unresolvedForeshadowing.map(f => `- [${f.id}] [${f.type}] ${f.content}${f.notes ? ` (备注: ${f.notes})` : ''}`).join('\n')}
\`\`\`

**处理规则**：
- 如果本章中有某个伏笔的新进展，应该将其 type 更新为 \`developed\`，并更新内容
- 如果本章揭晓了某个伏笔的答案，应该将其 type 更新为 \`resolved\`
- 更新伏笔时，**必须保留原 ID**，在 mergeActions 中使用 \`update\` 操作
` : ''}

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
- **content长度**：每个**30字以内**（关键！必须简洁）
- **duration**：必须选择时长类型
  - short_term: 短期伏笔（1-5章内回收），如对话暗示、场景细节、角色小秘密
  - mid_term: 中期伏笔（10-20章回收），如支线剧情、角色关系转变、物品用途
  - long_term: 长期伏笔（100章以上回收），如身世之谜、世界观秘密、终极目标
- **tags数量**：至少1个

#### 什么是伏笔？
伏笔是作者在前文中埋下的线索、暗示或铺垫，为后续情节发展做准备。好的伏笔识别需要：
1. **敏锐的观察力**：注意看似不经意的细节、对话、描写
2. **前后关联**：思考这个细节可能在后续如何展开
3. **类型判断**：区分是新埋下、正在推进、还是已经回收

#### 伏笔的三种类型
**planted（新埋下）**：本章首次出现的线索
- 角色提到某个未出场的人物
- 出现神秘物品但未说明用途
- 角色做出反常行为但未解释原因
- 提及未来的事件或计划
- 环境中的异常细节

**developed（推进中）**：之前埋下的伏笔，本章有新进展
- 再次提到之前出现的线索
- 线索有了新的信息补充
- 角色对之前的疑问有了新的认识
- 伏笔的影响开始显现

**resolved（已回收）**：本章揭晓答案，谜底揭开
- 之前的疑问得到解答
- 神秘事物的真相大白
- 角色的真实身份/动机暴露
- 预言/暗示成为现实

#### 常见伏笔类型（参考）
1. **身世伏笔**：角色的真实身份、家族秘密、血缘关系
2. **物品伏笔**：神秘宝物、关键道具、信物
3. **能力伏笔**：隐藏的技能、未觉醒的力量、特殊体质
4. **关系伏笔**：人物间的隐藏关系、过往恩怨
5. **事件伏笔**：即将发生的重大事件、阴谋计划
6. **预言伏笔**：预言、梦境、占卜的暗示
7. **情感伏笔**：感情线的铺垫、情愫萌芽
8. **反转伏笔**：为后续剧情反转埋下的误导性线索

#### 识别伏笔的关键问题
在阅读章节时，问自己：
- 这个细节为什么要写？是否有深层含义？
- 角色的这句话/行为是否暗示了什么？
- 这个未解释的现象后续会如何展开？
- 作者是否在刻意强调某个看似不重要的信息？
- 这个线索与之前的哪些内容有关联？

#### 示例对比

**❌ 错误示例（太简单）**
{
  "content": "提到了酒会",
  "type": "planted",
  "duration": "mid_term",
  "tags": ["酒会"]
}

**❌ 错误示例（太长，超过30字）**
{
  "content": "苏清月提到了一个神秘的商业酒会，暗示她将在那里遇到一个改变命运的人。这个人很可能就是男主顾明远，为后续的相遇埋下伏笔。酒会的时间地点都很模糊，增加了悬念感。",
  "type": "planted"
}

**✅ 正确示例（简洁精准，30字以内）**
{
  "content": "神秘酒会邀请：将在那里遇到改变命运的人",
  "type": "planted",
  "duration": "short_term",
  "tags": ["感情线", "命运转折"],
  "notes": "预计第5章回收，可能是男主初遇"
}

**✅ 推进中的伏笔示例**
{
  "content": "梦境预言：不要相信身边最亲近的人",
  "type": "developed",
  "duration": "mid_term",
  "tags": ["预言", "背叛"],
  "notes": "与第3章梦境呼应，暗示闺蜜是背叛者"
}

**✅ 已回收的伏笔示例**
{
  "content": "神秘人身份揭晓：竟是女主亲生父亲",
  "type": "resolved",
  "duration": "long_term",
  "tags": ["身世", "真相揭晓"],
  "notes": "回收了第1章和第5章的伏笔"
}

#### 注意事项
- 不是所有章节都有伏笔，如果确实没有，可以返回空数组
- 不要把普通的剧情发展误认为伏笔
- 伏笔必须是"埋下线索"而不是"直接说明"
- 同一个伏笔可能跨越多个章节，要追踪其发展状态


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

  parseTerminalResult: (args, input) => {
    console.log('[ChapterAnalysisAgent] LLM 返回的完整数据:', JSON.stringify(args, null, 2));

    const chapterRef = input.chapterRef;

    // Parse merge actions
    const mergeActions = (args.mergeActions || []).map((a: any) => ({
      action: a.action || 'add',
      target: a.target || 'plot',
      id: a.id,
      data: a.data,
      reason: a.reason || ''
    }));

    // Parse plot key points - 新格式，包含 chapterRef
    const plotKeyPoints: ChapterPlotKeyPoint[] = (args.plotSummary || []).map((p: any, idx: number) => ({
      id: p.id || `plot-${Date.now()}-${idx}`,
      chapterRef,  // 填充章节引用
      description: p.description || '',
      importance: p.importance || 'medium',
      tags: p.tags || [],
      relatedCharacters: p.relatedCharacters || [],
      createdAt: Date.now()
    }));

    // Parse character states - 新格式，包含 chapterRef
    const characterStates: ChapterCharacterState[] = (args.characterStates || []).map((c: any, idx: number) => ({
      id: c.id || `char-${Date.now()}-${idx}`,
      characterName: c.characterName || '',
      chapterRef,  // 填充章节引用
      stateDescription: c.stateDescription || '',
      emotionalState: c.emotionalState,
      location: c.location,
      relationships: c.relationships || [],
      changes: c.changes || [],
      createdAt: Date.now()
    }));

    // Parse foreshadowing - 填充 sourceRef
    const foreshadowing: ForeshadowingItem[] = (args.foreshadowing || []).map((f: any, idx: number) => ({
      id: f.id || `foreshadow-${Date.now()}-${idx}`,
      content: f.content || '',
      type: f.type || 'planted',
      duration: f.duration || 'mid_term',
      tags: f.tags || [],
      source: 'chapter_analysis' as const,
      sourceRef: chapterRef,  // 填充章节引用
      developedRefs: [],
      resolvedRef: undefined,
      notes: f.notes
    }));

    console.log('[ChapterAnalysisAgent] 解析后的数据:', {
      chapterRef,
      mergeActionsCount: mergeActions.length,
      plotKeyPointsCount: plotKeyPoints.length,
      characterStatesCount: characterStates.length,
      foreshadowingCount: foreshadowing.length
    });

    return {
      mergeActions,
      plotKeyPoints,
      characterStates,
      foreshadowing
    };
  },

  handleTextResponse: (text, loopCount) => {
    return '请立即调用 submit_analysis 工具提交你的分析结果，不要只输出文字。';
  }
};

// --- 角色登场检测工具定义 ---
const detectCharactersTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_detected_characters',
    description: '提交检测到的登场角色列表。[TERMINAL TOOL]',
    parameters: {
      type: 'object',
      properties: {
        characters: {
          type: 'array',
          items: { type: 'string' },
          description: '本章登场的主要角色名称列表（只包含有对话或重要行动的角色）'
        }
      },
      required: ['characters']
    }
  }
};

/**
 * 使用轻量模型检测章节中登场的角色
 * @param aiService AI 服务实例
 * @param chapterContent 章节内容
 * @param characterList 项目中的角色列表（带角色卡的角色名）
 * @param signal 中断信号
 * @returns 登场角色名称列表
 */
export async function detectCharactersInChapter(
  aiService: AIService,
  chapterContent: string,
  characterList: string[],
  signal?: AbortSignal
): Promise<string[]> {
  const lightweightModel = (aiService as any).config?.lightweightModelName;
  const systemPrompt = `你是一个【角色登场检测专家】。
你的任务是从章节内容中识别哪些角色登场了。

## 角色列表（只有这些角色需要检测）
${characterList.map(name => `- ${name}`).join('\n')}

## 检测规则
1. 只有在角色列表中的角色才需要检测
2. 角色必须有**对话**或**重要行动**才算登场
3. 仅被提及但没有实际出场的角色不算登场
4. 只返回确实登场的角色名称

## 输出格式
调用 submit_detected_characters 工具，传入登场角色列表。`;

  const history: any[] = [];
  const message = `## 章节内容
\`\`\`
${chapterContent.slice(0, 15000)} // 限制长度避免超出上下文
\`\`\`

请检测上述章节中登场的角色，调用工具提交结果。`;

  try {
    const response = await aiService.sendMessage(
      history,
      message,
      systemPrompt,
      [detectCharactersTool],
      signal,
      'submit_detected_characters', // 强制调用工具
      1000, // 限制输出长度
      0.3,  // 低温度
      lightweightModel // 使用轻量模型
    );

    // 解析工具调用结果
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      if (toolCall.function?.name === 'submit_detected_characters') {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        return args.characters || [];
      }
    }

    console.warn('[detectCharactersInChapter] 未收到工具调用，返回空列表');
    return [];
  } catch (error) {
    console.error('[detectCharactersInChapter] 检测失败:', error);
    // 失败时返回全部角色列表作为降级处理
    return characterList;
  }
}

// --- 单角色状态提取配置 ---
interface SingleCharacterInput {
  chapterContent: string;
  chapterTitle: string;
  project?: ProjectMeta;
}

const createSingleCharacterConfig = (characterName: string): SubAgentConfig<SingleCharacterInput, CharacterState> => {
  const singleCharacterTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'submit_character_state',
      description: '提交单个角色的状态提取结果。[TERMINAL TOOL]',
      parameters: {
        type: 'object',
        properties: {
          characterName: { type: 'string', description: '角色名称' },
          stateDescription: {
            type: 'string',
            description: '角色当前状态的综合描述（至少30字）'
          },
          emotionalState: { type: 'string', description: '情绪状态' },
          location: { type: 'string', description: '所在位置' },
          relationships: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                with: { type: 'string', description: '关系对象' },
                status: { type: 'string', description: '关系状态描述' }
              },
              required: ['with', 'status']
            },
            description: '人际关系变化'
          },
          changes: {
            type: 'array',
            items: { type: 'string' },
            description: '本章中该角色的重要变化列表（至少1个）'
          }
        },
        required: ['characterName', 'stateDescription', 'changes']
      }
    }
  };

  return {
    name: `Character State: ${characterName}`,
    maxLoops: 3,
    tools: [singleCharacterTool],
    terminalToolName: 'submit_character_state',

    getSystemPrompt: (input: SingleCharacterInput) => {
      const projectOverview = buildProjectOverviewPrompt(input.project);
      return `${projectOverview}

你是一个【角色状态提取专家】。
你的任务是从章节中提取**单个角色**的状态变化。

## 目标角色
**${characterName}**

## 提取规则
1. 只提取 ${characterName} 的状态，忽略其他角色
2. **覆盖型字段**只提取最终状态，不要包含演变过程
   - ❌ 错误: "A地 -> B地 -> C地"
   - ✅ 正确: "C地"
3. 变化列表记录本章发生的重要变化

## 章节信息
**章节标题**: ${input.chapterTitle}

## 章节内容
\`\`\`
${input.chapterContent}
\`\`\`

请提取 ${characterName} 的状态，调用 submit_character_state 工具提交结果。`;
    },

    getInitialMessage: () => `请提取 ${characterName} 在本章的状态变化。`,

    parseTerminalResult: (args): CharacterState => ({
      id: `char-${Date.now()}`,
      characterName: args.characterName || characterName,
      stateDescription: args.stateDescription || '',
      emotionalState: args.emotionalState,
      location: args.location,
      relationships: args.relationships || [],
      changes: args.changes || []
    }),

    handleTextResponse: () => '请立即调用 submit_character_state 工具提交结果。'
  };
};

/**
 * 提取单个角色的状态
 */
export async function extractSingleCharacterState(
  aiService: AIService,
  characterName: string,
  chapterContent: string,
  chapterTitle: string,
  project?: ProjectMeta,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<CharacterState | null> {
  try {
    const config = createSingleCharacterConfig(characterName);
    const agent = new BaseSubAgent(config);
    const result = await agent.run(
      aiService,
      { chapterContent, chapterTitle, project },
      undefined,
      onLog,
      signal
    );
    return result;
  } catch (error) {
    console.error(`[extractSingleCharacterState] 提取 ${characterName} 失败:`, error);
    return null;
  }
}

// --- 导出函数（保持向后兼容） ---

/**
 * 分步执行章节分析（推荐）
 * 1. 使用轻量模型检测登场角色
 * 2. 对每个角色单独提取状态
 * 3. 提取剧情点和伏笔
 */
export async function runChapterAnalysisAgentWithSteps(
  aiService: AIService,
  chapterContent: string,
  chapterTitle: string,
  characterList: string[],
  existingAnalysis?: ChapterAnalysis,
  project?: ProjectMeta,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<ChapterAnalysisOutput> {
  onLog?.('[Step 1] 检测登场角色...');

  // Step 1: 检测登场角色
  const detectedCharacters = await detectCharactersInChapter(
    aiService,
    chapterContent,
    characterList,
    signal
  );

  onLog?.(`[Step 1] 检测到 ${detectedCharacters.length} 个角色: ${detectedCharacters.join(', ')}`);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Step 2: 对每个角色单独提取状态（串行，避免并发压力）
  onLog?.('[Step 2] 提取角色状态...');

  const characterStates: (CharacterState | ChapterCharacterState)[] = [];
  for (const name of detectedCharacters) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    onLog?.(`[Step 2] 正在提取: ${name}`);
    const result = await extractSingleCharacterState(
      aiService,
      name,
      chapterContent,
      chapterTitle,
      project,
      onLog,
      signal
    );
    if (result) {
      characterStates.push(result);
    }
  }

  onLog?.(`[Step 2] 成功提取 ${characterStates.length} 个角色状态`);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Step 3: 提取剧情点和伏笔（使用原有逻辑，但跳过角色状态）
  onLog?.('[Step 3] 提取剧情点和伏笔...');

  const agent = new BaseSubAgent(chapterAnalysisConfig);

  // 修改输入，告知已经提取了哪些角色
  const modifiedInput = {
    chapterContent,
    chapterTitle,
    existingAnalysis: existingAnalysis ? {
      ...existingAnalysis,
      characterStates: [] // 清空，让 agent 只提取剧情和伏笔
    } : undefined,
    project,
    preExtractedCharacters: characterStates // 传入已提取的角色状态
  };

  // 使用修改后的 prompt
  const originalGetSystemPrompt = chapterAnalysisConfig.getSystemPrompt;
  const modifiedConfig: SubAgentConfig<any, ChapterAnalysisOutput> = {
    ...chapterAnalysisConfig,
    getSystemPrompt: (input: any) => {
      const basePrompt = originalGetSystemPrompt(input);
      const preExtractedInfo = input.preExtractedCharacters?.length > 0
        ? `\n## 已提取的角色状态（无需重复提取）\n${input.preExtractedCharacters.map((c: CharacterState) =>
            `- ${c.characterName}: ${c.stateDescription}`
          ).join('\n')}`
        : '';
      return basePrompt + preExtractedInfo;
    }
  };

  const modifiedAgent = new BaseSubAgent(modifiedConfig);
  const result = await modifiedAgent.run(
    aiService,
    modifiedInput,
    undefined,
    onLog,
    signal
  );

  // 合并预提取的角色状态
  // 注意：这是一个兼容旧逻辑的函数，characterStates 包含旧类型的 CharacterState
  return {
    ...result,
    characterStates: [...characterStates, ...result.characterStates.filter(
      c => !characterStates.some(pc => pc.characterName === c.characterName)
    )] as ChapterCharacterState[]
  };
}

export async function runChapterAnalysisAgent(
  aiService: AIService,
  chapterContent: string,
  chapterTitle: string,
  chapterRef: string,
  existingData?: {
    characterStates: ChapterCharacterState[];
    plotKeyPoints: ChapterPlotKeyPoint[];
  },
  project?: ProjectMeta,
  unresolvedForeshadowing?: ForeshadowingItem[],
  characterList?: string[],  // 添加角色列表参数
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<ChapterAnalysisOutput> {
  const agent = new BaseSubAgent(chapterAnalysisConfig);
  return agent.run(
    aiService,
    { chapterContent, chapterTitle, chapterRef, existingData, project, unresolvedForeshadowing, characterList },
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
          duration: action.data?.duration || 'mid_term',
          tags: action.data?.tags || [],
          source: 'chapter_analysis',  // 标记来源为章节分析
          sourceRef: chapterPath,
          developedRefs: [],
          resolvedRef: undefined,
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

  // If no merge actions OR merge actions don't have data, use new data directly
  const hasFullMergeData = newAnalysis.mergeActions.every(
    action => action.action === 'skip' || (action.data && Object.keys(action.data).length > 0)
  );

  if (newAnalysis.mergeActions.length === 0 || !hasFullMergeData) {
    // mergeActions 只是策略指示，实际数据在 plotSummary/characterStates/foreshadowing 中
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
