
import { listFilesTool, readFileTool } from './fileReadTools';
import { createFileTool, updateFileTool, patchFileTool, renameFileTool, deleteFileTool } from './fileWriteTools';
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import { recallMemoryTool, manageMemoryTool } from './longTermMemoryTools';
import {
  getEventsTool,
  getChaptersTool,
  getVolumesTool,
  getStoryLinesTool,
  processOutlineInputTool
} from '../toolDefinitions/timeline';
import { ToolDefinition } from '../types';

// 主 Agent 可用的工具
const readTools: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  recallMemoryTool,
  getVolumesTool,
  getChaptersTool,
  getEventsTool,
  getStoryLinesTool
];

const writeTools: ToolDefinition[] = [
  createFileTool,
  updateFileTool,
  patchFileTool,
  renameFileTool,
  deleteFileTool,
  updateProjectMetaTool,
  manageMemoryTool,
  // ⚠️ outline 写入通过 SubAgent，主 Agent 只能调用 processOutlineInput
  processOutlineInputTool
];

export const allTools: ToolDefinition[] = [...readTools, ...writeTools, manageTodosTool];

export const getToolsForMode = (planMode: boolean): ToolDefinition[] => allTools;

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './timelineTools';
