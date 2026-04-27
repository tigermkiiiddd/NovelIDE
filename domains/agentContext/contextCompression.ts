import { ChatMessage } from '../../types';
import { ToolDefinition } from '../../services/agent/types';
import { estimatePromptTokens } from '../../utils/tokenEstimator';
import {
  classifyMessage,
  ContentValue,
  extractToolCallInfo,
  getToolType,
  ToolType,
} from './messageClassifier';
import { fixWindowIntegrity, fixWindowStart } from './windowing';

export const CONTEXT_COMPRESSION_THRESHOLD = 0.8;
export const RECENT_USER_ROUNDS_TO_KEEP = 5;

export interface DocumentRef {
  path: string;
  name: string;
  action: 'read' | 'search' | 'list' | 'write' | 'edit' | 'create' | 'delete' | 'unknown';
  sourceMessageId: string;
  summary: string;
}

export interface ContextCompressionDebug {
  originalMessageCount: number;
  sentMessageCount: number;
  compressedMessageCount: number;
  compressedUntilMessageId?: string;
  originalEstimatedTokens: number;
  compressedEstimatedTokens: number;
  thresholdTokens: number;
  compressionNodePreview?: string;
  recentDocumentRefs: DocumentRef[];
}

export interface BuildCompressedHistoryInput {
  messages: ChatMessage[];
  systemInstruction: string;
  tools?: ToolDefinition[];
  tokenLimit: number;
  thresholdRatio?: number;
  recentUserRoundsToKeep?: number;
}

export interface BuildCompressedHistoryResult {
  messages: ChatMessage[];
  compressed: boolean;
  compressedUntilMessageId?: string;
  debug: ContextCompressionDebug;
}

const isRealUserMessage = (message: ChatMessage): boolean =>
  message.role === 'user' &&
  !message.isToolOutput &&
  !message.rawParts?.some((part: any) => part.functionResponse);

const truncate = (value: unknown, maxLength = 180): string => {
  const text = typeof value === 'string' ? value : stringifyValue(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

const stringifyValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const basename = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || normalized;
};

const normalizeAction = (toolName: string): DocumentRef['action'] => {
  const toolType = getToolType(toolName);
  if (toolType === ToolType.READ_FILE) return 'read';
  if (toolType === ToolType.LIST_FILES) {
    const normalized = toolName.toLowerCase();
    if (normalized.includes('grep') || normalized.includes('search')) return 'search';
    return 'list';
  }
  if (toolType === ToolType.CREATE_FILE) return 'create';
  if (toolType === ToolType.WRITE_FILE || toolType === ToolType.UPDATE_FILE) return 'write';
  if (toolType === ToolType.PATCH_FILE) return 'edit';
  if (toolType === ToolType.DELETE_FILE) return 'delete';
  return 'unknown';
};

const extractPathsFromObject = (input: unknown): string[] => {
  if (!input || typeof input !== 'object') return [];
  const record = input as Record<string, any>;
  const pathKeys = ['path', 'filePath', 'oldPath', 'newPath', 'targetPath'];
  const paths: string[] = [];

  pathKeys.forEach((key) => {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) paths.push(value.trim());
  });

  if (Array.isArray(record.paths)) {
    record.paths.forEach((value) => {
      if (typeof value === 'string' && value.trim()) paths.push(value.trim());
    });
  }

  return Array.from(new Set(paths));
};

const extractFunctionCall = (message: ChatMessage) =>
  message.rawParts?.find((part: any) => part.functionCall) as any | undefined;

const extractFunctionResponse = (message: ChatMessage) =>
  message.rawParts?.find((part: any) => part.functionResponse) as any | undefined;

const parseArgs = (args: unknown): Record<string, any> => {
  if (!args) return {};
  if (typeof args !== 'string') return args as Record<string, any>;
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
};

