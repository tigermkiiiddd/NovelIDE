import { executeManageGlobalSoul, manageGlobalSoulTool } from '../../../services/agent/tools/globalSoulTools';
import { dbAPI } from '../../../services/persistence';

jest.mock('../../../services/persistence', () => ({
  dbAPI: {
    getGlobalSoul: jest.fn(),
    saveGlobalSoul: jest.fn(),
  },
}));

const mockedDb = dbAPI as jest.Mocked<typeof dbAPI>;

describe('manage_global_soul tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes read and patch actions', () => {
    expect(manageGlobalSoulTool.function.name).toBe('manage_global_soul');
    expect(manageGlobalSoulTool.function.parameters?.properties.action.enum).toEqual(['read', 'patch']);
  });

  it('reads saved global soul', async () => {
    mockedDb.getGlobalSoul.mockResolvedValue('## 全局 Soul\n\n- 用户喜欢直接结论。');

    const result = await executeManageGlobalSoul({
      action: 'read',
      reason: '确认当前跨项目规则',
    });

    expect(result).toContain('用户喜欢直接结论');
    expect(mockedDb.saveGlobalSoul).not.toHaveBeenCalled();
  });

  it('patches global soul with exact replacement', async () => {
    mockedDb.getGlobalSoul.mockResolvedValue('## 全局 Soul\n\n- 用户喜欢直接结论。');

    const result = await executeManageGlobalSoul({
      action: 'patch',
      reason: '用户明确要求以后都更直接',
      exact: '- 用户喜欢直接结论。',
      replacement: '- 用户喜欢直接结论，普通回答先给结论再给理由。',
    });

    expect(result).toContain('全局 Soul 已更新');
    expect(mockedDb.saveGlobalSoul).toHaveBeenCalledWith(
      '## 全局 Soul\n\n- 用户喜欢直接结论，普通回答先给结论再给理由。',
    );
  });
});
