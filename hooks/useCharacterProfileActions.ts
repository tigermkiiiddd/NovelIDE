/**
 * useCharacterProfileActions - 角色档案操作 hook
 *
 * 提供手动触发角色档案初始化和更新的功能
 * 初始化时使用 AI 分析角色卡，自动生成小分类
 */
import { useCallback, useState } from 'react';
import { useCharacterMemoryStore, CharacterMemoryState } from '../stores/characterMemoryStore';
import { useAgentStore } from '../stores/agentStore';
import { useProjectStore } from '../stores/projectStore';
import { CharacterCategoryName, CharacterProfileV2 } from '../types';
import { AIService } from '../services/geminiService';
import { createRoutedAIService } from '../services/modelRouter';
import { buildProjectOverviewPrompt } from '../utils/projectContext';
import { ToolDefinition } from '../services/agent/types';

interface CharacterProfileActionsResult {
  isInitializing: boolean;
  isUpdating: boolean;
  error: string | null;
  initializeFromMarkdown: (filePath: string, content: string) => Promise<boolean>;
  forceReinitialize: (filePath: string, content: string) => Promise<boolean>;
  updateFromChapter: (filePath: string, content: string, chapterRef: string) => Promise<boolean>;
  deleteProfile: (characterName: string) => void;
}

/**
 * 从文件路径提取角色名称
 * 格式: 02_角色档案/主角_张三.md -> 张三
 * 或者: 02_角色档案/林星晚.md -> 林星晚
 */
const extractCharacterNameFromPath = (filePath: string): string => {
  const fileName = filePath.split('/').pop() || '';
  // 移除扩展名
  let name = fileName.replace(/\.md$/i, '').replace(/\.txt$/i, '').trim();
  // 如果有前缀（如 "主角_"），移除前缀
  if (name.includes('_')) {
    name = name.substring(name.indexOf('_') + 1);
  }
  return name;
};

/**
 * AI 分析角色卡，生成小分类并提取初始值（使用 Tool Calling）
 */
