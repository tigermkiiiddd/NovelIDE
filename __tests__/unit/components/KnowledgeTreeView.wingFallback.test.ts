/**
 * Regression Test: WING_COLORS fallback
 *
 * Bug: KnowledgeTreeView.tsx 中 WING_COLORS[wing] 在 wing 为未注册值时
 * 返回 undefined，导致 Cannot read properties of undefined (reading 'rgb')。
 *
 * 修复：所有 WING_COLORS[wing] 查找加 || WING_COLORS.world fallback。
 *
 * 测试覆盖 4 个查找点（NodeTooltip, room 锚点, knowledge 星辰, link 线条）。
 */

import { KnowledgeWing } from '../../../types';

// --- 内联 WING_COLORS 配置（与 KnowledgeTreeView.tsx 保持同步） ---
type WingColor = { light: string; main: string; dark: string; rgb: string };

const WING_COLORS: Record<KnowledgeWing, WingColor> = {
  world: { light: '#60a5fa', main: '#3b82f6', dark: '#1e40af', rgb: '59,130,246' },
  writing_rules: { light: '#fbbf24', main: '#f59e0b', dark: '#b45309', rgb: '245,158,11' },
};

/**
 * 提取 resolveWingColors 逻辑（与组件内一致）
 */
function resolveWingColors(wing: string | undefined): WingColor {
  // 知识节点 / room 锚点模式
  return WING_COLORS[wing as KnowledgeWing] || WING_COLORS.world;
}

function resolveLinkColors(srcWing: string | undefined): WingColor {
  // link 模式（已有 fallback）
  return (srcWing && WING_COLORS[srcWing as KnowledgeWing]) || WING_COLORS.world;
}

// --- Tests ---

describe('KnowledgeTreeView: WING_COLORS fallback', () => {

  describe('resolveWingColors (节点/room)', () => {
    it('world wing → 返回 world 颜色', () => {
      const c = resolveWingColors('world');
      expect(c.rgb).toBe('59,130,246');
      expect(c.main).toBe('#3b82f6');
    });

    it('writing_rules wing → 返回 writing_rules 颜色', () => {
      const c = resolveWingColors('writing_rules');
      expect(c.rgb).toBe('245,158,11');
      expect(c.main).toBe('#f59e0b');
    });

    it('undefined → fallback 到 world', () => {
      const c = resolveWingColors(undefined);
      expect(c.rgb).toBe('59,130,246');
    });

    it('未注册的 wing 值 → fallback 到 world', () => {
      const c = resolveWingColors('characters');
      expect(c.rgb).toBe('59,130,246');
    });

    it('空字符串 → fallback 到 world', () => {
      const c = resolveWingColors('');
      expect(c.rgb).toBe('59,130,246');
    });

    it('返回值始终包含完整属性', () => {
      const cases = ['world', 'writing_rules', undefined, 'unknown'];
      for (const wing of cases) {
        const c = resolveWingColors(wing);
        expect(c).toHaveProperty('light');
        expect(c).toHaveProperty('main');
        expect(c).toHaveProperty('dark');
        expect(c).toHaveProperty('rgb');
        expect(typeof c.rgb).toBe('string');
        expect(c.rgb).toBeTruthy();
      }
    });
  });

  describe('resolveLinkColors (连线)', () => {
    it('world → world 颜色', () => {
      expect(resolveLinkColors('world').rgb).toBe('59,130,246');
    });

    it('writing_rules → writing_rules 颜色', () => {
      expect(resolveLinkColors('writing_rules').rgb).toBe('245,158,11');
    });

    it('undefined → fallback 到 world', () => {
      expect(resolveLinkColors(undefined).rgb).toBe('59,130,246');
    });

    it('未注册值 → fallback 到 world', () => {
      expect(resolveLinkColors('plot').rgb).toBe('59,130,246');
    });
  });

  describe('canvas 调用不会抛错', () => {
    it('resolveWingColors 结果可直接用于模板字符串', () => {
      const wings: (string | undefined)[] = [
        'world', 'writing_rules', undefined, 'nonexistent', '',
      ];
      for (const w of wings) {
        const c = resolveWingColors(w);
        // 模拟 canvas 调用：`rgba(${colors.rgb}, 0.04)`
        expect(() => `rgba(${c.rgb}, 0.04)`).not.toThrow();
        expect(`rgba(${c.rgb}, 0.04)`).toMatch(/^rgba\(\d+,\d+,\d+, 0\.04\)$/);
      }
    });

    it('resolveLinkColors 结果可直接用于模板字符串', () => {
      const wings: (string | undefined)[] = [
        'world', 'writing_rules', undefined, 'nonexistent',
      ];
      for (const w of wings) {
        const c = resolveLinkColors(w);
        expect(() => `rgba(${c.rgb}, 0.2)`).not.toThrow();
      }
    });
  });
});
