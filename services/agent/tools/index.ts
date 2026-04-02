
import { listFilesTool, readFileTool } from './fileReadTools';
import { createFileTool, updateFileTool, patchFileTool, renameFileTool, deleteFileTool } from './fileWriteTools';
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import { thinkingTool } from './thinkingTools';
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
import {
  queryRelationshipsTool,
  manageRelationshipsTool,
  getRelationshipGraphTool,
} from './relationshipTools';
import { ToolDefinition } from '../types';

// 主 Agent 可用的工具
const readTools: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  queryKnowledgeTool,
  listKnowledgeMetadataTool,
  listAllKnowledgeTool,
  queryRelationshipsTool,
  getRelationshipGraphTool,
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
  // 人际关系工具
  manageRelationshipsTool,
];

export const allTools: ToolDefinition[] = [...readTools, ...writeTools, manageTodosTool, thinkingTool];

export const getToolsForMode = (planMode: boolean): ToolDefinition[] => allTools;

export * from './fileReadTools';
export * from './fileWriteTools';
export * from './projectTools';
export * from './todoTools';
export * from './knowledgeGraphTools';
export * from './timelineTools';
export * from './characterProfileTools';
export * from './relationshipTools';
export * from './thinkingTools';
