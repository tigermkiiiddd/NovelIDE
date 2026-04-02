/**
 * 技能触发状态管理
 * 负责：记录触发、技能匹配、轮次衰减（8轮后清除）
 *
 * round 来源：LifecycleManager（单例）
 * 持久化：records 存到 IndexedDB
 */

import { create } from 'zustand';
import { dbAPI } from '../services/persistence';
import { lifecycleManager } from '../domains/agentContext/toolLifecycle';

const MAX_ROUNDS = 8; // 技能活跃轮次上限

/** 判断技能在当前轮次是否仍然活跃 */
function isSkillAlive(record: SkillTriggerRecord, currentRound: number): boolean {
  const elapsed = currentRound - record.triggerRound;
  return elapsed < record.decayRounds;
}

export interface SkillTriggerRecord {
  skillId: string;           // 技能文件名
  name: string;              // 技能显示名
  originalTags: string[];    // 原始 tags
  matchText: string;         // tags + summarys（用于匹配）
  triggerRound: number;      // 触发时的轮次
  decayRounds: number;      // 衰减轮次（固定为8）
}

export interface SkillTriggerState {
  records: SkillTriggerRecord[];

  triggerSkill: (skill: Omit<SkillTriggerRecord, 'triggerRound' | 'decayRounds'>) => SkillTriggerRecord;
  getActiveSkills: () => SkillTriggerRecord[];
  reset: () => void;
  loadFromDB: (projectId: string) => Promise<void>;
  recalibrate: (newMessageCount: number) => void;
}

export interface ActivationNotification {
  skillId: string;
  name: string;
  matchedKeyword: string | null;
  remainingRounds: number;
  isReset: boolean;
}

// 简单的 debounce 工具
const debounce = <T extends (...args: any[]) => any>(func: T, wait: number) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export const useSkillTriggerStore = create<SkillTriggerState>((set, get) => ({
  records: [],

  triggerSkill: (skill) => {
    const currentRound = lifecycleManager.getCurrentRound();
    const { records } = get();
    const existingIndex = records.findIndex(r => r.skillId === skill.skillId);

    if (existingIndex >= 0) {
      const updated = { ...records[existingIndex], triggerRound: currentRound };
      const newRecords = [...records];
      newRecords[existingIndex] = updated;
      set({ records: newRecords });
      debouncedPersist(newRecords);
      return updated;
    } else {
      const newRecord: SkillTriggerRecord = {
        ...skill,
        triggerRound: currentRound,
        decayRounds: MAX_ROUNDS,
      };
      const newRecords = [...records, newRecord];
      set({ records: newRecords });
      debouncedPersist(newRecords);
      return newRecord;
    }
  },

  getActiveSkills: () => {
    const currentRound = lifecycleManager.getCurrentRound();
    return get().records.filter(record => isSkillAlive(record, currentRound));
  },

  reset: () => {
    set({ records: [] });
    lifecycleManager.reset();
    debouncedPersist([]);
  },

  loadFromDB: async (projectId) => {
    const state = await dbAPI.getSkillTriggerState(projectId);
    if (state) {
      set({ records: state.records });
      lifecycleManager.setCurrentRound(state.currentRound);
    } else {
      set({ records: [] });
      lifecycleManager.reset();
    }
  },

  recalibrate: (newMessageCount: number) => {
    const { records } = get();
    // 如果消息被删除了，同步重置 round 并清除超出范围的技能
    const currentRound = lifecycleManager.getCurrentRound();
    if (newMessageCount < currentRound) {
      lifecycleManager.setCurrentRound(newMessageCount);
      const stillActive = records.filter(record => isSkillAlive(record, newMessageCount));
      set({ records: stillActive });
      debouncedPersist(stillActive);
    }
  },
}));

// 当前项目 ID
let _currentProjectId: string | null = null;

const persistTriggerState = (records: SkillTriggerRecord[]) => {
  if (!_currentProjectId) return;
  dbAPI.saveSkillTriggerState(_currentProjectId, {
    records,
    currentRound: lifecycleManager.getCurrentRound()
  });
};

const debouncedPersist = debounce(persistTriggerState, 1000);

export const setSkillTriggerProjectId = (projectId: string | null) => {
  _currentProjectId = projectId;
};

// 辅助：计算剩余活跃轮数
export function getRemainingRounds(record: SkillTriggerRecord, currentRound: number): number {
  const elapsed = currentRound - record.triggerRound;
  return Math.max(0, record.decayRounds - elapsed);
}
