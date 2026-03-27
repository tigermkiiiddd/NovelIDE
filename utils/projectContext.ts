/**
 * @file projectContext.ts
 * @description 项目上下文工具函数，用于向所有 AI 调用注入项目概览
 */

import { ProjectMeta } from '../types';

/**
 * 构建项目概览提示文本
 * 用于注入到所有 AI Agent 的 system prompt 中，防止风格漂移
 *
 * @param project - 项目元数据
 * @returns 格式化的项目概览文本
 */
export function buildProjectOverviewPrompt(project: ProjectMeta | undefined): string {
  if (!project) {
    return `## 项目概览
> 当前无活跃项目`;
  }

  const lines: string[] = [
    '## 项目概览 ⚠️【核心约束】',
    '',
    `书名：《${project.name}》`,
    `类型：${project.genre || '未定'}`,
    `单章字数：${project.wordsPerChapter || '未定'}`,
    `进度目标：${project.targetChapters || 0}章`,
    `每卷章节数：${project.chaptersPerVolume || '未定'}章`,
  ];

  // 添加爽点节奏配置
  if (project.pleasureRhythm) {
    lines.push(`爽点节奏：小爽每${project.pleasureRhythm.small}章，中爽每${project.pleasureRhythm.medium}章，大爽每${project.pleasureRhythm.large}章`);
  }

  if (project.description) {
    lines.push(`核心梗：${project.description}`);
  }

  lines.push('');
  lines.push('> ⚠️ 上述项目基础信息是创作地基，所有输出必须与之对齐：');
  lines.push('> - **类型**决定叙事风格和读者预期');
  lines.push('> - **核心梗**决定故事主线和卖点');
  lines.push('> - **爽点节奏**决定剧情高潮的分布密度');

  return lines.join('\n');
}

/**
 * 项目上下文接口，用于传递给 SubAgent 和其他 AI 函数
 */
export interface ProjectContext {
  project: ProjectMeta | undefined;
}

/**
 * 构建完整的项目上下文对象
 */
export function buildProjectContext(project: ProjectMeta | undefined): ProjectContext {
  return { project };
}

/**
 * 将项目概览注入到现有的 system prompt 中
 *
 * @param systemPrompt - 原始 system prompt
 * @param project - 项目元数据
 * @returns 注入项目概览后的 system prompt
 */
export function injectProjectOverview(
  systemPrompt: string,
  project: ProjectMeta | undefined
): string {
  const projectOverview = buildProjectOverviewPrompt(project);

  // 如果 prompt 中已有项目信息占位符，替换它
  if (systemPrompt.includes('{{PROJECT_INFO}}')) {
    return systemPrompt.replace('{{PROJECT_INFO}}', projectOverview.replace('## 项目概览 ⚠️【核心约束】\n\n', ''));
  }

  // 否则在开头插入项目概览
  return `${projectOverview}

${systemPrompt}`;
}
