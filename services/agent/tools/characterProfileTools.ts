/**
 * 角色档案工具 - AI 自动更新角色状态和记忆
 */
import { ToolDefinition } from '../types';
import {
  CharacterProfileInitRequest,
  CharacterProfileUpdateRequest,
  CharacterCategoryName,
  CHARACTER_CATEGORIES,
  CharacterProfileV2,
  CharacterCategory,
} from '../../../types';
import { useCharacterMemoryStore } from '../../../stores/characterMemoryStore';

// ============================================
// 工具定义
// ============================================

/**
 * 初始化角色档案
 */
export const initCharacterProfileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'init_character_profile',
    description: `【初始化角色档案】AI 分析角色设定文档后，自动生成适合该角色的小分类并初始化档案。

## 大分类（已预设，不可更改）
- **状态**（覆盖型）：位置、情绪、体力、当前装备等
- **属性**（覆盖型）：力量、敏捷、智力等
- **目标**（覆盖型）：主目标、近期目标、隐藏目标等
- **技能**（覆盖型）：每个技能独立记录
- **关系**（累加型）：与其他角色的关系历史
- **经历**（累加型）：关键事件、转折点、成长变化
- **记忆**（累加型）：已知秘密、重要信息

## 小分类生成规则
- 根据项目特性和角色资料自动生成
- 名称应简洁明确（2-6个汉字）
- 覆盖型分类的小分类应该是可量化的维度
- 累加型分类的小分类应该是相关实体名称或事件类型`,
    parameters: {
      type: 'object',
      properties: {
        characterName: {
          type: 'string',
          description: '角色名称（必须与角色设定文档中的名称一致）',
        },
        baseProfilePath: {
          type: 'string',
          description: '角色基础设定文档的路径（可选）',
        },
        subCategories: {
          type: 'object',
          description: '为每个大分类生成的小分类列表',
          properties: {
            '状态': {
              type: 'array',
              items: { type: 'string' },
              description: '如：位置、情绪、体力、当前装备、当前任务',
            },
            '属性': {
              type: 'array',
              items: { type: 'string' },
              description: '如：力量、敏捷、智力、魅力、运气',
            },
            '目标': {
              type: 'array',
              items: { type: 'string' },
              description: '如：主目标、近期目标、隐藏目标',
            },
            '技能': {
              type: 'array',
              items: { type: 'string' },
              description: '角色已知的技能名称，如：剑术、火魔法、潜行',
            },
            '关系': {
              type: 'array',
              items: { type: 'string' },
              description: '相关角色名称列表',
            },
            '经历': {
              type: 'array',
              items: { type: 'string' },
              description: '如：关键事件、转折点、成长变化',
            },
            '记忆': {
              type: 'array',
              items: { type: 'string' },
              description: '如：已知秘密、重要信息',
            },
          },
        },
      },
      required: ['characterName', 'subCategories'],
    },
  },
};

/**
 * 更新角色档案
 */
export const updateCharacterProfileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_character_profile',
    description: `【更新角色档案】章节完成后，AI 分析章节内容并更新角色的状态、关系、经历等。

## 覆盖型分类（状态、属性、目标、技能）
- 直接替换旧值，只保留最新状态
- action 设为 'update'

## 累加型分类（关系、经历、记忆）
- 保留历史记录，可更新或新增
- action='update': 更新最后一个未归档条目
- action='add': 新增条目

## 保守新增原则
- 必须有明确的剧情依据
- 值必须是确定的
- 优先复用现有条目`,
    parameters: {
      type: 'object',
      properties: {
        characterName: {
          type: 'string',
          description: '角色名称',
        },
        chapterRef: {
          type: 'string',
          description: '来源章节引用（如"第3章"）',
        },
        updates: {
          type: 'array',
          description: '要更新的条目列表',
          items: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['状态', '属性', '目标', '技能', '关系', '经历', '记忆'],
                description: '大分类名称',
              },
              subCategory: {
                type: 'string',
                description: '小分类名称（如"位置"、"情绪"或技能名"剑术"）',
              },
              value: {
                type: 'string',
                description: '条目值',
              },
              action: {
                type: 'string',
                enum: ['update', 'add'],
                description: 'update=更新现有, add=新增条目（仅累加型有效）',
              },
            },
            required: ['category', 'subCategory', 'value'],
          },
        },
      },
      required: ['characterName', 'chapterRef', 'updates'],
    },
  },
};

/**
 * 查询角色档案
 */
export const getCharacterProfileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_character_profile',
    description: `【查询角色档案】获取角色的完整动态档案。

返回角色的所有分类状态，包括：
- 覆盖型分类的最新值
- 累加型分类的历史记录

用于 AI 查询角色设定时一并获取动态状态。`,
    parameters: {
      type: 'object',
      properties: {
        characterName: {
          type: 'string',
          description: '角色名称',
        },
        includeArchived: {
          type: 'boolean',
          description: '是否包含已归档的累加型条目（默认 false）',
        },
      },
      required: ['characterName'],
    },
  },
};

