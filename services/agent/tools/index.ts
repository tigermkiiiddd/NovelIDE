
import { listFilesTool, readFileTool, searchFilesTool } from './fileReadTools';
import { createFileTool, updateFileTool, patchFileTool, renameFileTool, deleteFileTool } from './fileWriteTools';
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import { callSearchAgentTool } from './subAgentTools';
import { managePlanNoteTool, createManagePlanNoteTool } from './planTools';
import { thinkingTool } from './thinkingTools';
import { ToolDefinition } from '../types';

// 读取工具
const readTools: ToolDefinition[] = [
  listFilesTool,
  readFileTool
];

// 写入工具
const writeTools: ToolDefinition[] = [
  createFileTool,
  updateFileTool,
  patchFileTool,
  renameFileTool,
  deleteFileTool,
  updateProjectMetaTool
];

// 注意：searchFilesTool 虽然被导入（因为 fileReadTools 导出需要），
// 但不再包含在 allTools 数组中。
// thinkingTool 已被移除
// callSearchAgentTool 已被移除，不再提供给 Agent 使用
// managePlanNoteTool 已被移除
export const allTools: ToolDefinition[] = [
  ...readTools,
  ...writeTools,
  manageTodosTool,
  // callSearchAgentTool,  // 已屏蔽
  // managePlanNoteTool,  // 已移除
  // thinkingTool  // 已移除
];

/**
 * 根据模式获取可用工具
 * @param planMode - 是否处于 Plan 模式（已废弃，保留参数以兼容）
 * @returns 可用工具列表
 */
export const getToolsForMode = (planMode: boolean): ToolDefinition[] => {
  // Plan 模式已移除，统一返回所有工具
  return [...readTools, ...writeTools, manageTodosTool];
};

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './subAgentTools';
export * from './planTools';
export * from './thinkingTools';
