/**
 * 技能触发服务 - 纯函数模块
 * 三通道 skill 触发：
 *   1. 用户文本触发（分类过滤 → 语义优先 → 关键词 fallback）
 *   2. 代码检测触发（由 toolRunner hook 调用）
 *   3. Agent 主动搜索（通过 activate_skill 工具）
 */

import Fuse from 'fuse.js';
import type { FileNode } from '../../types';
import { FileType } from '../../types';
import type { SkillTriggerRecord } from '../../stores/skillTriggerStore';
import type { ActivationNotification } from '../../stores/skillTriggerStore';
import { lifecycleManager } from '../agentContext/toolLifecycle';
import { generateEmbedding, cosineSimilarity } from '../memory/embeddingService';

// ==================== 意图分类 ====================

/** 意图 → 候选 category 映射 */
const INTENT_CATEGORY_MAP: Record<string, string[]> = {
  '写': ['创作'],
  '扩写': ['创作'],
  '展开': ['创作'],
  '润色': ['创作'],
  '改写': ['创作', '审核'],
  '重写': ['创作'],
  '描写': ['创作'],
  '对话': ['创作'],
  '打斗': ['创作'],
  '战斗': ['创作'],
  '情绪': ['创作'],
  '场景': ['创作'],
  '规划': ['规划'],
  '大纲': ['规划'],
  '设计': ['设计'],
  '构思': ['规划', '设计'],
  '角色': ['设计'],
  '人设': ['设计'],
  '设定': ['规划'],
  '世界观': ['规划'],
  '审核': ['审核'],
  '检查': ['审核'],
  '修改': ['创作', '审核'],
  '创建': ['规划', '设计'],
  '生成': ['创作'],
};

/** 纯查询类意图 → 不触发 */
const QUERY_INTENT_KEYWORDS = [
  '查询', '搜索', '找找', '查看', '有什么', '都有哪些',
  '能说说', '介绍一下', '看看', '了解一下', '帮我找', '读一下',
];

/** 从用户文本推断候选分类 */
function classifyIntent(text: string): { categories: string[]; isQuery: boolean } {
  const lower = text.toLowerCase();

  // 纯查询意图
  if (QUERY_INTENT_KEYWORDS.some(kw => lower.includes(kw))) {
    return { categories: [], isQuery: true };
  }

  const categories = new Set<string>();
  for (const [keyword, cats] of Object.entries(INTENT_CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      cats.forEach(c => categories.add(c));
    }
  }

  return { categories: [...categories], isQuery: false };
}

// ==================== Skill 文件收集 ====================

/** 从文件树中收集所有 skill 文件（按分类过滤） */
function collectSkillFiles(
  files: FileNode[],
  categoryFilter?: string[]
): Array<{ file: FileNode; category: string }> {
  const skillFolder = files.find(f => f.name === '98_技能配置');
  const skillsFolder = skillFolder
    ? files.find(f => f.parentId === skillFolder.id && f.name === 'skills' && f.type === FileType.FOLDER)
    : null;

  if (!skillsFolder) return [];

  const categoryFolders = files.filter(
    f => f.parentId === skillsFolder.id && f.type === FileType.FOLDER
  );

  const results: Array<{ file: FileNode; category: string }> = [];
  for (const catFolder of categoryFolders) {
    // 跳过核心目录（始终注入，不参与触发）
    if (catFolder.name === '核心') continue;

    // 分类过滤
    if (categoryFilter && categoryFilter.length > 0 && !categoryFilter.includes(catFolder.name)) continue;

    const skillFiles = files.filter(
      f => f.parentId === catFolder.id && f.type === 'FILE' && !f.hidden
    );
    for (const sf of skillFiles) {
      results.push({ file: sf, category: catFolder.name });
    }
  }

  return results;
}

// ==================== 关键词匹配（fallback） ====================

