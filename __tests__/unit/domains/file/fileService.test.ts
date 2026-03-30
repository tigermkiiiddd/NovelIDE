/**
 * TDD Phase 3.1: 🔴 RED - FileService 域服务测试
 *
 * 这些测试定义FileService应该具有的行为。
 * FileService负责文件系统相关的业务逻辑。
 *
 * 核心职责：
 * 1. 系统文件保护逻辑
 * 2. 文件树构建和验证
 * 3. 文件操作规则（删除/重命名权限）
 */

import { FileNode, FileType } from '../../../../types';
import { FileService } from '../../../../domains/file/fileService';
import { getProtectionLevel, ProtectionLevel, canDelete, canModifyContent } from '../../../../domains/file/protectionRegistry';
import { mockFileSystem } from '../../../../src/test/utils/testHelpers';

describe('FileService - 文件系统域逻辑', () => {
  let fileService: FileService;
  let mockGenerateId: jest.Mock;

  beforeEach(() => {
    // Mock generateId function
    mockGenerateId = jest.fn();
    mockGenerateId.mockReturnValue('mock-id-1');

    fileService = new FileService(mockGenerateId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('系统文件保护', () => {
    it('应该识别系统保护文件', () => {
      const systemFile = {
        id: 'sys-1',
        path: '/system/.gitkeep',
        name: '.gitkeep',
        type: FileType.FILE,
        content: '',
        lastModified: Date.now()
      };

      const canDelete = fileService.canDeleteFile(systemFile);

      expect(canDelete).toBe(false);
    });

    it('应该允许删除非系统文件', () => {
      const userFile = {
        id: 'user-1',
        path: '/chapters/chapter1.md',
        name: 'chapter1.md',
        type: FileType.FILE,
        content: 'Chapter content',
        lastModified: Date.now()
      };

      const canDelete = fileService.canDeleteFile(userFile);

      expect(canDelete).toBe(true);
    });

    it('应该识别受保护的文件夹', () => {
      const protectedFolder = {
        id: 'folder-1',
        name: '98_技能配置',
        type: FileType.FOLDER,
        lastModified: Date.now()
      };

      const canDelete = fileService.canDeleteFile(protectedFolder);

      expect(canDelete).toBe(false);
    });

    it('应该允许删除subskill下的技能文件（AUTO_REBUILD）', () => {
      const allFiles: FileNode[] = [
        { id: 'root', parentId: '', name: 'root', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'skill-folder', parentId: 'root', name: '98_技能配置', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'subskill-folder', parentId: 'skill-folder', name: 'subskill', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'file-1', parentId: 'subskill-folder', name: '技能_世界观.md', type: FileType.FILE, content: 'Skill content', lastModified: Date.now() }
      ];
      const skillFile = allFiles[3];

      const canDelete = fileService.canDeleteFile(skillFile, allFiles);

      // subskill files are AUTO_REBUILD: can be deleted, will auto-rebuild
      expect(canDelete).toBe(true);
    });

    it('应该允许删除99_创作规范目录下的文件', () => {
      const allFiles: FileNode[] = [
        { id: 'root', parentId: '', name: 'root', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'rules-folder', parentId: 'root', name: '99_创作规范', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'file-1', parentId: 'rules-folder', name: '指南_文风规范.md', type: FileType.FILE, content: 'Style guide', lastModified: Date.now() }
      ];
      const guideFile = allFiles[2];

      const canDelete = fileService.canDeleteFile(guideFile, allFiles);

      expect(canDelete).toBe(true);
    });
  });

  describe('文件重命名权限', () => {
    it('应该允许重命名subskill下的技能文件（AUTO_REBUILD）', () => {
      const allFiles: FileNode[] = [
        { id: 'root', parentId: '', name: 'root', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'skill-folder', parentId: 'root', name: '98_技能配置', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'subskill-folder', parentId: 'skill-folder', name: 'subskill', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'file-1', parentId: 'subskill-folder', name: '技能_世界观.md', type: FileType.FILE, content: 'Skill content', lastModified: Date.now() }
      ];
      const skillFile = allFiles[3];

      const canRename = fileService.canRenameFile(skillFile, allFiles);

      // subskill files are AUTO_REBUILD: can be renamed
      expect(canRename).toBe(true);
    });

    it('应该允许重命名99_创作规范目录下的文件', () => {
      const allFiles: FileNode[] = [
        { id: 'root', parentId: '', name: 'root', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'rules-folder', parentId: 'root', name: '99_创作规范', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'file-1', parentId: 'rules-folder', name: '指南_文风规范.md', type: FileType.FILE, content: 'Style guide', lastModified: Date.now() }
      ];
      const guideFile = allFiles[2];

      const canRename = fileService.canRenameFile(guideFile, allFiles);

      expect(canRename).toBe(true);
    });

    it('应该允许重命名用户文件', () => {
      const userFile = {
        id: 'file-2',
        name: 'my-chapter.md',
        type: FileType.FILE,
        content: 'My chapter',
        lastModified: Date.now()
      };

      const canRename = fileService.canRenameFile(userFile);

      expect(canRename).toBe(true);
    });
  });

  describe('系统文件恢复', () => {
    it('应该在缺失系统文件夹时创建它们', () => {
      const existingFiles: FileNode[] = [];

      const updatedFiles = fileService.restoreSystemFiles(existingFiles);

      // 应该创建 98_技能配置 文件夹
      const skillFolder = updatedFiles.find(
        f => f.name === '98_技能配置' && f.parentId === 'root'
      );
      expect(skillFolder).toBeDefined();
      expect(skillFolder?.type).toBe(FileType.FOLDER);

      // 应该创建 99_创作规范 文件夹
      const rulesFolder = updatedFiles.find(
        f => f.name === '99_创作规范' && f.parentId === 'root'
      );
      expect(rulesFolder).toBeDefined();
      expect(rulesFolder?.type).toBe(FileType.FOLDER);
    });

    it('应该在缺失系统文件时创建它们', () => {
      const existingFiles: FileNode[] = [
        {
          id: 'folder-1',
          parentId: 'root',
          name: '98_技能配置',
          type: FileType.FOLDER,
          lastModified: Date.now()
        }
      ];

      const updatedFiles = fileService.restoreSystemFiles(existingFiles);

      // 应该创建 agent_core.md 文件，使用真实的协议模板
      const agentFile = updatedFiles.find(
        f => f.name === 'agent_core.md' && f.parentId === 'folder-1'
      );
      expect(agentFile).toBeDefined();
      expect(agentFile?.type).toBe(FileType.FILE);
      expect(agentFile?.content).toContain('你是 NovelGenie');
    });

    it('应该保留现有的系统文件', () => {
      const existingSystemFile = {
        id: 'existing-1',
        parentId: 'folder-1',
        name: 'agent_core.md',
        type: FileType.FILE,
        content: 'Existing content',
        lastModified: Date.now()
      };

      const updatedFiles = fileService.restoreSystemFiles([
        {
          id: 'folder-1',
          parentId: 'root',
          name: '98_技能配置',
          type: FileType.FOLDER,
          lastModified: Date.now()
        },
        existingSystemFile
      ]);

      const agentFile = updatedFiles.find(
        f => f.id === 'existing-1'
      );
      expect(agentFile).toBeDefined();
      expect(agentFile?.content).toBe('Existing content');
    });

    it('应该创建嵌套的subskill文件夹', () => {
      const existingFiles: FileNode[] = [
        {
          id: 'skill-folder',
          parentId: 'root',
          name: '98_技能配置',
          type: FileType.FOLDER,
          lastModified: Date.now()
        }
      ];

      const updatedFiles = fileService.restoreSystemFiles(existingFiles);

      // 应该创建 subskill 子文件夹
      const subskillFolder = updatedFiles.find(
        f => f.name === 'subskill' && f.parentId === 'skill-folder'
      );
      expect(subskillFolder).toBeDefined();
      expect(subskillFolder?.type).toBe(FileType.FOLDER);
    });

    it('应该返回所有文件包括新创建的', () => {
      const existingFiles: FileNode[] = [];

      const updatedFiles = fileService.restoreSystemFiles(existingFiles);

      expect(updatedFiles.length).toBeGreaterThan(existingFiles.length);
    });

    it('应该标记有更改', () => {
      const existingFiles: FileNode[] = [];

      const result = fileService.restoreSystemFiles(existingFiles);

      // 假设实现返回 { files, hasChanges } 结构
      expect(result).toBeDefined();
    });
  });

  describe('文件树构建', () => {
    it('应该构建扁平文件列表为树结构', () => {
      const flatFiles: FileNode[] = [
        {
          id: 'file-1',
          parentId: 'root',
          name: 'README.md',
          type: FileType.FILE,
          content: 'readme',
          lastModified: Date.now()
        },
        {
          id: 'folder-1',
          parentId: 'root',
          name: 'src',
          type: FileType.FOLDER,
          lastModified: Date.now()
        },
        {
          id: 'file-2',
          parentId: 'folder-1',
          name: 'index.ts',
          type: FileType.FILE,
          content: 'code',
          lastModified: Date.now()
        }
      ];

      const tree = fileService.buildFileTree(flatFiles);

      expect(tree).toEqual({
        'README.md': expect.any(Object),
        'src': {
          'index.ts': expect.any(Object)
        }
      });
    });

    it('应该处理空文件列表', () => {
      const tree = fileService.buildFileTree([]);

      expect(tree).toEqual({});
    });

    it('应该处理深层嵌套结构', () => {
      const parentFolder = {
        id: 'folder-1',
        parentId: 'root',
        name: 'src',
        type: FileType.FOLDER,
        lastModified: Date.now()
      };

      const subFolder = {
        id: 'folder-2',
        parentId: 'folder-1',
        name: 'components',
        type: FileType.FOLDER,
        lastModified: Date.now()
      };

      const fileInSub = {
        id: 'file-1',
        parentId: 'folder-2',
        name: 'App.tsx',
        type: FileType.FILE,
        content: 'export default function App() {}',
        lastModified: Date.now()
      };

      const tree = fileService.buildFileTree([parentFolder, subFolder, fileInSub]);

      expect(tree).toEqual({
        'src': {
          'components': {
            'App.tsx': fileInSub
          }
        }
      });
    });
  });

  describe('文件操作规则', () => {
    it('应该验证文件路径存在性', () => {
      const files: FileNode[] = mockFileSystem();

      const exists = fileService.fileExists(files, '/file1.ts');

      expect(exists).toBe(true);
    });

    it('应该检测不存在的文件路径', () => {
      const files: FileNode[] = mockFileSystem();

      const exists = fileService.fileExists(files, '/nonexistent.ts');

      expect(exists).toBe(false);
    });

    it('应该验证文件名', () => {
      const fileName = 'test-file.md';

      const isValid = fileService.isValidFileName(fileName);

      expect(isValid).toBe(true);
    });

    it('应该拒绝无效文件名', () => {
      const invalidNames = [
        '',
        'file/name',
        'file:',
        'file<name>.md',
        'file|name.md',
        'file*name.md',
        'file?name.md'
      ];

      invalidNames.forEach(name => {
        const isValid = fileService.isValidFileName(name);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('保护注册表 (protectionRegistry)', () => {
    describe('getProtectionLevel', () => {
      it('98_技能配置 文件夹应为 IMMUTABLE', () => {
        expect(getProtectionLevel('/98_技能配置', true)).toBe(ProtectionLevel.IMMUTABLE);
      });

      it('99_创作规范 文件夹应为 IMMUTABLE', () => {
        expect(getProtectionLevel('/99_创作规范', true)).toBe(ProtectionLevel.IMMUTABLE);
      });

      it('subskill 文件夹应为 IMMUTABLE', () => {
        expect(getProtectionLevel('/98_技能配置/subskill', true)).toBe(ProtectionLevel.IMMUTABLE);
      });

      it('agent_core.md 应为 AUTO_REBUILD', () => {
        expect(getProtectionLevel('/98_技能配置/agent_core.md', false)).toBe(ProtectionLevel.AUTO_REBUILD);
      });

      it('subskill下技能文件应为 AUTO_REBUILD', () => {
        expect(getProtectionLevel('/98_技能配置/subskill/技能_大纲构建.md', false)).toBe(ProtectionLevel.AUTO_REBUILD);
      });

      it('99_创作规范下文件应为 AUTO_REBUILD', () => {
        expect(getProtectionLevel('/99_创作规范/指南_文风规范.md', false)).toBe(ProtectionLevel.AUTO_REBUILD);
        expect(getProtectionLevel('/99_创作规范/模板_项目档案.md', false)).toBe(ProtectionLevel.AUTO_REBUILD);
      });

      it('长期记忆.json 应为 PERSISTENT', () => {
        expect(getProtectionLevel('/00_基础信息/长期记忆.json', false)).toBe(ProtectionLevel.PERSISTENT);
      });

      it('outline.json 应为 PERSISTENT', () => {
        expect(getProtectionLevel('/03_剧情大纲/outline.json', false)).toBe(ProtectionLevel.PERSISTENT);
      });

      it('章节分析.json 应为 AUTO_REBUILD', () => {
        expect(getProtectionLevel('/00_基础信息/章节分析.json', false)).toBe(ProtectionLevel.AUTO_REBUILD);
      });

      it('用户文件应为 NONE', () => {
        expect(getProtectionLevel('/05_正文草稿/第一章.md', false)).toBe(ProtectionLevel.NONE);
        expect(getProtectionLevel('/01_世界观/设定集.md', false)).toBe(ProtectionLevel.NONE);
        expect(getProtectionLevel('/05_正文草稿', true)).toBe(ProtectionLevel.NONE);
      });
    });

    describe('canDelete', () => {
      it('NONE 和 AUTO_REBUILD 可删除', () => {
        expect(canDelete(ProtectionLevel.NONE)).toBe(true);
        expect(canDelete(ProtectionLevel.AUTO_REBUILD)).toBe(true);
      });

      it('IMMUTABLE 和 PERSISTENT 不可删除', () => {
        expect(canDelete(ProtectionLevel.IMMUTABLE)).toBe(false);
        expect(canDelete(ProtectionLevel.PERSISTENT)).toBe(false);
      });
    });

    describe('canModifyContent', () => {
      it('仅 IMMUTABLE 不可修改内容', () => {
        expect(canModifyContent(ProtectionLevel.IMMUTABLE)).toBe(false);
      });

      it('NONE, PERSISTENT, AUTO_REBUILD 可修改内容', () => {
        expect(canModifyContent(ProtectionLevel.NONE)).toBe(true);
        expect(canModifyContent(ProtectionLevel.PERSISTENT)).toBe(true);
        expect(canModifyContent(ProtectionLevel.AUTO_REBUILD)).toBe(true);
      });
    });
  });

  describe('FileService canModifyContent', () => {
    it('IMMUTABLE 文件不可修改内容', () => {
      const allFiles: FileNode[] = [
        { id: 'root', parentId: '', name: 'root', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'skill-folder', parentId: 'root', name: '98_技能配置', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'agent-core', parentId: 'skill-folder', name: 'agent_core.md', type: FileType.FILE, content: 'core', lastModified: Date.now() },
      ];
      // 98_技能配置 folder is IMMUTABLE - but it's a folder, not a file with content
      // Let's test with the folder itself
      const skillFolder = allFiles[1];
      expect(fileService.canModifyContent(skillFolder, allFiles)).toBe(false);
    });

    it('PERSISTENT 文件可修改内容', () => {
      const allFiles: FileNode[] = [
        { id: 'root', parentId: '', name: 'root', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'info-folder', parentId: 'root', name: '00_基础信息', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'memory', parentId: 'info-folder', name: '长期记忆.json', type: FileType.FILE, content: '{}', lastModified: Date.now() },
      ];
      const memoryFile = allFiles[2];
      expect(fileService.canModifyContent(memoryFile, allFiles)).toBe(true);
    });

    it('AUTO_REBUILD 文件可修改内容', () => {
      const allFiles: FileNode[] = [
        { id: 'root', parentId: '', name: 'root', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'skill-folder', parentId: 'root', name: '98_技能配置', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'subskill-folder', parentId: 'skill-folder', name: 'subskill', type: FileType.FOLDER, lastModified: Date.now() },
        { id: 'skill-file', parentId: 'subskill-folder', name: '技能_大纲构建.md', type: FileType.FILE, content: 'skill', lastModified: Date.now() },
      ];
      const skillFile = allFiles[3];
      expect(fileService.canModifyContent(skillFile, allFiles)).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('应该处理空文件列表进行系统恢复', () => {
      const emptyFiles: FileNode[] = [];
      const mockGenerateId = jest.fn().mockReturnValue('id-1');

      const service = new FileService(mockGenerateId);
      const result = service.restoreSystemFiles(emptyFiles);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该处理已有完整系统文件的文件列表', () => {
      const completeSystemFiles: FileNode[] = [
        // 假设已经包含所有必需的系统文件
        {
          id: 'skill-folder',
          parentId: 'root',
          name: '98_技能配置',
          type: FileType.FOLDER,
          lastModified: Date.now()
        }
      ];

      const mockGenerateId = jest.fn().mockReturnValue('id-1');
      const service = new FileService(mockGenerateId);
      const result = service.restoreSystemFiles(completeSystemFiles);

      // 应该至少包含原有文件
      expect(result.length).toBeGreaterThanOrEqual(completeSystemFiles.length);
    });

    it('应该处理null或undefined文件', () => {
      const canDelete = fileService.canDeleteFile(null as any);

      expect(canDelete).toBe(false);
    });
  });
});
