/**
 * @file skillTools.ts
 * @description 渐进式技能加载工具（参考 hermes 的 progressive disclosure 设计）
 *
 * 两步设计：
 * 1. skills_list() — 列出可用技能的 name + description（省 token，发现阶段）
 * 2. activate_skill() — 加载完整内容到下一轮 system prompt（使用阶段）
 */

import type { ToolDefinition } from '../types';
import { useFileStore } from '../../../stores/fileStore';
import { useSkillTriggerStore } from '../../../stores/skillTriggerStore';
import { useProjectStore } from '../../../stores/projectStore';
import { FileType } from '../../../types';
import { parseFileMeta } from '../../fileSystem';

// ==================== 工具定义 ====================

/** Tier 1: 技能发现 — 只返回 name + description */
export const skillsListTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skills_list',
    description:
      '列出所有可用技能的名称和简介（渐进式加载 Tier 1）。' +
      '遇到不熟悉的任务类型时调用，先看有什么技能可用，再用 activate_skill 加载。' +
      '[READ TOOL — 不需要审批]',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '按分类过滤（创作/规划/设计/审核）',
        },
      },
      required: [],
    },
  },
};

/** Tier 2: 技能加载 — 完整内容直接在 tool response 中返回 */
export const activateSkillTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'activate_skill',
    description:
      '加载技能的完整方法论。完整内容直接在本条 tool response 中返回，立即生效。' +
      '先用 skills_list 查看可用技能，选合适的再激活。' +
      '[READ TOOL — 不需要审批]',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: '技能名称（从 skills_list 结果中选择，如"深度思考方法论"、"角色设计"）',
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

// ==================== 技能文件收集 ====================

interface SkillEntry {
  file: import('../../../types').FileNode;
  category: string;
  meta: Record<string, any>;
}

function collectSkills(category?: string): SkillEntry[] {
  const files = useFileStore.getState().files;
  const skillFolder = files.find(f => f.name === '98_技能配置');
  const skillsFolder = skillFolder
    ? files.find(f => f.parentId === skillFolder.id && f.name === 'skills' && f.type === FileType.FOLDER)
    : null;

  if (!skillsFolder) return [];

  const categoryFolders = files.filter(
    f => f.parentId === skillsFolder.id && f.type === FileType.FOLDER && f.name !== '核心'
  );

  const results: SkillEntry[] = [];
  for (const catFolder of categoryFolders) {
    if (category && catFolder.name !== category) continue;

    const skillFiles = files.filter(
      f => f.parentId === catFolder.id && f.type === 'FILE' && !f.hidden
    );

    for (const sf of skillFiles) {
      const meta = parseFileMeta(sf.content);
      results.push({ file: sf, category: catFolder.name, meta });
    }
  }
  return results;
}

// ==================== skills_list 执行 ====================

export function executeSkillsList(category?: string): string {
  const skills = collectSkills(category);

  if (skills.length === 0) {
    return '当前没有可用技能。';
  }

  const lines = skills.map(({ meta, category: cat }) => {
    const name = meta.name || '(未命名)';
    const desc = meta.description || meta.summarys?.[0] || '';
    return `- **${name}** [${cat}]：${desc}`;
  });

  return `可用技能（${skills.length}个）：\n${lines.join('\n')}\n\n用 activate_skill(name) 加载完整内容。`;
}

// ==================== activate_skill 执行 ====================

export interface ActivateSkillResult {
  success: boolean;
  message: string;
  skillId?: string;
  category?: string;
  hasPatch?: boolean;
}

export function executeActivateSkill(
  skillName: string,
  reason: string
): ActivateSkillResult {
  const files = useFileStore.getState().files;
  const triggerStore = useSkillTriggerStore.getState();

  const skills = collectSkills();
  const normalizedName = skillName.toLowerCase().trim();

  // 按名称匹配
  let matched: SkillEntry | null = null;
  for (const s of skills) {
    const name = (s.meta.name || '').toLowerCase();
    const fileName = s.file.name.toLowerCase();
    if (name.includes(normalizedName) || fileName.includes(normalizedName)) {
      matched = s;
      break;
    }
  }

  if (!matched) {
    const available = skills.map(s => `[${s.category}] ${s.meta.name || s.file.name}`).join('\n');
    return {
      success: false,
      message: `未找到技能 "${skillName}"。可用技能：\n${available}\n\n提示：先用 skills_list 查看所有技能。`,
    };
  }

  // 注册到 triggerStore（供 AgentInput UI 标签使用）
  triggerStore.triggerSkill({
    skillId: matched.file.name,
    name: matched.meta.name || matched.file.name,
    originalTags: (matched.meta.tags || []).filter((t: string) => t !== '技能'),
    matchText: `Agent主动激活: ${reason}`,
    category: matched.category,
    source: 'agent',
  });

  // 构建返回内容：直接包含完整 skill 内容
  const skillDisplayName = matched.meta.name || matched.file.name;
  let message = `已激活 [${matched.category}] ${skillDisplayName}\n\n` +
    `<skill_content name="${skillDisplayName}" category="${matched.category}">\n` +
    `${matched.file.content}\n` +
    `</skill_content>`;

  // 检查题材补丁
  const project = useProjectStore.getState().project;
  const genre = project?.genre;
  let hasPatch = false;

  if (genre) {
    const skillFolder = files.find(f => f.name === '98_技能配置');
    const skillsFolder = skillFolder
      ? files.find(f => f.parentId === skillFolder.id && f.name === 'skills' && f.type === FileType.FOLDER)
      : null;
    const patchFolder = skillsFolder
      ? files.find(f => f.parentId === skillsFolder.id && f.name === '补丁' && f.type === FileType.FOLDER)
      : null;

    if (patchFolder) {
      const baseName = matched.file.name.replace('技能_', '').replace('.md', '');
      const patchName = `${genre}_${baseName}.md`;
      const patchFile = files.find(
        f => f.parentId === patchFolder.id && f.name === patchName && !f.hidden
      );
      if (patchFile) {
        hasPatch = true;
        triggerStore.triggerSkill({
          skillId: patchFile.name,
          name: `补丁: ${matched.meta.name} - ${genre}`,
          originalTags: (patchFile.metadata?.tags || []),
          matchText: `题材补丁自动关联`,
          category: '补丁',
          source: 'code',
          isPatch: true,
        });
        message += `\n\n<skill_patch genre="${genre}">\n${patchFile.content}\n</skill_patch>`;
      }
    }
  }

  return {
    success: true,
    message,
    skillId: matched.file.name,
    category: matched.category,
    hasPatch,
  };
}
