/**
 * @file toolCatalog.ts
 * @description 二级工具目录 — 轻量级 name + description
 * 未激活时 Agent 只看到这些目录条目（无参数 schema），通过 search_tools 激活后获得完整定义
 */

import type { ToolCategory } from '../../../stores/agentStore';

export interface ToolCatalogEntry {
  name: string;
  description: string;
  category: ToolCategory;
}

export const toolCatalogEntries: ToolCatalogEntry[] = [
  // memory 系列
  {
    name: 'query_memory',
    description: '查询记忆宫殿中的相关知识节点',
    category: 'memory',
  },
  {
    name: 'manage_memory',
    description: '批量添加、更新、删除记忆节点，或强化/复习已有记忆',
    category: 'memory',
  },
  {
    name: 'link_memory',
    description: '建立记忆节点之间的关系（属于/细化/依赖/冲突）',
    category: 'memory',
  },
  {
    name: 'memory_status',
    description: '查看记忆宫殿全貌（翼/房间/节点数/冲突/衰减）',
    category: 'memory',
  },
  {
    name: 'traverse_memory',
    description: '从指定节点出发沿关系图遍历，发现关联知识',
    category: 'memory',
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
  {
    name: 'outline_manageForeshadowing',
    description: '独立管理伏笔：修改属性、删除、列出全部、批量调整计划回收章节',
    category: 'outline',
  },
];

// 获取指定类别的目录条目
export const getCatalogByCategory = (category: ToolCategory): ToolCatalogEntry[] => {
  return toolCatalogEntries.filter((entry) => entry.category === category);
};

// 获取已激活类别后，从 catalog 中过滤掉已激活的条目
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
