import { ChatMessage, ChatSession } from '../../types';
import {
  ContentValue,
  classifyMessage,
  classifyMessages,
  MessageClassification,
  ToolType,
  ContentLocation,
  getToolDecayConfigs,
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
 * 计算每条消息距当前经过了多少"轮"
 * 一轮 = 一条 user 消息 或 一条 model 消息（system 消息不计轮次）
 * 返回 Map<messageId, roundsElapsed>
 */
const computeRoundsElapsed = (messages: ChatMessage[]): Map<string, number> => {
  // 从后往前扫，統計每條消息之後經過了多少輪
  let roundCounter = 0;
  const result = new Map<string, number>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    result.set(msg.id, roundCounter);
    // user 或 model 消息才算一轮（system 是工具结果，不是对话轮次）
    if (msg.role === 'user' || msg.role === 'model') {
      roundCounter++;
    }
  }

  return result;
};

/**
 * 简化版历史构建：基于真实轮次的精细化三维衰减
 *
 * 衰减规则：
 * - user 消息：永久保留
 * - 工具调用对（AI call + system response）：
 *     - roundsElapsed >= response.decayRounds → 整对从 API history 移除
 *     - roundsElapsed >= content.decayRounds  → 清空 args，只保留函数名（无内容）
 *     - roundsElapsed >= call.decayRounds     → 消息降级但保留
 * - 普通 model 文本回复：超过 decayRounds(4) 轮后移除
 */
