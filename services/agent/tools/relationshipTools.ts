/**
 * 人际关系工具 - AI 查询、管理和分析角色关系网络
 */
import { ToolDefinition } from '../types';
import {
  CharacterRelation,
  PRESET_RELATION_TYPES,
} from '../../../types';
import { useRelationshipStore } from '../../../stores/relationshipStore';
import { useCharacterMemoryStore } from '../../../stores/characterMemoryStore';

// ============================================
// 工具定义
// ============================================

const ALL_RELATION_TYPES = [
  ...PRESET_RELATION_TYPES,
  ...useRelationshipStore.getState().customRelationTypes,
];

export const queryRelationshipsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_relationships',
    description: `【查询人际关系】查询角色关系网络。支持按角色名、关系类型、目标角色、描述关键词搜索。

返回匹配的关系列表，每条包含：来源角色、目标角色、关系类型、强度、描述、来源章节。

不传参数时返回所有关系。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '思考过程(用中文):为什么要查询关系？你想了解什么？',
        },
        characterName: {
          type: 'string',
          description: '查询特定角色的所有关系',
        },
        targetName: {
          type: 'string',
          description: '查询两个特定角色之间的关系',
        },
        type: {
          type: 'string',
          description: `按关系类型筛选。预设类型：${PRESET_RELATION_TYPES.join('、')}。也可以是自定义类型。`,
        },
        keyword: {
          type: 'string',
          description: '按关系描述中的关键词模糊搜索',
        },
      },
      required: ['thinking'],
    },
  },
};

export const manageRelationshipsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_relationships',
    description: `【批量管理人际关系】批量添加、更新、删除角色之间的关系。

## 角色来源
角色必须先在"角色档案与记忆"系统中注册，才能添加到关系中。
- 已注册角色: 从角色档案中获取，名称与档案一致
- 注册方式: 通过 create_character_profile 工具创建角色档案
- 查看已注册角色: 使用 list_character_profiles 工具
- ⚠️ 注意: 仅读取角色档案文件不等于注册角色，必须通过工具创建档案

## 关系类型
预设类型：${PRESET_RELATION_TYPES.join('、')}
也可以使用自定义关系类型（description 中说明理由）。

## 强度
- 强：核心关系（如主角与反派、师徒）
- 中：重要关系（如同门、盟友）
- 弱：次要关系（如邻居、陌生人）

## 注意
- 添加时 from/to 必须是已在角色档案中注册的角色名
- 双向关系设 isBidirectional=true（如"朋友"），单向关系设 false（如"暗恋"）
- 支持同一对角色有多种关系（如既是"师徒"又是"亲属"）`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '思考过程(用中文):为什么要管理关系？这些关系从何而来？',
        },
        operations: {
          type: 'array',
          description: '关系操作列表',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['add', 'update', 'delete'],
                description: '操作类型',
              },
              // add/update 通用字段
              from: {
                type: 'string',
                description: '角色A名称（add 时必填）',
              },
              to: {
                type: 'string',
                description: '角色B名称（add 时必填）',
              },
              type: {
                type: 'string',
                description: '关系类型（add 时必填）',
              },
              strength: {
                type: 'string',
                enum: ['强', '中', '弱'],
                description: '关系强度',
              },
              description: {
                type: 'string',
                description: '关系描述/备注',
              },
              isBidirectional: {
                type: 'boolean',
                description: '是否双向关系（默认 true）',
              },
              chapterRef: {
                type: 'string',
                description: '来源章节',
              },
              // update/delete 用
              relationId: {
                type: 'string',
                description: '关系ID（update/delete 时必填）',
              },
            },
            required: ['action'],
          },
        },
      },
      required: ['thinking', 'operations'],
    },
  },
};

export const getRelationshipGraphTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_relationship_graph',
    description: `【获取关系网络全貌】获取项目所有角色的关系网络概览。

返回：
- 所有角色列表及其关系数量
- 关系类型分布
- 核心角色（关系最多的角色）
- 关系网络结构摘要

用于 AI 理解整体社交格局，辅助创作决策。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '思考过程(用中文):为什么需要了解全局关系？你在考虑什么创作决策？',
        },
      },
      required: ['thinking'],
    },
  },
};

// ============================================
// 执行函数
// ============================================

export const executeQueryRelationships = (args: {
  characterName?: string;
  targetName?: string;
  type?: string;
  keyword?: string;
}): string => {
  const store = useRelationshipStore.getState();

  let results = store.relations;

  // 按角色筛选
  if (args.characterName) {
    const name = args.characterName.trim().toLowerCase();
    results = results.filter(
      r => r.from.trim().toLowerCase() === name || r.to.trim().toLowerCase() === name
    );
  }

  // 按目标角色筛选
  if (args.targetName) {
    const target = args.targetName.trim().toLowerCase();
    results = results.filter(
      r => r.from.trim().toLowerCase() === target || r.to.trim().toLowerCase() === target
    );
  }

  // 按类型筛选
  if (args.type) {
    results = results.filter(r => r.type === args.type);
  }

  // 按关键词搜索
  if (args.keyword) {
    results = store.searchRelations(args.keyword);
    // 如果同时有其他筛选条件，取交集
    if (args.characterName || args.targetName || args.type) {
      const name = args.characterName?.trim().toLowerCase();
      const target = args.targetName?.trim().toLowerCase();
      const type = args.type;
      results = results.filter(r => {
        if (name && r.from.trim().toLowerCase() !== name && r.to.trim().toLowerCase() !== name) return false;
        if (target && r.from.trim().toLowerCase() !== target && r.to.trim().toLowerCase() !== target) return false;
        if (type && r.type !== type) return false;
        return true;
      });
    }
  }

  if (results.length === 0) {
    return '(未找到匹配的关系)';
  }

  return results.map(r => {
    const dir = r.isBidirectional ? '⇄' : '→';
    let line = `- [${r.id}] ${r.from} ${dir} ${r.to}: ${r.type}(${r.strength})`;
    if (r.description) line += ` — ${r.description}`;
    if (r.chapterRef) line += ` (来源: ${r.chapterRef})`;
    return line;
  }).join('\n');
};

