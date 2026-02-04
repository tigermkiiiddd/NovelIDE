
import { listFilesTool, readFileTool, searchFilesTool } from './fileReadTools';
import { createFileTool, updateFileTool, patchFileTool, renameFileTool, deleteFileTool } from './fileWriteTools';
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import { callSearchAgentTool } from './subAgentTools';

// 注意：searchFilesTool 虽然被导入（因为 fileReadTools 导出需要），
// 但不再包含在 allTools 数组中。这迫使主 Agent 使用 Sub-Agent。
export const allTools = [
  listFilesTool,
  readFileTool,
  createFileTool,
  updateFileTool,
  patchFileTool,
  renameFileTool,
  deleteFileTool,
  updateProjectMetaTool,
  manageTodosTool,
  callSearchAgentTool
];

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './subAgentTools';