export const buildSimpleHistory = (
  messages: ChatMessage[],
  config: Partial<HistoryBuilderConfig> = {}
): ChatMessage[] => {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (messages.length === 0) return [];

  // 1. 计算每条消息的已过轮次
  const roundsMap = computeRoundsElapsed(messages);

  // 2. 找出所有工具调用对：AI functionCall message → system functionResponse messages（1:N 支持并发工具）
  //    一条 model 消息可能有多个 functionCall，对应多个 system functionResponse 消息
  const callToResponsesMap = new Map<string, string[]>(); // aiMsgId → systemMsgId[]
  const responseToCallMap = new Map<string, string>();   // systemMsgId → aiMsgId

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'model' || !msg.rawParts?.some((p: any) => p.functionCall)) continue;

    // 收集紧跟在这条 model 消息之后的所有 system functionResponse 消息
    const responseSysIds: string[] = [];
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (next.role === 'system' && next.rawParts?.some((p: any) => p.functionResponse)) {
        responseSysIds.push(next.id);
        responseToCallMap.set(next.id, msg.id);
      } else {
        break; // 遇到非 system-response 消息就停止收集
      }
    }

    if (responseSysIds.length > 0) {
      callToResponsesMap.set(msg.id, responseSysIds);
    }
  }

  // 3. 遍历消息，按衰减规则决定是否保留
  const resultMessages: ChatMessage[] = [];
  // ⚠️ 修复：拆分为两个 Set，避免双重职责导致 system response 被误删
  // processedSysIds: 防止 system response 在主循环中被重复处理
  // droppedIds: 真正需要从最终输出中排除的消息（整组丢弃时使用）
  const processedSysIds = new Set<string>(); // 已经由 call 消息统一处理的 sys response id
  const droppedIds = new Set<string>();      // 需要从最终输出中排除的 id

  for (const msg of messages) {
    if (processedSysIds.has(msg.id)) continue; // 已由配对的 call 消息处理，跳过

    const rounds = roundsMap.get(msg.id) ?? 0;
    const classification = classifyMessage(msg);

    // ——— 用户消息：永久保留 ———
    if (msg.role === 'user') {
      resultMessages.push(msg);
      continue;
    }

    // ——— AI 工具调用消息（model with functionCall，非特殊工具）———
    // ⚠️ 关键修复：如果 model 消息有 functionCall 但找不到对应的 system response，
    // 则为孤立 tool_call（如会话意外中断），直接丢弃。
    // 原先此类消息会 fall-through 到"普通 model 文本回复"分支被保留，
    // 之后 fixWindowIntegrity 再丢弃它，导致上下文只剩 user 消息，LLM 无限重试同一工具。
    if (msg.role === 'model' && msg.rawParts?.some((p: any) => p.functionCall) && !callToResponsesMap.has(msg.id)) {
      const nextMsg = messages[i + 1];
      const nextMsgHasFnResp = nextMsg?.rawParts?.some((p: any) => p.functionResponse);
      const nextMsgHasFnCall = nextMsg?.rawParts?.some((p: any) => p.functionCall);
      console.warn(`[buildSimpleHistory] 丢弃孤立 tool_call: msgId=${msg.id}, nextMsgRole=${nextMsg?.role}, nextMsgHasFnResp=${nextMsgHasFnResp}, nextMsgHasFnCall=${nextMsgHasFnCall}`);
      continue;
    }

    if (msg.role === 'model' && callToResponsesMap.has(msg.id)) {
      const sysIds = callToResponsesMap.get(msg.id)!;
      const sysMsgs = sysIds.map(id => messages.find(m => m.id === id)).filter(Boolean) as ChatMessage[];

      // 取该 model 消息中所有 functionCall 对应的最短 decayRounds（短板效应）
      const allFunctionCalls = msg.rawParts?.filter((p: any) => p.functionCall) ?? [];
      const allConfigs = allFunctionCalls.map((p: any) => {
        const toolType = classification.toolType ?? ToolType.UNKNOWN;
        return getToolDecayConfigs(toolType);
      });
      // 如果有多个工具，用最快衰减的工具配置（最保守）
      const minResponseDecay = Math.min(...allConfigs.map(c => c.response.decayRounds));
      const minContentDecay = Math.min(...allConfigs.map(c => c.content.decayRounds));

      // response 维度衰减 → 整组丢弃（维持 API 合法性）
      if (rounds >= minResponseDecay) {
        droppedIds.add(msg.id);  // 标记 model 消息为丢弃
        sysIds.forEach(id => {
          processedSysIds.add(id); // 防止主循环再次处理
          droppedIds.add(id);      // 同时标记为丢弃
        });
        continue;
      }

      // content 维度衰减 → 保留函数名但清空所有 args
      if (rounds >= minContentDecay) {
        const strippedParts = msg.rawParts?.map((p: any) => {
          if (p.functionCall) {
            return { functionCall: { ...p.functionCall, args: {} } };
          }
          return p;
        });
        resultMessages.push({ ...msg, rawParts: strippedParts });
        sysMsgs.forEach(sysMsg => {
          resultMessages.push(sysMsg);
          processedSysIds.add(sysMsg.id); // 只防重复，不丢弃
        });
        continue;
      }

      // 完整保留
      resultMessages.push(msg);
      sysMsgs.forEach(sysMsg => {
        resultMessages.push(sysMsg);
        processedSysIds.add(sysMsg.id); // 只防重复，不丢弃
      });
      continue;
    }

    // ——— system 工具结果消息（对应的 AI call 在 responseToCallMap 中但上面未处理）———
    // 通常已经被上面的 AI call 处理逻辑 push 进去了，如果到这里说明没配对
    if (msg.role === 'system' && responseToCallMap.has(msg.id)) {
      // 孤立的 response（AI call 已衰减移除），一并移除
      continue;
    }

    // ——— 普通 system 消息（非工具输出，如错误、停止通知等）———
    // 跳过标记为 skipInHistory 的消息（如"用户已停止生成"）
    if (msg.role === 'system' && !msg.isToolOutput) {
      if (!msg.skipInHistory) {
        resultMessages.push(msg);
      }
      continue;
    }

    // ——— 普通 model 文本回复（无工具调用）———
    if (msg.role === 'model') {
      const decayRounds = classification.decayRounds === -1 ? Infinity : classification.decayRounds;
      if (rounds >= decayRounds) continue; // 超过轮次，丢弃
      resultMessages.push(msg);
      continue;
    }

    // ——— 兜底：保留 ———
    resultMessages.push(msg);
  }

  // 4. 移除真正被丢弃的消息（只过滤 droppedIds，不影响已 push 的 system response）
  const finalMessages = resultMessages.filter(m => !droppedIds.has(m.id));

  // 5. 按时间正序返回（保持 API 历史正确顺序）
  return finalMessages.sort((a, b) => a.timestamp - b.timestamp);
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