export function matchKeywords(text: string, keywords: string[]): boolean {
  if (!text || text.trim().length === 0) return false;
  if (!keywords || keywords.length === 0) return false;

  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (kw && lowerText.includes(kw.toLowerCase())) return true;
  }

  const items = keywords
    .filter(kw => kw && kw.trim().length > 0)
    .map(kw => ({ text: kw, keyword: kw }));

  if (items.length === 0) return false;

  const fuse = new Fuse(items, { includeScore: true, threshold: 0.4, keys: ['text'] });
  const results = fuse.search(text);
  return results.length > 0 && (results[0].score ?? 0) < 0.4;
}

export function buildMatchText(tags: string[], summarys: string[]): string {
  const parts: string[] = [];
  if (tags) parts.push(...tags);
  if (summarys) {
    for (const s of summarys) {
      if (typeof s === 'string') parts.push(s);
    }
  }
  return parts.join(' ');
}

export function findMatchedKeyword(text: string, keywords: string[]): string | null {
  if (!text || !keywords) return null;
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (kw && lowerText.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

// ==================== 触发检测上下文 ====================

export interface TriggerDetectionContext {
  files: FileNode[];
  triggerStore: {
    triggerSkill: (skill: Omit<SkillTriggerRecord, 'triggerRound' | 'decayRounds'>) => SkillTriggerRecord;
  };
}

// ==================== 通道 2: 用户文本触发（语义优先） ====================

/**
 * 同步版：关键词快速匹配（用于即时反馈）
 */
export function detectSkillTriggers(
  text: string,
  context: TriggerDetectionContext,
  onActivated?: (notif: ActivationNotification) => void
): void {
  const { categories, isQuery } = classifyIntent(text);
  if (isQuery) {
    console.log('[SkillTrigger] 跳过：纯查询意图');
    return;
  }

  const skillEntries = collectSkillFiles(context.files, categories.length > 0 ? categories : undefined);

  for (const { file: skillFile, category } of skillEntries) {
    const meta = skillFile.metadata || {};
    const tags: string[] = (meta.tags || []).filter(t => t !== '技能');
    const summarys: string[] = meta.summarys || [];
    const matchText = buildMatchText(tags, summarys);
    const allKeywords = [...tags, ...summarys];

    if (matchKeywords(text, allKeywords)) {
      const matched = findMatchedKeyword(text, allKeywords);
      const existingRecord = context.triggerStore.triggerSkill({
        skillId: skillFile.name,
        name: meta.name || skillFile.name,
        originalTags: tags,
        matchText,
        category,
        source: 'user',
      });

      const wasReset = lifecycleManager.getCurrentRound() > existingRecord.triggerRound;
      const remaining = existingRecord.decayRounds - (lifecycleManager.getCurrentRound() - existingRecord.triggerRound);

      onActivated?.({
        skillId: existingRecord.skillId,
        name: existingRecord.name,
        matchedKeyword: matched || null,
        remainingRounds: remaining,
        isReset: wasReset,
      });

      console.log(
        `[SkillTrigger] ${wasReset ? '重置' : '激活'}: ${existingRecord.name} [${category}]` +
        ` | 命中: ${matched || '模糊匹配'} | 剩余: ${remaining}轮`
      );
    }
  }
}

// ==================== 语义匹配缓存 ====================

const skillEmbeddingCache = new Map<string, number[]>();

export function clearSkillEmbeddingCache(): void {
  skillEmbeddingCache.clear();
}

/**
 * 异步版：语义优先 + 关键词 fallback
 * 流程：意图分类 → 语义 embedding 匹配 → 关键词 fallback
 */
export async function detectSkillTriggersSemantic(
  text: string,
  context: TriggerDetectionContext,
  onActivated?: (notif: ActivationNotification) => void
): Promise<void> {
  const { categories, isQuery } = classifyIntent(text);
  if (isQuery) return;

  // 先同步检测（关键词快速命中）
  const syncTriggered = new Set<string>();
  const originalOnActivated = onActivated;
  detectSkillTriggers(text, context, (notif) => {
    syncTriggered.add(notif.skillId);
    originalOnActivated?.(notif);
  });

  // 收集未触发的候选 skill（分类过滤缩小范围）
  const skillEntries = collectSkillFiles(
    context.files,
    categories.length > 0 ? categories : undefined
  );
  const remaining = skillEntries.filter(({ file }) => !syncTriggered.has(file.name));
  if (remaining.length === 0) return;

  // 语义 embedding 匹配
  try {
    const queryEmb = await generateEmbedding(text);

    for (const { file: skillFile, category } of remaining) {
      const meta = skillFile.metadata || {};
      const tags: string[] = (meta.tags || []).filter(t => t !== '技能');
      const summarys: string[] = meta.summarys || [];

      let skillEmb = skillEmbeddingCache.get(skillFile.name);
      if (!skillEmb) {
        const matchText = buildMatchText(tags, summarys);
        if (!matchText.trim()) continue;
        skillEmb = await generateEmbedding(matchText);
        skillEmbeddingCache.set(skillFile.name, skillEmb);
      }

      const sim = cosineSimilarity(queryEmb, skillEmb);
      if (sim > 0.50) {
        const existingRecord = context.triggerStore.triggerSkill({
          skillId: skillFile.name,
          name: meta.name || skillFile.name,
          originalTags: tags,
          matchText: `语义匹配(${sim.toFixed(2)})`,
          category,
          source: 'user',
        });

        const wasReset = lifecycleManager.getCurrentRound() > existingRecord.triggerRound;
        const remainingRounds = existingRecord.decayRounds - (lifecycleManager.getCurrentRound() - existingRecord.triggerRound);

        originalOnActivated?.({
          skillId: existingRecord.skillId,
          name: existingRecord.name,
          matchedKeyword: `语义匹配(${sim.toFixed(2)})`,
          remainingRounds: remainingRounds,
          isReset: wasReset,
        });

        console.log(
          `[SkillTrigger-Semantic] ${wasReset ? '重置' : '激活'}: ${existingRecord.name} [${category}]` +
          ` | 语义相似度: ${sim.toFixed(3)} | 剩余: ${remainingRounds}轮`
        );
      }
    }
  } catch {
    console.warn('[SkillTrigger-Semantic] embedding 不可用，跳过语义匹配');
  }
}

// ==================== 通道 1: 代码检测触发（供 toolRunner 调用） ====================

/**
 * 由 toolRunner post-hook 调用，根据工具调用类型强制注入 skill
 * @returns 被激活的 skill ID 列表
 */
export function injectSkillByCodeTrigger(
  toolName: string,
  toolArgs: Record<string, any>,
  context: TriggerDetectionContext
): string[] {
  const INJECTION_RULES: Array<{
    test: (name: string, args: Record<string, any>) => boolean;
    skillNames: string[];  // skill 文件名（不含路径）
  }> = [
    {
      test: (name, args) => name === 'writeFile' && args?.path?.includes('05_正文草稿'),
      skillNames: ['技能_正文扩写.md'],
    },
    {
      test: (name, args) => name === 'writeFile' && args?.path?.includes('05_正文草稿'),
      skillNames: ['技能_编辑审核.md'],
    },
    {
      test: (name) => name === 'processOutlineInput',
      skillNames: ['技能_大纲构建.md'],
    },
    {
      test: (name) => name === 'updateProjectMeta',
      skillNames: ['技能_项目初始化.md'],
    },
  ];

  const activated: string[] = [];
  const { triggerStore } = context;

  for (const rule of INJECTION_RULES) {
    if (rule.test(toolName, toolArgs)) {
      for (const skillName of rule.skillNames) {
        triggerStore.triggerSkill({
          skillId: skillName,
          name: skillName.replace('技能_', '').replace('.md', ''),
          originalTags: [],
          matchText: '代码检测触发',
          source: 'code',
        });
        activated.push(skillName);
        console.log(`[SkillTrigger-Code] 强制注入: ${skillName}`);
      }
    }
  }

  return activated;
}