/**
 * 管理小分类
 */
export const manageSubCategoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_sub_category',
    description: `【管理小分类】手动管理角色档案的小分类。

用于：
- 添加新的小分类
- 删除不需要的小分类

注意：这是用户手动操作，AI 不应主动调用此工具。`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: 'add=添加小分类, remove=删除小分类',
        },
        characterName: {
          type: 'string',
          description: '角色名称',
        },
        category: {
          type: 'string',
          enum: ['状态', '属性', '目标', '技能', '关系', '经历', '记忆'],
          description: '大分类名称',
        },
        subCategory: {
          type: 'string',
          description: '小分类名称',
        },
      },
      required: ['action', 'characterName', 'category', 'subCategory'],
    },
  },
};

/**
 * 归档条目
 */
export const archiveEntryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'archive_entry',
    description: `【归档条目】归档或取消归档累加型条目。

归档后条目不在主视图显示，但数据保留。
仅对累加型分类（关系、经历、记忆）有效。`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['archive', 'unarchive'],
          description: 'archive=归档, unarchive=取消归档',
        },
        characterName: {
          type: 'string',
          description: '角色名称',
        },
        category: {
          type: 'string',
          enum: ['关系', '经历', '记忆'],
          description: '大分类名称（仅累加型）',
        },
        subCategory: {
          type: 'string',
          description: '小分类名称',
        },
        entryIndex: {
          type: 'number',
          description: '条目索引（从 0 开始）',
        },
      },
      required: ['action', 'characterName', 'category', 'subCategory', 'entryIndex'],
    },
  },
};

// ============================================
// 执行函数
// ============================================

