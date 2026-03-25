
import { listFilesTool, readFileTool } from './fileReadTools';
import { createFileTool, updateFileTool, patchFileTool, renameFileTool, deleteFileTool } from './fileWriteTools';
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import {
  queryKnowledgeTool,
  manageKnowledgeTool,
  linkKnowledgeTool,
  listKnowledgeMetadataTool,
  listReviewQueueTool,
} from './knowledgeGraphTools';
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
  queryKnowledgeTool,
  listKnowledgeMetadataTool,
  listReviewQueueTool,
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
  manageKnowledgeTool,
  linkKnowledgeTool,
  // ⚠️ outline 写入通过 SubAgent，主 Agent 只能调用 processOutlineInput
  processOutlineInputTool
];

export const allTools: ToolDefinition[] = [...readTools, ...writeTools, manageTodosTool];

export const getToolsForMode = (planMode: boolean): ToolDefinition[] => allTools;

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './knowledgeGraphTools';
export * from './timelineTools';
