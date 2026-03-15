import { ToolDefinition } from '../types';
import { useLongTermMemoryStore } from '../../../stores/longTermMemoryStore';
import { MemoryType } from '../../../types';

// ===================== 召回工具 =====================

export const recallMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'recall_memory',
    description: '【记忆召回】根据标签、关键字或记忆名称召回长期记忆。用于获取写作规范、设定限制、风格指南、角色规则等。\n\n> 使用场景：\n> - 开始写作前，检查是否有相关设定限制\n> - 遇到新角色时，查询角色规则\n> - 不确定写作风格时，召回风格指南\n> - 需要了解已确定的规则时使用\n\n> 使用建议：\n> - 如果不确定有哪些记忆，先用 manage_memory(action=\'list\') 查看所有记忆\n> - 可以使用 memoryTypes 参数按类型过滤，提高召回精度',
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
          items: { type: 'string', enum: ['setting', 'style', 'restriction', 'experience', 'character_rule', 'world_rule'] },
          description: '按记忆类型过滤（可选）。可用类型：setting(不可违背的设定) / style(正文扩写风格) / restriction(绝对限制) / experience(写作经验) / character_rule(角色规则) / world_rule(世界观规则)'
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
  const store = useLongTermMemoryStore.getState();
  await store.ensureInitialized();

  const { query, tags, memoryTypes, limit = 5 } = args;
  let memories = store.memories;

  // 1. 按类型过滤
  if (memoryTypes && memoryTypes.length > 0) {
    memories = memories.filter(m => memoryTypes.includes(m.type));
  }

  // 2. 按标签过滤
  if (tags && tags.length > 0) {
    memories = memories.filter(m =>
      tags.some(tag => m.tags.includes(tag))
    );
  }

  // 3. 全文搜索 + 相关度计算
  const queryLower = query.toLowerCase();
  const scoredMemories = memories.map(m => {
    let score = 0;

    // 关键词匹配（权重最高）
    m.keywords.forEach(kw => {
      if (kw.toLowerCase().includes(queryLower)) score += 10;
      if (queryLower.includes(kw.toLowerCase())) score += 8;
    });

    // 标签匹配
    m.tags.forEach(tag => {
      if (tag.toLowerCase().includes(queryLower)) score += 5;
      if (queryLower.includes(tag.toLowerCase())) score += 4;
    });

    // 名称匹配
    if (m.name.toLowerCase().includes(queryLower)) score += 7;
    if (queryLower.includes(m.name.toLowerCase())) score += 6;

    // 摘要匹配
    if (m.summary.toLowerCase().includes(queryLower)) score += 3;

    // 内容匹配
    if (m.content.toLowerCase().includes(queryLower)) score += 1;

    return { memory: m, score };
  });

  // 4. 按相关度排序，过滤掉0分
  const results = scoredMemories
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.memory);

  // 5. 知识图谱扩展（获取关联记忆）
  const relatedIds = new Set<string>();
  results.forEach(m => {
    m.relatedMemories.forEach(id => relatedIds.add(id));
  });
  const related = store.memories.filter(m => relatedIds.has(m.id) && !results.find(r => r.id === m.id));

  if (results.length === 0) {
    return `未找到匹配的记忆。建议：\n1. 使用 manage_memory(action='list') 查看所有记忆\n2. 使用 memoryTypes 参数按类型过滤`;
  }

  let output = `找到 ${results.length} 条相关记忆：\n\n`;
  results.forEach((m, i) => {
    output += `### ${i + 1}. ${m.name}\n`;
    output += `- 类型: ${m.type}\n`;
    output += `- 标签: ${m.tags.join(', ')}\n`;
    output += `- 关键字: ${m.keywords.join(', ')}\n`;
    output += `- 摘要: ${m.summary}\n`;
    output += `- 完整内容:\n${m.content}\n\n`;
  });

  if (related.length > 0) {
    output += `\n关联记忆（${related.length}条）：\n`;
    related.forEach(m => {
      output += `- ${m.name} [${m.type}]\n`;
    });
  }

  return output;
};

