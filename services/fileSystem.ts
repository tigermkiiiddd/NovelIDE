
import { FileNode, FileType } from '../types';
import { 
  PROJECT_PROFILE_TEMPLATE, 
  STYLE_GUIDE_TEMPLATE, 
  OUTLINE_CHAPTER_TEMPLATE,
  OUTLINE_MASTER_TEMPLATE,
  CHARACTER_CARD_TEMPLATE,
  DEFAULT_AGENT_SKILL,
  DEFAULT_AGENT_PERSONA,
  SKILL_EROTIC_WRITER
} from './templates';

// 生成唯一ID
export const generateId = (): string => Math.random().toString(36).substring(2, 9);

const createFolder = (name: string, parentId: string): FileNode => ({
  id: generateId(),
  parentId,
  name,
  type: FileType.FOLDER,
  lastModified: Date.now()
});

const createFile = (name: string, parentId: string, content: string): FileNode => ({
  id: generateId(),
  parentId,
  name,
  type: FileType.FILE,
  content,
  lastModified: Date.now()
});

// Helper for simple default content with metadata
const withMeta = (content: string, summary: string, tags: string[] = []) => {
    return `---\nsummarys: ["${summary}"]\ntags: ${JSON.stringify(tags)}\n---\n${content}`;
}

// 初始文件系统状态 - 构建标准小说工程目录
const rootId = 'root';

const infoFolder = createFolder('00_基础信息', rootId);
const worldFolder = createFolder('01_世界观', rootId);
const charFolder = createFolder('02_角色档案', rootId);
const outlineFolder = createFolder('03_剧情大纲', rootId);
const inspirationFolder = createFolder('04_灵感碎片', rootId); 
const draftFolder = createFolder('05_正文草稿', rootId);
const skillFolder = createFolder('98_技能配置', rootId);
const rulesFolder = createFolder('99_创作规范', rootId);

// 新增 subskill 文件夹
const subskillFolder = createFolder('subskill', skillFolder.id);

export const initialFileSystem: FileNode[] = [
  { id: rootId, parentId: null, name: 'Root', type: FileType.FOLDER, lastModified: Date.now() },
  
  infoFolder,
  worldFolder,
  charFolder,
  outlineFolder,
  inspirationFolder,
  draftFolder,
  skillFolder,
  subskillFolder, 
  rulesFolder,
  
  // --- 00_基础信息 ---
  createFile('项目档案.md', infoFolder.id, PROJECT_PROFILE_TEMPLATE),
  createFile('世界线记录.md', infoFolder.id, withMeta('# 世界线记录 (Timeline Log)\n\n> 记录实际发生的剧情，作为后续章节的历史参考。\n\n| 章节 | 事件 | 状态变更 | 伏笔 |\n|---|---|---|---|\n', '本文件用于详细记录故事发展过程中发生的关键事件、世界状态的变更以及埋下的伏笔信息，作为后续创作的严谨参考依据。', ['记录', '世界线'])),
  createFile('伏笔记录.md', infoFolder.id, withMeta('# 伏笔记录 (Foreshadowing Log)\n\n> 记录未回收的伏笔。\n\n- [ ] [第一章] 主角捡到的黑色戒指 (未回收)\n', '本文件专门用于追踪故事中埋设的各类伏笔和悬念，详细记录其出处及回收状态，确保故事逻辑闭环，提升读者阅读体验。', ['记录', '伏笔'])),
  
  // --- 02_角色档案 (示例) ---
  createFile('主角_李逍遥.md', charFolder.id, CHARACTER_CARD_TEMPLATE.replace('姓名：', '姓名：李逍遥')),
  
  // --- 03_剧情大纲 (示例) ---
  createFile('第一章_细纲.md', outlineFolder.id, OUTLINE_CHAPTER_TEMPLATE.replace('章节名：', '章节名：霓虹觉醒')),
  
  // --- 98_技能配置 (Agent Skills) ---
  createFile('agent_core.md', skillFolder.id, DEFAULT_AGENT_SKILL),
  createFile('助手人设.md', skillFolder.id, DEFAULT_AGENT_PERSONA),
  // subskill
  createFile('示例_战斗扩写增强.md', subskillFolder.id, `---
name: 战斗扩写增强
description: 强化战斗场面的描写，侧重动作连贯性。
summarys: ["本技能模块专注于提升战斗场景的描写质量，特别强调招式动作的流畅连贯性、环境破坏的视觉效果渲染以及技能命名与喊招的格调。"]
tags: ["技能", "战斗"]
---

# 战斗描写增强指令

当涉及战斗场景时，请重点关注：动作连贯性、环境破坏效果、招式名称的格调。`),
  createFile('技能_涩涩扩写.md', subskillFolder.id, SKILL_EROTIC_WRITER),

  // --- 99_创作规范 (Templates & Guides) ---
  createFile('指南_文风规范.md', rulesFolder.id, STYLE_GUIDE_TEMPLATE),
  
  createFile('模板_项目档案.md', rulesFolder.id, PROJECT_PROFILE_TEMPLATE),
  createFile('模板_角色档案.md', rulesFolder.id, CHARACTER_CARD_TEMPLATE),
  createFile('模板_全书总纲.md', rulesFolder.id, OUTLINE_MASTER_TEMPLATE),
  createFile('模板_章节细纲.md', rulesFolder.id, OUTLINE_CHAPTER_TEMPLATE),
  createFile('模板_世界线记录.md', rulesFolder.id, withMeta('# 世界线记录\n\n| 章节 | 事件 | 状态变更 | 伏笔 |\n|---|---|---|---|\n', '此文件为标准的世界线记录模板，提供了表格格式以供复制使用，旨在规范化记录剧情事件与状态变更。', ['模板'])),
  createFile('模板_伏笔记录.md', rulesFolder.id, withMeta('# 伏笔记录\n\n- [ ] [章节名] 伏笔内容 (未回收)\n', '此文件为标准的伏笔追踪模板，采用了任务列表的格式，方便作者在创作过程中随时添加和勾选已回收的伏笔。', ['模板'])),
];

