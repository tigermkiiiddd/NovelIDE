/**
 * @file conversationMemoryAgent.ts
 * @description 对话记忆提取 Agent - 包装 MemoryDecisionAgent 用于对话场景
 */

import { ChatMessage, LongTermMemory, LongTermMemoryDraft, MemoryType, MemoryEdge, MemoryEdgeType } from '../../types';
import { AIService } from '../geminiService';
import { runMemoryDecisionAgent, MemoryDecisionOutput } from './memoryDecisionAgent';

// 边链接信息
export interface MemoryLink {
  to: string;
  type: MemoryEdgeType;
}

// 扩展支持边的操作
export interface MemoryCandidateAction {
  action: 'add' | 'update' | 'link' | 'skip';
  memoryId?: string;
  confidence: number;
  reason: string;
  memory?: LongTermMemoryDraft;
  // 边相关
  links?: MemoryLink[];          // add 时的边链接
  from?: string;                 // link 操作的源
  to?: string;                   // link 操作的目标
  edgeType?: MemoryEdgeType;     // link 操作的边类型
}

export interface ConversationMemoryInput {
  userMessage: ChatMessage;
  recentMessages: ChatMessage[];
  existingMemories: Pick<LongTermMemory, 'id' | 'name' | 'type' | 'tags' | 'keywords' | 'summary' | 'importance' | 'isResident'>[];
}

export interface ConversationMemoryOutput {
  shouldExtract: boolean;
  summary: string;
  actions: MemoryCandidateAction[];
}

/**
 * 将对话输入转换为决策输入内容
 */
const buildDialogContent = (input: ConversationMemoryInput): string => {
  const parts: string[] = [];

  // 添加最近对话上下文
  if (input.recentMessages.length > 0) {
    parts.push('## 最近对话上下文');
    parts.push(input.recentMessages.slice(-8).map((msg, i) =>
      `${i + 1}. [${msg.role}] ${msg.text}`
    ).join('\n'));
    parts.push('');
  }

  // 添加当前用户消息
  parts.push('## 当前用户消息');
  parts.push(input.userMessage.text);

  return parts.join('\n');
}

/**
 * 将 GraphOperation 转换为 MemoryCandidateAction
 */
const convertOperationsToActions = (operations: MemoryDecisionOutput['operations']): MemoryCandidateAction[] => {
  return operations.map((op) => {
    switch (op.action) {
      case 'add':
        return {
          action: 'add' as const,
          confidence: 0.8,
          reason: '新增记忆节点',
          memory: op.memory,
          // 保留边链接信息
          links: op.links?.map(l => ({ to: l.to, type: l.type })),
        };
      case 'update':
        return {
          action: 'update' as const,
          memoryId: op.memoryId,
          confidence: 0.8,
          reason: '更新现有记忆',
          memory: op.changes as LongTermMemoryDraft,
        };
      case 'merge':
        return {
          action: 'update' as const,  // merge 映射为 update 第一个记忆
          memoryId: op.memoryIds?.[0],
          confidence: 0.9,
          reason: '合并重复记忆',
          memory: op.mergedMemory,
        };
      case 'link':
        return {
          action: 'link' as const,
          confidence: 0.8,
          reason: `建立关联: ${op.from} -> ${op.to} (${op.type})`,
          from: op.from,
          to: op.to,
          edgeType: op.type,
        };
      case 'skip':
      default:
        return {
          action: 'skip' as const,
          confidence: 0,
          reason: op.reason || '跳过',
        };
    }
  });
};

/**
 * 运行对话记忆提取
 * 内部调用 MemoryDecisionAgent
 */
export async function runConversationMemoryAgent(
  aiService: AIService,
  input: ConversationMemoryInput,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<ConversationMemoryOutput> {
  // 构建决策输入
  const content = buildDialogContent(input);

  // 将 Pick 类型转换为完整类型（补充默认值）
  const fullMemories: LongTermMemory[] = input.existingMemories.map((m) => ({
    ...m,
    content: '',
    relatedMemories: [],
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'user' as const,
      lastAccessedAt: Date.now(),
      lastRecalledAt: Date.now(),
      lastReinforcedAt: Date.now(),
      recallCount: 0,
      reinforceCount: 0,
      reviewCount: 0,
      activation: 0.5,
      strength: 0.5,
      reviewIntervalHours: 168,
      nextReviewAt: Date.now() + 168 * 60 * 60 * 1000,
    },
  }));

  // 调用决策 Agent
  const result = await runMemoryDecisionAgent(
    aiService,
    {
      content,
      source: 'dialogue',
      sourceRef: `对话-${new Date(input.userMessage.timestamp).toLocaleString()}`,
      existingMemories: fullMemories,
      existingEdges: [],  // 暂时没有边信息
    },
    onLog,
    signal
  );

  // 转换结果格式
  return {
    shouldExtract: result.shouldExtract,
    summary: result.summary,
    actions: convertOperationsToActions(result.operations),
  };
}

// 导出类型供其他模块使用
export type { MemoryDecisionOutput };
