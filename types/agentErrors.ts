/**
 * AI 响应错误类型定义
 * 用于增强 AI 响应相关的错误报告机制
 */

/**
 * 错误分类
 */
export enum AgentErrorCategory {
  NETWORK = 'network',       // 网络错误 (连接失败、超时)
  API = 'api',               // API 错误 (4xx/5xx 状态码)
  RATE_LIMIT = 'rate_limit', // 限流 (429)
  PARSE = 'parse',           // 响应解析错误 (JSON 格式错误)
  CONTENT = 'content',       // 内容问题 (截断、空响应、内容过滤)
  AUTH = 'auth',             // 认证错误 (401/403)
}

/**
 * 错误严重程度
 */
export enum AgentErrorSeverity {
  LOW = 'low',           // 可自动恢复
  MEDIUM = 'medium',     // 需要用户干预
  HIGH = 'high',         // 严重错误，需要立即处理
}

/**
 * 错误信息接口
 */
export interface AgentErrorInfo {
  category: AgentErrorCategory;
  severity: AgentErrorSeverity;
  title: string;             // 简短标题
  message: string;           // 用户友好描述
  suggestions: string[];     // 解决建议
  recoverable: boolean;      // 是否可恢复
  debugData?: {              // Debug 模式显示
    rawError?: any;          // 原始错误对象
    request?: any;           // 请求信息
    response?: any;          // 响应信息
    stack?: string;          // 堆栈信息
  };
}

/**
 * AI 响应元数据
 */
export interface AIResponseMetadata {
  finishReason?: string;      // 完成原因: 'stop', 'length', 'content_filter'
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  requestId?: string;
  duration?: number;
  warnings?: string[];        // 警告信息列表
}

/**
 * ChatMessage.metadata 中的错误信息字段
 */
export interface AgentErrorMetadata {
  errorInfo?: AgentErrorInfo;
  responseMetadata?: AIResponseMetadata;
}

/**
 * 创建 AgentErrorInfo 的辅助类型
 */
export type AgentErrorInput = Omit<AgentErrorInfo, 'category'> & {
  category: AgentErrorCategory;
};
