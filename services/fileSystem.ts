
import { FileNode, FileType } from '../types';
import { 
  PROJECT_PROFILE_TEMPLATE, 
  STYLE_GUIDE_TEMPLATE, 
  OUTLINE_CHAPTER_TEMPLATE, 
  OUTLINE_MASTER_TEMPLATE, 
  CHARACTER_CARD_TEMPLATE, 
  DEFAULT_AGENT_SKILL,
  SKILL_EROTIC_WRITER,
  SKILL_WORLD_BUILDER,
  SKILL_OUTLINE_ARCHITECT,
  SKILL_CHARACTER_DESIGNER,
  SKILL_DRAFT_EXPANDER,
  SKILL_EDITOR_REVIEW,
  SKILL_HUMANIZER_STYLE
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

// --- Factory Function for Fresh File Systems ---
export const createInitialFileSystem = (): FileNode[] => {
  const rootId = 'root';

  const infoFolder = createFolder('00_基础信息', rootId);
  const worldFolder = createFolder('01_世界观', rootId);
  const charFolder = createFolder('02_角色档案', rootId);
  const outlineFolder = createFolder('03_剧情大纲', rootId);
  const inspirationFolder = createFolder('04_灵感碎片', rootId); 
  const draftFolder = createFolder('05_正文草稿', rootId);
  const skillFolder = createFolder('98_技能配置', rootId);
  const rulesFolder = createFolder('99_创作规范', rootId);

  // 新增 subskill 文件夹 (Inside skillFolder)
  const subskillFolder = createFolder('subskill', skillFolder.id);

  return [
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
    
    // --- 00-05 业务文件夹初始为空 (用户要求) ---
    
    // --- 98_技能配置 (Agent Skills) ---
    createFile('agent_core.md', skillFolder.id, DEFAULT_AGENT_SKILL),
    
    // --- Sub Skills (Enhanced) ---
    createFile('技能_世界观构建.md', subskillFolder.id, SKILL_WORLD_BUILDER),
    createFile('技能_大纲构建.md', subskillFolder.id, SKILL_OUTLINE_ARCHITECT),
    createFile('技能_角色设计.md', subskillFolder.id, SKILL_CHARACTER_DESIGNER),
    createFile('技能_正文扩写.md', subskillFolder.id, SKILL_DRAFT_EXPANDER),
    createFile('技能_编辑审核.md', subskillFolder.id, SKILL_EDITOR_REVIEW),
    createFile('技能_去AI化文风.md', subskillFolder.id, SKILL_HUMANIZER_STYLE),
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
};

// Deprecated: For backward compatibility if needed, but prefer createInitialFileSystem
export const initialFileSystem = createInitialFileSystem();
