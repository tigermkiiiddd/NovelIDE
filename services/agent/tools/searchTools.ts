/**
 * @file searchTools.ts
 * @description search_tools 工具定义和执行器
 */

import { ToolDefinition } from '../types';
import type { ToolCategory } from '../../../stores/agentStore';
import { useAgentStore } from '../../../stores/agentStore';
import { categoryTools } from './categories';
import { toolCatalogEntries } from './toolCatalog';

// search_tools 工具定义
export const searchToolsDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_tools',
    description: `【工具激活】根据需求激活对应类别的完整工具定义。

激活后，下次 LLM 调用时将传入完整的工具定义（包含参数 schema），可直接使用。

可用类别：
- file_write: 文件写入操作（updateFile, renameFile, deleteFile）
- knowledge: 知识图谱（查询/管理/关联）
- character: 角色档案（初始化/更新/归档）
- relationship: 人际关系（查询/管理/网络）
- outline: 大纲时间线（事件/章节/卷/故事线/伏笔）

可以一次激活多个类别。`,
    parameters: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['file_write', 'knowledge', 'character', 'relationship', 'outline'],
          },
          description: '要激活的工具类别列表',
        },
      },
      required: ['categories'],
    },
  },
};

// 执行 search_tools 工具
export const executeSearchTools = (args: {
  categories: string[];
}): string => {
  const validCategories = ['file_write', 'knowledge', 'character', 'relationship', 'outline'] as const;
  const requestedCategories = args.categories || [];

  // 过滤有效类别
  const validRequested = requestedCategories.filter(
    (cat): cat is ToolCategory => validCategories.includes(cat as any)
  );

  if (validRequested.length === 0) {
    return JSON.stringify({
      success: false,
      error: `无效的类别: ${requestedCategories.join(', ')}。可用类别: ${validCategories.join(', ')}`,
      availableCategories: validCategories,
    });
  }

  // 替换激活的类别列表
  useAgentStore.getState().setActivatedCategories(validRequested);

  // 返回激活的工具信息（包含完整的 tool definitions）
  const activatedTools: any[] = [];
  for (const category of validRequested) {
    const tools = categoryTools[category] || [];
    for (const tool of tools) {
      activatedTools.push({
        type: tool.type,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      });
    }
  }

  return JSON.stringify({
    success: true,
    activatedCategories: validRequested,
    activatedTools,
    message: `已激活 ${validRequested.length} 个类别的工具，共 ${activatedTools.length} 个。现在可以使用这些工具了。`,
  });
};
