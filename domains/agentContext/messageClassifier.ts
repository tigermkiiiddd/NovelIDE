import { ChatMessage, ToolCallResult } from '../../types';

/**
 * 工具类型枚举
 */
export enum ToolType {
  // 文件操作
  READ_FILE = 'readFile',
  CREATE_FILE = 'createFile',
  WRITE_FILE = 'writeFile',
  PATCH_FILE = 'patchFile',
  UPDATE_FILE = 'updateFile',
  DELETE_FILE = 'deleteFile',
  LIST_FILES = 'listFiles',

  // 任务管理
  MANAGE_TODOS = 'manageTodos',

  // 计划笔记
  MANAGE_PLAN_NOTE = 'managePlanNote',

  // 项目元数据
  UPDATE_PROJECT_META = 'updateProjectMeta',

  // 未知
  UNKNOWN = 'unknown'
}

const TOOL_TYPE_ALIASES: Record<string, ToolType> = {
  read: ToolType.READ_FILE,
  readfile: ToolType.READ_FILE,

  write: ToolType.WRITE_FILE,
  writefile: ToolType.WRITE_FILE,

  edit: ToolType.PATCH_FILE,
  patchfile: ToolType.PATCH_FILE,

  createfile: ToolType.CREATE_FILE,
  updatefile: ToolType.UPDATE_FILE,
  deletefile: ToolType.DELETE_FILE,

  glob: ToolType.LIST_FILES,
  listfiles: ToolType.LIST_FILES,
  grep: ToolType.LIST_FILES,
  searchfiles: ToolType.LIST_FILES,
  searchfile: ToolType.LIST_FILES,

  managetodos: ToolType.MANAGE_TODOS,
  manageplannote: ToolType.MANAGE_PLAN_NOTE,
  updateprojectmeta: ToolType.UPDATE_PROJECT_META
};

const normalizeToolName = (toolName: string): string =>
  toolName.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * 内容价值等级
 */
export enum ContentValue {
  HIGH = 'high',     // 完整保留 (thinking)
  MEDIUM = 'medium', // 3-5轮衰减
  LOW = 'low'        // 快速衰减
}

/**
 * 内容类型
 */
export enum ContentType {
  PATH = 'path',
  CONTENT = 'content',
  DIFF = 'diff',
  LIST = 'list',
  STATUS = 'status',
  TASK = 'task',
  ACTION = 'action',
  QUERY = 'query',
  NOTE = 'note',
  THOUGHT = 'thought',
  MIXED = 'mixed',
  UNKNOWN = 'unknown'
}

/**
 * 消息内容位置
 */
export enum ContentLocation {
  TEXT = 'text',
  RAW_PARAMS = 'rawParts_params',
  RAW_RESULT = 'rawParts_result'
}

/**
 * 参数价值配置
 */
