import { ToolDefinition } from '../types';
import { useLongTermMemoryStore } from '../../../stores/longTermMemoryStore';
import { MemoryType } from '../../../types';

// ===================== 召回工具 =====================

export const recallMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'recall_memory',
    description: '【记忆召回】根据标签、关键字或记忆名称召回长期记忆。用于获取写作规范、设定限制、风格指南、角色规则等。\n\n> 使用场景：\n> - 开始写作前，检查是否有相关设定限制\n> - 遇到新角色时，查询角色规则\n> - 不确定写作风格时，召回风格指南\n> - 需要了解已确定的规则时使用',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '自然语言描述你需要什么类型的记忆。例如："找回关于主角性格设定的记忆"'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '按标签过滤（可选）'
        },
        memoryTypes: {
          type: 'array',
          items: { type: 'string' },
          description: '按记忆类型过滤（可选）'
        },
        limit: {
          type: 'number',
          default: 5,
          description: '返回结果数量限制'
        }
      },
      required: ['query']
    }
  }
};

// 执行召回记忆
export const executeRecallMemory = async (args: {
  query: string;
  tags?: string[];
  memoryTypes?: string[];
  limit?: number;
}) => {
  // 确保 store 已初始化
  const store = useLongTermMemoryStore.getState();
  await store.ensureInitialized();

  const { query, tags, memoryTypes, limit = 5 } = args;

  // 1. 基于关键字匹配
  let results = store.searchByKeyword(query);

  // 2. 标签过滤
  if (tags && tags.length > 0) {
    results = results.filter(m =>
      tags.some(t => m.tags.includes(t))
    );
  }

  // 3. 类型过滤
  if (memoryTypes && memoryTypes.length > 0) {
    results = results.filter(m =>
      memoryTypes.includes(m.type)
    );
  }

  // 4. 获取关联记忆（知识图谱扩展）
  const relatedIds = new Set<string>();
  results.forEach(m => {
    m.relatedMemories.forEach(id => relatedIds.add(id));
  });

  const relatedMemories = store.memories.filter(m => relatedIds.has(m.id));
  results = [...results, ...relatedMemories];

  // 5. 限制返回数量
  results = results.slice(0, limit);

  if (results.length === 0) {
    return '未找到相关记忆。';
  }

  return results.map(m => `
## ${m.name} [${m.type}]
- 关键字: ${m.keywords.join(', ')}
- 摘要: ${m.summary}
- 完整内容: ${m.content}
`).join('\n---\n');
};

// ===================== 管理工具 =====================

export const manageMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_memory',
    description: '【记忆管理】添加、更新、删除或列出长期记忆。用于记录不可违背的设定、写作风格偏好、绝对限制等。\n\n> 使用场景：\n> - 用户明确指定"以后都不能..."、"必须遵守..."等规则时 -> 添加为 critical\n> - 用户确定写作风格或偏好时 -> 添加为 important\n> - 列出所有记忆查看当前已保存的规则\n> - 更新或删除已有记忆',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'list'],
          description: '操作类型：add(添加)、update(更新)、delete(删除)、list(列出)'
        },
        memory: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '记忆名称' },
            type: { type: 'string', description: '记忆类型：setting/style/restriction/experience/character_rule/world_rule' },
            tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
            keywords: { type: 'array', items: { type: 'string' }, description: '关键字列表（用于检索）' },
            summary: { type: 'string', description: '摘要（50-100字，用于注入系统提示词）' },
            content: { type: 'string', description: '完整内容' },
            importance: { type: 'string', enum: ['critical', 'important', 'normal'], description: '重要程度' },
            relatedMemories: { type: 'array', items: { type: 'string' }, description: '关联记忆ID列表' }
          },
          description: '记忆内容（add/update 时需要）'
        },
        memoryId: { type: 'string', description: '记忆ID（update/delete 时需要）' }
      },
      required: ['action']
    }
  }
};

// 执行记忆管理
export const executeManageMemory = async (args: {
  action: 'add' | 'update' | 'delete' | 'list';
  memory?: {
    name: string;
    type: MemoryType;
    tags?: string[];
    keywords?: string[];
    summary?: string;
    content?: string;
    importance?: 'critical' | 'important' | 'normal';
    relatedMemories?: string[];
  };
  memoryId?: string;
}) => {
  // 确保 store 已初始化
  const store = useLongTermMemoryStore.getState();
  await store.ensureInitialized();

  const { action, memory, memoryId } = args;

  switch (action) {
    case 'add': {
      if (!memory) {
        return '错误：添加记忆需要提供 memory 参数';
      }
      store.addMemory({
        name: memory.name,
        type: memory.type,
        tags: memory.tags || [],
        keywords: memory.keywords || [],
        summary: memory.summary || '',
        content: memory.content || '',
        importance: memory.importance || 'normal',
        relatedMemories: memory.relatedMemories || [],
        metadata: { source: 'agent' }
      });
      return `✅ 已添加记忆：${memory.name}`;
    }

    case 'update': {
      if (!memoryId || !memory) {
        return '错误：更新记忆需要提供 memoryId 和 memory 参数';
      }
      store.updateMemory(memoryId, memory);
      return `✅ 已更新记忆：${memoryId}`;
    }

    case 'delete': {
      if (!memoryId) {
        return '错误：删除记忆需要提供 memoryId 参数';
      }
      store.deleteMemory(memoryId);
      return `✅ 已删除记忆：${memoryId}`;
    }

    case 'list': {
      const memories = store.memories;
      if (memories.length === 0) {
        return '暂无长期记忆。';
      }
      return memories.map(m => `
- **${m.name}** [${m.type}] (${m.importance})
  关键字: ${m.keywords.join(', ')}
  摘要: ${m.summary}
`).join('\n');
    }

    default:
      return `未知操作：${action}`;
  }
};
