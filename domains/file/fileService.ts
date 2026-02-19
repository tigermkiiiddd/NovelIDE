/**
 * FileService - 文件系统域服务
 *
 * 职责：
 * 1. 系统文件保护逻辑
 * 2. 文件树构建和验证
 * 3. 文件操作权限验证
 *
 * 设计原则：
 * - 纯业务逻辑，无持久化依赖
 * - 可独立测试
 * - 与fileStore解耦
 */

import { FileNode, FileType } from '../../types';
import {
  DEFAULT_AGENT_SKILL,
  STYLE_GUIDE_TEMPLATE,
  PROJECT_PROFILE_TEMPLATE,
  CHARACTER_CARD_TEMPLATE,
  OUTLINE_MASTER_TEMPLATE,
  OUTLINE_CHAPTER_TEMPLATE,
  SKILL_WORLD_BUILDER,
  SKILL_OUTLINE_ARCHITECT,
  SKILL_CHARACTER_DESIGNER,
  SKILL_DRAFT_EXPANDER,
  SKILL_EDITOR_REVIEW,
  SKILL_HUMANIZER_STYLE,
  SKILL_EROTIC_WRITER
} from '../../services/templates';

// 内联模板（用于世界线记录和伏笔记录）
const withMeta = (content: string, summary: string, tags: string[] = []) => {
  return `---\nsummarys: ["${summary}"]\ntags: ${JSON.stringify(tags)}\n---\n${content}`;
};

const TIMELINE_TEMPLATE = withMeta(
  '# 世界线记录\n\n| 章节 | 事件 | 状态变更 | 伏笔 |\n|---|---|---|---|\n',
  '此文件为标准的世界线记录模板，提供了表格格式以供复制使用，旨在规范化记录剧情事件与状态变更。',
  ['模板']
);

const FORESHADOW_TEMPLATE = withMeta(
  '# 伏笔记录\n\n- [ ] [章节名] 伏笔内容 (未回收)\n',
  '此文件为标准的伏笔追踪模板，采用了任务列表的格式，方便作者在创作过程中随时添加和勾选已回收的伏笔。',
  ['模板']
);

// 系统文件定义（从fileStore迁移）
const PROTECTED_FOLDERS = ['98_技能配置', '99_创作规范', 'subskill'];
const PROTECTED_FILE_PREFIXES = ['技能_', '指南_', '模板_'];

export interface FileTree {
  [name: string]: FileTree | FileNode;
}

export class FileService {
  private generateId: () => string;

  constructor(generateId: () => string) {
    this.generateId = generateId;
  }

  /**
   * 系统文件保护 - 判断文件是否可删除
   */
  canDeleteFile(file: FileNode | null): boolean {
    if (!file) return false;

    // 检查是否是受保护的文件夹
    if (file.type === FileType.FOLDER && PROTECTED_FOLDERS.includes(file.name)) {
      return false;
    }

    // 检查是否是受保护的文件
    if (file.type === FileType.FILE) {
      // 检查文件名前缀
      if (PROTECTED_FILE_PREFIXES.some(prefix => file.name.startsWith(prefix))) {
        return false;
      }

      // 检查是否是系统文件（/.gitkeep等）
      if (file.name === '.gitkeep' || file.name.includes('/system/')) {
        return false;
      }
    }

    return true;
  }

  /**
   * 文件重命名权限 - 判断文件是否可重命名
   */
  canRenameFile(file: FileNode | null): boolean {
    // 复用删除权限逻辑
    return this.canDeleteFile(file);
  }

