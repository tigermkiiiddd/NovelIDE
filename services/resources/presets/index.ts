/**
 * 预设模块导出
 */

export type { GenrePreset } from './presetTypes';
export { PRESETS } from './genrePresets';
export * from './presetTemplates';

import { PRESETS } from './genrePresets';

// 辅助函数：根据ID获取预设
export function getPresetById(id: string) {
  return PRESETS.find(preset => preset.id === id);
}

// 辅助函数：获取所有预设列表
export function getAllPresets() {
  return PRESETS;
}