export const executeManageRelationships = (args: {
  operations: Array<{
    action: 'add' | 'update' | 'delete';
    from?: string;
    to?: string;
    type?: string;
    strength?: '强' | '中' | '弱';
    description?: string;
    isBidirectional?: boolean;
    chapterRef?: string;
    relationId?: string;
  }>;
}): string => {
  const store = useRelationshipStore.getState();
  const results: string[] = [];

  // 获取所有角色名用于验证
  const characterNames = new Set<string>();
  useCharacterMemoryStore.getState().profiles.forEach(p => characterNames.add(p.characterName));

  for (const op of args.operations) {
    switch (op.action) {
      case 'add': {
        if (!op.from || !op.to || !op.type) {
          results.push(`❌ 添加失败: 缺少必填字段 (from/to/type)`);
          continue;
        }
        if (!characterNames.has(op.from) || !characterNames.has(op.to)) {
          const availableChars = Array.from(characterNames);
          const missing: string[] = [];
          if (!characterNames.has(op.from)) missing.push(op.from);
          if (!characterNames.has(op.to)) missing.push(op.to);

          let msg = `❌ 添加失败: 角色 ${missing.map(m => `"${m}"`).join(', ')} 未在角色档案中注册\n`;
          if (availableChars.length > 0) {
            msg += `已注册角色: ${availableChars.join('、')}\n`;
          } else {
            msg += `当前没有任何已注册角色\n`;
          }
          msg += `提示: 请先使用 create_character_profile 工具创建角色档案，或检查角色名称是否完全匹配`;
          results.push(msg);
          continue;
        }
        const relation = store.addRelation({
          from: op.from,
          to: op.to,
          type: op.type,
          strength: op.strength || '中',
          description: op.description,
          isBidirectional: op.isBidirectional !== false,
          chapterRef: op.chapterRef,
        });
        results.push(`✅ 已添加: [${relation.id}] ${op.from} ⇄ ${op.to}: ${op.type}(${op.strength || '中'})`);
        break;
      }
      case 'update': {
        if (!op.relationId) {
          results.push(`❌ 更新失败: 缺少 relationId`);
          continue;
        }
        const existing = store.relations.find(r => r.id === op.relationId);
        if (!existing) {
          results.push(`❌ 更新失败: 关系 [${op.relationId}] 不存在`);
          continue;
        }
        const updates: Partial<CharacterRelation> = {};
        if (op.type) updates.type = op.type;
        if (op.strength) updates.strength = op.strength;
        if (op.description !== undefined) updates.description = op.description;
        if (op.isBidirectional !== undefined) updates.isBidirectional = op.isBidirectional;
        if (op.chapterRef !== undefined) updates.chapterRef = op.chapterRef;
        store.updateRelation(op.relationId, updates);
        results.push(`✅ 已更新: [${op.relationId}]`);
        break;
      }
      case 'delete': {
        if (!op.relationId) {
          results.push(`❌ 删除失败: 缺少 relationId`);
          continue;
        }
        store.deleteRelation(op.relationId);
        results.push(`✅ 已删除: [${op.relationId}]`);
        break;
      }
    }
  }

  // 持久化
  store._syncToFiles();

  return results.join('\n');
};

export const executeGetRelationshipGraph = (): string => {
  const store = useRelationshipStore.getState();
  const { relations } = store;

  if (relations.length === 0) {
    return '(关系网络为空。请先确保角色已在"角色档案与记忆"中注册，再使用 manage_relationships 添加关系。)';
  }

  // 统计每个角色的关系数
  const charRelationCounts: Record<string, number> = {};
  relations.forEach(r => {
    charRelationCounts[r.from] = (charRelationCounts[r.from] || 0) + 1;
    charRelationCounts[r.to] = (charRelationCounts[r.to] || 0) + 1;
  });

  // 按关系数排序
  const sorted = Object.entries(charRelationCounts).sort((a, b) => b[1] - a[1]);

  // 关系类型分布
  const typeCounts: Record<string, number> = {};
  relations.forEach(r => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  });

  const lines: string[] = [];
  lines.push(`## 关系网络概览`);
  lines.push(`总关系数: ${relations.length}`);
  lines.push(`涉及角色: ${sorted.length}`);
  lines.push('');

  lines.push('### 核心角色（按关系数排序）');
  sorted.forEach(([name, count]) => {
    lines.push(`- ${name}: ${count} 条关系`);
  });
  lines.push('');

  lines.push('### 关系类型分布');
  Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    lines.push(`- ${type}: ${count} 条`);
  });
  lines.push('');

  lines.push('### 全部关系');
  relations.forEach(r => {
    const dir = r.isBidirectional ? '⇄' : '→';
    let line = `- ${r.from} ${dir} ${r.to}: ${r.type}(${r.strength})`;
    if (r.description) line += ` — ${r.description}`;
    lines.push(line);
  });

  return lines.join('\n');
};

export const relationshipTools: ToolDefinition[] = [
  queryRelationshipsTool,
  manageRelationshipsTool,
  getRelationshipGraphTool,
];