  /**
   * 系统文件恢复 - 确保系统文件和文件夹存在
   * 使用与 fileSystem.ts 初始化时相同的模板常量
   */
  restoreSystemFiles(files: FileNode[]): FileNode[] {
    const updatedFiles = [...files];
    const generateId = this.generateId;

    // 辅助函数：确保文件夹存在
    const ensureFolder = (name: string, parentId: string): FileNode => {
      let folder = updatedFiles.find(
        f => f.name === name && f.parentId === parentId && f.type === FileType.FOLDER
      );

      if (!folder) {
        folder = {
          id: generateId(),
          parentId,
          name,
          type: FileType.FOLDER,
          lastModified: Date.now()
        };
        updatedFiles.push(folder);
      }

      return folder;
    };

    // 辅助函数：确保文件存在
    const ensureFile = (
      name: string,
      parentId: string,
      content: string
    ): FileNode => {
      let file = updatedFiles.find(
        f => f.name === name && f.parentId === parentId && f.type === FileType.FILE
      );

      if (!file) {
        file = {
          id: generateId(),
          parentId,
          name,
          type: FileType.FILE,
          content,
          lastModified: Date.now()
        };
        updatedFiles.push(file);
      }

      return file;
    };

    // 1. 确保 98_技能配置 文件夹
    const skillFolder = ensureFolder('98_技能配置', 'root');

    // 2. 确保 agent_core.md 文件（使用 DEFAULT_AGENT_SKILL 常量）
    ensureFile('agent_core.md', skillFolder.id, DEFAULT_AGENT_SKILL);

    // 3. 确保 99_创作规范 文件夹
    const rulesFolder = ensureFolder('99_创作规范', 'root');

    // 4. 确保创作规范文件（使用正确的模板常量）
    ensureFile('指南_文风规范.md', rulesFolder.id, STYLE_GUIDE_TEMPLATE);
    ensureFile('模板_项目档案.md', rulesFolder.id, PROJECT_PROFILE_TEMPLATE);
    ensureFile('模板_角色档案.md', rulesFolder.id, CHARACTER_CARD_TEMPLATE);
    ensureFile('模板_全书总纲.md', rulesFolder.id, OUTLINE_MASTER_TEMPLATE);
    ensureFile('模板_章节细纲.md', rulesFolder.id, OUTLINE_CHAPTER_TEMPLATE);
    ensureFile('模板_世界线记录.md', rulesFolder.id, TIMELINE_TEMPLATE);
    ensureFile('模板_伏笔记录.md', rulesFolder.id, FORESHADOW_TEMPLATE);

    // 5. 确保 subskill 子文件夹
    const subskillFolder = ensureFolder('subskill', skillFolder.id);

    // 6. 确保 subskill 文件（使用正确的文件名和模板常量）
    ensureFile('技能_世界观构建.md', subskillFolder.id, SKILL_WORLD_BUILDER);
    ensureFile('技能_大纲构建.md', subskillFolder.id, SKILL_OUTLINE_ARCHITECT);
    ensureFile('技能_角色设计.md', subskillFolder.id, SKILL_CHARACTER_DESIGNER);
    ensureFile('技能_正文扩写.md', subskillFolder.id, SKILL_DRAFT_EXPANDER);
    ensureFile('技能_编辑审核.md', subskillFolder.id, SKILL_EDITOR_REVIEW);
    ensureFile('技能_去AI化文风.md', subskillFolder.id, SKILL_HUMANIZER_STYLE);
    ensureFile('技能_涩涩扩写.md', subskillFolder.id, SKILL_EROTIC_WRITER);

    return updatedFiles;
  }

  /**
   * 文件树构建 - 将扁平文件列表转换为树结构
   *
   * 文件夹作为中间节点（不包含自身属性）
   * 文件作为叶子节点（包含完整FileNode）
   */
  buildFileTree(files: FileNode[]): FileTree {
    const tree: FileTree = {};

    for (const file of files) {
      const path = this.getNodePath(file, files);
      const parts = path.split('/').filter(Boolean);

      let current = tree;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        if (isLast) {
          // 最后一个部分是目标节点
          // 如果是文件，添加完整的FileNode
          // 如果是文件夹，作为空对象容器
          if (file.type === FileType.FOLDER) {
            if (!current[part]) {
              current[part] = {};
            }
          } else {
            current[part] = file;
          }
        } else {
          // 中间路径部分，确保存在容器
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part] as FileTree;
        }
      }
    }

    return tree;
  }

  /**
   * 文件存在性检查
   */
  fileExists(files: FileNode[], path: string): boolean {
    return this.findNodeByPath(files, path) !== undefined;
  }

  /**
   * 文件名验证
   */
  isValidFileName(fileName: string): boolean {
    if (!fileName || fileName.trim().length === 0) {
      return false;
    }

    // 检查非法字符：/ : < > | ? *
    const invalidChars = /[\/:<>\|?\*]/;
    if (invalidChars.test(fileName)) {
      return false;
    }

    return true;
  }

  /**
   * 私有方法：通过路径查找节点
   */
  private findNodeByPath(files: FileNode[], path: string): FileNode | undefined {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return undefined;

    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');

    let parentId = 'root';
    if (parentPath) {
      const parent = this.findNodeByPath(files, parentPath);
      if (!parent || parent.type !== FileType.FOLDER) {
        return undefined;
      }
      parentId = parent.id;
    }

    return files.find(f => f.parentId === parentId && f.name === name);
  }

  /**
   * 私有方法：获取节点路径
   */
  private getNodePath(node: FileNode, files: FileNode[]): string {
    const parts: string[] = [node.name];

    let currentNode = node;
    while (currentNode.parentId !== 'root') {
      const parent = files.find(f => f.id === currentNode.parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentNode = parent;
    }

    return '/' + parts.join('/');
  }
}
