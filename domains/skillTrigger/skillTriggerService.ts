/**
 * 技能触发服务 - 纯函数模块
 * 提供 Fuse.js 模糊匹配和检测逻辑
 */

import Fuse from 'fuse.js';
import type { FileNode } from '../../types';
import type { SkillTriggerRecord } from '../../stores/skillTriggerStore';
import type { ActivationNotification } from '../../stores/skillTriggerStore';
import { lifecycleManager } from '../agentContext/toolLifecycle';

/**
 * 对一段文本进行多关键字模糊匹配
 * @param text 待检测文本（用户输入 + thinking）
 * @param keywords tags + summarys 拼接后的关键词列表
 * @returns 是否命中任意一个关键词
 */
export function matchKeywords(text: string, keywords: string[]): boolean {
  if (!text || text.trim().length === 0) return false;
  if (!keywords || keywords.length === 0) return false;

  // 直接字符串包含匹配（最严格，优先命中）
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (kw && lowerText.includes(kw.toLowerCase())) {
      return true;
    }
  }

  // Fuse.js 模糊匹配（宽松匹配）
  const items = keywords
    .filter(kw => kw && kw.trim().length > 0)
    .map(kw => ({ text: kw, keyword: kw }));

  if (items.length === 0) return false;

  const fuse = new Fuse(items, { includeScore: true, threshold: 0.4, keys: ['text'] });
  const results = fuse.search(text);

  return results.length > 0 && (results[0].score ?? 0) < 0.4;
}

/**
 * 构建技能的匹配文本
 * @param tags 原始 tags 数组
 * @param summarys 原始 summarys 数组
 * @returns 拼接后的匹配文本
 */
export function buildMatchText(tags: string[], summarys: string[]): string {
  const parts: string[] = [];

  // tags 作为高权重触发词
  if (tags) {
    parts.push(...tags);
  }

  // summarys 提供更丰富的语义上下文
  if (summarys) {
    for (const s of summarys) {
      if (typeof s === 'string') {
        parts.push(s);
      }
    }
  }

  return parts.join(' ');
}

/**
 * 从匹配结果中找出命中了哪个关键词
 */
export function findMatchedKeyword(
  text: string,
  keywords: string[]
): string | null {
  if (!text || !keywords) return null;

  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (kw && lowerText.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

export interface TriggerDetectionContext {
  files: FileNode[];
  triggerStore: {
    triggerSkill: (skill: Omit<SkillTriggerRecord, 'triggerRound' | 'decayRounds'>) => SkillTriggerRecord;
  };
}

/**
 * 在给定上下文中执行技能触发检测
 * @param text 用户消息文本 + tool thinking 文本
 * @param onActivated 技能激活时的回调（用于 UI 通知）
 */
export function detectSkillTriggers(
  text: string,
  context: TriggerDetectionContext,
  onActivated?: (notif: ActivationNotification) => void
): void {
  const { files, triggerStore } = context;

  // 获取 subskill 目录中的技能文件
  const skillFolder = files.find(f => f.name === '98_技能配置');
  const subskillFolder = skillFolder
    ? files.find(f => f.parentId === skillFolder.id && f.name === 'subskill')
    : null;
  const skillFiles = subskillFolder
    ? files.filter(f => f.parentId === subskillFolder.id && f.type === 'FILE' && !f.hidden)
    : [];

  for (const skillFile of skillFiles) {
    const meta = skillFile.metadata || {};
    const tags: string[] = (meta.tags || []).filter(t => t !== '技能');
    const summarys: string[] = meta.summarys || [];
    const matchText = buildMatchText(tags, summarys);
    const allKeywords = [...tags, ...summarys];

    if (matchKeywords(text, allKeywords)) {
      const matched = findMatchedKeyword(text, allKeywords);
      const existingRecord = triggerStore.triggerSkill({
        skillId: skillFile.name,
        name: meta.name || skillFile.name,
        originalTags: tags,
        matchText,
      });

      const wasReset = lifecycleManager.getCurrentRound() > existingRecord.triggerRound;
      const remaining = existingRecord.decayRounds - (lifecycleManager.getCurrentRound() - existingRecord.triggerRound);

      const notif: ActivationNotification = {
        skillId: existingRecord.skillId,
        name: existingRecord.name,
        matchedKeyword: matched || null,
        remainingRounds: remaining,
        isReset: wasReset,
      };

      console.log(
        `[SkillTrigger] ${wasReset ? '重置' : '激活'}: ${existingRecord.name}` +
        ` | 命中: ${matched || '模糊匹配'} | 剩余: ${remaining}轮`
      );

      onActivated?.(notif);
    }
  }
}
