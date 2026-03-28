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
  CHARACTER_CARD_TEMPLATE,
  PROJECT_PROFILE_TEMPLATE,
  SKILL_WORLD_BUILDER,
  SKILL_CHARACTER_DESIGNER,
  SKILL_DRAFT_EXPANDER,
  SKILL_EDITOR_REVIEW,
  SKILL_HUMANIZER_STYLE,
  SKILL_EXPECTATION_MANAGER,
  SKILL_CONSTRAINT_LAYERED_DESIGN,
  SKILL_PLEASURE_RHYTHM_MANAGER,
  SKILL_OUTLINE_ARCHITECT
} from '../../services/templates';
import { getPresetById } from '../../services/resources/presets';

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
   * 注意：99_创作规范 目录下的文件允许删除（可重置内容）
   */
  canDeleteFile(file: FileNode | null, allFiles?: FileNode[]): boolean {
    if (!file) return false;

    // 检查是否是受保护的文件夹（99_创作规范 允许删除其中的文件，但文件夹本身不可删除）
    if (file.type === FileType.FOLDER && PROTECTED_FOLDERS.includes(file.name)) {
      return false;
    }

    // 检查是否是受保护的文件
    if (file.type === FileType.FILE) {
      // 获取文件的完整路径
      const filePath = allFiles ? this.getNodePath(file, allFiles) : '';

      // 长期记忆.json 文件禁止删除（知识图谱系统文件）
      if (file.name === '长期记忆.json') {
        return false;
      }

      // 99_创作规范 目录下的文件允许删除（用户可重置内容）
      if (filePath.startsWith('/99_创作规范/')) {
        return true;
      }

      // 98_技能配置/subskill 目录下的文件禁止删除（系统技能文件保护）
      if (filePath.startsWith('/98_技能配置/subskill/')) {
        return false;
      }

      // 检查文件名前缀（保护 98_技能配置 根目录下的文件）
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
  canRenameFile(file: FileNode | null, allFiles?: FileNode[]): boolean {
    // 复用删除权限逻辑
    return this.canDeleteFile(file, allFiles);
  }

  /**
   * 系统文件恢复 - 确保系统文件和文件夹存在
   * 使用与 fileSystem.ts 初始化时相同的模板常量
   * @param files 当前文件列表
   * @param presetId 可选的预设ID，用于恢复题材特定的模板和技能
   */
  restoreSystemFiles(files: FileNode[], presetId?: string): FileNode[] {
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

    // 查找预设（如果提供了 presetId）
    const preset = presetId ? getPresetById(presetId) : undefined;

    // 1. 确保 98_技能配置 文件夹
    const skillFolder = ensureFolder('98_技能配置', 'root');

    // 2. 确保 agent_core.md 文件（使用 DEFAULT_AGENT_SKILL 常量）
    ensureFile('agent_core.md', skillFolder.id, DEFAULT_AGENT_SKILL);

    // 3. 确保 99_创作规范 文件夹
    const rulesFolder = ensureFolder('99_创作规范', 'root');

    // 4. 确保创作规范文件（使用正确的模板常量）
    // 文风规范：优先使用预设版本
    const styleGuide = preset?.styleGuide || STYLE_GUIDE_TEMPLATE;
    ensureFile('指南_文风规范.md', rulesFolder.id, styleGuide);
    ensureFile('模板_项目档案.md', rulesFolder.id, PROJECT_PROFILE_TEMPLATE);
    ensureFile('模板_角色档案.md', rulesFolder.id, CHARACTER_CARD_TEMPLATE);
    ensureFile('模板_世界线记录.md', rulesFolder.id, TIMELINE_TEMPLATE);
    ensureFile('模板_伏笔记录.md', rulesFolder.id, FORESHADOW_TEMPLATE);

    // 4.1 恢复预设特定模板到 99_创作规范
    if (preset && preset.templates) {
      Object.entries(preset.templates).forEach(([fileName, content]) => {
        ensureFile(fileName, rulesFolder.id, content);
      });
    }

    // 5. 确保 subskill 子文件夹
    const subskillFolder = ensureFolder('subskill', skillFolder.id);

    // 6. 技能文件映射（通用 + 题材分离）
    // 通用技能 - 与题材无关，始终创建/恢复
    const UNIVERSAL_SKILLS: Record<string, string> = {
      '技能_大纲构建.md': SKILL_OUTLINE_ARCHITECT,
      '技能_正文扩写.md': SKILL_DRAFT_EXPANDER,
      '技能_编辑审核.md': SKILL_EDITOR_REVIEW,
      '技能_去AI化文风.md': SKILL_HUMANIZER_STYLE,
      '技能_分层约束设计.md': SKILL_CONSTRAINT_LAYERED_DESIGN,
    };

    // 题材技能 - 根据预设选择性加载
    const GENRE_SKILL_MAP: Record<string, string> = {
      '技能_世界观构建.md': SKILL_WORLD_BUILDER,
      '技能_角色设计.md': SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': SKILL_PLEASURE_RHYTHM_MANAGER,
    };

    // 始终恢复通用技能
    Object.entries(UNIVERSAL_SKILLS).forEach(([name, content]) => {
      ensureFile(name, subskillFolder.id, content);
    });

    // 恢复题材技能
    if (preset && preset.skills.length > 0) {
      // 恢复预设指定的技能，优先使用定制版本
      preset.skills.forEach(skillName => {
        // 跳过通用技能（已恢复）
        if (UNIVERSAL_SKILLS[skillName]) return;
        const customContent = preset.customSkills?.[skillName];
        const skillContent = customContent || GENRE_SKILL_MAP[skillName];
        if (skillContent) {
          ensureFile(skillName, subskillFolder.id, skillContent);
        }
      });
      // 爽点节奏管理始终恢复
      if (!preset.skills.includes('技能_爽点节奏管理.md')) {
        const customRhythm = preset.customSkills?.['技能_爽点节奏管理.md'];
        ensureFile('技能_爽点节奏管理.md', subskillFolder.id, customRhythm || SKILL_PLEASURE_RHYTHM_MANAGER);
      }
    } else {
      // 无预设时恢复全部题材技能
      Object.entries(GENRE_SKILL_MAP).forEach(([name, content]) => {
        ensureFile(name, subskillFolder.id, content);
      });
    }

    // 7. 确保 00_基础信息 文件夹存在
    const infoFolder = ensureFolder('00_基础信息', 'root');

    // 8. 确保章节分析.json 文件存在
    ensureFile('章节分析.json', infoFolder.id, '[]');

    // 9. 确保长期记忆.json 文件存在（知识图谱存储）
    ensureFile('长期记忆.json', infoFolder.id, JSON.stringify({
      nodes: [],
      edges: [],
      availableSubCategories: {
        '设定': ['世界设定', '角色设定', '物品设定', '场景设定'],
        '规则': ['创作规则', '叙事规则', '逻辑规则'],
        '禁止': ['禁止词汇', '禁止情节', '禁止写法'],
        '风格': ['叙事风格', '对话风格', '描写风格'],
        '用户偏好': ['写作偏好', '交互偏好', '输出偏好'],
      },
      availableTags: [],
      version: 1,
    }, null, 2));

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
