import { constructSystemPrompt } from '../../../services/resources/skills/coreProtocol';
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
});
