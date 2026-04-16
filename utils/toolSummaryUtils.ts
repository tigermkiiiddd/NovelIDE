/**
 * 工具操作摘要生成工具
 * 为 AI 工具调用生成简洁的人类可读摘要
 */

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
        ].filter(Boolean).join(' | ') || '内部推理'
      };

    case 'final_answer':
      return {
        action: 'answer',
        summary: restArgs.answer
          ? `回复: ${truncate(restArgs.answer, 80)}`
          : '最终回复'
      };

    case 'deep_thinking': {
      const dtLabels: Record<string, string> = {
        'create': '创建深度分析空间',
        'list': '查看活跃分析空间',
        'archive': '归档分析空间',
        'view_log': '查看变更日志',
      };
      return {
        action: 'deep_think',
        summary: restArgs.action
          ? `${dtLabels[restArgs.action] || restArgs.action}${restArgs.title ? `: ${truncate(restArgs.title, 30)}` : restArgs.padId ? ` (${restArgs.padId.slice(0, 8)})` : ''}`
          : '深度分析'
      };
    }

    // 文件操作
    case 'write':
    case 'createFile':
    case 'updateFile':
      return {
        action: 'write',
        summary: restArgs.path ? `写入文件: ${restArgs.path}` : '写入文件'
      };

    case 'patchFile':
      const editCount = restArgs.edits?.length || 0;
      return {
        action: 'patch',
        summary: restArgs.path
          ? `编辑 ${editCount} 处: ${restArgs.path}`
          : `编辑 ${editCount} 处`
      };

    case 'deleteFile':
      return {
        action: 'delete',
        summary: restArgs.path ? `删除文件: ${restArgs.path}` : '删除文件'
      };

    case 'renameFile':
      return {
        action: 'rename',
        summary: restArgs.oldPath && restArgs.newName
          ? `重命名: ${restArgs.oldPath} → ${restArgs.newName}`
          : '重命名文件'
      };

    case 'readFile':
      return {
        action: 'read',
        summary: restArgs.path ? `读取文件: ${restArgs.path}` : '读取文件'
      };

    case 'listFiles':
      return {
        action: 'list',
        summary: restArgs.path ? `列出目录: ${restArgs.path}` : '列出文件'
      };

    case 'searchFiles':
      return {
        action: 'search',
        summary: restArgs.query ? `搜索文件: "${truncate(restArgs.query, 40)}"` : '搜索文件'
      };

    case 'globFiles':
      return {
        action: 'glob',
        summary: restArgs.pattern ? `匹配文件: ${restArgs.pattern}` : '匹配文件'
      };

    // 记忆宫殿
    case 'query_memory':
      return {
        action: 'query',
        summary: restArgs.query
          ? `查询记忆: "${truncate(restArgs.query, 40)}"`
          : '查询记忆'
      };

    case 'manage_memory':
      return {
        action: 'memory',
        summary: restArgs.action
          ? `记忆管理: ${restArgs.action}${restArgs.content ? ` — ${truncate(restArgs.content, 30)}` : ''}`
          : '记忆管理'
      };

    case 'link_memory':
      return {
        action: 'link',
        summary: restArgs.sourceId && restArgs.targetId
          ? `关联记忆: ${restArgs.sourceId} → ${restArgs.targetId}`
          : '关联记忆'
      };

    case 'memory_status':
      return {
        action: 'status',
        summary: '记忆宫殿状态'
      };

    case 'traverse_memory':
      return {
        action: 'traverse',
        summary: restArgs.wingName
          ? `遍历记忆: ${restArgs.wingName}`
          : '遍历记忆宫殿'
      };

    // 任务管理
    case 'manageTodos':
      return {
        action: 'todo',
        summary: restArgs.action
          ? `任务管理: ${getTodoActionLabel(restArgs.action)}`
          : '任务管理'
      };

    // 项目管理
    case 'updateProjectMeta':
      return {
        action: 'config',
        summary: '更新项目设置'
      };

    // 技能
    case 'skills_list':
      return {
        action: 'skill',
        summary: '浏览可用技能列表',
        icon: '📚',
      };
    case 'activate_skill':
      return {
        action: 'skill',
        summary: restArgs.skillName
          ? `激活技能: ${restArgs.skillName}`
          : '激活技能'
      };

    // 子代理
    case 'callSubAgent':
      return {
        action: 'agent',
        summary: restArgs.agentType
          ? `调用子代理: ${restArgs.agentType}`
          : '调用子代理'
      };

    // 计划
    case 'managePlanNote':
      return {
        action: 'plan',
        summary: restArgs.action
          ? `计划笔记: ${restArgs.action}`
          : '计划笔记'
      };

    // 角色档案
    case 'initCharacterProfile':
      return {
        action: 'character',
        summary: restArgs.characterName
          ? `初始化角色: ${restArgs.characterName}`
          : '初始化角色'
      };

    case 'updateCharacterProfile':
      return {
        action: 'character',
        summary: restArgs.characterName
          ? `更新角色: ${restArgs.characterName}`
          : '更新角色'
      };

    // 人际关系
    case 'queryRelationships':
      return {
        action: 'relationship',
        summary: restArgs.characterName
          ? `查询关系: ${restArgs.characterName}`
          : '查询人际关系'
      };

    // 大纲时间线
    case 'getEvents':
      return { action: 'outline', summary: '获取事件列表' };
    case 'getChapters':
      return { action: 'outline', summary: '获取章节列表' };
    case 'getVolumes':
      return { action: 'outline', summary: '获取卷列表' };
    case 'getStoryLines':
      return { action: 'outline', summary: '获取故事线' };
    case 'manageEvents':
      return { action: 'outline', summary: `管理事件: ${restArgs.action || ''}` };
    case 'manageChapters':
      return { action: 'outline', summary: `管理章节: ${restArgs.action || ''}` };
    case 'manageVolumes':
      return { action: 'outline', summary: `管理卷: ${restArgs.action || ''}` };
    case 'manageStoryLines':
      return { action: 'outline', summary: `管理故事线: ${restArgs.action || ''}` };
    case 'processOutlineInput':
      return { action: 'outline', summary: `处理大纲输入: ${truncate(restArgs.input || '', 40)}` };
    case 'getUnresolvedForeshadowing':
      return { action: 'outline', summary: '获取未收尾伏笔' };
    case 'getForeshadowingDetail':
      return { action: 'outline', summary: `伏笔详情: ${restArgs.foreshadowingId || ''}` };

    // 默认 — 显示名称 + 首个参数值
    default: {
      const firstKey = restArgs ? Object.keys(restArgs)[0] : null;
      const firstVal = firstKey ? restArgs[firstKey] : null;
      const paramHint = firstVal ? ` — ${truncate(String(firstVal), 40)}` : '';
      return {
        action: 'tool',
        summary: `执行: ${name}${paramHint}`
      };
    }
  }
}

/**
 * 获取任务操作的中文标签
 */
function getTodoActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'add': '添加任务',
    'update': '更新任务',
    'remove': '移除任务',
    'complete': '完成任务',
    'reorder': '重排任务',
    'list': '列出任务'
  };
  return labels[action] || action;
}