const PARAM_VALUE_CONFIG: Record<ToolType, Record<string, { type: ContentType; value: ContentValue; decayRounds: number }>> = {
  [ToolType.READ_FILE]: {
    path: { type: ContentType.PATH, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.CREATE_FILE]: {
    path: { type: ContentType.PATH, value: ContentValue.MEDIUM, decayRounds: 4 },
    content: { type: ContentType.CONTENT, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.WRITE_FILE]: {
    path: { type: ContentType.PATH, value: ContentValue.MEDIUM, decayRounds: 4 },
    content: { type: ContentType.CONTENT, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.PATCH_FILE]: {
    path: { type: ContentType.PATH, value: ContentValue.MEDIUM, decayRounds: 4 },
    patches: { type: ContentType.DIFF, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.UPDATE_FILE]: {
    path: { type: ContentType.PATH, value: ContentValue.MEDIUM, decayRounds: 4 },
    content: { type: ContentType.CONTENT, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.DELETE_FILE]: {
    path: { type: ContentType.PATH, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.LIST_FILES]: {
    path: { type: ContentType.PATH, value: ContentValue.LOW, decayRounds: 1 }
  },
  [ToolType.MANAGE_TODOS]: {
    action: { type: ContentType.ACTION, value: ContentValue.LOW, decayRounds: 1 },
    todo: { type: ContentType.TASK, value: ContentValue.MEDIUM, decayRounds: 4 },
    task: { type: ContentType.TASK, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.MANAGE_PLAN_NOTE]: {
    noteId: { type: ContentType.NOTE, value: ContentValue.MEDIUM, decayRounds: 3 },
    content: { type: ContentType.NOTE, value: ContentValue.MEDIUM, decayRounds: 3 },
    action: { type: ContentType.ACTION, value: ContentValue.MEDIUM, decayRounds: 3 }
  },
  [ToolType.UPDATE_PROJECT_META]: {
    key: { type: ContentType.MIXED, value: ContentValue.MEDIUM, decayRounds: 5 },
    value: { type: ContentType.MIXED, value: ContentValue.MEDIUM, decayRounds: 5 }
  },
  [ToolType.UNKNOWN]: {}
};

/**
 * 结果价值配置
 */
const RESULT_VALUE_CONFIG: Record<ToolType, Record<string, { type: ContentType; value: ContentValue; decayRounds: number }>> = {
  [ToolType.READ_FILE]: {
    content: { type: ContentType.CONTENT, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.CREATE_FILE]: {
    status: { type: ContentType.STATUS, value: ContentValue.LOW, decayRounds: 1 }
  },
  [ToolType.WRITE_FILE]: {
    status: { type: ContentType.STATUS, value: ContentValue.LOW, decayRounds: 1 }
  },
  [ToolType.PATCH_FILE]: {
    status: { type: ContentType.STATUS, value: ContentValue.LOW, decayRounds: 1 }
  },
  [ToolType.UPDATE_FILE]: {
    status: { type: ContentType.STATUS, value: ContentValue.LOW, decayRounds: 1 }
  },
  [ToolType.DELETE_FILE]: {
    status: { type: ContentType.STATUS, value: ContentValue.LOW, decayRounds: 1 }
  },
  [ToolType.LIST_FILES]: {
    files: { type: ContentType.LIST, value: ContentValue.MEDIUM, decayRounds: 3 }
  },
  [ToolType.MANAGE_TODOS]: {
    todos: { type: ContentType.LIST, value: ContentValue.MEDIUM, decayRounds: 4 }
  },
  [ToolType.MANAGE_PLAN_NOTE]: {
    status: { type: ContentType.STATUS, value: ContentValue.LOW, decayRounds: 1 }
  },
  [ToolType.UPDATE_PROJECT_META]: {
    status: { type: ContentType.STATUS, value: ContentValue.MEDIUM, decayRounds: 5 }
  },
  [ToolType.UNKNOWN]: {}
};

/**
 * 从工具名称获取工具类型
 */
export const getToolType = (toolName: string): ToolType => {
  const normalized = normalizeToolName(toolName);
  const alias = TOOL_TYPE_ALIASES[normalized];
  if (alias) return alias;

  const toolKey = Object.keys(ToolType).find(
    key => normalizeToolName(ToolType[key as keyof typeof ToolType]) === normalized
  );
  return toolKey ? ToolType[toolKey as keyof typeof ToolType] : ToolType.UNKNOWN;
};

/**
 * 从消息中提取工具调用信息
 */
export interface ToolCallInfo {
  toolName: ToolType;
  toolCallId?: string;
  functionName: string;
  args: Record<string, any>;
  result?: any;
}

/**
 * 从 ChatMessage 中提取工具调用信息
 */
export const extractToolCallInfo = (message: ChatMessage): ToolCallInfo | null => {
  if (!message.rawParts || !Array.isArray(message.rawParts)) {
    return null;
  }

  // 查找 functionCall 或 functionResponse
  const functionCall = message.rawParts.find((part): part is import('../../types').FunctionCallPart => 'functionCall' in part);
  const functionResponse = message.rawParts.find((part): part is import('../../types').FunctionResponsePart => 'functionResponse' in part);

  if (functionCall) {
    const fc = functionCall.functionCall;
    return {
      toolName: getToolType(fc.name),
      functionName: fc.name,
      args: typeof fc.args === 'string' ? JSON.parse(fc.args) : fc.args
    };
  }

  if (functionResponse) {
    const fr = functionResponse.functionResponse;
    return {
      toolName: getToolType(fr.name),
      functionName: fr.name,
      args: {},
      result: fr.response
    };
  }

  return null;
};

/**
 * 从 ToolCallResult 中提取工具调用信息
 */
export const extractToolResultInfo = (result: ToolCallResult): ToolCallInfo => ({
  toolName: getToolType(result.functionName),
  functionName: result.functionName,
  args: result.args,
  result: result.result
});

/**
 * 获取参数的价值配置
 */
export const getParamValueConfig = (toolType: ToolType, paramKey: string) => {
  return PARAM_VALUE_CONFIG[toolType]?.[paramKey];
};

/**
 * 获取结果的价值配置
 */
export const getResultValueConfig = (toolType: ToolType, resultKey: string) => {
  return RESULT_VALUE_CONFIG[toolType]?.[resultKey];
};

/**
 * 获取工具调用的精细衰减配置（5维度模型）
 * - call: 工具名称 (~5-20 tokens)
 * - path: 文件/目录路径 (~10-50 tokens)
 * - content: 主参数内容 (varies)
 * - status: 操作状态 (~10-50 tokens)
 * - results: 大型数据载荷 (100s-1000s tokens)
 */
export const getToolDecayConfigs = (toolType: ToolType): ToolDecayConfigs => {
  // 默认配置
  const defaultConfig: ToolDecayConfigs = {
    call: { value: ContentValue.LOW, decayRounds: 12 },
    path: { value: ContentValue.MEDIUM, decayRounds: 8 },
    content: { value: ContentValue.MEDIUM, decayRounds: 8 },
    status: { value: ContentValue.MEDIUM, decayRounds: 30 },
    results: { value: ContentValue.LOW, decayRounds: 8 }
  };

  switch (toolType) {
    case ToolType.READ_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.MEDIUM, decayRounds: 12 },
        content: { value: ContentValue.MEDIUM, decayRounds: 8 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 30 }
      };

    case ToolType.CREATE_FILE:
    case ToolType.WRITE_FILE:
    case ToolType.UPDATE_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.MEDIUM, decayRounds: 16 },
        content: { value: ContentValue.LOW, decayRounds: 4 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 30 }
      };

    case ToolType.PATCH_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.MEDIUM, decayRounds: 16 },
        content: { value: ContentValue.LOW, decayRounds: 4 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 30 }
      };

    case ToolType.DELETE_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.MEDIUM, decayRounds: 30 },
        content: { value: ContentValue.LOW, decayRounds: 4 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 30 }
      };

    case ToolType.LIST_FILES:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.LOW, decayRounds: 4 },
        content: { value: ContentValue.LOW, decayRounds: 4 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 4 }
      };

    case ToolType.MANAGE_TODOS:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.LOW, decayRounds: 4 },
        content: { value: ContentValue.LOW, decayRounds: 4 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 4 }
      };

    case ToolType.MANAGE_PLAN_NOTE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.MEDIUM, decayRounds: 8 },
        content: { value: ContentValue.MEDIUM, decayRounds: 30 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 30 }
      };

    case ToolType.UPDATE_PROJECT_META:
      return {
        call: { value: ContentValue.LOW, decayRounds: 12 },
        path: { value: ContentValue.LOW, decayRounds: 4 },
        content: { value: ContentValue.MEDIUM, decayRounds: 8 },
        status: { value: ContentValue.MEDIUM, decayRounds: 30 },
        results: { value: ContentValue.MEDIUM, decayRounds: 30 }
      };

    default:
      return defaultConfig;
  }
};

