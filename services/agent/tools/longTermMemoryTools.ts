import { ToolDefinition } from '../types';
import { useLongTermMemoryStore } from '../../../stores/longTermMemoryStore';
import { MemoryType } from '../../../types';
import {
  getMemoryDynamicState,
  scoreMemoryRecall,
  sortMemoriesForReview,
} from '../../../utils/memoryIntelligence';

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const formatReviewTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const getStateLabel = (state: ReturnType<typeof getMemoryDynamicState>['state']) => {
  switch (state) {
    case 'active':
      return '活跃';
    case 'stable':
      return '稳定';
    case 'needs_review':
      return '待复习';
    default:
      return '降温中';
  }
};

export const recallMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'recall_memory',
    description:
      '【记忆召回】根据问题动态召回长期记忆。系统会综合关键字匹配、重要度、近期使用情况、记忆强度和复习窗口排序，优先返回当前最该被使用的记忆。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '自然语言描述你需要什么记忆。例如："主角的底线和说话风格"。',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '按标签过滤（可选）。',
        },
        memoryTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['setting', 'style', 'restriction', 'experience', 'character_rule', 'world_rule'],
          },
          description: '按记忆类型过滤（可选）。',
        },
        limit: {
          type: 'number',
          default: 5,
          description: '返回结果数量上限。',
        },
      },
      required: ['query'],
    },
  },
};

export const executeRecallMemory = async (args: {
  query: string;
  tags?: string[];
  memoryTypes?: string[];
  limit?: number;
}) => {
  const store = useLongTermMemoryStore.getState();
  await store.ensureInitialized();

  const { query, tags, memoryTypes, limit = 5 } = args;
  const now = Date.now();

  let memories = store.memories;

  if (memoryTypes && memoryTypes.length > 0) {
    memories = memories.filter((memory) => memoryTypes.includes(memory.type));
  }

  if (tags && tags.length > 0) {
    memories = memories.filter((memory) => tags.some((tag) => memory.tags.includes(tag)));
  }

  const ranked = memories
    .map((memory) => {
      const breakdown = scoreMemoryRecall(memory, query, now);
      const dynamic = getMemoryDynamicState(memory, now);
      return { memory, breakdown, dynamic };
    })
    .filter((item) => item.breakdown.total > 0)
    .sort((left, right) => right.breakdown.total - left.breakdown.total);

  const results = ranked.slice(0, limit);

  if (results.length === 0) {
    const reviewQueue = sortMemoriesForReview(store.getReviewQueue(3), now);
    let output = `未找到与“${query}”直接匹配的记忆。建议：\n1. 使用 manage_memory(action='list') 查看所有记忆\n2. 使用 memoryTypes 缩小范围`;

    if (reviewQueue.length > 0) {
      output += '\n\n当前值得优先检查的待复习记忆：\n';
      reviewQueue.forEach((memory) => {
        const dynamic = getMemoryDynamicState(memory, now);
        output += `- ${memory.name} [${memory.type}] ${getStateLabel(dynamic.state)}，下次复习：${formatReviewTime(dynamic.nextReviewAt)}\n`;
      });
    }

    return output;
  }

  store.touchMemories(
    results.map((item) => item.memory.id),
    'recall'
  );

  const relatedIds = new Set<string>();
  results.forEach((item) => {
    item.memory.relatedMemories.forEach((id) => relatedIds.add(id));
  });

  const related = sortMemoriesForReview(
    store.memories.filter((memory) => relatedIds.has(memory.id) && !results.some((item) => item.memory.id === memory.id)),
    now
  ).slice(0, 5);

  let output = `找到 ${results.length} 条动态相关记忆：\n\n`;

  results.forEach((item, index) => {
    output += `### ${index + 1}. ${item.memory.name}\n`;
    output += `- 类型: ${item.memory.type}\n`;
    output += `- 相关度: ${item.breakdown.total.toFixed(1)}\n`;
    output += `- 状态: ${getStateLabel(item.dynamic.state)}\n`;
    output += `- 激活度: ${formatPercent(item.dynamic.activation)}\n`;
    output += `- 强度: ${formatPercent(item.dynamic.strength)}\n`;
    output += `- 召回次数: ${item.memory.metadata.recallCount}\n`;
    output += `- 下次复习: ${formatReviewTime(item.dynamic.nextReviewAt)}\n`;
    output += `- 标签: ${item.memory.tags.join(', ') || '无'}\n`;
    output += `- 关键字: ${item.memory.keywords.join(', ') || '无'}\n`;
    output += `- 摘要: ${item.memory.summary || '无'}\n`;
    output += `- 完整内容:\n${item.memory.content || item.memory.summary || '无'}\n\n`;
  });

  if (related.length > 0) {
    output += '关联记忆：\n';
    related.forEach((memory) => {
      const dynamic = getMemoryDynamicState(memory, now);
      output += `- ${memory.name} [${memory.type}] ${getStateLabel(dynamic.state)}\n`;
    });
  }

  return output.trim();
};

