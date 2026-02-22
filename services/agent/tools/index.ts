
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
// 但不再包含在 allTools 数组中。这迫使主 Agent 使用 Sub-Agent。
// managePlanNoteTool 普通模式也能访问（只读 list 操作）
// thinkingTool 是元工具，用于结构化思考
export const allTools: ToolDefinition[] = [
  ...readTools,
  ...writeTools,
  manageTodosTool,
  callSearchAgentTool,
  managePlanNoteTool,
  thinkingTool
];

/**
 * 根据模式获取可用工具
 * @param planMode - 是否处于 Plan 模式
 * @returns 可用工具列表
 */
export const getToolsForMode = (planMode: boolean): ToolDefinition[] => {
  if (planMode) {
    // Plan 模式：读取工具 + planNote（完整功能） + searchAgent + thinking
    return [...readTools, createManagePlanNoteTool(true), callSearchAgentTool, thinkingTool];
  }
  // 普通模式：所有工具（包含受限的 planNote，仅 list 操作）+ thinking
  // 注意：allTools 已包含 thinkingTool，但我们要确保 getToolsForMode 返回的工具列表正确
  return [...readTools, ...writeTools, manageTodosTool, callSearchAgentTool, createManagePlanNoteTool(false), thinkingTool];
};

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './subAgentTools';
export * from './planTools';
export * from './thinkingTools';