/**
 * 衰减维度类型
 */
export type DecayDimension = 'call' | 'path' | 'content' | 'status' | 'results' | 'content_text';

/**
 * 单个衰减维度的配置
 */
export interface DecayConfig {
  value: ContentValue;
  decayRounds: number;
}

/**
 * 工具调用的精细衰减配置（5维度）
 */
export interface ToolDecayConfigs {
  call: DecayConfig;      // 工具名称
  path: DecayConfig;      // 文件/目录路径
  content: DecayConfig;   // 主参数内容
  status: DecayConfig;    // 操作状态
  results: DecayConfig;   // 大型数据载荷
}

/**
 * 消息分类结果
 */
export interface MessageClassification {
  messageId: string;
  role: 'user' | 'model' | 'system';
  isToolCall: boolean;
  isToolResult: boolean;
  isThinking: boolean;
  toolType?: ToolType;

  // 统一的衰减配置（兼容旧逻辑）
  contentValue: ContentValue;
  decayRounds: number;
  contentLocation: ContentLocation;
  decayDimension: DecayDimension;

  // 精细化衰减配置（工具调用专用）
  toolDecayConfigs?: ToolDecayConfigs;
}

/**
 * 分类单条消息
 */
export const classifyMessage = (message: ChatMessage): MessageClassification => {
  const toolInfo = extractToolCallInfo(message);

  // 是工具调用 (call)
  if (toolInfo && !message.isToolOutput) {
    const configs = getToolDecayConfigs(toolInfo.toolName);
    return {
      messageId: message.id,
      role: message.role,
      isToolCall: true,
      isToolResult: false,
      isThinking: false,
      toolType: toolInfo.toolName,
      contentValue: configs.call.value, // 使用 call 维度的价值
      decayRounds: configs.call.decayRounds,
      contentLocation: ContentLocation.RAW_PARAMS,
      decayDimension: 'call',
      toolDecayConfigs: configs
    };
  }

  // 是工具结果 (response)
  if (message.isToolOutput || toolInfo?.result !== undefined) {
    const configs = toolInfo ? getToolDecayConfigs(toolInfo.toolName) : getToolDecayConfigs(ToolType.UNKNOWN);

    return {
      messageId: message.id,
      role: message.role,
      isToolCall: false,
      isToolResult: true,
      isThinking: false,
      toolType: toolInfo?.toolName,
      contentValue: configs.results.value, // results 维度为主要价值
      decayRounds: configs.results.decayRounds,
      contentLocation: ContentLocation.RAW_RESULT,
      decayDimension: 'results',
      toolDecayConfigs: configs
    };
  }

  // 普通消息 - 用户消息为 HIGH 价值（不衰减）
  if (message.role === 'user') {
    return {
      messageId: message.id,
      role: message.role,
      isToolCall: false,
      isToolResult: false,
      isThinking: false,
      contentValue: ContentValue.HIGH,
      decayRounds: -1,
      contentLocation: ContentLocation.TEXT,
      decayDimension: 'content'
    };
  }

  // 模型普通回复为 MEDIUM 价值
  return {
    messageId: message.id,
    role: message.role,
    isToolCall: false,
    isToolResult: false,
    isThinking: false,
    contentValue: ContentValue.MEDIUM,
    decayRounds: 4,
    contentLocation: ContentLocation.TEXT,
    decayDimension: 'content'
  };
};

/**
 * 批量分类消息
 */
export const classifyMessages = (messages: ChatMessage[]): MessageClassification[] => {
  return messages.map(classifyMessage);
};
