import { getToolType, ToolType } from '../../../domains/agentContext/messageClassifier';

describe('messageClassifier tool aliases', () => {
  it('maps current visible file tools to legacy decay categories', () => {
    expect(getToolType('read')).toBe(ToolType.READ_FILE);
    expect(getToolType('write')).toBe(ToolType.WRITE_FILE);
    expect(getToolType('edit')).toBe(ToolType.PATCH_FILE);
    expect(getToolType('glob')).toBe(ToolType.LIST_FILES);
    expect(getToolType('grep')).toBe(ToolType.LIST_FILES);
  });

  it('keeps legacy tool names compatible', () => {
    expect(getToolType('readFile')).toBe(ToolType.READ_FILE);
    expect(getToolType('writeFile')).toBe(ToolType.WRITE_FILE);
    expect(getToolType('patchFile')).toBe(ToolType.PATCH_FILE);
    expect(getToolType('listFiles')).toBe(ToolType.LIST_FILES);
    expect(getToolType('manageTodos')).toBe(ToolType.MANAGE_TODOS);
  });

  it('normalizes separator variants', () => {
    expect(getToolType('read_file')).toBe(ToolType.READ_FILE);
    expect(getToolType('update-project-meta')).toBe(ToolType.UPDATE_PROJECT_META);
    expect(getToolType('manage_plan_note')).toBe(ToolType.MANAGE_PLAN_NOTE);
  });
});
