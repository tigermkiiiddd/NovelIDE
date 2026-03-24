/**
 * @file documentMemoryAgent.ts
 * @description 文档记忆提取 Agent - 包装 MemoryDecisionAgent 用于文档场景
 */

import { LongTermMemory, LongTermMemoryDraft, MemoryType } from '../../types';
import { AIService } from '../geminiService';
import { runMemoryDecisionAgent, MemoryDecisionOutput } from './memoryDecisionAgent';
import { MemoryCandidateAction } from './conversationMemoryAgent';

export interface DocumentMemoryInput {
  filePath: string;
  content: string;
  existingMemories: Pick<LongTermMemory, 'id' | 'name' | 'type' | 'tags' | 'keywords' | 'summary' | 'importance' | 'isResident'>[];
}

export interface DocumentMemoryOutput {
  shouldExtract: boolean;
  summary: string;
  actions: MemoryCandidateAction[];
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
          action: 'skip' as const,
          confidence: 0.5,
          reason: `建立关联: ${op.from} -> ${op.to} (${op.type})`,
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
 * 推断文档类型
 */
const inferDocumentKind = (filePath: string): string => {
  if (filePath.startsWith('02_角色档案/')) return '角色设定文档';
  if (filePath.startsWith('01_世界观/')) return '世界观文档';
  if (filePath.startsWith('00_基础信息/')) return '基础设定文档';
  if (filePath.startsWith('03_剧情大纲/')) return '剧情纲要文档';
  return '项目文档';
};

/**
 * 运行文档记忆提取
 * 内部调用 MemoryDecisionAgent
 */
export async function runDocumentMemoryAgent(
  aiService: AIService,
  input: DocumentMemoryInput,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<DocumentMemoryOutput> {
  // 构建决策输入内容
  const documentKind = inferDocumentKind(input.filePath);
  const content = `## 文档类型\n${documentKind}\n\n## 文件路径\n${input.filePath}\n\n## 文档内容\n${input.content}`;

  // 将 Pick 类型转换为完整类型（补充默认值）
  const fullMemories: LongTermMemory[] = input.existingMemories.map((m) => ({
    ...m,
    content: '',
    relatedMemories: [],
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'agent' as const,
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
      source: 'document',
      sourceRef: input.filePath,
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
