import { PROJECT_SOUL_TEMPLATE, constructSystemPrompt } from '../../../services/resources/skills/coreProtocol';
import { FileNode, FileType, TodoItem } from '../../../types';

const folder = (id: string, name: string, parentId: string | null = null): FileNode => ({
  id,
  name,
  parentId,
  type: FileType.FOLDER,
  lastModified: 1,
});

const file = (id: string, name: string, parentId: string, content: string): FileNode => ({
  id,
  name,
  parentId,
  type: FileType.FILE,
  content,
  lastModified: 1,
});

describe('constructSystemPrompt', () => {
  it('keeps user turn history out of the system prompt', () => {
    const files: FileNode[] = [
      folder('root', '项目'),
      folder('drafts', '05_正文草稿', 'root'),
    ];

    const prompt = constructSystemPrompt(
      files,
      { id: 'p1', name: '测试项目', createdAt: 1, lastModified: 1 } as any,
      [],
      [
        { id: 'm1', role: 'user', text: '这是一条不应该重复注入 system prompt 的用户历史', timestamp: 1 },
      ],
      false,
      [],
    );

    expect(prompt).toContain('<runtime_context>');
    expect(prompt).toContain('## 项目概况');
    expect(prompt).not.toContain('用户意图历史');
    expect(prompt).not.toContain('这是一条不应该重复注入 system prompt 的用户历史');
  });

  it('sorts skill metadata deterministically in the stable section', () => {
    const files: FileNode[] = [
      folder('cfg', '98_技能配置'),
      folder('skills', 'skills', 'cfg'),
      folder('creative', '创作', 'skills'),
      file('b', 'b.md', 'creative', '---\nname: B技能\nsummarys: [后出现]\n---\n'),
      file('a', 'a.md', 'creative', '---\nname: A技能\nsummarys: [先出现]\n---\n'),
    ];
    const todos: TodoItem[] = [{ task: '继续写第二章', status: 'pending' } as TodoItem];

    const prompt = constructSystemPrompt(files, undefined, todos, [], false, []);

    expect(prompt.indexOf('A技能')).toBeGreaterThan(-1);
    expect(prompt.indexOf('A技能')).toBeLessThan(prompt.indexOf('B技能'));
    expect(prompt).toContain('继续写第二章');
    expect(prompt.indexOf('<available_skills>')).toBeLessThan(prompt.indexOf('<runtime_context>'));
  });

  it('combines global soul with project soul override', () => {
    const files: FileNode[] = [
      folder('cfg', '98_技能配置'),
      folder('skills', 'skills', 'cfg'),
      folder('core', '核心', 'skills'),
      file('soul', 'soul.md', 'core', '## 当前项目 Soul 覆盖\n\n- 本项目使用冷峻克制的语气。'),
    ];

    const prompt = constructSystemPrompt(
      files,
      undefined,
      [],
      [],
      false,
      [],
      '## 全局 Soul\n\n- 用户喜欢直接结论。',
    );

    expect(prompt).toContain('用户喜欢直接结论');
    expect(prompt).toContain('本项目使用冷峻克制的语气');
  });

  it('does not inject the project soul template as an override', () => {
    const files: FileNode[] = [
      folder('cfg', '98_技能配置'),
      folder('skills', 'skills', 'cfg'),
      folder('core', '核心', 'skills'),
      file('soul', 'soul.md', 'core', PROJECT_SOUL_TEMPLATE),
    ];

    const prompt = constructSystemPrompt(files, undefined, [], [], false, [], '## 全局 Soul\n\n- 全局规则');

    expect(prompt).toContain('全局规则');
    expect(prompt).not.toContain('本文件只写当前项目的特殊人格/风格要求');
  });

  it('includes soul update criteria in the stable protocol', () => {
    const prompt = constructSystemPrompt([], undefined, [], [], false, []);

    expect(prompt).toContain('## Soul 更新准则');
    expect(prompt).toContain('更新全局 Soul 必须使用 manage_global_soul');
    expect(prompt).toContain('项目 98_技能配置/skills/核心/soul.md');
  });
});