export const manageMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_memory',
    description:
      '【记忆管理】添加、更新、删除、强化、复习或列出长期记忆。用于维护规则、偏好和写作经验，并支持主动复习队列。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'list', 'review', 'reinforce'],
          description: '操作类型。',
        },
        memoryTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['setting', 'style', 'restriction', 'experience', 'character_rule', 'world_rule'],
          },
          description: '按记忆类型过滤（用于 list/review）。',
        },
        memory: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '记忆名称' },
            type: {
              type: 'string',
              enum: ['setting', 'style', 'restriction', 'experience', 'character_rule', 'world_rule'],
              description: '记忆类型',
            },
            tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
            keywords: { type: 'array', items: { type: 'string' }, description: '关键字列表' },
            summary: { type: 'string', description: '摘要' },
            content: { type: 'string', description: '完整内容' },
            importance: {
              type: 'string',
              enum: ['critical', 'important', 'normal'],
              description: '重要程度',
            },
            isResident: { type: 'boolean', description: '是否常驻' },
            relatedMemories: { type: 'array', items: { type: 'string' }, description: '关联记忆 ID 列表' },
          },
          description: '记忆内容（add/update 时需要）',
        },
        memoryId: { type: 'string', description: '记忆 ID（update/delete/reinforce 时需要）' },
        limit: { type: 'number', description: 'review 时返回数量上限' },
      },
      required: ['action'],
    },
  },
};

export const executeManageMemory = async (args: {
  action: 'add' | 'update' | 'delete' | 'list' | 'review' | 'reinforce';
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
  limit?: number;
}) => {
  const store = useLongTermMemoryStore.getState();
  await store.ensureInitialized();

  const { action, memory, memoryId, limit = 5 } = args;
  const now = Date.now();

  switch (action) {
    case 'add': {
      if (!memory) return '错误：添加记忆需要提供 memory 参数';

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
        metadata: { source: 'agent' },
      });

      return `已添加记忆：${memory.name}${memory.isResident ? '（常驻）' : ''}`;
    }

    case 'update': {
      if (!memoryId || !memory) return '错误：更新记忆需要提供 memoryId 和 memory 参数';
      store.updateMemory(memoryId, memory);
      return `已更新记忆：${memoryId}`;
    }

    case 'delete': {
      if (!memoryId) return '错误：删除记忆需要提供 memoryId 参数';
      store.deleteMemory(memoryId);
      return `已删除记忆：${memoryId}`;
    }

    case 'reinforce': {
      if (!memoryId) return '错误：强化记忆需要提供 memoryId 参数';

      const target = store.getById(memoryId);
      if (!target) return `错误：未找到记忆 ${memoryId}`;

      store.touchMemories([memoryId], 'reinforce');
      const updated = useLongTermMemoryStore.getState().getById(memoryId);

      return `已强化记忆：${target.name}\n- 新的复习间隔: ${updated?.metadata.reviewIntervalHours || target.metadata.reviewIntervalHours} 小时\n- 下次复习: ${formatReviewTime(updated?.metadata.nextReviewAt || target.metadata.nextReviewAt)}`;
    }

    case 'review': {
      let reviewQueue = store.getReviewQueue(limit);

      if (args.memoryTypes && args.memoryTypes.length > 0) {
        reviewQueue = reviewQueue.filter((item) => args.memoryTypes!.includes(item.type));
      }

      if (reviewQueue.length === 0) {
        return '当前没有需要优先复习的长期记忆。';
      }

      let output = `当前待复习记忆 ${reviewQueue.length} 条：\n\n`;
      reviewQueue.forEach((item, index) => {
        const dynamic = getMemoryDynamicState(item, now);
        output += `### ${index + 1}. ${item.name}\n`;
        output += `- 类型: ${item.type}\n`;
        output += `- 状态: ${getStateLabel(dynamic.state)}\n`;
        output += `- 激活度: ${formatPercent(dynamic.activation)}\n`;
        output += `- 强度: ${formatPercent(dynamic.strength)}\n`;
        output += `- 下次复习: ${formatReviewTime(dynamic.nextReviewAt)}\n`;
        output += `- 摘要: ${item.summary || '无'}\n\n`;
      });

      return output.trim();
    }

    case 'list': {
      let memories = store.memories;

      if (args.memoryTypes && args.memoryTypes.length > 0) {
        memories = memories.filter((item) => args.memoryTypes!.includes(item.type));
      }

      if (memories.length === 0) {
        return args.memoryTypes?.length
          ? `暂无 ${args.memoryTypes.join(', ')} 类型的记忆。`
          : '暂无长期记忆。';
      }

      const grouped: Record<string, typeof memories> = {};
      memories.forEach((item) => {
        if (!grouped[item.type]) grouped[item.type] = [];
        grouped[item.type].push(item);
      });

      let output = `共 ${memories.length} 条记忆。\n当前待复习：${store.getReviewQueue(10).length} 条\n\n`;

      Object.keys(grouped).forEach((type) => {
        const items = grouped[type];
        output += `## ${type} (${items.length}条)\n`;
        sortMemoriesForReview(items, now).forEach((item) => {
          const dynamic = getMemoryDynamicState(item, now);
          output += `- ${item.name} [${item.importance}]${item.isResident ? ' [resident]' : ''} (id: ${item.id})\n`;
          output += `  状态: ${getStateLabel(dynamic.state)} | 激活: ${formatPercent(dynamic.activation)} | 强度: ${formatPercent(dynamic.strength)}\n`;
          output += `  召回: ${item.metadata.recallCount} 次 | 下次复习: ${formatReviewTime(item.metadata.nextReviewAt)}\n`;
          output += `  摘要: ${item.summary || '无'}\n`;
        });
        output += '\n';
      });

      return output.trim();
    }

    default:
      return `未知操作：${action}`;
  }
};
