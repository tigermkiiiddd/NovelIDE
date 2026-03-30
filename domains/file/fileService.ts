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
  SKILL_EXPECTATION_MANAGER,
  SKILL_CONSTRAINT_LAYERED_DESIGN,
  SKILL_PLEASURE_RHYTHM_MANAGER,
  SKILL_OUTLINE_ARCHITECT,
  SKILL_DIALOGUE_WRITING,
  SKILL_COMBAT_SCENES,
  SKILL_EMOTION_RENDERING,
  SKILL_SCENE_DESCRIPTION,
  SKILL_TEXT_POLISH,
  SKILL_STRAND_WEAVE,
  SKILL_PROJECT_INIT
} from '../../services/templates';
import { getPresetById, PRESETS } from '../../services/resources/presets';
import {
  ProtectionLevel,
  getProtectionLevel,
  canDelete as canDeleteByLevel,
  canModifyContent as canModifyByLevel,
} from './protectionRegistry';

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
   * 委托给保护注册表，IMMUTABLE 和 PERSISTENT 不可删除
   */
  canDeleteFile(file: FileNode | null, allFiles?: FileNode[]): boolean {
    if (!file) return false;
    const filePath = allFiles ? this.getNodePath(file, allFiles) : '/' + file.name;
    const level = getProtectionLevel(filePath, file.type === FileType.FOLDER);
    return canDeleteByLevel(level);
  }

  /**
   * 文件重命名权限 - 判断文件是否可重命名
   */
  canRenameFile(file: FileNode | null, allFiles?: FileNode[]): boolean {
    return this.canDeleteFile(file, allFiles);
  }

  /**
   * 文件内容修改权限 - 判断文件内容是否可修改
   * 仅 IMMUTABLE 禁止修改
   */
  canModifyContent(file: FileNode | null, allFiles?: FileNode[]): boolean {
    if (!file) return false;
    const filePath = allFiles ? this.getNodePath(file, allFiles) : '/' + file.name;
    const level = getProtectionLevel(filePath, file.type === FileType.FOLDER);
    return canModifyByLevel(level);
  }

  /**
   * 获取文件的保护等级
   */
  getProtectionLevelForFile(file: FileNode | null, allFiles?: FileNode[]): ProtectionLevel {
    if (!file) return ProtectionLevel.NONE;
    const filePath = allFiles ? this.getNodePath(file, allFiles) : '/' + file.name;
    return getProtectionLevel(filePath, file.type === FileType.FOLDER);
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
      '技能_去AI化润色.md': SKILL_TEXT_POLISH,
      '技能_分层约束设计.md': SKILL_CONSTRAINT_LAYERED_DESIGN,
      // 写作技法 Skills
      '技能_对话写作.md': SKILL_DIALOGUE_WRITING,
      '技能_战斗场景.md': SKILL_COMBAT_SCENES,
      '技能_情绪渲染.md': SKILL_EMOTION_RENDERING,
      '技能_场景描写.md': SKILL_SCENE_DESCRIPTION,
      '技能_线束编织.md': SKILL_STRAND_WEAVE,
      '技能_项目初始化.md': SKILL_PROJECT_INIT,
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

    // 7. 确保 03_剧情大纲 文件夹存在及 outline.json 文件
    const outlineFolder = ensureFolder('03_剧情大纲', 'root');
    ensureFile('outline.json', outlineFolder.id, JSON.stringify({
      timeStart: '第0天',
      events: [],
      chapters: [],
      volumes: [],
      storyLines: [{ id: 'main-storyline', name: '主线', color: '#4A90D9', isMain: true }],
      lastModified: Date.now()
    }, null, 2));

    // 8. 确保 00_基础信息 文件夹存在
    const infoFolder = ensureFolder('00_基础信息', 'root');

    // 9. 确保章节分析.json 文件存在
    ensureFile('章节分析.json', infoFolder.id, '[]');

    // 10. 确保长期记忆.json 文件存在（知识图谱存储）
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
   * 切换题材预设 - 隐藏旧题材文件、显示/创建新题材文件
   * 不删除任何文件，通过 hidden 标记控制可见性
   * @param files 当前文件列表
   * @param newPresetId 新的预设ID（undefined 表示无预设）
   */
  switchPreset(files: FileNode[], newPresetId?: string): FileNode[] {
    const updatedFiles = files.map(f => ({ ...f })); // shallow copy each node

    // --- 收集所有预设中已知的题材文件名 ---
    const UNIVERSAL_SKILL_NAMES = new Set([
      '技能_大纲构建.md', '技能_正文扩写.md', '技能_编辑审核.md',
      '技能_去AI化润色.md', '技能_分层约束设计.md',
      '技能_对话写作.md', '技能_战斗场景.md', '技能_情绪渲染.md',
      '技能_场景描写.md', '技能_线束编织.md', '技能_项目初始化.md',
    ]);

    const UNIVERSAL_TEMPLATE_NAMES = new Set([
      '模板_项目档案.md', '模板_角色档案.md', '模板_世界线记录.md', '模板_伏笔记录.md',
    ]);

    // 收集所有预设中出现的题材技能名
    const ALL_GENRE_SKILL_NAMES = new Set<string>();
    // 收集所有预设中出现的题材模板名
    const ALL_GENRE_TEMPLATE_NAMES = new Set<string>();

    PRESETS.forEach(preset => {
      preset.skills.forEach(skillName => {
        if (!UNIVERSAL_SKILL_NAMES.has(skillName)) {
          ALL_GENRE_SKILL_NAMES.add(skillName);
        }
      });
      Object.keys(preset.templates).forEach(tplName => {
        if (!UNIVERSAL_TEMPLATE_NAMES.has(tplName)) {
          ALL_GENRE_TEMPLATE_NAMES.add(tplName);
        }
      });
    });

    // --- 找到关键文件夹 ---
    const skillFolder = updatedFiles.find(
      f => f.name === '98_技能配置' && f.parentId === 'root' && f.type === FileType.FOLDER
    );
    const rulesFolder = updatedFiles.find(
      f => f.name === '99_创作规范' && f.parentId === 'root' && f.type === FileType.FOLDER
    );
    const subskillFolder = skillFolder
      ? updatedFiles.find(f => f.name === 'subskill' && f.parentId === skillFolder.id && f.type === FileType.FOLDER)
      : null;

    if (!skillFolder || !rulesFolder || !subskillFolder) return updatedFiles;

    // --- Step 1: 隐藏所有已知题材 subskill 文件 ---
    updatedFiles.forEach(f => {
      if (f.parentId === subskillFolder.id && f.type === FileType.FILE && ALL_GENRE_SKILL_NAMES.has(f.name)) {
        f.hidden = true;
      }
    });

    // --- Step 2: 隐藏所有已知题材模板文件 ---
    updatedFiles.forEach(f => {
      if (f.parentId === rulesFolder.id && f.type === FileType.FILE && ALL_GENRE_TEMPLATE_NAMES.has(f.name)) {
        f.hidden = true;
      }
    });

    // --- Step 3: 更新文风规范内容 ---
    const newPreset = newPresetId ? getPresetById(newPresetId) : undefined;
    const styleGuide = newPreset?.styleGuide || STYLE_GUIDE_TEMPLATE;
    updatedFiles.forEach(f => {
      if (f.parentId === rulesFolder.id && f.name === '指南_文风规范.md' && f.type === FileType.FILE) {
        f.content = styleGuide;
        f.lastModified = Date.now();
      }
    });

    // --- Step 4: 恢复新题材的 subskill 文件（取消隐藏或创建） ---
    if (newPreset && newPreset.skills.length > 0) {
      const GENRE_SKILL_MAP: Record<string, string> = {
        '技能_世界观构建.md': SKILL_WORLD_BUILDER,
        '技能_角色设计.md': SKILL_CHARACTER_DESIGNER,
        '技能_期待感管理.md': SKILL_EXPECTATION_MANAGER,
        '技能_爽点节奏管理.md': SKILL_PLEASURE_RHYTHM_MANAGER,
      };

      newPreset.skills.forEach(skillName => {
        if (UNIVERSAL_SKILL_NAMES.has(skillName)) return;
        const existing = updatedFiles.find(
          f => f.parentId === subskillFolder.id && f.name === skillName && f.type === FileType.FILE
        );
        if (existing) {
          // 取消隐藏 + 更新内容
          existing.hidden = false;
          const customContent = newPreset.customSkills?.[skillName];
          existing.content = customContent || GENRE_SKILL_MAP[skillName] || existing.content;
          existing.lastModified = Date.now();
        } else {
          // 不存在则创建
          const customContent = newPreset.customSkills?.[skillName];
          const skillContent = customContent || GENRE_SKILL_MAP[skillName];
          if (skillContent) {
            updatedFiles.push({
              id: this.generateId(),
              parentId: subskillFolder.id,
              name: skillName,
              type: FileType.FILE,
              content: skillContent,
              lastModified: Date.now()
            });
          }
        }
      });

      // 爽点节奏管理始终恢复
      if (!newPreset.skills.includes('技能_爽点节奏管理.md')) {
        const rhythmFile = updatedFiles.find(
          f => f.parentId === subskillFolder.id && f.name === '技能_爽点节奏管理.md' && f.type === FileType.FILE
        );
        if (rhythmFile) {
          rhythmFile.hidden = false;
          const customRhythm = newPreset.customSkills?.['技能_爽点节奏管理.md'];
          rhythmFile.content = customRhythm || SKILL_PLEASURE_RHYTHM_MANAGER;
          rhythmFile.lastModified = Date.now();
        } else {
          const customRhythm = newPreset.customSkills?.['技能_爽点节奏管理.md'];
          updatedFiles.push({
            id: this.generateId(),
            parentId: subskillFolder.id,
            name: '技能_爽点节奏管理.md',
            type: FileType.FILE,
            content: customRhythm || SKILL_PLEASURE_RHYTHM_MANAGER,
            lastModified: Date.now()
          });
        }
      }
    } else if (!newPreset) {
      // 无预设时：恢复所有基础题材技能（取消隐藏）
      const GENRE_SKILL_MAP: Record<string, string> = {
        '技能_世界观构建.md': SKILL_WORLD_BUILDER,
        '技能_角色设计.md': SKILL_CHARACTER_DESIGNER,
        '技能_期待感管理.md': SKILL_EXPECTATION_MANAGER,
        '技能_爽点节奏管理.md': SKILL_PLEASURE_RHYTHM_MANAGER,
      };
      Object.keys(GENRE_SKILL_MAP).forEach(skillName => {
        const existing = updatedFiles.find(
          f => f.parentId === subskillFolder.id && f.name === skillName && f.type === FileType.FILE
        );
        if (existing) {
          existing.hidden = false;
          existing.content = GENRE_SKILL_MAP[skillName];
          existing.lastModified = Date.now();
        }
      });
    }

    // --- Step 5: 恢复新题材的模板文件（取消隐藏或创建） ---
    if (newPreset && newPreset.templates) {
      Object.entries(newPreset.templates).forEach(([fileName, content]) => {
        const existing = updatedFiles.find(
          f => f.parentId === rulesFolder.id && f.name === fileName && f.type === FileType.FILE
        );
        if (existing) {
          existing.hidden = false;
          existing.content = content;
          existing.lastModified = Date.now();
        } else {
          updatedFiles.push({
            id: this.generateId(),
            parentId: rulesFolder.id,
            name: fileName,
            type: FileType.FILE,
            content,
            lastModified: Date.now()
          });
        }
      });
    }

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
      // 跳过隐藏文件
      if (file.hidden) continue;

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
