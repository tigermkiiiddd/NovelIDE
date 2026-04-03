/**
 * @file toolCatalog.ts
 * @description 工具目录 - 轻量级 name + description，仅用于首次展示
 */

import type { ToolCategory } from '../../../stores/agentStore';

// 工具目录条目（轻量级，只包含 name 和 description）
export interface ToolCatalogEntry {
  name: string;
  description: string;
  category: ToolCategory;
}

// 工具目录 - 每个 lazy 类别的工具目录条目
export const toolCatalogEntries: ToolCatalogEntry[] = [
  // file_write 系列
  {
    name: 'updateFile',
    description: '覆写整个文件内容（用于大改或重写）',
    category: 'file_write',
  },
  {
    name: 'renameFile',
    description: '重命名文件（不改路径，只改文件名）',
    category: 'file_write',
  },
  {
    name: 'deleteFile',
    description: '删除文件或文件夹',
    category: 'file_write',
  },

  // file_search 系列
  {
    name: 'searchFiles',
    description: '按文件名或内容关键词搜索文件',
    category: 'file_search',
  },

  // knowledge 系列
  {
    name: 'query_knowledge',
    description: '查询知识图谱中的相关知识节点',
    category: 'knowledge',
  },
  {
    name: 'manage_knowledge',
    description: '批量添加、更新、删除知识节点，或强化/复习已有知识',
    category: 'knowledge',
  },
  {
    name: 'link_knowledge',
    description: '建立知识节点之间的关系（属于/细化/依赖/冲突）',
    category: 'knowledge',
  },
  {
    name: 'list_knowledge_metadata',
    description: '列出可用的知识分类和标签',
    category: 'knowledge',
  },
  {
    name: 'list_all_knowledge',
    description: '列出知识图谱中所有节点的列表，按分类分组',
    category: 'knowledge',
  },

  // character 系列
  {
    name: 'init_character_profile',
    description: 'AI 分析角色设定文档后，自动生成适合该角色的小分类并初始化档案',
    category: 'character',
  },
  {
    name: 'update_character_profile',
    description: '章节完成后，AI 分析章节内容并更新角色的状态、关系、经历等',
    category: 'character',
  },
  {
    name: 'manage_sub_category',
    description: '手动管理角色档案的小分类（添加/删除）',
    category: 'character',
  },
  {
    name: 'archive_entry',
    description: '归档或取消归档累加型条目（关系、经历、记忆）',
    category: 'character',
  },

  // relationship 系列
  {
    name: 'query_relationships',
    description: '查询角色关系网络，支持按角色名、关系类型、描述关键词搜索',
    category: 'relationship',
  },
  {
    name: 'manage_relationships',
    description: '批量添加、更新、删除角色之间的关系',
    category: 'relationship',
  },
  {
    name: 'get_relationship_graph',
    description: '获取项目所有角色的关系网络全貌',
    category: 'relationship',
  },

  // outline 系列
  {
    name: 'outline_getEvents',
    description: '获取事件列表（支持按章节/范围筛选）',
    category: 'outline',
  },
  {
    name: 'outline_getChapters',
    description: '获取章节分组列表（不含事件详情）',
    category: 'outline',
  },
  {
    name: 'outline_getVolumes',
    description: '获取所有卷列表',
    category: 'outline',
  },
  {
    name: 'outline_getStoryLines',
    description: '获取所有故事线列表',
    category: 'outline',
  },
  {
    name: 'outline_manageVolumes',
    description: '管理卷（添加/更新/删除）',
    category: 'outline',
  },
  {
    name: 'outline_manageChapters',
    description: '管理章节（添加/更新/删除）',
    category: 'outline',
  },
  {
    name: 'outline_manageEvents',
    description: '管理事件（添加/插入/更新/删除/移动）',
    category: 'outline',
  },
  {
    name: 'outline_manageStoryLines',
    description: '管理故事线（添加/删除）',
    category: 'outline',
  },
  {
    name: 'processOutlineInput',
    description: '将剧情内容写入结构化大纲（SubAgent 入口）',
    category: 'outline',
  },
  {
    name: 'outline_getUnresolvedForeshadowing',
    description: '获取所有未完结的伏笔列表',
    category: 'outline',
  },
  {
    name: 'outline_getForeshadowingDetail',
    description: '获取单个伏笔的详细信息',
    category: 'outline',
  },
];

// 转换为 ToolDefinition 格式（用于发送给 LLM）
export const getToolCatalog = (): import('../types').ToolDefinition[] => {
  return toolCatalogEntries.map((entry) => ({
    type: 'function' as const,
    function: {
      name: entry.name,
      description: entry.description,
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
  }));
};

// 获取指定类别的目录条目
export const getCatalogByCategory = (category: ToolCategory): ToolCatalogEntry[] => {
  return toolCatalogEntries.filter((entry) => entry.category === category);
};

// 获取已激活类别后，从 catalog 中过滤掉
export const getFilteredCatalog = (activatedCategories: ToolCategory[]): import('../types').ToolDefinition[] => {
  const filteredEntries = toolCatalogEntries.filter(
    (entry) => !activatedCategories.includes(entry.category)
  );
  return filteredEntries.map((entry) => ({
    type: 'function' as const,
    function: {
      name: entry.name,
      description: entry.description,
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
  }));
};