// ===================== 管理工具 =====================

export const manageMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_memory',
    description: '【记忆管理】添加、更新、删除或列出长期记忆。用于记录不可违背的设定、写作风格偏好、绝对限制等。\n\n> 使用场景：\n> - 用户明确指定"以后都不能..."、"必须遵守..."等规则时 -> 添加为 critical\n> - 用户确定写作风格或偏好时 -> 添加为 important\n> - 需要快速索引的记忆 -> 设置为常驻（isResident: true）\n> - 列出所有记忆查看当前已保存的规则\n> - 更新或删除已有记忆\n\n> 推荐工作流：\n> - 使用 recall_memory 前，先用 list 操作查看所有记忆\n> - 可以使用 memoryTypes 参数按类型过滤，例如只查看 character_rule 类型的记忆',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'list'],
          description: '操作类型：add(添加)、update(更新)、delete(删除)、list(列出)'
        },
        memoryTypes: {
          type: 'array',
          items: { type: 'string', enum: ['setting', 'style', 'restriction', 'experience', 'character_rule', 'world_rule'] },
          description: '按记忆类型过滤（仅用于list操作）。可用类型：setting(不可违背的设定) / style(正文扩写风格) / restriction(绝对限制) / experience(写作经验) / character_rule(角色规则) / world_rule(世界观规则)'
        },
        memory: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '记忆名称' },
            type: { type: 'string', enum: ['setting', 'style', 'restriction', 'experience', 'character_rule', 'world_rule'], description: '记忆类型：setting(不可违背的设定) / style(正文扩写风格) / restriction(绝对限制) / experience(写作经验) / character_rule(角色规则) / world_rule(世界观规则)' },
            tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
            keywords: { type: 'array', items: { type: 'string' }, description: '关键字列表（用于检索）' },
            summary: { type: 'string', description: '摘要（50-100字，用于注入系统提示词）' },
            content: { type: 'string', description: '完整内容' },
            importance: { type: 'string', enum: ['critical', 'important', 'normal'], description: '重要程度' },
            isResident: { type: 'boolean', description: '是否常驻（常驻记忆会在系统提示词中显示标题和关键词）' },
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
  memoryTypes?: string[];
  memory?: {
    name: string;
    type: MemoryType;
    tags?: string[];
    keywords?: string[];
    summary?: string;
    content?: string;
    importance?: 'critical' | 'important' | 'normal';
    isResident?: boolean;
    relatedMemories?: string[];
  };
  memoryId?: string;
}) => {
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
        isResident: memory.isResident ?? false,
        relatedMemories: memory.relatedMemories || [],
        metadata: { source: 'agent' }
      });
      return `✅ 已添加记忆：${memory.name}${memory.isResident ? ' (常驻)' : ''}`;
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
      let memories = store.memories;

      if (args.memoryTypes && args.memoryTypes.length > 0) {
        memories = memories.filter(m => args.memoryTypes!.includes(m.type));
      }

      if (memories.length === 0) {
        return args.memoryTypes
          ? `暂无 ${args.memoryTypes.join(', ')} 类型的记忆。`
          : '暂无长期记忆。';
      }

      // 按类型分组显示
      const grouped = memories.reduce((acc, m) => {
        if (!acc[m.type]) acc[m.type] = [];
        acc[m.type].push(m);
        return acc;
      }, {} as Record<string, typeof memories>);

      let output = `共 ${memories.length} 条记忆：\n\n`;
      Object.entries(grouped).forEach(([type, mems]) => {
        output += `## ${type} (${mems.length}条)\n`;
        mems.forEach(m => {
          output += `- **${m.name}** [${m.importance}]${m.isResident ? ' 🔖常驻' : ''} (id: ${m.id})\n`;
          output += `  关键字: ${m.keywords.join(', ')}\n`;
          output += `  摘要: ${m.summary}\n\n`;
        });
      });

      return output;
    }

    default:
      return `未知操作：${action}`;
  }
};
