/**
 * @file categories.ts
 * @description 按系列分组的工具定义，用于 lazy loading
 */

import { ToolDefinition } from '../types';
import type { ToolCategory } from '../../../stores/agentStore';

// 导入所有工具定义
import {
  updateFileTool,
  renameFileTool,
  deleteFileTool,
} from './fileWriteTools';

import { searchFilesTool } from './fileReadTools';

import {
  queryKnowledgeTool,
  manageKnowledgeTool,
  linkKnowledgeTool,
  listKnowledgeMetadataTool,
  listAllKnowledgeTool,
  discoverTunnelsTool,
  resolveConflictTool,
  maintenanceTool,
} from './knowledgeGraphTools';

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

import {
  getEventsTool,
  getChaptersTool,
  getVolumesTool,
  getStoryLinesTool,
  manageVolumesTool,
  manageChaptersTool,
  manageEventsTool,
  manageStoryLinesTool,
  processOutlineInputTool,
  getUnresolvedForeshadowingTool,
  getForeshadowingDetailTool,
} from '../toolDefinitions/timeline';

// ============================================
// 始终激活的工具（不进入 lazy 加载）
// ============================================

import { listFilesTool, readFileTool } from './fileReadTools';
import { createFileTool, patchFileTool } from './fileWriteTools';
import { manageTodosTool } from './todoTools';
import { managePlanNoteTool } from './planTools';

export const alwaysOnTools: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  searchFilesTool,
  createFileTool,
  patchFileTool,
  manageTodosTool,
  managePlanNoteTool,
];

// ============================================
// 按系列分组的工具
// ============================================

export const categoryTools: Record<ToolCategory, ToolDefinition[]> = {
  file_write: [updateFileTool, renameFileTool, deleteFileTool],
  memory: [
    queryKnowledgeTool,
    manageKnowledgeTool,
    linkKnowledgeTool,
    listKnowledgeMetadataTool,
    listAllKnowledgeTool,
    discoverTunnelsTool,
    resolveConflictTool,
    maintenanceTool,
  ],
  character: [
    initCharacterProfileTool,
    updateCharacterProfileTool,
    manageSubCategoryTool,
    archiveEntryTool,
  ],
  relationship: [
    queryRelationshipsTool,
    manageRelationshipsTool,
    getRelationshipGraphTool,
  ],
  outline: [
    getEventsTool,
    getChaptersTool,
    getVolumesTool,
    getStoryLinesTool,
    manageVolumesTool,
    manageChaptersTool,
    manageEventsTool,
    manageStoryLinesTool,
    processOutlineInputTool,
    getUnresolvedForeshadowingTool,
    getForeshadowingDetailTool,
  ],
};

// 获取指定类别的工具
export const getToolsByCategory = (category: ToolCategory): ToolDefinition[] => {
  return categoryTools[category] || [];
};

// 获取所有已激活类别的工具
export const getActivatedTools = (activatedCategories: ToolCategory[]): ToolDefinition[] => {
  const tools: ToolDefinition[] = [];
  for (const category of activatedCategories) {
    tools.push(...(categoryTools[category] || []));
  }
  return tools;
};

// 导出所有 lazy 类别
export const lazyCategories: ToolCategory[] = [
  'file_write',
  'memory',
  'character',
  'relationship',
  'outline',
];
