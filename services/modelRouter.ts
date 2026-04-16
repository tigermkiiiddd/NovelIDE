/**
 * @file modelRouter.ts
 * @description 模型路由策略 - 不同类型的任务使用不同的供应商/模型配置。
 *
 * 路由 ID 说明：
 * - main: 主对话引擎
 * - polish: 文本润色
 * - outline: 大纲/时间线子Agent
 * - extraction: 自动提取（知识图谱、章节分析、角色提取）
 * - subAgent: 其他子Agent（章节合并、知识决策等）
 */

import { AIConfig, ModelRouteId, ModelRoutes, OpenAIBackend } from '../types';
import { AIService } from './geminiService';

/**
 * 解析指定路由的 AIConfig。
 * 回退逻辑：路由有 backendId → 用指定 backend；有 modelName → 覆盖模型名；都空 → 用活跃后端
 *
 * Legacy 兼容：如果 extraction 路由无配置但 baseConfig 有 lightweightModelName，自动作为 fallback
 */
export function resolveConfigForRoute(baseConfig: AIConfig, routeId: ModelRouteId): AIConfig {
  const route = baseConfig.modelRoutes?.[routeId];

  // 无路由配置 → 检查 legacy fallback，否则直接用活跃后端
  if (!route || (!route.backendId && !route.modelName)) {
    // Legacy fallback: lightweightModelName 对 extraction 路由生效
    if (routeId === 'extraction' && baseConfig.lightweightModelName) {
      return { ...baseConfig, modelName: baseConfig.lightweightModelName };
    }
    return baseConfig;
  }

  // 从 baseConfig 构建派生配置
  const derived: AIConfig = { ...baseConfig };

  if (route.backendId && baseConfig.openAIBackends) {
    const targetBackend = baseConfig.openAIBackends.find(
      (b: OpenAIBackend) => b.id === route.backendId
    );

    if (targetBackend) {
      derived.apiKey = targetBackend.apiKey;
      derived.baseUrl = targetBackend.baseUrl;
      derived.modelName = targetBackend.modelName;
      // 继承后端的 maxOutputTokens（如果配置了的话）
      if (targetBackend.maxOutputTokens !== undefined) {
        derived.maxOutputTokens = targetBackend.maxOutputTokens;
      }
    }
    // backendId 找不到 → 回退到活跃后端
  }

  // modelName 覆盖（优先级高于 backend 的默认模型）
  if (route.modelName) {
    derived.modelName = route.modelName;
  }

  return derived;
}

/**
 * 用路由后的 config 创建 AIService 实例。
 */
export function createRoutedAIService(baseConfig: AIConfig, routeId: ModelRouteId): AIService {
  const routedConfig = resolveConfigForRoute(baseConfig, routeId);
  return new AIService(routedConfig);
}
