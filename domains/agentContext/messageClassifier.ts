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

  // 思考工具（已移除）
  // THINKING = 'thinking',

  // 搜索
  CALL_SEARCH_AGENT = 'call_search_agent',

  // 计划笔记
  MANAGE_PLAN_NOTE = 'managePlanNote',

  // 项目元数据
  UPDATE_PROJECT_META = 'updateProjectMeta',

  // 未知
  UNKNOWN = 'unknown'
}

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
  [ToolType.THINKING]: {
    thought: { type: ContentType.THOUGHT, value: ContentValue.HIGH, decayRounds: -1 } // -1 表示永久保留
  },
  [ToolType.CALL_SEARCH_AGENT]: {
    query: { type: ContentType.QUERY, value: ContentValue.MEDIUM, decayRounds: 3 }
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
  [ToolType.THINKING]: {
    thought: { type: ContentType.THOUGHT, value: ContentValue.HIGH, decayRounds: -1 }
  },
  [ToolType.CALL_SEARCH_AGENT]: {
    results: { type: ContentType.LIST, value: ContentValue.MEDIUM, decayRounds: 3 }
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
  const normalized = toolName.toLowerCase().replace(/_/g, '');
  const toolKey = Object.keys(ToolType).find(
    key => ToolType[key as keyof typeof ToolType].toLowerCase().replace(/_/g, '') === normalized
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
  const functionCall = message.rawParts.find(part => part?.functionCall);
  const functionResponse = message.rawParts.find(part => part?.functionResponse);

  if (functionCall) {
    const fc = functionCall.functionCall;
    return {
      toolName: getToolType(fc.name),
      functionName: fc.name,
      args: typeof fc.arguments === 'string' ? JSON.parse(fc.arguments) : fc.arguments
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
 * 获取工具调用的精细衰减配置
 * call: 工具名称，快速衰减
 * content: 参数内容，根据参数类型决定衰减
 * response: 返回结果
 */
export const getToolDecayConfigs = (toolType: ToolType): ToolDecayConfigs => {
  // 默认配置
  const defaultConfig: ToolDecayConfigs = {
    call: { value: ContentValue.LOW, decayRounds: 4 },      // 工具名 4轮
    content: { value: ContentValue.MEDIUM, decayRounds: 8 }, // 参数内容 8轮
    response: { value: ContentValue.LOW, decayRounds: 8 }    // 结果 8轮
  };

  // 根据工具类型调整配置
  switch (toolType) {
    case ToolType.READ_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.MEDIUM, decayRounds: 8 }, // path 8轮
        response: { value: ContentValue.MEDIUM, decayRounds: 12 } // 文件内容 12轮
      };

    case ToolType.CREATE_FILE:
    case ToolType.WRITE_FILE:
    case ToolType.UPDATE_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.MEDIUM, decayRounds: 16 }, // path + content 16轮
        response: { value: ContentValue.LOW, decayRounds: 8 }    // status 8轮
      };

    case ToolType.PATCH_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.MEDIUM, decayRounds: 16 }, // path + patches 16轮
        response: { value: ContentValue.LOW, decayRounds: 8 }    // status 8轮
      };

    case ToolType.DELETE_FILE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.MEDIUM, decayRounds: 8 }, // path 8轮
        response: { value: ContentValue.LOW, decayRounds: 8 }    // status 8轮
      };

    case ToolType.LIST_FILES:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.LOW, decayRounds: 8 },    // path 8轮
        response: { value: ContentValue.MEDIUM, decayRounds: 8 } // files 8轮
      };

    case ToolType.MANAGE_TODOS:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.MEDIUM, decayRounds: 8 }, // todo/task 8轮
        response: { value: ContentValue.MEDIUM, decayRounds: 8 }  // todos 8轮
      };

    case ToolType.THINKING:
      return {
        call: { value: ContentValue.HIGH, decayRounds: -1 },
        content: { value: ContentValue.HIGH, decayRounds: -1 }, // thought 永久
        response: { value: ContentValue.HIGH, decayRounds: -1 }
      };

    case ToolType.CALL_SEARCH_AGENT:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.MEDIUM, decayRounds: 8 }, // query 8轮
        response: { value: ContentValue.MEDIUM, decayRounds: 8 } // results 8轮
      };

    case ToolType.MANAGE_PLAN_NOTE:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },        // 工具名 4轮
        content: { value: ContentValue.MEDIUM, decayRounds: 8 }, // content 8轮
        response: { value: ContentValue.LOW, decayRounds: 8 }    // status 8轮
      };

    case ToolType.UPDATE_PROJECT_META:
      return {
        call: { value: ContentValue.LOW, decayRounds: 4 },
        content: { value: ContentValue.MEDIUM, decayRounds: 8 },
        response: { value: ContentValue.MEDIUM, decayRounds: 8 }
      };

    default:
      return defaultConfig;
  }
};

/**
 * 衰减维度类型
 */
export type DecayDimension = 'call' | 'content' | 'response' | 'content_text';

/**
 * 单个衰减维度的配置
 */
export interface DecayConfig {
  value: ContentValue;
  decayRounds: number;
}

/**
 * 工具调用的精细衰减配置
 */
export interface ToolDecayConfigs {
  call: DecayConfig;      // 工具名称
  content: DecayConfig;  // 参数内容
  response: DecayConfig; // 返回结果
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
      contentValue: configs.response.value, // 使用 response 维度的价值
      decayRounds: configs.response.decayRounds,
      contentLocation: ContentLocation.RAW_RESULT,
      decayDimension: 'response',
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