const extractDocumentRefs = (messages: ChatMessage[]): DocumentRef[] => {
  const refs: DocumentRef[] = [];
  const callArgsById = new Map<string, { name: string; args: Record<string, any>; messageId: string }>();

  messages.forEach((message) => {
    const call = extractFunctionCall(message)?.functionCall;
    if (call) {
      const args = parseArgs(call.args);
      if (call.id) callArgsById.set(call.id, { name: call.name, args, messageId: message.id });

      extractPathsFromObject(args).forEach((path) => {
        refs.push({
          path,
          name: basename(path),
          action: normalizeAction(call.name),
          sourceMessageId: message.id,
          summary: `${call.name} ${path}`,
        });
      });
    }

    const response = extractFunctionResponse(message)?.functionResponse;
    if (response?.id && callArgsById.has(response.id)) {
      const source = callArgsById.get(response.id)!;
      extractPathsFromObject(source.args).forEach((path) => {
        refs.push({
          path,
          name: basename(path),
          action: normalizeAction(source.name),
          sourceMessageId: message.id,
          summary: `${source.name} ${path}: ${truncate(response.response, 100)}`,
        });
      });
    }
  });

  const byKey = new Map<string, DocumentRef>();
  refs.forEach((ref) => {
    byKey.set(`${ref.action}:${ref.path}`, ref);
  });
  return Array.from(byKey.values()).slice(-30);
};

const summarizeToolMessage = (message: ChatMessage): string | null => {
  let toolInfo;
  try {
    toolInfo = extractToolCallInfo(message);
  } catch {
    return null;
  }
  if (!toolInfo) return null;

  const classification = classifyMessage(message);
  const value = classification.contentValue;
  const name = toolInfo.functionName;

  if (value === ContentValue.LOW && classification.isToolResult) {
    return null;
  }

  if (classification.isToolCall) {
    const paths = extractPathsFromObject(toolInfo.args);
    const pathText = paths.length ? ` path=${paths.join(', ')}` : '';
    return `${name}${pathText}`;
  }

  if (classification.isToolResult) {
    return `${name} result: ${truncate(toolInfo.result, value === ContentValue.MEDIUM ? 220 : 120)}`;
  }

  return null;
};

const summarizeModelMessage = (message: ChatMessage): string | null => {
  if (message.rawParts?.some((part: any) => part.functionCall || part.functionResponse)) return null;
  const text = message.text?.trim();
  if (!text) return null;
  return truncate(text, 180);
};

const formatList = (items: string[], empty = '- 暂无明确记录'): string => {
  if (items.length === 0) return empty;
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
};

const formatDocRefs = (refs: DocumentRef[]): string => {
  if (refs.length === 0) return '- 暂无明确记录';
  return refs
    .map(ref => `- path: ${ref.path}\n  name: ${ref.name}\n  action: ${ref.action}\n  sourceMessageId: ${ref.sourceMessageId}\n  summary: ${truncate(ref.summary, 140)}`)
    .join('\n');
};

const findPreserveStartIndex = (
  messages: ChatMessage[],
  recentUserRoundsToKeep: number
): number => {
  let seenUsers = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isRealUserMessage(messages[i])) {
      seenUsers++;
      if (seenUsers >= recentUserRoundsToKeep) return i;
    }
  }

  return messages.length;
};

const buildCompressionNodeText = (
  compressedMessages: ChatMessage[],
  retainedMessages: ChatMessage[],
  documentRefs: DocumentRef[],
  compressedUntilMessageId?: string
): string => {
  const userQuotes = compressedMessages
    .filter(isRealUserMessage)
    .map(message => message.text || '');

  const modelSummaries = compressedMessages
    .map(summarizeModelMessage)
    .filter((value): value is string => Boolean(value));

  const toolSummaries = compressedMessages
    .map(summarizeToolMessage)
    .filter((value): value is string => Boolean(value));

  const recentGoal = [...retainedMessages].reverse().find(isRealUserMessage)?.text
    || userQuotes[userQuotes.length - 1]
    || '未识别到明确目标';

  const readRefs = documentRefs.filter(ref => ref.action === 'read' || ref.action === 'search' || ref.action === 'list').slice(-12);
  const editRefs = documentRefs.filter(ref => ['write', 'edit', 'create', 'delete'].includes(ref.action)).slice(-12);

  return [
    '# 上下文压缩节点',
    '',
    '这是前情提要，不是新的用户请求。请基于此继续压缩节点之后的对话。',
    '',
    '## 上下文状态',
    `- compressedUntilMessageId: ${compressedUntilMessageId || 'unknown'}`,
    `- compressedMessages: ${compressedMessages.length}`,
    `- retainedRecentMessages: ${retainedMessages.length}`,
    '- strategy: 代码级确定性压缩，原始 ChatSession.messages/rawParts 未被修改',
    '',
    '## 用户原话',
    formatList(userQuotes),
    '',
    '## 当前目标',
    `- ${recentGoal}`,
    '',
    '## 用户硬约束',
    formatList(userQuotes.filter(text => /必须|不要|禁止|保留|完整|原话|注意|一定|不能|不需要|只|先/.test(text)).map(text => truncate(text, 240))),
    '',
    '## 已完成动作',
    formatList(toolSummaries.slice(-30)),
    '',
    '## 关键发现/决策',
    formatList(modelSummaries.slice(-20)),
    '',
    '## 最近读取文档',
    formatDocRefs(readRefs),
    '',
    '## 最近编辑文档',
    formatDocRefs(editRefs),
    '',
    '## 重要工具结果摘要',
    formatList(toolSummaries.slice(-20)),
    '',
    '## 未完成事项',
    '- 继续执行压缩节点之后最近用户消息所要求的任务。',
    '- 如近期消息中已有具体下一步，以近期消息为准。',
    '',
    '## 风险/待确认点',
    '- 压缩节点只保留早期历史的结构化摘要；需要逐字内容时应重新读取对应文件或查看原始会话。',
  ].join('\n');
};

