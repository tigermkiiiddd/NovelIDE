
import { FileNode, FileType } from '../types';
import {
  PROJECT_PROFILE_TEMPLATE,
  STYLE_GUIDE_TEMPLATE,
  CHARACTER_CARD_TEMPLATE,
  DEFAULT_AGENT_SKILL,
  SKILL_WORLD_BUILDER,
  SKILL_CHARACTER_DESIGNER,
  SKILL_DRAFT_EXPANDER,
  SKILL_EDITOR_REVIEW,
  SKILL_CONSTRAINT_LAYERED_DESIGN,
  SKILL_EXPECTATION_MANAGER,
  SKILL_PLEASURE_RHYTHM_MANAGER,
  SKILL_OUTLINE_ARCHITECT,
  SKILL_TEXT_POLISH,
  SKILL_PROJECT_INIT
} from './templates';
import { GenrePreset } from './resources/presets';

// 生成唯一ID
export const generateId = (): string => Math.random().toString(36).substring(2, 9);

const createFolder = (name: string, parentId: string): FileNode => ({
  id: generateId(),
  parentId,
  name,
  type: FileType.FOLDER,
  lastModified: Date.now()
});

const createFile = (name: string, parentId: string, content: string, extra?: Partial<FileNode>): FileNode => ({
  id: generateId(),
  parentId,
  name,
  type: FileType.FILE,
  content,
  lastModified: Date.now(),
  ...extra,
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
    currentNode = files.find(f => f.parentId === currentParentId && f.name === partName && !f.hidden);
    
    if (!currentNode) return undefined;
    currentParentId = currentNode.id;
  }

  return currentNode;
};

export const getFileTreeStructure = (files: FileNode[]): string => {
  const buildTree = (parentId: string | null, depth: number, currentPath: string): string => {
    const children = files.filter(f => f.parentId === parentId && !f.hidden)
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
export const createInitialFileSystem = (preset?: GenrePreset): FileNode[] => {
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

  // 技能文件映射（通用 + 题材分离）
  // 通用技能 - 与题材无关，始终创建
  const UNIVERSAL_SKILLS: Record<string, string> = {
    '技能_大纲构建.md': SKILL_OUTLINE_ARCHITECT,
    '技能_正文扩写.md': SKILL_DRAFT_EXPANDER,
    '技能_编辑审核.md': SKILL_EDITOR_REVIEW,
    '技能_去AI化润色.md': SKILL_TEXT_POLISH,
    '技能_分层约束设计.md': SKILL_CONSTRAINT_LAYERED_DESIGN,
    '技能_项目初始化.md': SKILL_PROJECT_INIT,
  };

  // 题材技能 - 根据预设选择性加载
  const GENRE_SKILL_MAP: Record<string, string> = {
    '技能_世界观构建.md': SKILL_WORLD_BUILDER,
    '技能_角色设计.md': SKILL_CHARACTER_DESIGNER,
    '技能_期待感管理.md': SKILL_EXPECTATION_MANAGER,
    '技能_爽点节奏管理.md': SKILL_PLEASURE_RHYTHM_MANAGER,
  };

  // 基础文件列表
  const files: FileNode[] = [
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

    // --- 03_剧情大纲/outline.json (剧情大纲系统文件，必须初始化) ---
    createFile('outline.json', outlineFolder.id, JSON.stringify({
      timeStart: '第0天',
      events: [],
      chapters: [],
      volumes: [],
      storyLines: [{ id: 'main-storyline', name: '主线', color: '#4A90D9', isMain: true }],
      lastModified: Date.now()
    }, null, 2)),

    // --- 00_基础信息/长期记忆.json (记忆宫殿存储) ---
    createFile('长期记忆.json', infoFolder.id, JSON.stringify({
      nodes: [],
      edges: [],
      availableSubCategories: {
        '设定': ['世界设定', '物品设定', '场景设定'],
        '规则': ['创作规则', '叙事规则', '逻辑规则'],
        '禁止': ['禁止词汇', '禁止情节', '禁止写法'],
        '风格': ['叙事风格', '对话风格', '描写风格'],
        '用户偏好': ['写作偏好', '交互偏好', '输出偏好'],
      },
      availableTags: [],
      version: 1,
    }, null, 2)),

    // --- 98_技能配置 (Agent Skills) ---
    createFile('agent_core.md', skillFolder.id, DEFAULT_AGENT_SKILL),
  ];

  // --- Sub Skills (通用技能始终创建 + 题材技能根据预设加载) ---
  // 始终创建通用技能
  Object.entries(UNIVERSAL_SKILLS).forEach(([name, content]) => {
    files.push(createFile(name, subskillFolder.id, content));
  });

  // 根据预设创建题材技能
  if (preset && preset.skills.length > 0) {
    // 使用预设指定的技能，标记 sourcePresetId
    const pid = preset.id;
    preset.skills.forEach(skillName => {
      // 跳过通用技能（已创建）
      if (UNIVERSAL_SKILLS[skillName]) return;
      // 优先使用题材定制版本
      const customContent = preset.customSkills?.[skillName];
      const skillContent = customContent || GENRE_SKILL_MAP[skillName];
      if (skillContent) {
        files.push(createFile(skillName, subskillFolder.id, skillContent, { sourcePresetId: pid }));
      }
    });
    // 爽点节奏管理技能始终加载
    if (!preset.skills.includes('技能_爽点节奏管理.md')) {
      const customRhythm = preset.customSkills?.['技能_爽点节奏管理.md'];
      files.push(createFile('技能_爽点节奏管理.md', subskillFolder.id, customRhythm || SKILL_PLEASURE_RHYTHM_MANAGER, { sourcePresetId: pid }));
    }
  } else {
    // 默认加载全部题材技能
    Object.entries(GENRE_SKILL_MAP).forEach(([name, content]) => {
      files.push(createFile(name, subskillFolder.id, content));
    });
  }

  // --- 99_创作规范 (Templates & Guides) ---
  // 文风规范：使用预设的或默认的，有预设时标记 sourcePresetId
  const styleGuide = preset?.styleGuide || STYLE_GUIDE_TEMPLATE;
  files.push(createFile('指南_文风规范.md', rulesFolder.id, styleGuide, preset ? { sourcePresetId: preset.id } : undefined));

  // 基础模板
  files.push(
    createFile('模板_项目档案.md', rulesFolder.id, PROJECT_PROFILE_TEMPLATE),
    createFile('模板_角色档案.md', rulesFolder.id, CHARACTER_CARD_TEMPLATE),
  );

  // 预设特定模板，标记 sourcePresetId
  if (preset && preset.templates) {
    Object.entries(preset.templates).forEach(([fileName, content]) => {
      files.push(createFile(fileName, rulesFolder.id, content, { sourcePresetId: preset.id }));
    });
  }

  return files;
};

// Deprecated: For backward compatibility if needed, but prefer createInitialFileSystem
// export const initialFileSystem = createInitialFileSystem();
