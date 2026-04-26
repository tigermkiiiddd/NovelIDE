import { DEFAULT_SOUL } from '../../resources/skills/coreProtocol';
import { dbAPI } from '../../persistence';
import { ToolDefinition } from '../types';

export const manageGlobalSoulTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manage_global_soul',
    description: `【全局 Soul 管理】读取或最小修改跨项目共享的全局 Soul。

## 使用边界
- 只保存跨项目长期有效的协作偏好、沟通习惯、稳定审美和高重要度纠正。
- 禁止写入世界观、角色口吻、专有名词、剧情事实、伏笔、章节状态和一次性任务偏好。
- patch 前必须先 read 当前全局 Soul。
- patch 必须是最小替换：用 exact 查找旧文本，用 replacement 替换；不要重写整份 Soul。
- 用户没有明确要求固化时，优先用 manage_evolution 记录，不要擅自更新全局 Soul。`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'patch'],
          description: 'read=读取当前全局 Soul；patch=最小替换更新全局 Soul',
        },
        reason: {
          type: 'string',
          description: '中文说明：为什么这条规则符合全局 Soul，而不是项目 Soul 或普通记忆',
        },
        exact: {
          type: 'string',
          description: 'patch 时必填：当前全局 Soul 中要被替换的精确文本',
        },
        replacement: {
          type: 'string',
          description: 'patch 时必填：替换后的文本。必须保留 exact 中仍然有效的内容',
        },
      },
      required: ['action', 'reason'],
    },
  },
};

const loadGlobalSoul = async (): Promise<string> => {
  const savedSoul = await dbAPI.getGlobalSoul();
  return savedSoul?.trim() ? savedSoul : DEFAULT_SOUL;
};

export const executeManageGlobalSoul = async (args: Record<string, any>): Promise<string> => {
  const action = String(args.action || '');
  const reason = String(args.reason || '').trim();

  if (!reason) {
    return 'Error: reason 不能为空。必须说明为什么这是跨项目全局 Soul 规则。';
  }

  const currentSoul = await loadGlobalSoul();

  if (action === 'read') {
    return `当前全局 Soul:\n\n${currentSoul}`;
  }

  if (action !== 'patch') {
    return `Error: 未知 action "${action}"。支持 read / patch。`;
  }

  const exact = String(args.exact || '');
  const replacement = String(args.replacement || '');

  if (!exact || !replacement) {
    return 'Error: patch 需要 exact 和 replacement。';
  }

  const firstIndex = currentSoul.indexOf(exact);
  if (firstIndex === -1) {
    return 'Error: exact 未在当前全局 Soul 中找到。请先 read 最新内容，再使用精确文本 patch。';
  }

  if (currentSoul.indexOf(exact, firstIndex + exact.length) !== -1) {
    return 'Error: exact 在当前全局 Soul 中出现多次。请扩大 exact 范围，确保只匹配一处。';
  }

  const nextSoul = currentSoul.slice(0, firstIndex) + replacement + currentSoul.slice(firstIndex + exact.length);
  await dbAPI.saveGlobalSoul(nextSoul);

  return [
    '全局 Soul 已更新。',
    `原因: ${reason}`,
    '',
    '变更:',
    `- ${exact}`,
    `+ ${replacement}`,
  ].join('\n');
};