const analyzeCharacterCardWithAI = async (
  aiService: AIService,
  characterName: string,
  content: string,
  projectOverview: string
): Promise<{
  success: boolean;
  subCategories?: Record<CharacterCategoryName, string[]>;
  initialValues?: {
    category: CharacterCategoryName;
    subCategory: string;
    value: any; // 可以是字符串或结构化对象
  }[];
  error?: string;
}> => {
  const systemPrompt = `${projectOverview}

你是一个小说角色分析专家。你的任务是分析【完整生命周期的角色设定卡】，为角色档案系统设计小分类结构，并提取【故事开始时的初始状态】。

## ⚠️ 关键概念

你拿到的是【完整生命周期的设定卡】，包含了角色在整个故事中可能发展出的所有状态、技能、经历等。

但你需要提取的是【初始状态】——即角色在**故事开始时刻**的状态。

### 举例说明

设定卡可能写着：
- "初期阶段：仅掌握基础剑法，战斗中需要灵活走位"
- "后期可领悟剑意增强威力"
- "极限状态：剑意凝聚度100%时释放毁灭性攻击"

你应该提取的初始值：
- 技能"基础剑法"：入门阶段，需要持续练习提升
- 技能"剑意爆发"：尚未掌握，需要领悟剑意后解锁
- 状态"剑意凝聚度"：0%（刚开始修炼）

**不要**把后期才有的能力当作初始状态！

## 大分类体系（7个预设，不可更改）

1. **状态**（覆盖型）：角色的当前状态，如位置、情绪、体力、当前装备、当前任务等
2. **属性**（覆盖型）：角色的固定属性，如力量、敏捷、智力、魅力、运气等
3. **目标**（覆盖型）：角色的目标，如主目标、近期目标、隐藏目标等
4. **技能**（覆盖型）：角色的技能，每个技能独立记录，如剑术、火魔法、潜行等
5. **关系**（累加型）：角色与其他角色的关系，以角色名为小分类
6. **经历**（累加型）：角色的过往经历，如身世背景、关键事件、转折点等
7. **记忆**（累加型）：角色知道的信息，如已知秘密、重要信息等

## 小分类设计原则

1. 小分类名称要简洁（2-6个汉字）
2. 小分类结构要能承载角色在整个故事中的发展变化
3. "关系"分类的小分类应该是文档中提到的其他角色名
4. "技能"分类的小分类应该是角色明确拥有的技能

## 初始值提取原则

1. **只提取故事开始时刻的状态**，不是整个故事中的所有状态
2. 如果设定卡区分了"初期/后期/极限"等阶段，只提取初期状态
3. 初始值必须来源于文档，不可臆造
4. 如果某个大分类没有相关信息，返回空数组
5. **重要**：
   - "经历"和"记忆"是故事中积累的，**初始化时 initialValues 必须返回空数组**
   - 只有"状态"、"属性"、"目标"、"技能"、"关系"这5个大分类需要提取初始值

## 各分类的值结构

### 状态（覆盖型）
简单字符串值，描述当前状态。
示例：{ "subCategory": "位置", "value": "青云宗外门弟子宿舍" }

### 属性（覆盖型）
结构化值，包含等级和描述。
示例：{ "subCategory": "力量", "value": { "level": "B", "description": "常人水平" } }

### 目标（覆盖型）
简单字符串值。
示例：{ "subCategory": "主目标", "value": "成为最强剑修" }

### 技能（覆盖型）⚠️ 重点
结构化值，必须包含三个字段：
- quality: 未掌握 / 入门 / 熟练 / 精通 / 大师
- description: 技能的描述说明
- unlockCondition: 解锁或提升条件

示例：
{ "subCategory": "基础剑法", "value": { "quality": "入门", "description": "掌握基本剑招，可进行攻防", "unlockCondition": "无需特殊条件，通过基础训练即可掌握" } }
{ "subCategory": "剑意爆发", "value": { "quality": "未掌握", "description": "释放凝聚的剑意进行强力攻击", "unlockCondition": "需要剑意凝聚度达到70%以上，配合领悟后解锁" } }

### 关系（累加型）
简单字符串值，描述当前关系状态。
示例：{ "subCategory": "林月", "value": "青梅竹马，互有好感" }`;

  const userMessage = `请分析以下【完整生命周期的角色设定卡】，设计小分类结构并提取【故事开始时的初始状态】。

角色名：${characterName}

角色设定卡内容：
---
${content}
---

⚠️ 关键提醒：
1. 设定卡包含了角色在整个故事中的发展信息，请只提取【故事开始时刻】的初始状态
2. **"经历"和"记忆"的 initialValues 必须返回空数组 []**
3. **技能的 value 必须是结构化对象**，包含 quality、description、unlockCondition 三个字段
4. **属性的 value 建议是结构化对象**，包含 level 和 description 字段`;

  // 定义工具
  const tools: ToolDefinition[] = [{
    type: 'function' as const,
    function: {
      name: 'submit_character_profile',
      description: '提交角色档案分析结果，包含小分类结构和初始值',
      parameters: {
        type: 'object',
        properties: {
          subCategories: {
            type: 'object',
            description: '每个大分类对应的小分类列表',
            properties: {
              '状态': { type: 'array', items: { type: 'string' }, description: '如：位置、情绪、体力、当前装备' },
              '属性': { type: 'array', items: { type: 'string' }, description: '如：力量、敏捷、智力、魅力' },
              '目标': { type: 'array', items: { type: 'string' }, description: '如：主目标、近期目标、隐藏目标' },
              '技能': { type: 'array', items: { type: 'string' }, description: '角色拥有或可能获得的技能名称' },
              '关系': { type: 'array', items: { type: 'string' }, description: '相关角色名称列表' },
              '经历': { type: 'array', items: { type: 'string' }, description: '如：身世背景、关键事件、转折点' },
              '记忆': { type: 'array', items: { type: 'string' }, description: '如：已知秘密、重要信息' },
            },
            required: ['状态', '属性', '目标', '技能', '关系', '经历', '记忆'],
          },
          initialValues: {
            type: 'array',
            description: '从文档中提取的初始值列表。注意：只提取"状态"、"属性"、"目标"、"技能"、"关系"这5个分类的初始值，"经历"和"记忆"必须返回空数组',
            items: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  enum: ['状态', '属性', '目标', '技能', '关系'],
                  description: '大分类名称（只允许这5个分类）',
                },
                subCategory: { type: 'string', description: '小分类名称' },
                value: {
                  oneOf: [
                    {
                      type: 'string',
                      description: '用于状态、目标、关系 - 简单字符串值',
                    },
                    {
                      type: 'object',
                      description: '用于属性 - 包含 level 和 description',
                      properties: {
                        level: { type: 'string', description: '等级，如：S/A/B/C/D 或 1-10' },
                        description: { type: 'string', description: '属性描述' },
                      },
                      required: ['level', 'description'],
                    },
                    {
                      type: 'object',
                      description: '用于技能 - 必须包含 quality（品质）、description（描述）、unlockCondition（解锁条件）',
                      properties: {
                        quality: {
                          type: 'string',
                          enum: ['未掌握', '入门', '熟练', '精通', '大师'],
                          description: '技能品质/掌握程度',
                        },
                        description: { type: 'string', description: '技能的描述说明' },
                        unlockCondition: { type: 'string', description: '解锁或提升条件' },
                      },
                      required: ['quality', 'description', 'unlockCondition'],
                    },
                  ],
                  description: '初始值。状态/目标/关系用字符串，属性用{level,description}，技能用{quality,description,unlockCondition}',
                },
              },
              required: ['category', 'subCategory', 'value'],
            },
          },
        },
        required: ['subCategories', 'initialValues'],
      },
    },
  }];

  try {
    console.log('[CharacterProfile] 调用 AI (Tool Calling)...');
    const response = await aiService.sendMessage(
      [], // 空 history
      userMessage,
      systemPrompt,
      tools,
      undefined, // 无 signal
      'submit_character_profile', // 强制调用此工具
      4000, // 限制输出长度
      0.3 // 低温度，更稳定
    );

    // 从 tool call 结果中提取参数
    let toolArgs: any = null;

    // AIService 标准返回格式 - candidates[0].content.parts 中找 functionCall
    const parts = (response as any).candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.functionCall?.name === 'submit_character_profile') {
        toolArgs = part.functionCall.args;
        break;
      }
    }

    // OpenAI 格式 - choices[0].message.tool_calls
    if (!toolArgs && response.choices?.[0]?.message?.tool_calls) {
      for (const tc of response.choices[0].message.tool_calls) {
        if (tc.function?.name === 'submit_character_profile') {
          toolArgs = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
          break;
        }
      }
    }

    if (!toolArgs) {
      console.log('[CharacterProfile] AI 未调用工具，response:', JSON.stringify(response, null, 2));
      return { success: false, error: 'AI 未返回工具调用结果' };
    }

    console.log('[CharacterProfile] Tool args:', JSON.stringify(toolArgs, null, 2));

    // 验证并规范化 subCategories
    const subCategories: Record<CharacterCategoryName, string[]> = {
      '状态': [],
      '属性': [],
      '目标': [],
      '技能': [],
      '关系': [],
      '经历': [],
      '记忆': [],
    };

    const validCategories = ['状态', '属性', '目标', '技能', '关系', '经历', '记忆'];

    if (toolArgs.subCategories) {
      for (const [cat, subs] of Object.entries(toolArgs.subCategories)) {
        if (validCategories.includes(cat) && Array.isArray(subs)) {
          subCategories[cat as CharacterCategoryName] = subs
            .filter((s: any) => typeof s === 'string' && s.trim())
            .map((s: string) => s.trim());
        }
      }
    }

    // 提取 initialValues
    const initialValues: {
      category: CharacterCategoryName;
      subCategory: string;
      value: any; // 保持原始格式，让 store 处理序列化
    }[] = [];

    if (toolArgs.initialValues && Array.isArray(toolArgs.initialValues)) {
      for (const item of toolArgs.initialValues) {
        if (
          item.category &&
          item.subCategory &&
          item.value !== undefined &&
          validCategories.includes(item.category)
        ) {
          initialValues.push({
            category: item.category as CharacterCategoryName,
            subCategory: String(item.subCategory).trim(),
            value: item.value, // 保持原始值，可能是字符串或对象
          });
        }
      }
    }

    console.log('[CharacterProfile] AI 生成的小分类:', subCategories);
    console.log('[CharacterProfile] AI 提取的初始值数量:', initialValues.length);

    return { success: true, subCategories, initialValues };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[CharacterProfile] AI 分析失败:', errorMsg);
    return { success: false, error: `AI 分析失败: ${errorMsg}` };
  }
};