export const executeInitCharacterProfile = async (args: {
  characterName: string;
  baseProfilePath?: string;
  subCategories?: {
    '状态'?: string[];
    '属性'?: string[];
    '目标'?: string[];
    '技能'?: string[];
    '关系'?: string[];
    '经历'?: string[];
    '记忆'?: string[];
  };
}): Promise<string> => {
  const { characterName, baseProfilePath, subCategories } = args;

  if (!characterName?.trim()) {
    return JSON.stringify({ success: false, error: '角色名称不能为空' });
  }

  if (!subCategories || Object.keys(subCategories).length === 0) {
    return JSON.stringify({ success: false, error: '必须提供至少一个大分类的小分类' });
  }

  try {
    const store = useCharacterMemoryStore.getState();
    const existingProfile = store.getByName(characterName);

    if (existingProfile) {
      return JSON.stringify({
        success: false,
        error: `角色 "${characterName}" 的档案已存在，请使用 update_character_profile 更新`,
      });
    }

    const request: CharacterProfileInitRequest = {
      characterName,
      baseProfilePath,
      initialSubCategories: subCategories as any,
    };

    const profile = store.initializeProfile(request);

    return JSON.stringify({
      success: true,
      message: `角色 "${characterName}" 的档案已初始化`,
      profile: {
        characterId: profile.characterId,
        characterName: profile.characterName,
        categories: Object.keys(profile.categories).map((cat) => ({
          name: cat,
          type: CHARACTER_CATEGORIES[cat as CharacterCategoryName],
          subCategoryCount: Object.keys(profile.categories[cat].subCategories).length,
        })),
      },
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `初始化失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

export const executeUpdateCharacterProfile = async (args: {
  characterName: string;
  chapterRef: string;
  updates: {
    category: CharacterCategoryName;
    subCategory: string;
    value: string;
    action?: 'update' | 'add';
  }[];
}): Promise<string> => {
  const { characterName, chapterRef, updates } = args;

  if (!characterName?.trim()) {
    return JSON.stringify({ success: false, error: '角色名称不能为空' });
  }

  if (!chapterRef?.trim()) {
    return JSON.stringify({ success: false, error: '章节引用不能为空' });
  }

  if (!updates || updates.length === 0) {
    return JSON.stringify({ success: false, error: '必须提供至少一个更新项' });
  }

  try {
    const store = useCharacterMemoryStore.getState();
    const existingProfile = store.getByName(characterName);

    if (!existingProfile) {
      return JSON.stringify({
        success: false,
        error: `角色 "${characterName}" 的档案不存在，请先使用 init_character_profile 初始化`,
      });
    }

    // 验证并规范化更新请求
    const normalizedUpdates = updates.map((u) => ({
      category: u.category,
      subCategory: u.subCategory,
      value: u.value,
      action: (u.action || 'update') as 'update' | 'add',
    }));

    // 检查是否有尝试在不存在的分类中新增
    const warnings: string[] = [];
    normalizedUpdates.forEach((u) => {
      const category = existingProfile.categories[u.category];
      if (!category) {
        warnings.push(`大分类 "${u.category}" 不存在`);
      } else if (!category.subCategories[u.subCategory] && u.action === 'update') {
        warnings.push(`小分类 "${u.category}.${u.subCategory}" 不存在，将自动创建`);
      }
    });

    const request: CharacterProfileUpdateRequest = {
      characterName,
      chapterRef,
      updates: normalizedUpdates,
    };

    store.updateProfile(request);

    return JSON.stringify({
      success: true,
      message: `角色 "${characterName}" 的档案已更新`,
      updatedCount: updates.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `更新失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

export const executeGetCharacterProfile = async (args: {
  characterName: string;
  includeArchived?: boolean;
}): Promise<string> => {
  const { characterName, includeArchived = false } = args;

  if (!characterName?.trim()) {
    return JSON.stringify({ success: false, error: '角色名称不能为空' });
  }

  try {
    const store = useCharacterMemoryStore.getState();
    const profile = store.getByName(characterName);

    if (!profile) {
      return JSON.stringify({
        success: false,
        error: `角色 "${characterName}" 的档案不存在`,
      });
    }

    // 过滤归档条目
    const filteredCategories: CharacterProfileV2['categories'] = {};

    (Object.entries(profile.categories) as [string, CharacterCategory][]).forEach(([catName, catData]) => {
      if (!catData) return;
      const filteredSubCats: typeof catData.subCategories = {};

      Object.entries(catData.subCategories).forEach(([subCatName, value]) => {
        if (Array.isArray(value)) {
          // 累加型：过滤归档条目
          const filtered = includeArchived
            ? value
            : value.filter((entry) => !entry.archived);
          if (filtered.length > 0 || includeArchived) {
            filteredSubCats[subCatName] = filtered;
          }
        } else {
          // 覆盖型：直接保留
          filteredSubCats[subCatName] = value;
        }
      });

      if (Object.keys(filteredSubCats).length > 0) {
        filteredCategories[catName] = {
          type: catData.type,
          subCategories: filteredSubCats,
        };
      }
    });

    return JSON.stringify({
      success: true,
      profile: {
        characterId: profile.characterId,
        characterName: profile.characterName,
        baseProfilePath: profile.baseProfilePath,
        categories: filteredCategories,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `查询失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

export const executeManageSubCategory = async (args: {
  action: 'add' | 'remove';
  characterName: string;
  category: CharacterCategoryName;
  subCategory: string;
}): Promise<string> => {
  const { action, characterName, category, subCategory } = args;

  if (!characterName?.trim()) {
    return JSON.stringify({ success: false, error: '角色名称不能为空' });
  }

  if (!subCategory?.trim()) {
    return JSON.stringify({ success: false, error: '小分类名称不能为空' });
  }

  try {
    const store = useCharacterMemoryStore.getState();
    const profile = store.getByName(characterName);

    if (!profile) {
      return JSON.stringify({
        success: false,
        error: `角色 "${characterName}" 的档案不存在`,
      });
    }

    if (action === 'add') {
      store.addSubCategory(characterName, category, subCategory);
      return JSON.stringify({
        success: true,
        message: `已添加小分类 "${category} > ${subCategory}"`,
      });
    } else {
      store.removeSubCategory(characterName, category, subCategory);
      return JSON.stringify({
        success: true,
        message: `已删除小分类 "${category} > ${subCategory}"`,
      });
    }
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `操作失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

export const executeArchiveEntry = async (args: {
  action: 'archive' | 'unarchive';
  characterName: string;
  category: '关系' | '经历' | '记忆';
  subCategory: string;
  entryIndex: number;
}): Promise<string> => {
  const { action, characterName, category, subCategory, entryIndex } = args;

  if (!characterName?.trim()) {
    return JSON.stringify({ success: false, error: '角色名称不能为空' });
  }

  try {
    const store = useCharacterMemoryStore.getState();
    const profile = store.getByName(characterName);

    if (!profile) {
      return JSON.stringify({
        success: false,
        error: `角色 "${characterName}" 的档案不存在`,
      });
    }

    if (action === 'archive') {
      store.archiveEntry(characterName, category, subCategory, entryIndex);
      return JSON.stringify({
        success: true,
        message: `已归档条目 "${category} > ${subCategory}[${entryIndex}]"`,
      });
    } else {
      store.unarchiveEntry(characterName, category, subCategory, entryIndex);
      return JSON.stringify({
        success: true,
        message: `已取消归档条目 "${category} > ${subCategory}[${entryIndex}]"`,
      });
    }
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `操作失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

// 导出所有工具
export const characterProfileTools: ToolDefinition[] = [
  initCharacterProfileTool,
  updateCharacterProfileTool,
  manageSubCategoryTool,
  archiveEntryTool,
];
