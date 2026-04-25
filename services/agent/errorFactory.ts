/**
 * AI 响应错误工厂
 * 提供统一方法创建各类错误信息
 */

import {
  AgentErrorCategory,
  AgentErrorSeverity,
  AgentErrorInfo,
  AIResponseMetadata,
} from '../../types/agentErrors';
import i18n from '../../i18n';

/**
 * 从原始错误中提取有用信息
 */
function extractErrorContext(error: any): { code?: string; status?: number; message: string } {
  return {
    code: error?.code || error?.cause?.code,
    status: error?.status || error?.response?.status,
    message: error?.message || String(error),
  };
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(error: any): boolean {
  const { code, message } = extractErrorContext(error);

  // 常见网络错误代码
  const networkErrorCodes = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
  ];

  // 网络错误关键词
  const networkErrorKeywords = [
    'network',
    'fetch failed',
    'connection refused',
    'connection reset',
    'timeout',
    'dns',
    'socket hang up',
  ];

  if (code && networkErrorCodes.includes(code.toUpperCase())) {
    return true;
  }

  const lowerMessage = message.toLowerCase();
  return networkErrorKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * 判断是否为限流错误
 */
function isRateLimitError(error: any): boolean {
  const { code, status, message } = extractErrorContext(error);

  return (
    status === 429 ||
    code === '429' ||
    message.includes('429') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('too many requests')
  );
}

/**
 * 判断是否为认证错误
 */
function isAuthError(error: any): boolean {
  const { code, status, message } = extractErrorContext(error);

  return (
    status === 401 ||
    status === 403 ||
    code === '401' ||
    code === '403' ||
    message.toLowerCase().includes('unauthorized') ||
    message.toLowerCase().includes('invalid api key') ||
    message.toLowerCase().includes('forbidden') ||
    message.toLowerCase().includes('authentication')
  );
}

/**
 * 判断是否为服务器错误
 */
function isServerError(error: any): boolean {
  const { status, code } = extractErrorContext(error);
  const statusCode = status ?? (typeof code === 'number' ? code : undefined);
  return statusCode !== undefined && statusCode >= 500 && statusCode < 600;
}

/**
 * 创建网络错误
 */
export function networkError(error: any, requestInfo?: any): AgentErrorInfo {
  const { code, message } = extractErrorContext(error);

  return {
    category: AgentErrorCategory.NETWORK,
    severity: AgentErrorSeverity.MEDIUM,
    title: i18n.t('errors.network.title'),
    message: i18n.t('errors.network.message', { code: code ? `错误代码: ${code}` : '' }),
    suggestions: [
      i18n.t('errors.network.checkNetwork'),
      i18n.t('errors.network.checkProxy'),
      i18n.t('errors.network.checkBaseUrl'),
      i18n.t('errors.network.retryLater'),
    ],
    recoverable: true,
    debugData: {
      rawError: error,
      request: requestInfo,
      stack: error?.stack,
    },
  };
}

/**
 * 创建 API 错误
 */
export function apiError(error: any, requestInfo?: any, responseInfo?: any): AgentErrorInfo {
  const { status, message } = extractErrorContext(error);

  let title = i18n.t('errors.api.title');
  let detailedMessage = message;
  const suggestions: string[] = [];

  if (status === 400) {
    title = i18n.t('errors.api.badRequestTitle');
    detailedMessage = i18n.t('errors.api.badRequestMessage');
    suggestions.push(i18n.t('errors.api.badRequestFormat'));
    suggestions.push(i18n.t('errors.api.restartChat'));
  } else if (status === 404) {
    title = i18n.t('errors.api.notFoundTitle');
    detailedMessage = i18n.t('errors.api.notFoundMessage');
    suggestions.push(i18n.t('errors.api.confirmBaseUrl'));
    suggestions.push(i18n.t('errors.api.confirmModelName'));
  } else if (isServerError(error)) {
    title = i18n.t('errors.api.serverErrorTitle');
    detailedMessage = i18n.t('errors.api.serverErrorMessage', { status });
    suggestions.push(i18n.t('errors.api.serverRetryLater'));
    suggestions.push(i18n.t('errors.api.contactProvider'));
  } else {
    suggestions.push(i18n.t('errors.api.viewDetails'));
    suggestions.push(i18n.t('errors.api.restartChat'));
  }

  return {
    category: AgentErrorCategory.API,
    severity: (status ?? 0) >= 500 ? AgentErrorSeverity.MEDIUM : AgentErrorSeverity.HIGH,
    title,
    message: detailedMessage,
    suggestions,
    recoverable: (status ?? 0) >= 500 || status === 400,
    debugData: {
      rawError: error,
      request: requestInfo,
      response: responseInfo,
      stack: error?.stack,
    },
  };
}

/**
 * 创建限流错误
 */
export function rateLimitError(error: any, requestInfo?: any): AgentErrorInfo {
  const { message } = extractErrorContext(error);

  // 尝试从错误中提取重试时间
  let retryAfter = '';
  if (error?.response?.headers?.['retry-after']) {
    retryAfter = ` (建议等待 ${error.response.headers['retry-after']} 秒)`;
  }

  return {
    category: AgentErrorCategory.RATE_LIMIT,
    severity: AgentErrorSeverity.LOW,
    title: i18n.t('errors.rateLimit.title'),
    message: i18n.t('errors.rateLimit.message', { retryHint: retryAfter }),
    suggestions: [
      i18n.t('errors.rateLimit.wait'),
      i18n.t('errors.rateLimit.reduceFrequency'),
      i18n.t('errors.rateLimit.upgradePlan'),
    ],
    recoverable: true,
    debugData: {
      rawError: error,
      request: requestInfo,
      stack: error?.stack,
    },
  };
}

/**
 * 创建认证错误
 */
export function authError(error: any, requestInfo?: any): AgentErrorInfo {
  return {
    category: AgentErrorCategory.AUTH,
    severity: AgentErrorSeverity.HIGH,
    title: i18n.t('errors.auth.title'),
    message: i18n.t('errors.auth.message'),
    suggestions: [
      i18n.t('errors.auth.checkKey'),
      i18n.t('errors.auth.checkExpiry'),
      i18n.t('errors.auth.checkProxy'),
      i18n.t('errors.auth.goToSettings'),
    ],
    recoverable: true,  // 允许重试，用户可能已更新 API Key
    debugData: {
      rawError: error,
      request: requestInfo,
      stack: error?.stack,
    },
  };
}

/**
 * 创建响应解析错误
 */
export function parseError(error: any, rawResponse?: any, requestInfo?: any): AgentErrorInfo {
  return {
    category: AgentErrorCategory.PARSE,
    severity: AgentErrorSeverity.MEDIUM,
    title: i18n.t('errors.parse.title'),
    message: i18n.t('errors.parse.message'),
    suggestions: [
      i18n.t('errors.parse.retry'),
      i18n.t('errors.parse.checkFormat'),
      i18n.t('errors.parse.viewDebug'),
    ],
    recoverable: true,
    debugData: {
      rawError: error,
      request: requestInfo,
      response: rawResponse,
      stack: error?.stack,
    },
  };
}

/**
 * 创建内容错误（截断、空响应、过滤等）
 */
export function contentError(
  reason: 'truncated' | 'empty' | 'filtered' | 'unknown',
  metadata?: AIResponseMetadata,
  rawResponse?: any
): AgentErrorInfo {
  let title: string;
  let message: string;
  let suggestions: string[];
  let severity: AgentErrorSeverity;

  switch (reason) {
    case 'truncated':
      title = i18n.t('errors.content.truncatedTitle');
      message = i18n.t('errors.content.truncatedMessage');
      suggestions = [
        i18n.t('errors.content.continueTask'),
        i18n.t('errors.content.simplifyRequest'),
        i18n.t('errors.content.increaseTokens'),
      ];
      severity = AgentErrorSeverity.LOW;
      break;

    case 'empty':
      title = i18n.t('errors.content.emptyTitle');
      message = i18n.t('errors.content.emptyMessage');
      suggestions = [
        i18n.t('errors.content.retryLater'),
        i18n.t('errors.content.checkRateLimit'),
        i18n.t('errors.content.viewDebug'),
      ];
      severity = AgentErrorSeverity.MEDIUM;
      break;

    case 'filtered':
      title = i18n.t('errors.content.filteredTitle');
      message = i18n.t('errors.content.filteredMessage');
      suggestions = [
        i18n.t('errors.content.rephrase'),
        i18n.t('errors.content.adjustSafety'),
        i18n.t('errors.content.sensitiveTopics'),
      ];
      severity = AgentErrorSeverity.MEDIUM;
      break;

    default:
      title = i18n.t('errors.content.unknownTitle');
      message = i18n.t('errors.content.unknownMessage');
      suggestions = [
        i18n.t('errors.content.retryRequest'),
        i18n.t('errors.content.viewDebug'),
        i18n.t('errors.content.tryOtherModel'),
      ];
      severity = AgentErrorSeverity.MEDIUM;
  }

  return {
    category: AgentErrorCategory.CONTENT,
    severity,
    title,
    message,
    suggestions,
    recoverable: reason !== 'filtered',
    debugData: {
      response: rawResponse,
    },
  };
}

/**
 * 从原始错误自动判断并创建错误信息
 */
export function fromError(error: any, requestInfo?: any, responseInfo?: any): AgentErrorInfo {
  // 跳过 AbortError（用户主动取消）
  if (error?.name === 'AbortError') {
    throw error; // 重新抛出，不作为错误处理
  }

  // 如果上层已经构造了标准 AgentErrorInfo（例如 contentError），直接透传
  if (error?.category && error?.title && typeof error?.message === 'string' && Array.isArray(error?.suggestions)) {
    return error as AgentErrorInfo;
  }

  // 检查是否是空响应错误（由 geminiService 抛出）
  if (error?._isEmptyResponse) {
    return contentError('empty', error._metadata, responseInfo);
  }

  // 检查错误类型并返回对应的错误信息
  if (isNetworkError(error)) {
    return networkError(error, requestInfo);
  }

  if (isRateLimitError(error)) {
    return rateLimitError(error, requestInfo);
  }

  if (isAuthError(error)) {
    return authError(error, requestInfo);
  }

  const { status } = extractErrorContext(error);
  if (status && status !== 200) {
    return apiError(error, requestInfo, responseInfo);
  }

  // 默认返回通用 API 错误（但设置 recoverable: true 以便用户可以重试）
  const defaultError = apiError(error, requestInfo, responseInfo);
  defaultError.recoverable = true; // 未知错误也应该允许重试
  return defaultError;
}

/**
 * 检查 finish_reason 并创建相应的错误信息
 */
export function checkFinishReason(
  finishReason: string | undefined,
  metadata?: AIResponseMetadata,
  rawResponse?: any
): AgentErrorInfo | null {
  // 正常完成的情况（包括工具调用）
  if (!finishReason || finishReason === 'stop' || finishReason === 'tool_calls') {
    return null;
  }

  if (finishReason === 'length') {
    return contentError('truncated', metadata, rawResponse);
  }

  if (finishReason === 'content_filter') {
    return contentError('filtered', metadata, rawResponse);
  }

  // 其他未知原因
  return contentError('unknown', metadata, rawResponse);
}

/**
 * 将错误信息格式化为用户可读的字符串
 */
export function formatErrorForDisplay(errorInfo: AgentErrorInfo): string {
  const lines: string[] = [];

  lines.push(`${errorInfo.title}`);
  lines.push('');
  lines.push(errorInfo.message);

  if (errorInfo.suggestions.length > 0) {
    lines.push('');
    lines.push(i18n.t('errors.suggestionsLabel'));
    errorInfo.suggestions.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s}`);
    });
  }

  return lines.join('\n');
}