/**
 * AI 分析正文内容，更新相关角色
 */
const analyzeChapterWithAI = async (
  aiService: AIService,
  content: string,
  chapterRef: string,
  profiles: { characterName: string; categories: any }[],
  projectOverview: string
): Promise<{
  success: boolean;
  updates?: {
    characterName: string;
    updates: {
      category: CharacterCategoryName;
      subCategory: string;
      value: string;
      action: 'update' | 'add';
    }[];
  }[];
  error?: string;
}> => {
  // 构建现有角色档案摘要
  const profilesSummary = profiles.map(p => {
    const categories: string[] = [];
    Object.entries(p.categories).forEach(([catName, catData]: [string, any]) => {
      const subCats = Object.keys(catData.subCategories || {});
      if (subCats.length > 0) {
        categories.push(`  - ${catName}: ${subCats.join('、')}`);
      }
    });
    return `【${p.characterName}】\n${categories.join('\n')}`;
  }).join('\n\n');

  const systemPrompt = `${projectOverview}

你是一个小说内容分析专家。你的任务是分析正文内容，识别角色状态变化，并生成角色档案更新指令。

## 角色档案分类体系

1. **状态**（覆盖型）：位置、情绪、体力、当前装备等 - 只保留最新值
2. **属性**（覆盖型）：力量、敏捷、智力等 - 只保留最新值
3. **目标**（覆盖型）：主目标、近期目标、隐藏目标等 - 只保留最新值
4. **技能**（覆盖型）：剑术、火魔法等 - 只保留最新值
5. **关系**（累加型）：与其他角色的关系 - 保留历史
6. **经历**（累加型）：关键事件、转折点 - 保留历史
7. **记忆**（累加型）：已知秘密、重要信息 - 保留历史

## ⚠️ 重要规则

**优先更新现有子分类，不要轻易创建新子分类！**

- 如果正文提到"使用剑法攻击"，应该更新现有的"基础剑法"技能，而不是创建新的"剑法"子分类
- 只有当内容明确涉及全新的、现有子分类无法涵盖的内容时，才创建新子分类
- 更新时使用现有子分类的准确名称

## 输出格式

返回 JSON 格式：
\`\`\`json
{
  "updates": [
    {
      "characterName": "张三",
      "updates": [
        {
          "category": "状态",
          "subCategory": "位置",
          "value": "青云宗外门",
          "action": "update"
        },
        {
          "category": "经历",
          "subCategory": "关键事件",
          "value": "在森林中遇到神秘老者",
          "action": "add"
        }
      ]
    }
  ]
}
\`\`\`

## 其他规则

1. 只返回 JSON，不要有其他内容
2. action: "update" 用于覆盖型，"add" 用于累加型
3. 只提取明确的信息，不要推测
4. 如果没有角色相关信息，返回空 updates 数组
5. 保守原则：不确定的信息不提取`;

  const userMessage = `请分析以下正文内容，提取角色状态变化。

章节：${chapterRef}

## 现有角色档案结构（⚠️ 优先使用现有子分类）

${profilesSummary}

## 正文内容

---
${content}
---

请生成角色档案更新 JSON（注意：优先更新现有子分类）：`;

  try {
    const response = await aiService.sendMessage(
      [],
      userMessage,
      systemPrompt,
      [],
      undefined,
      undefined,
      3000,
      0.3
    );

    let textContent = '';
    if ((response as any).candidates?.[0]?.content?.parts?.[0]?.text) {
      // AIService 标准返回格式
      textContent = (response as any).candidates[0].content.parts[0].text;
    } else if ((response as any).firstChoice?.message?.content) {
      // DeepSeek 等返回 firstChoice 格式
      textContent = (response as any).firstChoice.message.content;
    } else if (response.choices?.[0]?.message?.content) {
      // OpenAI 格式
      textContent = response.choices[0].message.content;
    } else if (typeof response === 'string') {
      textContent = response;
    }

    const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                      textContent.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { success: true, updates: [] };
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    return { success: true, updates: parsed.updates || [] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `AI 分析失败: ${errorMsg}` };
  }
};

