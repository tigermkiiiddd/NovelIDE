
import { listFilesTool, readFileTool, searchFilesTool } from './fileReadTools';
import { createFileTool, updateFileTool, patchFileTool, renameFileTool, deleteFileTool } from './fileWriteTools';
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import { callSearchAgentTool } from './subAgentTools';
import { managePlanNoteTool } from './planTools';
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
// 但不再包含在 allTools 数组中。这迫使主 Agent 使用 Sub-Agent。
export const allTools: ToolDefinition[] = [
  ...readTools,
  ...writeTools,
  manageTodosTool,
  callSearchAgentTool
];

/**
 * 根据模式获取可用工具
 * @param planMode - 是否处于 Plan 模式
 * @returns 可用工具列表
 */
export const getToolsForMode = (planMode: boolean): ToolDefinition[] => {
  if (planMode) {
    // Plan 模式：只有读取工具 + todo + planNote
    return [...readTools, manageTodosTool, managePlanNoteTool];
  }
  // 普通模式：所有工具
  return [...allTools, managePlanNoteTool];
};

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './subAgentTools';
export * from './planTools';
