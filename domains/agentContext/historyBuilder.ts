import { ChatMessage, ChatSession } from '../../types';
import {
  ContentValue,
  classifyMessage,
  classifyMessages,
  MessageClassification,
  ToolType,
  ContentLocation
} from './messageClassifier';
import {
  LifecycleManager,
  getAttenuationStrategy,
  applyAttenuation
} from './toolLifecycle';

/**
 * 历史记录构建配置
 */
interface HistoryBuilderConfig {
  maxRounds: number;           // 最大轮次数
  maxMessages: number;         // 最大消息数
  preserveThinking: boolean;   // 是否保留 thinking
  preserveSystem: boolean;     // 是否保留系统消息
  preserveErrors: boolean;     // 是否保留错误消息
  truncateLongText: number;   // 长文本截断阈值
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: HistoryBuilderConfig = {
  maxRounds: 10,
  maxMessages: 30,
  preserveThinking: true,
  preserveSystem: true,
  preserveErrors: true,
  truncateLongText: 2000
};

/**
 * 按价值分类的消息分组
 */
interface MessageGroup {
  highValue: ChatMessage[];   // 高价值 (thinking)
  mediumValue: ChatMessage[]; // 中价值
  lowValue: ChatMessage[];    // 低价值
  system: ChatMessage[];      // 系统消息
  errors: ChatMessage[];      // 错误消息
}

/**
 * 按价值矩阵分组消息
 */
export const groupMessagesByValue = (
  messages: ChatMessage[],
  config: Partial<HistoryBuilderConfig> = {}
): MessageGroup => {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const classifications = classifyMessages(messages);

  const groups: MessageGroup = {
    highValue: [],
    mediumValue: [],
    lowValue: [],
    system: [],
    errors: []
  };

  messages.forEach((message, index) => {
    const classification = classifications[index];

    // 优先保留系统消息
    if (cfg.preserveSystem && message.role === 'system') {
      groups.system.push(message);
      return;
    }

    // 优先保留错误消息
    if (cfg.preserveErrors && message.isError) {
      groups.errors.push(message);
      return;
    }

    // thinking 工具消息完整保留
    if (cfg.preserveThinking && classification.isThinking) {
      groups.highValue.push(message);
      return;
    }

    // 根据价值分组
    switch (classification.contentValue) {
      case ContentValue.HIGH:
        groups.highValue.push(message);
        break;
      case ContentValue.MEDIUM:
        groups.mediumValue.push(message);
        break;
      case ContentValue.LOW:
        groups.lowValue.push(message);
        break;
      default:
        groups.mediumValue.push(message);
    }
  });

  return groups;
};

/**
 * 消息排序优先级
 */
const getMessagePriority = (classification: MessageClassification): number => {
  // 高价值最高优先级
  if (classification.contentValue === ContentValue.HIGH) return 100;
  // 工具结果其次
  if (classification.isToolResult) return 50;
  // 工具调用再次
  if (classification.isToolCall) return 40;
  // 用户消息
  if (classification.role === 'user') return 30;
  // 模型消息
  if (classification.role === 'model') return 20;
  return 10;
};

/**
 * 构建用于 API 的历史消息
 * 包含精细化的生命周期管理和价值衰减
 */
export const buildRefinedHistory = (
  messages: ChatMessage[],
  lifecycleManager: LifecycleManager,
  config: Partial<HistoryBuilderConfig> = {}
): ChatMessage[] => {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. 按价值分组
  const groups = groupMessagesByValue(messages, config);

  // 2. 获取生命周期允许的消息
  const aliveMessageIds = new Set(lifecycleManager.getMessagesForPrompt());

  // 3. 分类并排序消息
  const classifiedMessages: Array<{
    message: ChatMessage;
    classification: MessageClassification;
    priority: number;
  }> = [];

  messages.forEach((message, index) => {
    const classification = classifyMessage(message);

    // 始终保留系统消息
    if (message.role === 'system') {
      classifiedMessages.push({
        message,
        classification,
        priority: 200
      });
      return;
    }

    // 始终保留错误消息
    if (message.isError) {
      classifiedMessages.push({
        message,
        classification,
        priority: 150
      });
      return;
    }

    // 检查生命周期状态
    if (!aliveMessageIds.has(message.id)) {
      // 消息已衰减，检查是否需要应用衰减内容
      if (classification.contentValue === ContentValue.HIGH) {
        // 高价值内容不应衰减
        classifiedMessages.push({
          message,
          classification,
          priority: getMessagePriority(classification)
        });
      }
      return;
    }

    classifiedMessages.push({
      message,
      classification,
      priority: getMessagePriority(classification)
    });
  });

  // 4. 按优先级和时间排序
  classifiedMessages.sort((a, b) => {
    // 首先按优先级
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    // 同优先级按时间排序，较新的优先
    return b.message.timestamp - a.message.timestamp;
  });

  // 5. 应用衰减
  const result: ChatMessage[] = [];

  for (const { message, classification } of classifiedMessages) {
    // 应用内容衰减 - 根据内容价值和位置
    let processedText = message.text;

    // 根据内容价值决定是否截断
    if (classification.contentValue === ContentValue.LOW) {
      // 低价值内容直接截断
      const strategy = getAttenuationStrategy(classification.contentLocation, 2);
      processedText = applyAttenuation(message.text, strategy, cfg.truncateLongText);
    } else if (message.text.length > cfg.truncateLongText) {
      // 长文本截断
      processedText = message.text.slice(0, cfg.truncateLongText) + '...[已截断]';
    }

    result.push({
      ...message,
      text: processedText
    });
  }

  // 6. 按时间顺序排列返回
  result.sort((a, b) => a.timestamp - b.timestamp);

  // 7. 最终滑动窗口截断（哪怕是永久保留的高价值，超过窗口大小也会被剔除）
  return result.slice(-cfg.maxMessages);
};

/**
 * 为会话构建历史记录
 */
export const buildSessionHistory = (
  session: ChatSession,
  lifecycleManager: LifecycleManager,
  config?: Partial<HistoryBuilderConfig>
): ChatMessage[] => {
  return buildRefinedHistory(session.messages, lifecycleManager, config);
};

/**
 * 简化版：仅按价值矩阵过滤，不使用生命周期管理
 * 适用于不需要轮次追踪的场景
 */
export const buildSimpleHistory = (
  messages: ChatMessage[],
  config: Partial<HistoryBuilderConfig> = {}
): ChatMessage[] => {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const groups = groupMessagesByValue(messages, config);
  const result: ChatMessage[] = [];
  let remaining = cfg.maxMessages;

  // 辅助函数：将按老到新排序的消息，从新到老（优先保留新消息）地填充到 result
  const fillMessages = (pool: ChatMessage[]) => {
    // 按时间从新到老排列候选池
    const sortedPool = [...pool].sort((a, b) => b.timestamp - a.timestamp);
    const toTake = sortedPool.slice(0, remaining);
    remaining -= toTake.length;
    result.push(...toTake);
  };

  // 按优先级顺序填充（高级别全拿如果配额足够，或者取最新的）

  // 1. 高价值 (永久保留，就算超配额也优先取最新)
  fillMessages(groups.highValue);

  // 2. 必须保留的系统/报错
  if (remaining > 0) fillMessages(groups.system);
  if (remaining > 0) fillMessages(groups.errors);

  // 3. 中等价值
  if (remaining > 0) fillMessages(groups.mediumValue);

  // 4. 低等价值 (并且尝试应用长文本衰减截断)
  if (remaining > 0) {
    const sortedLowPool = [...groups.lowValue].sort((a, b) => b.timestamp - a.timestamp);
    const toTakeLow = sortedLowPool.slice(0, remaining);
    const decayedLow = toTakeLow.map(msg => {
      const classification = classifyMessages([msg])[0];
      const strategy = getAttenuationStrategy(classification.contentLocation, 2);
      return {
        ...msg,
        text: applyAttenuation(msg.text, strategy, cfg.truncateLongText)
      };
    });
    result.push(...decayedLow);
    remaining -= toTakeLow.length;
  }

  // 最后把被选中的按时间老 -> 新正序排列返回
  return result.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * 获取构建历史时的统计信息
 */
export const getHistoryStats = (messages: ChatMessage[]): {
  total: number;
  byRole: Record<string, number>;
  byValue: Record<ContentValue, number>;
  toolTypes: Record<ToolType, number>;
} => {
  const classifications = classifyMessages(messages);

  const byRole: Record<string, number> = {
    user: 0,
    model: 0,
    system: 0
  };

  const byValue: Record<ContentValue, number> = {
    [ContentValue.HIGH]: 0,
    [ContentValue.MEDIUM]: 0,
    [ContentValue.LOW]: 0
  };

  const toolTypes: Record<ToolType, number> = {
    [ToolType.READ_FILE]: 0,
    [ToolType.CREATE_FILE]: 0,
    [ToolType.WRITE_FILE]: 0,
    [ToolType.PATCH_FILE]: 0,
    [ToolType.UPDATE_FILE]: 0,
    [ToolType.DELETE_FILE]: 0,
    [ToolType.LIST_FILES]: 0,
    [ToolType.MANAGE_TODOS]: 0,
    [ToolType.THINKING]: 0,
    [ToolType.CALL_SEARCH_AGENT]: 0,
    [ToolType.MANAGE_PLAN_NOTE]: 0,
    [ToolType.UPDATE_PROJECT_META]: 0,
    [ToolType.UNKNOWN]: 0
  };

  classifications.forEach(c => {
    byRole[c.role]++;
    byValue[c.contentValue]++;
    if (c.toolType) {
      toolTypes[c.toolType]++;
    }
  });

  return {
    total: messages.length,
    byRole,
    byValue,
    toolTypes
  };
};
