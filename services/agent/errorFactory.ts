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
    code === 429 ||
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
    code === 401 ||
    code === 403 ||
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
  const statusCode = status || code;
  return statusCode >= 500 && statusCode < 600;
}

/**
 * 创建网络错误
 */
export function networkError(error: any, requestInfo?: any): AgentErrorInfo {
  const { code, message } = extractErrorContext(error);

  return {
    category: AgentErrorCategory.NETWORK,
    severity: AgentErrorSeverity.MEDIUM,
    title: '网络连接失败',
    message: `无法连接到 AI 服务。${code ? `错误代码: ${code}` : ''}`,
    suggestions: [
      '请检查您的网络连接是否正常',
      '如果您使用代理，请确保代理设置正确',
      '请检查 API Base URL 是否正确',
      '稍后重试，服务可能暂时不可用',
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

  let title = 'API 请求失败';
  let detailedMessage = message;
  const suggestions: string[] = [];

  if (status === 400) {
    title = '请求参数错误';
    detailedMessage = 'API 收到了无效的请求参数。';
    suggestions.push('请检查请求格式是否正确');
    suggestions.push('如果问题持续，请尝试重新开始对话');
  } else if (status === 404) {
    title = 'API 端点不存在';
    detailedMessage = '请求的 API 端点不存在，请检查 Base URL。';
    suggestions.push('请确认 API Base URL 是否正确');
    suggestions.push('请确认模型名称是否正确');
  } else if (isServerError(error)) {
    title = '服务器错误';
    detailedMessage = `AI 服务返回了服务器错误 (${status})。`;
    suggestions.push('这是服务端问题，请稍后重试');
    suggestions.push('如果问题持续，请联系服务提供商');
  } else {
    suggestions.push('请查看详细错误信息');
    suggestions.push('如果问题持续，请尝试重新开始对话');
  }

  return {
    category: AgentErrorCategory.API,
    severity: status >= 500 ? AgentErrorSeverity.MEDIUM : AgentErrorSeverity.HIGH,
    title,
    message: detailedMessage,
    suggestions,
    recoverable: status >= 500 || status === 400,
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
    title: '请求过于频繁',
    message: `您发送请求的速度太快了。${retryAfter}`,
    suggestions: [
      '请等待几秒后重试',
      '如果使用免费 API，可能需要降低请求频率',
      '考虑升级您的 API 套餐以获得更高的配额',
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
    title: 'API 认证失败',
    message: 'API Key 无效或已过期，请检查您的配置。',
    suggestions: [
      '请确认 API Key 是否正确',
      '请确认 API Key 是否已过期',
      '如果使用第三方代理，请确认其支持您的 API Key',
      '前往 AI 设置页面更新您的 API Key',
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
    title: '响应解析失败',
    message: '无法解析 AI 服务的响应，响应格式可能异常。',
    suggestions: [
      '这可能是临时问题，请重试',
      '如果问题持续，请检查 API 是否兼容 OpenAI 格式',
      '请查看 Debug 模式下的原始响应',
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
      title = '响应被截断';
      message = 'AI 的响应超过了最大长度限制，内容可能不完整。';
      suggestions = [
        '这可能导致任务未完成，请让 AI 继续',
        '可以尝试减少上下文信息或简化请求',
        '在 AI 设置中增加 Max Output Tokens',
      ];
      severity = AgentErrorSeverity.LOW;
      break;

    case 'empty':
      title = '收到空响应';
      message = 'AI 服务返回了空响应，可能是限流或服务暂时不可用。';
      suggestions = [
        '请稍后重试',
        '检查是否触发了 API 限流',
        '查看 Debug 模式下的响应详情',
      ];
      severity = AgentErrorSeverity.MEDIUM;
      break;

    case 'filtered':
      title = '内容被过滤';
      message = 'AI 服务的安全过滤器拦截了响应内容。';
      suggestions = [
        '尝试修改您的请求措辞',
        '如果是 Gemini API，可以在设置中调整安全级别',
        '某些敏感话题可能无法获得完整回复',
      ];
      severity = AgentErrorSeverity.MEDIUM;
      break;

    default:
      title = '响应内容异常';
      message = 'AI 服务返回了异常的响应内容。';
      suggestions = [
        '请重试您的请求',
        '查看 Debug 模式下的响应详情',
        '如果问题持续，请尝试其他模型',
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
    lines.push('解决建议:');
    errorInfo.suggestions.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s}`);
    });
  }

  return lines.join('\n');
}