export const buildCompressedHistoryView = ({
  messages,
  systemInstruction,
  tools = [],
  tokenLimit,
  thresholdRatio = CONTEXT_COMPRESSION_THRESHOLD,
  recentUserRoundsToKeep = RECENT_USER_ROUNDS_TO_KEEP,
}: BuildCompressedHistoryInput): BuildCompressedHistoryResult => {
  const thresholdTokens = Math.floor(tokenLimit * thresholdRatio);
  const originalEstimatedTokens = estimatePromptTokens({ systemInstruction, messages, tools });
  const baseDebug = {
    originalMessageCount: messages.length,
    sentMessageCount: messages.length,
    compressedMessageCount: 0,
    originalEstimatedTokens,
    compressedEstimatedTokens: originalEstimatedTokens,
    thresholdTokens,
    recentDocumentRefs: [] as DocumentRef[],
  };

  if (!Number.isFinite(tokenLimit) || tokenLimit <= 0 || originalEstimatedTokens <= thresholdTokens) {
    return { messages, compressed: false, debug: baseDebug };
  }

  const preserveStartIndex = findPreserveStartIndex(messages, recentUserRoundsToKeep);
  if (preserveStartIndex <= 0) {
    return { messages, compressed: false, debug: baseDebug };
  }

  const compressedMessages = messages.slice(0, preserveStartIndex);
  const retainedMessages = fixWindowIntegrity(fixWindowStart(messages.slice(preserveStartIndex)));
  if (compressedMessages.length === 0 || retainedMessages.length === 0) {
    return { messages, compressed: false, debug: baseDebug };
  }

  const compressedUntilMessageId = compressedMessages[compressedMessages.length - 1]?.id;
  const recentDocumentRefs = extractDocumentRefs(compressedMessages);
  const compressionText = buildCompressionNodeText(
    compressedMessages,
    retainedMessages,
    recentDocumentRefs,
    compressedUntilMessageId
  );
  const compressionNode: ChatMessage = {
    id: `context-compression-${compressedUntilMessageId || 'root'}`,
    role: 'system',
    text: compressionText,
    timestamp: compressedMessages[compressedMessages.length - 1]?.timestamp || Date.now(),
    metadata: {
      logType: 'info',
      synthetic: true,
      compressionNode: true,
      compressedUntilMessageId,
    },
  };

  const compressedView = [compressionNode, ...retainedMessages];
  const compressedEstimatedTokens = estimatePromptTokens({
    systemInstruction,
    messages: compressedView,
    tools,
  });

  return {
    messages: compressedView,
    compressed: true,
    compressedUntilMessageId,
    debug: {
      originalMessageCount: messages.length,
      sentMessageCount: compressedView.length,
      compressedMessageCount: compressedMessages.length,
      compressedUntilMessageId,
      originalEstimatedTokens,
      compressedEstimatedTokens,
      thresholdTokens,
      compressionNodePreview: compressionText.slice(0, 1200),
      recentDocumentRefs,
    },
  };
};
