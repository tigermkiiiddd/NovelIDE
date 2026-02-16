/**
 * 工具操作摘要生成工具
 * 为 AI 工具调用生成简洁的人类可读摘要
 */

export interface ToolSummary {
  action: string;    // 操作类型
  summary: string;   // 摘要文本
}

/**
 * 根据工具名称和参数生成简洁的操作摘要
 */
export function generateToolSummary(name: string, args: any): ToolSummary {
  // 提取 thinking（不参与摘要生成）
  const { thinking, ...restArgs } = args || {};

  switch (name) {
    // 文件操作
    case 'createFile':
      return {
        action: 'create',
        summary: restArgs.path ? `创建文件: ${restArgs.path}` : '创建文件'
      };

    case 'updateFile':
      return {
        action: 'update',
        summary: restArgs.path ? `更新文件: ${restArgs.path}` : '更新文件'
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

    // 搜索
    case 'callSearchAgent':
      return {
        action: 'search',
        summary: restArgs.query ? `搜索: "${restArgs.query}"` : '搜索'
      };

    // 子代理
    case 'callSubAgent':
      return {
        action: 'agent',
        summary: restArgs.agentType
          ? `调用子代理: ${restArgs.agentType}`
          : '调用子代理'
      };

    // 默认
    default:
      return {
        action: 'tool',
        summary: `执行工具: ${name}`
      };
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
