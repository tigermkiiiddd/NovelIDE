/**
 * @file skillTools.ts
 * @description 通道 3: Agent 主动搜索 + 渐进式注入的 skill 工具
 *
 * 使用场景：Agent 在执行任务过程中发现需要某个 skill 的知识，主动调用激活。
 * 执行逻辑：
 * 1. Agent 调用 activate_skill → 从文件系统读取完整 skill 内容
 * 2. 如果有题材补丁 → 自动拼接
 * 3. 注入到下一轮 system prompt（走 skillTriggerStore 统一注入）
 * 4. 返回确认信息
 */

import type { ToolDefinition } from '../types';
import { useFileStore } from '../../../stores/fileStore';
import { useSkillTriggerStore } from '../../../stores/skillTriggerStore';
import { useProjectStore } from '../../../stores/projectStore';
import { FileType } from '../../../types';

// ==================== 工具定义 ====================

export const activateSkillTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'activate_skill',
    description:
      '主动激活一个技能，加载完整内容到上下文。' +
      '当你觉得自己需要更专业的知识来完成当前任务时调用（如写打斗场景、设计角色、审核文本等）。' +
      '先看技能目录（system prompt 中已列出），选合适的激活。内容将在下一轮对话生效。' +
      '[READ TOOL — 不需要审批]',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: '技能名称（从技能目录中选择，如"正文扩写"、"角色设计"、"编辑审核"）',
        },
        reason: {
          type: 'string',
          description: '为什么需要这个技能（一句话）',
        },
      },
      required: ['skillName', 'reason'],
    },
  },
};

// ==================== 工具执行 ====================

export interface ActivateSkillResult {
  success: boolean;
  message: string;
  skillId?: string;
  category?: string;
  hasPatch?: boolean;
}

/**
 * 执行 activate_skill 工具
 * 查找 skill 文件 → 激活到 triggerStore → 检查补丁
 */
export function executeActivateSkill(
  skillName: string,
  reason: string
): ActivateSkillResult {
  const files = useFileStore.getState().files;
  const triggerStore = useSkillTriggerStore.getState();

  // 1. 在 skills/ 目录下查找匹配的 skill 文件
  const skillFolder = files.find(f => f.name === '98_技能配置');
  const skillsFolder = skillFolder
    ? files.find(f => f.parentId === skillFolder.id && f.name === 'skills' && f.type === FileType.FOLDER)
    : null;

  if (!skillsFolder) {
    return { success: false, message: '未找到技能目录' };
  }

  const categoryFolders = files.filter(
    f => f.parentId === skillsFolder.id && f.type === FileType.FOLDER && f.name !== '核心'
  );

  // 按名称匹配（支持模糊匹配：部分名称、中文名、英文名）
  const normalizedName = skillName.toLowerCase().trim();
  let matchedFile: FileNode | null = null;
  let matchedCategory = '';

  for (const catFolder of categoryFolders) {
    const skillFiles = files.filter(
      f => f.parentId === catFolder.id && f.type === 'FILE' && !f.hidden
    );

    for (const sf of skillFiles) {
      const meta = sf.metadata || {};
      const name = (meta.name || '').toLowerCase();
      const fileName = sf.name.toLowerCase();

      // 精确匹配
      if (name.includes(normalizedName) || fileName.includes(normalizedName)) {
        matchedFile = sf;
        matchedCategory = catFolder.name;
        break;
      }
    }
    if (matchedFile) break;
  }

  if (!matchedFile) {
    // 列出可用技能帮助 Agent 选择
    const available = categoryFolders.flatMap(catFolder => {
      const catFiles = files.filter(
        f => f.parentId === catFolder.id && f.type === 'FILE' && !f.hidden
      );
      return catFiles.map(f => {
        const meta = f.metadata || {};
        return `[${catFolder.name}] ${meta.name || f.name}`;
      });
    });
    return {
      success: false,
      message: `未找到技能 "${skillName}"。可用技能：\n${available.join('\n')}`,
    };
  }

  // 2. 激活 skill
  const meta = matchedFile.metadata || {};
  triggerStore.triggerSkill({
    skillId: matchedFile.name,
    name: meta.name || matchedFile.name,
    originalTags: (meta.tags || []).filter((t: string) => t !== '技能'),
    matchText: `Agent主动激活: ${reason}`,
    category: matchedCategory,
    source: 'agent',
  });

  // 3. 检查题材补丁
  const project = useProjectStore.getState().project;
  const genre = project?.genre;
  let hasPatch = false;

  if (genre) {
    const patchFolder = categoryFolders.find(f => f.name === '补丁');
    if (patchFolder) {
      const baseName = matchedFile.name.replace('技能_', '').replace('.md', '');
      const patchName = `${genre}_${baseName}.md`;
      const patchFile = files.find(
        f => f.parentId === patchFolder.id && f.name === patchName && !f.hidden
      );
      if (patchFile) {
        hasPatch = true;
        // 补丁也激活
        triggerStore.triggerSkill({
          skillId: patchFile.name,
          name: `补丁: ${meta.name} - ${genre}`,
          originalTags: (patchFile.metadata?.tags || []),
          matchText: `题材补丁自动关联`,
          category: '补丁',
          source: 'code',
          isPatch: true,
        });
      }
    }
  }

  return {
    success: true,
    message: `已激活 [${matchedCategory}] ${meta.name || matchedFile.name}。${hasPatch ? `检测到 ${genre} 题材补丁，已一并加载。` : ''}完整内容将在下一轮对话生效。`,
    skillId: matchedFile.name,
    category: matchedCategory,
    hasPatch,
  };
}
