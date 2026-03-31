
import { listFilesTool, readFileTool } from './fileReadTools';
import { createFileTool, updateFileTool, patchFileTool, renameFileTool, deleteFileTool } from './fileWriteTools';
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import {
  queryKnowledgeTool,
  manageKnowledgeTool,
  linkKnowledgeTool,
  listKnowledgeMetadataTool,
  listAllKnowledgeTool,
} from './knowledgeGraphTools';
import {
  getEventsTool,
  getChaptersTool,
  getVolumesTool,
  getStoryLinesTool,
  processOutlineInputTool
} from '../toolDefinitions/timeline';
import {
  initCharacterProfileTool,
  updateCharacterProfileTool,
  manageSubCategoryTool,
  archiveEntryTool,
} from './characterProfileTools';
import { ToolDefinition } from '../types';

// 主 Agent 可用的工具
const readTools: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  queryKnowledgeTool,
  listKnowledgeMetadataTool,
  listAllKnowledgeTool,
  getVolumesTool,
  getChaptersTool,
  getEventsTool,
  getStoryLinesTool,
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
  processOutlineInputTool,
  // 角色档案工具
  initCharacterProfileTool,
  updateCharacterProfileTool,
  manageSubCategoryTool,
  archiveEntryTool,
];

export const allTools: ToolDefinition[] = [...readTools, ...writeTools, manageTodosTool];

export const getToolsForMode = (planMode: boolean): ToolDefinition[] => allTools;

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './knowledgeGraphTools';
export * from './timelineTools';
export * from './characterProfileTools';
