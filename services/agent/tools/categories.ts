/**
 * @file categories.ts
 * @description 工具分级注册表
 *
 * 一级工具（alwaysOn）：简单、常用，始终完整可见
 * 二级工具（lazy）：复杂/专用，通过 search_tools 按需激活
 */

import { ToolDefinition } from '../types';
import type { ToolCategory } from '../../../stores/agentStore';

// ==================== 工具定义导入 ====================

// 文件操作
import { listFilesTool, readFileTool, searchFilesTool } from './fileReadTools';
import {
  writeFileTool,
  patchFileTool,
  renameFileTool,
  deleteFileTool,
} from './fileWriteTools';

// Agent 控制
import { finalAnswerTool } from './agentControlTools';
import { askQuestionsTool } from './askQuestionsTool';
import { reflectionTool } from './reflectionTool';
import { deepThinkingTool } from './deepThinkingTools';

// 项目 & 任务
import { updateProjectMetaTool } from './projectTools';
import { manageTodosTool } from './todoTools';
import { managePlanNoteTool } from './planTools';

// 技能 & 搜索（始终可用）
import { activateSkillTool, skillsListTool } from './skillTools';

// 二级：记忆宫殿
import {
  queryKnowledgeTool,
  manageKnowledgeTool,
  linkKnowledgeTool,
  memoryStatusTool,
  traverseMemoryTool,
} from './knowledgeGraphTools';

// 二级：角色档案
import {
  initCharacterProfileTool,
  updateCharacterProfileTool,
  manageSubCategoryTool,
  archiveEntryTool,
} from './characterProfileTools';

// 二级：人际关系
import {
  queryRelationshipsTool,
  manageRelationshipsTool,
  getRelationshipGraphTool,
} from './relationshipTools';

// 二级：大纲时间线
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
  manageForeshadowingTool,
} from '../toolDefinitions/timeline';

// 自进化工具
import { queryEvolutionTool, manageEvolutionTool } from './evolutionTools';


// ==================== 一级工具（始终激活） ====================
// 原则：简单、常用、Agent 几乎每轮都会用到

export const alwaysOnTools: ToolDefinition[] = [
  // Agent 控制（始终在最前面）
  reflectionTool,
  deepThinkingTool,
  finalAnswerTool,
  askQuestionsTool,
  // 文件读写
  listFilesTool,
  readFileTool,
  searchFilesTool,
  writeFileTool,
  patchFileTool,
  renameFileTool,
  deleteFileTool,
  // 项目配置
  updateProjectMetaTool,
  // 任务 & 计划
  manageTodosTool,
  managePlanNoteTool,
  // 技能
  skillsListTool,
  activateSkillTool,
  // 自进化记忆（始终可用，prompt 引用了这些工具）
  queryEvolutionTool,
  manageEvolutionTool,

];

// ==================== 二级工具（按类别 lazy 加载） ====================
// 原则：复杂、专用、只在特定场景才需要

export const categoryTools: Record<ToolCategory, ToolDefinition[]> = {
  memory: [
    queryKnowledgeTool,
    manageKnowledgeTool,
    linkKnowledgeTool,
    memoryStatusTool,
    traverseMemoryTool,
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
    manageForeshadowingTool,
  ],
};

// ==================== 辅助函数 ====================

export const getToolsByCategory = (category: ToolCategory): ToolDefinition[] => {
  return categoryTools[category] || [];
};

export const getActivatedTools = (activatedCategories: ToolCategory[]): ToolDefinition[] => {
  const tools: ToolDefinition[] = [];
  for (const category of activatedCategories) {
    tools.push(...(categoryTools[category] || []));
  }
  return tools;
};

export const lazyCategories: ToolCategory[] = [
  'memory',
  'character',
  'relationship',
  'outline',
];
