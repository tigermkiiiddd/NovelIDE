/**
 * @file indexLazy.ts
 * @description Lazy loading 核心逻辑
 */

import { ToolDefinition } from '../types';
import { useAgentStore } from '../../../stores/agentStore';
import type { ToolCategory } from '../../../stores/agentStore';
import { alwaysOnTools, getToolsByCategory } from './categories';
import { getFilteredCatalog } from './toolCatalog';
import { searchToolsDef } from './searchTools';

// 获取当前激活的类别
export const getActivatedCategories = (): ToolCategory[] => {
  return useAgentStore.getState().activatedCategories;
};

// 获取已激活的工具定义
export const getActivatedTools = (): ToolDefinition[] => {
  const activatedCategories = getActivatedCategories();
  const tools: ToolDefinition[] = [];
  for (const category of activatedCategories) {
    tools.push(...getToolsByCategory(category));
  }
  return tools;
};

// 获取始终激活的工具（完整定义）
export const getAlwaysOnTools = (): ToolDefinition[] => {
  return alwaysOnTools;
};

// 获取工具目录（过滤掉已激活的类别）
export const getToolCatalog = (): ToolDefinition[] => {
  const activatedCategories = getActivatedCategories();
  return getFilteredCatalog(activatedCategories);
};

// 获取 search_tools 工具定义
export const getSearchToolsDef = (): ToolDefinition => {
  return searchToolsDef;
};

// 获取完整的工具列表（每次 LLM 调用时使用）
export const getAllToolsForLLM = (): ToolDefinition[] => {
  const alwaysTools = getAlwaysOnTools();           // 6个始终激活工具（完整定义）
  const catalog = getToolCatalog();                // lazy 类别目录（过滤掉已激活）
  const searchTools = [getSearchToolsDef()];       // search_tools 始终传入
  const activatedTools = getActivatedTools();     // 已激活的工具（完整定义）

  return [...alwaysTools, ...catalog, ...searchTools, ...activatedTools];
};

// 检查 search_tools 是否被调用，如果是则激活对应类别
export const handleSearchToolsCall = (toolName: string, args: any): boolean => {
  if (toolName === 'search_tools') {
    const categories = args.categories || [];
    if (categories.length > 0) {
      const { setActivatedCategories } = useAgentStore.getState();
      setActivatedCategories(categories);
    }
    return true;
  }
  return false;
};

// 重置激活的类别（新建会话时调用）
export const resetActivatedCategories = (): void => {
  useAgentStore.getState().setActivatedCategories([]);
};