export const useCharacterProfileActions = (): CharacterProfileActionsResult => {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeProfile = useCharacterMemoryStore((state: CharacterMemoryState) => state.initializeProfile);
  const getByName = useCharacterMemoryStore((state: CharacterMemoryState) => state.getByName);
  const updateProfile = useCharacterMemoryStore((state: CharacterMemoryState) => state.updateProfile);
  const deleteProfileFromStore = useCharacterMemoryStore((state: CharacterMemoryState) => state.deleteProfile);
  const aiConfig = useAgentStore(state => state.aiConfig);
  const currentProject = useProjectStore(state => state.getCurrentProject());

  /**
   * 从 Markdown 角色卡初始化角色档案（使用 AI 分析）
   */
  const initializeFromMarkdown = useCallback(async (
    filePath: string,
    content: string
  ): Promise<boolean> => {
    console.log('[CharacterProfile] 开始初始化，文件路径:', filePath);
    setIsInitializing(true);
    setError(null);

    try {
      const characterName = extractCharacterNameFromPath(filePath);
      console.log('[CharacterProfile] 提取的角色名:', characterName);

      // 检查是否已存在
      const existing = getByName(characterName);
      if (existing) {
        console.log('[CharacterProfile] 角色已存在:', existing.characterId);
        setError(`角色 "${characterName}" 的档案已存在`);
        setIsInitializing(false);
        return false;
      }

      // 创建 AI 服务（使用轻量模型）
      if (!aiConfig.apiKey) {
        setError('未配置 API Key，无法使用 AI 分析');
        setIsInitializing(false);
        return false;
      }

      const aiService = createRoutedAIService(aiConfig, 'extraction');


      // 构建项目概览
      const projectOverview = buildProjectOverviewPrompt(currentProject);

      // 调用 AI 分析角色卡
      console.log(`[CharacterProfile] 正在使用 AI 分析角色卡: ${characterName}`);
      const result = await analyzeCharacterCardWithAI(aiService, characterName, content, projectOverview);

      if (!result.success || !result.subCategories) {
        setError(result.error || 'AI 分析失败');
        setIsInitializing(false);
        return false;
      }

      console.log('[CharacterProfile] AI 生成的小分类:', result.subCategories);
      console.log('[CharacterProfile] AI 提取的初始值数量:', result.initialValues?.length || 0);

      // 初始化档案（包含初始值）
      const newProfile = initializeProfile({
        characterName,
        baseProfilePath: filePath,
        initialSubCategories: result.subCategories,
        initialValues: result.initialValues,
      });

      console.log('[CharacterProfile] 档案已创建:', newProfile.characterName, 'ID:', newProfile.characterId);

      // 手动触发文件同步
      await useCharacterMemoryStore.getState()._syncToFiles();

      setIsInitializing(false);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`初始化失败: ${errorMsg}`);
      setIsInitializing(false);
      return false;
    }
  }, [getByName, initializeProfile, aiConfig, currentProject]);

  /**
   * 从正文内容更新相关角色（使用 AI 分析）
   */
  const updateFromChapter = useCallback(async (
    _filePath: string,
    content: string,
    chapterRef: string
  ): Promise<boolean> => {
    setIsUpdating(true);
    setError(null);

    try {
      // 获取所有角色档案
      const profiles = useCharacterMemoryStore.getState().profiles;
      if (profiles.length === 0) {
        setError('没有可更新的角色档案');
        setIsUpdating(false);
        return false;
      }

      // 查找在正文中提到的角色
      const mentionedProfiles = profiles.filter((profile: CharacterProfileV2) =>
        content.includes(profile.characterName)
      );

      if (mentionedProfiles.length === 0) {
        setError('正文中未找到已建档的角色');
        setIsUpdating(false);
        return false;
      }

      // 检查 API 配置
      if (!aiConfig.apiKey) {
        setError('未配置 API Key，无法使用 AI 分析');
        setIsUpdating(false);
        return false;
      }

      // 创建 AI 服务
      const aiService = createRoutedAIService(aiConfig, 'extraction');

      // 构建项目概览
      const projectOverview = buildProjectOverviewPrompt(currentProject);

      // 调用 AI 分析正文
      console.log(`[CharacterProfile] 正在使用 AI 分析章节: ${chapterRef}`);
      const result = await analyzeChapterWithAI(aiService, content, chapterRef, mentionedProfiles, projectOverview);

      if (!result.success) {
        setError(result.error || 'AI 分析失败');
        setIsUpdating(false);
        return false;
      }

      if (!result.updates || result.updates.length === 0) {
        console.log('[CharacterProfile] AI 未识别到角色状态变化');
        setIsUpdating(false);
        return true;
      }

      // 应用更新
      for (const charUpdate of result.updates) {
        if (charUpdate.updates && charUpdate.updates.length > 0) {
          updateProfile({
            characterName: charUpdate.characterName,
            chapterRef,
            updates: charUpdate.updates,
          });
          console.log(`[CharacterProfile] 已更新角色 "${charUpdate.characterName}":`, charUpdate.updates);
        }
      }

      setIsUpdating(false);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`更新失败: ${errorMsg}`);
      setIsUpdating(false);
      return false;
    }
  }, [updateProfile, aiConfig, currentProject]);

  /**
   * 强制重新初始化（先删除旧档案）
   */
  const forceReinitialize = useCallback(async (
    filePath: string,
    content: string
  ): Promise<boolean> => {
    const characterName = extractCharacterNameFromPath(filePath);
    console.log('[CharacterProfile] 强制重新初始化:', characterName);

    // 先删除旧档案
    deleteProfileFromStore(characterName);
    await useCharacterMemoryStore.getState()._syncToFiles();

    // 然后重新初始化
    return initializeFromMarkdown(filePath, content);
  }, [deleteProfileFromStore, initializeFromMarkdown]);

  /**
   * 删除角色档案
   */
  const deleteProfile = useCallback((characterName: string) => {
    console.log('[CharacterProfile] 删除角色档案:', characterName);
    deleteProfileFromStore(characterName);
    // 同步到文件
    useCharacterMemoryStore.getState()._syncToFiles();
  }, [deleteProfileFromStore]);

  return {
    isInitializing,
    isUpdating,
    error,
    initializeFromMarkdown,
    forceReinitialize,
    updateFromChapter,
    deleteProfile,
  };
};
