/**
 * @file memoryGraph.ts
 * @description 记忆图谱工具函数
 */

import {
  LongTermMemory,
  MemoryEdge,
  MemoryEdgeType,
  MemoryMetadataStats,
  MemoryNode,
  MemoryType,
} from '../types';

// ==================== 元数据统计 ====================

/**
 * 统计记忆库中的元数据
 */
export const getMetadataStats = (memories: LongTermMemory[]): MemoryMetadataStats => {
  const typeCount = new Map<MemoryType, number>();
  const keywordCount = new Map<string, number>();
  const tagCount = new Map<string, number>();

  memories.forEach((memory) => {
    // 统计类型
    typeCount.set(memory.type, (typeCount.get(memory.type) || 0) + 1);

    // 统计关键字
    memory.keywords.forEach((keyword) => {
      keywordCount.set(keyword, (keywordCount.get(keyword) || 0) + 1);
    });

    // 统计标签
    memory.tags.forEach((tag) => {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    });
  });

  return {
    types: Array.from(typeCount.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    keywords: Array.from(keywordCount.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count),
    tags: Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
  };
};

/**
 * 格式化元数据统计为文本（给 agent 看）
 */
export const formatMetadataStats = (stats: MemoryMetadataStats): string => {
  const lines: string[] = ['## 可用元数据', ''];

  // 类型统计
  lines.push('### 记忆类型 (types)');
  if (stats.types.length === 0) {
    lines.push('(暂无)');
  } else {
    stats.types.forEach(({ type, count }) => {
      lines.push(`- ${type} (${count}条)`);
    });
  }
  lines.push('');

  // 关键字统计
  lines.push('### 已有关键字 (keywords)');
  if (stats.keywords.length === 0) {
    lines.push('(暂无)');
  } else {
    stats.keywords.slice(0, 20).forEach(({ keyword, count }) => {
      lines.push(`- ${keyword} (${count}条)`);
    });
    if (stats.keywords.length > 20) {
      lines.push(`- ... 还有 ${stats.keywords.length - 20} 个关键字`);
    }
  }
  lines.push('');

  // 标签统计
  lines.push('### 已有标签 (tags)');
  if (stats.tags.length === 0) {
    lines.push('(暂无)');
  } else {
    stats.tags.slice(0, 15).forEach(({ tag, count }) => {
      lines.push(`- ${tag} (${count}条)`);
    });
    if (stats.tags.length > 15) {
      lines.push(`- ... 还有 ${stats.tags.length - 15} 个标签`);
    }
  }

  return lines.join('\n');
};

// ==================== 条件查询 ====================

export interface MemoryQueryParams {
  keywords?: string[];
  tags?: string[];
  types?: MemoryType[];
  importance?: ('critical' | 'important' | 'normal')[];
  limit?: number;
}

/**
 * 根据条件查询记忆
 */
export const queryMemories = (
  memories: LongTermMemory[],
  params: MemoryQueryParams
): LongTermMemory[] => {
  let result = [...memories];

  // 按类型过滤
  if (params.types && params.types.length > 0) {
    result = result.filter((m) => params.types!.includes(m.type));
  }

  // 按重要度过滤
  if (params.importance && params.importance.length > 0) {
    result = result.filter((m) => params.importance!.includes(m.importance));
  }

  // 按关键字过滤（OR 逻辑：匹配任意一个关键字）
  if (params.keywords && params.keywords.length > 0) {
    const keywordSet = new Set(params.keywords.map((k) => k.toLowerCase()));
    result = result.filter((m) =>
      m.keywords.some((k) => keywordSet.has(k.toLowerCase()))
    );
  }

  // 按标签过滤（OR 逻辑：匹配任意一个标签）
  if (params.tags && params.tags.length > 0) {
    const tagSet = new Set(params.tags.map((t) => t.toLowerCase()));
    result = result.filter((m) =>
      m.tags.some((t) => tagSet.has(t.toLowerCase()))
    );
  }

  // 限制返回数量
  if (params.limit && params.limit > 0) {
    result = result.slice(0, params.limit);
  }

  return result;
};

/**
 * 格式化查询结果为文本（给 agent 看）
 */
export const formatQueryResult = (
  memories: LongTermMemory[],
  edges: MemoryEdge[]
): string => {
  if (memories.length === 0) {
    return '## 查询结果\n\n没有匹配的记忆。';
  }

  const lines: string[] = [`## 查询结果`, '', `### 匹配的记忆节点 (${memories.length}条)`, ''];

  memories.forEach((memory, index) => {
    const relatedEdges = edges.filter(
      (e) => e.from === memory.id || e.to === memory.id
    );
    const relatedInfo = relatedEdges
      .map((e) => {
        if (e.from === memory.id) {
          return `→ ${e.to} (${e.type})`;
        }
        return `← ${e.from} (${e.type})`;
      })
      .join(', ');

    lines.push(`${index + 1}. (${memory.id}) ${memory.name} [${memory.type}] [${memory.importance}]`);
    lines.push(`   关键字: ${memory.keywords.join(', ') || '无'}`);
    lines.push(`   摘要: ${memory.summary || '无'}`);
    if (relatedInfo) {
      lines.push(`   关联: ${relatedInfo}`);
    }
    lines.push('');
  });

  return lines.join('\n');
};

// ==================== 图谱摘要 ====================

/**
 * 将记忆转换为轻量级节点
 */
export const memoryToNode = (memory: LongTermMemory): MemoryNode => ({
  id: memory.id,
  name: memory.name,
  type: memory.type,
  keywords: memory.keywords,
  summary: memory.summary,
  importance: memory.importance,
});

/**
 * 构建图谱摘要（给 agent 看）
 */
export const buildGraphSummary = (
  memories: LongTermMemory[],
  edges: MemoryEdge[],
  maxPerGroup: number = 5
): string => {
  const lines: string[] = ['## 知识图谱摘要', ''];

  // 按类型分组
  const groupedByType = new Map<MemoryType, LongTermMemory[]>();
  memories.forEach((m) => {
    const group = groupedByType.get(m.type) || [];
    group.push(m);
    groupedByType.set(m.type, group);
  });

  groupedByType.forEach((group, type) => {
    lines.push(`[${type}] (${group.length}条)`);
    group.slice(0, maxPerGroup).forEach((m) => {
      lines.push(`- (${m.id}) ${m.name} | 关键字: ${m.keywords.slice(0, 3).join(', ')} | 摘要: ${m.summary?.slice(0, 50) || '无'}...`);
    });
    if (group.length > maxPerGroup) {
      lines.push(`- ... 还有 ${group.length - maxPerGroup} 条`);
    }
    lines.push('');
  });

  // 关联关系
  if (edges.length > 0) {
    lines.push('### 关联关系');
    edges.slice(0, 10).forEach((edge) => {
      const fromMemory = memories.find((m) => m.id === edge.from);
      const toMemory = memories.find((m) => m.id === edge.to);
      if (fromMemory && toMemory) {
        lines.push(`- ${fromMemory.name} ${edge.type} ${toMemory.name}`);
      }
    });
    if (edges.length > 10) {
      lines.push(`- ... 还有 ${edges.length - 10} 条关联`);
    }
  }

  return lines.join('\n');
};

// ==================== 重叠检查 ====================

export interface OverlapResult {
  keywordOverlaps: { keyword: string; memoryIds: string[] }[];
  tagOverlaps: { tag: string; memoryIds: string[] }[];
  suggestions: string[];
}

/**
 * 从文本中提取潜在关键字
 */
const extractPotentialKeywords = (text: string): string[] => {
  // 简单的关键字提取：分词后过滤
  const words = text
    .toLowerCase()
    .split(/[\s,.;:!?，。；：！？、/\\|()[\]{}"'`~\n\r]+/)
    .filter((w) => w.length >= 2);

  // 去重
  return Array.from(new Set(words));
};

/**
 * 检查文本与现有记忆的重叠
 */
export const checkTextOverlap = (
  text: string,
  memories: LongTermMemory[]
): OverlapResult => {
  const potentialKeywords = extractPotentialKeywords(text);
  const keywordOverlaps: { keyword: string; memoryIds: string[] }[] = [];
  const tagOverlaps: { tag: string; memoryIds: string[] }[] = [];

  // 检查关键字重叠
  potentialKeywords.forEach((keyword) => {
    const matchingIds = memories
      .filter((m) =>
        m.keywords.some((k) => k.toLowerCase().includes(keyword)) ||
        m.name.toLowerCase().includes(keyword)
      )
      .map((m) => m.id);

    if (matchingIds.length > 0) {
      keywordOverlaps.push({ keyword, memoryIds: matchingIds });
    }
  });

  // 从文本中提取可能的标签（简单实现）
  const potentialTags = potentialKeywords; // 可以扩展更复杂的标签提取逻辑
  potentialTags.forEach((tag) => {
    const matchingIds = memories
      .filter((m) => m.tags.some((t) => t.toLowerCase().includes(tag)))
      .map((m) => m.id);

    if (matchingIds.length > 0) {
      tagOverlaps.push({ tag, memoryIds: matchingIds });
    }
  });

  // 生成建议
  const suggestions: string[] = [];
  const allOverlappedIds = new Set<string>();
  keywordOverlaps.forEach((o) => o.memoryIds.forEach((id) => allOverlappedIds.add(id)));
  tagOverlaps.forEach((o) => o.memoryIds.forEach((id) => allOverlappedIds.add(id)));

  if (allOverlappedIds.size > 0) {
    const overlappedMemories = memories.filter((m) => allOverlappedIds.has(m.id));
    overlappedMemories.slice(0, 3).forEach((m) => {
      suggestions.push(`可能需要 update ${m.id}（${m.name}）`);
    });
  }

  return {
    keywordOverlaps: keywordOverlaps.slice(0, 10),
    tagOverlaps: tagOverlaps.slice(0, 10),
    suggestions,
  };
};

/**
 * 格式化重叠检查结果（给 agent 看）
 */
export const formatOverlapResult = (result: OverlapResult): string => {
  const lines: string[] = ['## 重叠分析', ''];

  // 关键字重叠
  lines.push('### 关键字重叠');
  if (result.keywordOverlaps.length === 0) {
    lines.push('(无重叠)');
  } else {
    result.keywordOverlaps.forEach(({ keyword, memoryIds }) => {
      lines.push(`- "${keyword}" → 匹配 ${memoryIds.join(', ')}`);
    });
  }
  lines.push('');

  // 标签重叠
  lines.push('### 标签重叠');
  if (result.tagOverlaps.length === 0) {
    lines.push('(无重叠)');
  } else {
    result.tagOverlaps.forEach(({ tag, memoryIds }) => {
      lines.push(`- "${tag}" → 匹配 ${memoryIds.join(', ')}`);
    });
  }
  lines.push('');

  // 建议
  if (result.suggestions.length > 0) {
    lines.push('### 建议');
    result.suggestions.forEach((s) => lines.push(`- ${s}`));
  }

  return lines.join('\n');
};

// ==================== 边操作 ====================

const EDGE_FILE_NAME = '记忆关联.json';

/**
 * 生成边 ID
 */
export const generateEdgeId = () => `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * 创建新边
 */
export const createEdge = (
  from: string,
  to: string,
  type: MemoryEdgeType
): MemoryEdge => ({
  id: generateEdgeId(),
  from,
  to,
  type,
  createdAt: Date.now(),
});

/**
 * 验证边是否有效
 */
export const validateEdge = (
  edge: Partial<MemoryEdge>,
  existingMemories: LongTermMemory[]
): { valid: boolean; error?: string } => {
  if (!edge.from || !edge.to) {
    return { valid: false, error: '边的 from 和 to 不能为空' };
  }

  if (edge.from === edge.to) {
    return { valid: false, error: '不能创建自引用边' };
  }

  const fromExists = existingMemories.some((m) => m.id === edge.from);
  const toExists = existingMemories.some((m) => m.id === edge.to);

  if (!fromExists) {
    return { valid: false, error: `源节点 ${edge.from} 不存在` };
  }
  if (!toExists) {
    return { valid: false, error: `目标节点 ${edge.to} 不存在` };
  }

  return { valid: true };
};
