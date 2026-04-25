/**
 * 工具操作摘要生成工具
 * 为 AI 工具调用生成简洁的人类可读摘要
 */

import i18n from '../i18n';

export interface ToolSummary {
  action: string;    // 操作类型
  summary: string;   // 摘要文本
  icon?: string;     // 图标
}

/**
 * 截断文本，保留前后部分
 */
const truncate = (text: string, maxLen: number = 60): string => {
  if (!text || text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
};

/**
 * 根据工具名称和参数生成简洁的操作摘要
 */
export function generateToolSummary(name: string, args: any): ToolSummary {
  // 提取 thinking（不参与摘要生成）
  const { thinking, ...restArgs } = args || {};

  switch (name) {
    // Agent 控制
    case 'thinking':
      return {
        action: 'think',
        summary: [
          restArgs.surface ? `📋 ${restArgs.surface}` : '',
          restArgs.intent ? `🎯 ${truncate(restArgs.intent, 60)}` : '',
          restArgs.plan ? `📝 ${truncate(restArgs.plan, 60)}` : '',
          restArgs.reflection ? `🔄 ${truncate(restArgs.reflection, 40)}` : '',
        ].filter(Boolean).join(' | ') || i18n.t('toolSummary.thinking')
      };

    case 'final_answer':
      return {
        action: 'answer',
        summary: restArgs.answer
          ? i18n.t('toolSummary.reply', { text: truncate(restArgs.answer, 80) })
          : i18n.t('toolSummary.finalReply')
      };

    case 'deep_thinking': {
      const dtLabels: Record<string, string> = {
        'create': i18n.t('toolSummary.deepThinkingCreate'),
        'list': i18n.t('toolSummary.deepThinkingList'),
        'archive': i18n.t('toolSummary.deepThinkingArchive'),
        'view_log': i18n.t('toolSummary.deepThinkingViewLog'),
      };
      return {
        action: 'deep_think',
        summary: restArgs.action
          ? `${dtLabels[restArgs.action] || restArgs.action}${restArgs.title ? `: ${truncate(restArgs.title, 30)}` : restArgs.padId ? ` (${restArgs.padId.slice(0, 8)})` : ''}`
          : i18n.t('toolSummary.deepThinkingDefault')
      };
    }

    // 文件操作
    case 'write':
    case 'createFile':
    case 'updateFile':
      return {
        action: 'write',
        summary: restArgs.path ? i18n.t('toolSummary.writeFile', { path: restArgs.path }) : i18n.t('toolSummary.writeFileShort')
      };

    case 'patchFile':
      const editCount = restArgs.edits?.length || 0;
      return {
        action: 'patch',
        summary: restArgs.path
          ? i18n.t('toolSummary.editFile', { count: editCount, path: restArgs.path })
          : i18n.t('toolSummary.editFileShort', { count: editCount })
      };

    case 'deleteFile':
      return {
        action: 'delete',
        summary: restArgs.path ? i18n.t('toolSummary.deleteFile', { path: restArgs.path }) : i18n.t('toolSummary.deleteFileShort')
      };

    case 'renameFile':
      return {
        action: 'rename',
        summary: restArgs.oldPath && restArgs.newName
          ? i18n.t('toolSummary.renameFile', { oldPath: restArgs.oldPath, newName: restArgs.newName })
          : i18n.t('toolSummary.renameFileShort')
      };

    case 'readFile':
      return {
        action: 'read',
        summary: restArgs.path ? i18n.t('toolSummary.readFile', { path: restArgs.path }) : i18n.t('toolSummary.readFileShort')
      };

    case 'listFiles':
      return {
        action: 'list',
        summary: restArgs.path ? i18n.t('toolSummary.listDir', { path: restArgs.path }) : i18n.t('toolSummary.listDirShort')
      };

    case 'searchFiles':
      return {
        action: 'search',
        summary: restArgs.query ? i18n.t('toolSummary.searchFiles', { query: truncate(restArgs.query, 40) }) : i18n.t('toolSummary.searchFilesShort')
      };

    case 'globFiles':
      return {
        action: 'glob',
        summary: restArgs.pattern ? i18n.t('toolSummary.globFiles', { pattern: restArgs.pattern }) : i18n.t('toolSummary.globFilesShort')
      };

    // 记忆宫殿
    case 'query_memory':
      return {
        action: 'query',
        summary: restArgs.query
          ? i18n.t('toolSummary.queryMemory', { query: truncate(restArgs.query, 40) })
          : i18n.t('toolSummary.queryMemoryShort')
      };

    case 'manage_memory':
      return {
        action: 'memory',
        summary: restArgs.action
          ? (restArgs.content
            ? i18n.t('toolSummary.manageMemoryDetail', { action: restArgs.action, content: truncate(restArgs.content, 30) })
            : i18n.t('toolSummary.manageMemory', { action: restArgs.action }))
          : i18n.t('toolSummary.manageMemoryShort')
      };

    case 'link_memory':
      return {
        action: 'link',
        summary: restArgs.sourceId && restArgs.targetId
          ? i18n.t('toolSummary.linkMemory', { source: restArgs.sourceId, target: restArgs.targetId })
          : i18n.t('toolSummary.linkMemoryShort')
      };

    case 'memory_status':
      return {
        action: 'status',
        summary: i18n.t('toolSummary.memoryStatus')
      };

    case 'traverse_memory':
      return {
        action: 'traverse',
        summary: restArgs.wingName
          ? i18n.t('toolSummary.traverseMemory', { wing: restArgs.wingName })
          : i18n.t('toolSummary.traverseMemoryShort')
      };

    // 任务管理
    case 'manageTodos':
      return {
        action: 'todo',
        summary: restArgs.action
          ? i18n.t('toolSummary.todoManage', { action: getTodoActionLabel(restArgs.action) })
          : i18n.t('toolSummary.todoManageShort')
      };

    // 项目管理
    case 'updateProjectMeta':
      return {
        action: 'config',
        summary: i18n.t('toolSummary.updateProject')
      };

    // 技能
    case 'skills_list':
      return {
        action: 'skill',
        summary: i18n.t('toolSummary.skillsList'),
        icon: '📚',
      };
    case 'activate_skill':
      return {
        action: 'skill',
        summary: restArgs.skillName
          ? i18n.t('toolSummary.activateSkill', { name: restArgs.skillName })
          : i18n.t('toolSummary.activateSkillShort')
      };

    // 子代理
    case 'callSubAgent':
      return {
        action: 'agent',
        summary: restArgs.agentType
          ? i18n.t('toolSummary.callSubAgent', { type: restArgs.agentType })
          : i18n.t('toolSummary.callSubAgentShort')
      };

    // 计划
    case 'managePlanNote':
      return {
        action: 'plan',
        summary: restArgs.action
          ? i18n.t('toolSummary.planNote', { action: restArgs.action })
          : i18n.t('toolSummary.planNoteShort')
      };

    // 角色档案
    case 'initCharacterProfile':
      return {
        action: 'character',
        summary: restArgs.characterName
          ? i18n.t('toolSummary.initCharacter', { name: restArgs.characterName })
          : i18n.t('toolSummary.initCharacterShort')
      };

    case 'updateCharacterProfile':
      return {
        action: 'character',
        summary: restArgs.characterName
          ? i18n.t('toolSummary.updateCharacter', { name: restArgs.characterName })
          : i18n.t('toolSummary.updateCharacterShort')
      };

    // 人际关系
    case 'queryRelationships':
      return {
        action: 'relationship',
        summary: restArgs.characterName
          ? i18n.t('toolSummary.queryRelationship', { name: restArgs.characterName })
          : i18n.t('toolSummary.queryRelationshipShort')
      };

    // 大纲时间线
    case 'getEvents':
      return { action: 'outline', summary: i18n.t('toolSummary.getEvents') };
    case 'getChapters':
      return { action: 'outline', summary: i18n.t('toolSummary.getChapters') };
    case 'getVolumes':
      return { action: 'outline', summary: i18n.t('toolSummary.getVolumes') };
    case 'getStoryLines':
      return { action: 'outline', summary: i18n.t('toolSummary.getStoryLines') };
    case 'manageEvents':
      return { action: 'outline', summary: i18n.t('toolSummary.manageEvents', { action: restArgs.action || '' }) };
    case 'manageChapters':
      return { action: 'outline', summary: i18n.t('toolSummary.manageChapters', { action: restArgs.action || '' }) };
    case 'manageVolumes':
      return { action: 'outline', summary: i18n.t('toolSummary.manageVolumes', { action: restArgs.action || '' }) };
    case 'manageStoryLines':
      return { action: 'outline', summary: i18n.t('toolSummary.manageStoryLines', { action: restArgs.action || '' }) };
    case 'processOutlineInput':
      return { action: 'outline', summary: i18n.t('toolSummary.processOutlineInput', { input: truncate(restArgs.input || '', 40) }) };
    case 'getUnresolvedForeshadowing':
      return { action: 'outline', summary: i18n.t('toolSummary.getUnresolved') };
    case 'getForeshadowingDetail':
      return { action: 'outline', summary: i18n.t('toolSummary.foreshadowingDetail', { id: restArgs.foreshadowingId || '' }) };

    // 默认 — 显示名称 + 首个参数值
    default: {
      const firstKey = restArgs ? Object.keys(restArgs)[0] : null;
      const firstVal = firstKey ? restArgs[firstKey] : null;
      const paramHint = firstVal ? ` — ${truncate(String(firstVal), 40)}` : '';
      return {
        action: 'tool',
        summary: i18n.t('toolSummary.executeDefault', { name })
      };
    }
  }
}

/**
 * 获取任务操作的中文标签
 */
function getTodoActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'add': i18n.t('toolSummary.todoAdd'),
    'update': i18n.t('toolSummary.todoUpdate'),
    'remove': i18n.t('toolSummary.todoRemove'),
    'complete': i18n.t('toolSummary.todoComplete'),
    'reorder': i18n.t('toolSummary.todoReorder'),
    'list': i18n.t('toolSummary.todoList')
  };
  return labels[action] || action;
}
