import { ChatMessage } from '../../types';
import {
  ContentValue,
  MessageClassification,
  classifyMessage,
  ContentLocation
} from './messageClassifier';

/**
 * 消息生命周期状态
 */
export interface MessageLifecycle {
  messageId: string;
  classification: MessageClassification;
  roundAdded: number;
  currentRound: number;
  decayRounds: number;
  isAlive: boolean;
  attenuationLevel: number; // 0 = 完整, 1 = 衰减50%, 2 = 衰减75%
}

/**
 * 生命周期管理配置
 */
interface LifecycleConfig {
  maxAttenuationLevel: number; // 最大衰减级别
  highValueDecayRounds: number; // 高价值内容保留轮次
  mediumValueDecayRounds: number; // 中价值内容保留轮次
  lowValueDecayRounds: number; // 低价值内容保留轮次
}

const DEFAULT_CONFIG: LifecycleConfig = {
  maxAttenuationLevel: 3,
  highValueDecayRounds: -1, // 永久保留
  mediumValueDecayRounds: 4,
  lowValueDecayRounds: 1
};

/**
 * 创建消息生命周期记录
 */
export const createMessageLifecycle = (
  message: ChatMessage,
  currentRound: number
): MessageLifecycle => {
  const classification = classifyMessage(message);

  // 高价值内容永久保留
  if (classification.contentValue === ContentValue.HIGH) {
    return {
      messageId: message.id,
      classification,
      roundAdded: currentRound,
      currentRound,
      decayRounds: -1,
      isAlive: true,
      attenuationLevel: 0
    };
  }

  // 根据价值确定衰减轮次
  let decayRounds: number;
  switch (classification.contentValue) {
    case ContentValue.LOW:
      decayRounds = DEFAULT_CONFIG.lowValueDecayRounds;
      break;
    case ContentValue.MEDIUM:
      decayRounds = classification.decayRounds || DEFAULT_CONFIG.mediumValueDecayRounds;
      break;
    default:
      decayRounds = DEFAULT_CONFIG.mediumValueDecayRounds;
  }

  return {
    messageId: message.id,
    classification,
    roundAdded: currentRound,
    currentRound,
    decayRounds,
    isAlive: true,
    attenuationLevel: 0
  };
};

/**
 * 计算消息是否应该存活以及衰减级别
 */
export const calculateLifecycleState = (
  lifecycle: MessageLifecycle,
  currentRound: number
): MessageLifecycle => {
  // 高价值内容永久存活
  if (lifecycle.decayRounds === -1) {
    return {
      ...lifecycle,
      currentRound,
      isAlive: true,
      attenuationLevel: 0
    };
  }

  const roundsSinceAdded = currentRound - lifecycle.roundAdded;

  // 已超过保留轮次，标记为死亡
  if (roundsSinceAdded >= lifecycle.decayRounds) {
    return {
      ...lifecycle,
      currentRound,
      isAlive: false,
      attenuationLevel: DEFAULT_CONFIG.maxAttenuationLevel
    };
  }

  // 计算衰减级别
  const decayProgress = roundsSinceAdded / lifecycle.decayRounds;
  let attenuationLevel = 0;

  if (decayProgress >= 0.75) {
    attenuationLevel = 2;
  } else if (decayProgress >= 0.5) {
    attenuationLevel = 1;
  }

  return {
    ...lifecycle,
    currentRound,
    isAlive: true,
    attenuationLevel
  };
};

/**
 * 过滤并更新消息生命周期
 */
export const updateMessageLifecycles = (
  lifecycles: MessageLifecycle[],
  currentRound: number
): MessageLifecycle[] => {
  return lifecycles.map(lifecycle => calculateLifecycleState(lifecycle, currentRound));
};

/**
 * 获取当前轮次存活的消息
 */
export const getAliveMessages = (
  lifecycles: MessageLifecycle[]
): string[] => {
  return lifecycles
    .filter(l => l.isAlive)
    .map(l => l.messageId);
};

/**
 * 衰减策略：决定如何处理衰减内容
 */
export enum AttenuationStrategy {
  REMOVE = 'remove',           // 完全移除
  TRUNCATE = 'truncate',       // 截断内容
  SUMMARIZE = 'summarize',     // 压缩摘要
  KEEP_REFERENCE = 'keep_reference' // 保留引用
}

/**
 * 根据内容位置和衰减级别获取衰减策略
 */