// 根据名称查找节点 (不推荐，容易重名)
export const findNodeByName = (files: FileNode[], name: string): FileNode | undefined => {
  return files.find(f => f.name === name);
};

// --- Path System Utilities ---

export const getNodePath = (node: FileNode, allFiles: FileNode[]): string => {
  if (!node.parentId || node.parentId === 'root') return node.name;
  const parent = allFiles.find(f => f.id === node.parentId);
  return parent ? `${getNodePath(parent, allFiles)}/${node.name}` : node.name;
};

export const findNodeByPath = (files: FileNode[], path: string): FileNode | undefined => {
  const parts = path.split('/').map(p => p.trim()).filter(p => p);
  if (parts.length === 0) return undefined;

  let currentParentId = 'root';
  let currentNode: FileNode | undefined;

  for (let i = 0; i < parts.length; i++) {
    const partName = parts[i];
    currentNode = files.find(f => f.parentId === currentParentId && f.name === partName);
    
    if (!currentNode) return undefined;
    currentParentId = currentNode.id;
  }

  return currentNode;
};

export const getFileTreeStructure = (files: FileNode[]): string => {
  const buildTree = (parentId: string | null, depth: number, currentPath: string): string => {
    const children = files.filter(f => f.parentId === parentId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === FileType.FOLDER ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    if (children.length === 0) return '';
    
    return children.map(node => {
      const indent = '  '.repeat(depth);
      const typeStr = node.type === FileType.FOLDER ? '[DIR]' : '[FILE]';
      
      // Metadata String Construction
      let metaStr = '';
      if (node.type === FileType.FILE && node.metadata) {
          const { summarys, tags } = node.metadata;
          const tagsStr = tags && tags.length > 0 ? ` [Tags: ${tags.join(',')}]` : '';
          const summaryStr = summarys && summarys.length > 0 ? ` [Sum: ${summarys[0]}]` : '';
          if (tagsStr || summaryStr) metaStr = ` ${tagsStr}${summaryStr}`;
      }

      const subTree = node.type === FileType.FOLDER ? buildTree(node.id, depth + 1, '') : '';
      return `${indent}${typeStr} ${node.name}${metaStr}\n${subTree}`;
    }).join('');
  };

  return buildTree('root', 0, '');
};