export const getAttenuationStrategy = (
  location: ContentLocation,
  attenuationLevel: number
): AttenuationStrategy => {
  // 高衰减级别直接移除
  if (attenuationLevel >= 2) {
    return AttenuationStrategy.REMOVE;
  }

  // 工具结果快速衰减
  if (location === ContentLocation.RAW_RESULT) {
    return attenuationLevel >= 1
      ? AttenuationStrategy.TRUNCATE
      : AttenuationStrategy.KEEP_REFERENCE;
  }

  // 参数字段根据级别衰减
  if (location === ContentLocation.RAW_PARAMS) {
    return attenuationLevel >= 1
      ? AttenuationStrategy.TRUNCATE
      : AttenuationStrategy.KEEP_REFERENCE;
  }

  // 文本内容可以截断
  if (location === ContentLocation.TEXT) {
    return attenuationLevel >= 1
      ? AttenuationStrategy.TRUNCATE
      : AttenuationStrategy.KEEP_REFERENCE;
  }

  return AttenuationStrategy.KEEP_REFERENCE;
};

/**
 * 应用衰减策略到消息内容
 */
export const applyAttenuation = (
  content: string,
  strategy: AttenuationStrategy,
  maxLength: number = 200
): string => {
  switch (strategy) {
    case AttenuationStrategy.REMOVE:
      return '';

    case AttenuationStrategy.TRUNCATE:
      if (content.length <= maxLength) {
        return content;
      }
      return content.slice(0, maxLength) + '... [已衰减]';

    case AttenuationStrategy.SUMMARIZE:
      // 简化为保留首句
      const firstSentence = content.split(/[。！？\n]/)[0];
      return firstSentence.length < content.length
        ? firstSentence + '... [摘要]'
        : content;

    case AttenuationStrategy.KEEP_REFERENCE:
    default:
      return content;
  }
};

/**
 * 消息生命周期管理器
 */
export class LifecycleManager {
  private lifecycles: Map<string, MessageLifecycle> = new Map();
  private currentRound: number = 0;
  private config: LifecycleConfig;

  constructor(config: Partial<LifecycleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 添加消息到生命周期管理
   */
  addMessage(message: ChatMessage): void {
    const lifecycle = createMessageLifecycle(message, this.currentRound);
    this.lifecycles.set(message.id, lifecycle);
  }

  /**
   * 推进到下一轮
   */
  advanceRound(): void {
    this.currentRound++;
    // 更新所有消息的生命周期状态
    const updatedLifecycles: Map<string, MessageLifecycle> = new Map();
    this.lifecycles.forEach((lifecycle, id) => {
      const updated = calculateLifecycleState(lifecycle, this.currentRound);
      // 只保留仍然存活的消息
      if (updated.isAlive) {
        updatedLifecycles.set(id, updated);
      }
    });
    this.lifecycles = updatedLifecycles;
  }

  /**
   * 获取当前轮次
   */
  getCurrentRound(): number {
    return this.currentRound;
  }

  /**
   * 获取所有活跃消息的生命周期
   */
  getActiveLifecycles(): MessageLifecycle[] {
    return Array.from(this.lifecycles.values()).filter(l => l.isAlive);
  }

  /**
   * 获取应该包含在 prompt 中的消息 ID
   */
  getMessagesForPrompt(): string[] {
    return this.getActiveLifecycles().map(l => l.messageId);
  }

  /**
   * 获取特定消息的衰减后内容
   */
  getAttenuatedContent(message: ChatMessage): string {
    const lifecycle = this.lifecycles.get(message.id);
    if (!lifecycle) {
      // 未管理的消息，假设是新消息，不衰减
      return message.text;
    }

    const strategy = getAttenuationStrategy(
      lifecycle.classification.contentLocation,
      lifecycle.attenuationLevel
    );

    return applyAttenuation(message.text, strategy);
  }

  /**
   * 重置生命周期管理器
   */
  reset(): void {
    this.lifecycles.clear();
    this.currentRound = 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; alive: number; byValue: Record<ContentValue, number> } {
    const lifecycles = Array.from(this.lifecycles.values());
    const byValue: Record<ContentValue, number> = {
      [ContentValue.HIGH]: 0,
      [ContentValue.MEDIUM]: 0,
      [ContentValue.LOW]: 0
    };

    lifecycles.forEach(l => {
      byValue[l.classification.contentValue]++;
    });

    return {
      total: lifecycles.length,
      alive: lifecycles.filter(l => l.isAlive).length,
      byValue
    };
  }
}
