
import { create } from 'zustand';
import { FileNode, FileType } from '../types';
import { dbAPI } from '../services/persistence';
import { initialFileSystem, generateId, findNodeByPath, getFileTreeStructure, getNodePath } from '../services/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import { useProjectStore } from './projectStore';
import { 
  DEFAULT_AGENT_PERSONA, 
  DEFAULT_AGENT_SKILL,
  STYLE_GUIDE_TEMPLATE,
  PROJECT_PROFILE_TEMPLATE,
  CHARACTER_CARD_TEMPLATE,
  OUTLINE_MASTER_TEMPLATE,
  OUTLINE_CHAPTER_TEMPLATE,
  SKILL_EROTIC_WRITER
} from '../services/templates';

// Protected files logic reused
const PROTECTED_FILES: Record<string, Record<string, string>> = {
  '98_技能配置': {
    'agent_core.md': DEFAULT_AGENT_SKILL,
    '助手人设.md': DEFAULT_AGENT_PERSONA
  },
  '99_创作规范': {
    '指南_文风规范.md': STYLE_GUIDE_TEMPLATE,
    '模板_项目档案.md': PROJECT_PROFILE_TEMPLATE,
    '模板_角色档案.md': CHARACTER_CARD_TEMPLATE,
    '模板_全书总纲.md': OUTLINE_MASTER_TEMPLATE,
    '模板_章节细纲.md': OUTLINE_CHAPTER_TEMPLATE
  },
  'subskill': {
      '技能_涩涩扩写.md': SKILL_EROTIC_WRITER
  }
};

interface FileState {
  files: FileNode[];
  activeFileId: string | null;
  
  // Actions
  loadFiles: (projectId: string) => Promise<void>;
  setActiveFileId: (id: string | null) => void;
  
  // CRUD (Path-based)
  createFile: (path: string, content: string) => string;
  createFileById: (parentId: string, name: string) => void;
  createFolderById: (parentId: string, name: string) => void;
  updateFile: (path: string, content: string) => string;
  saveFileContent: (id: string, content: string) => void;
  patchFile: (path: string, startLine: number, endLine: number, newContent: string) => string;
  readFile: (path: string, startLine?: number, endLine?: number) => string;
  searchFiles: (query: string) => string;
  deleteFile: (pathOrId: string) => string;
  renameFile: (oldPath: string, newPath: string) => string;
  listFiles: () => string;
  
  // Internal Helper
  _saveToDB: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  activeFileId: null,

  loadFiles: async (projectId: string) => {
    // 1. Fetch from DB
    let loadedFiles = await dbAPI.getFiles(projectId);
    
    if (!loadedFiles) {
      loadedFiles = initialFileSystem;
    }
    
    // 2. Migration & Integrity Check
    let hasChanges = false;
    
    // Parse metadata for all loaded files (Ensure metadata is sync'd with content)
    loadedFiles = loadedFiles.map(f => {
        if (f.type === FileType.FILE && f.content && !f.metadata) {
            const meta = parseFrontmatter(f.content);
            if (Object.keys(meta).length > 0) {
                hasChanges = true;
                return { ...f, metadata: meta };
            }
        }
        return f;
    });

    // Fix: 98_灵感碎片 -> 04_灵感碎片
    const oldInspiration = loadedFiles.find(f => f.name === '98_灵感碎片');
    if (oldInspiration) {
        loadedFiles = loadedFiles.map(f => f.id === oldInspiration.id ? { ...f, name: '04_灵感碎片' } : f);
        hasChanges = true;
    }

    // Ensure 98_技能配置
    let skillFolder = loadedFiles.find(f => f.name === '98_技能配置');
    if (!skillFolder) {
        const initSkillFolder = initialFileSystem.find(f => f.name === '98_技能配置');
        if (initSkillFolder) {
            skillFolder = initSkillFolder; 
            loadedFiles.push(skillFolder);
            hasChanges = true;
        }
    }

    // Ensure subskill
    if (skillFolder) {
        let subskillFolder = loadedFiles.find(f => f.name === 'subskill' && f.parentId === skillFolder!.id);
        if (!subskillFolder) {
            const initSub = initialFileSystem.find(f => f.name === 'subskill');
            subskillFolder = { ...(initSub || { id: generateId(), name: 'subskill', type: FileType.FOLDER, lastModified: Date.now() }), parentId: skillFolder.id };
            loadedFiles.push(subskillFolder);
            
            // Add example skill
            loadedFiles.push({
                id: generateId(), parentId: subskillFolder.id, name: '示例_战斗扩写增强.md', type: FileType.FILE,
                content: initialFileSystem.find(f => f.name === '示例_战斗扩写增强.md')?.content || '',
                metadata: parseFrontmatter(initialFileSystem.find(f => f.name === '示例_战斗扩写增强.md')?.content || ''),
                lastModified: Date.now()
            });
            hasChanges = true;
        }
         // Ensure Erotic Skill
         if (subskillFolder) {
             const eroticSkill = loadedFiles.find(f => f.parentId === subskillFolder!.id && f.name === '技能_涩涩扩写.md');
             if (!eroticSkill) {
                 const content = SKILL_EROTIC_WRITER;
                 loadedFiles.push({ 
                     id: generateId(), 
                     parentId: subskillFolder.id, 
                     name: '技能_涩涩扩写.md', 
                     type: FileType.FILE, 
                     content: content, 
                     metadata: parseFrontmatter(content),
                     lastModified: Date.now() 
                 });
                 hasChanges = true;
             }
         }
    }

    // Ensure agent_core.md and persona
    if (skillFolder) {
        const agentFile = loadedFiles.find(f => f.name === 'agent_core.md');
        if (!agentFile) {
             const initAgentFile = initialFileSystem.find(f => f.name === 'agent_core.md')!;
             loadedFiles.push({ ...initAgentFile, parentId: skillFolder.id, metadata: parseFrontmatter(initAgentFile.content || '') }); 
             hasChanges = true;
        } else if (agentFile.parentId !== skillFolder.id) {
            loadedFiles = loadedFiles.map(f => f.id === agentFile.id ? { ...f, parentId: skillFolder!.id } : f);
            hasChanges = true;
        }

        const personaFile = loadedFiles.find(f => f.name === '助手人设.md');
        if (!personaFile) {
            loadedFiles.push({ 
                id: generateId(), parentId: skillFolder.id, name: '助手人设.md', type: FileType.FILE, 
                content: DEFAULT_AGENT_PERSONA, metadata: parseFrontmatter(DEFAULT_AGENT_PERSONA), lastModified: Date.now() 
            });
            hasChanges = true;
        }
    }

    set({ files: loadedFiles });
    
    if (hasChanges) {
       dbAPI.saveFiles(projectId, loadedFiles);
    }
  },

  setActiveFileId: (id) => set({ activeFileId: id }),

  _saveToDB: () => {
      const { files } = get();
      const currentProjectId = useProjectStore.getState().currentProjectId;
      if (currentProjectId) {
          dbAPI.saveFiles(currentProjectId, files);
      }
  },

  createFile: (path, content) => {
    const { files, _saveToDB } = get();
    if (findNodeByPath(files, path)) return `Error: File at "${path}" already exists.`;

    const parts = path.split('/');
    const fileName = parts.pop()!;
    const folderPath = parts.join('/');
    
    let parentId = 'root';
    if (folderPath) {
        const parentFolder = findNodeByPath(files, folderPath);
        if (!parentFolder || parentFolder.type !== FileType.FOLDER) return `Error: Parent folder "${folderPath}" does not exist.`;
        parentId = parentFolder.id;
    }

    const metadata = parseFrontmatter(content);
    const newFile: FileNode = { id: generateId(), parentId, name: fileName, type: FileType.FILE, content, metadata, lastModified: Date.now() };
    set(state => ({ files: [...state.files, newFile], activeFileId: newFile.id }));
    _saveToDB();
    return `Created file at: "${path}"`;
  },

  createFileById: (parentId, name) => {
      const { _saveToDB } = get();
      // Default empty file has no metadata
      const newFile: FileNode = { id: generateId(), parentId, name, type: FileType.FILE, content: '', metadata: {}, lastModified: Date.now() };
      set(state => ({ files: [...state.files, newFile], activeFileId: newFile.id }));
      _saveToDB();
  },

  createFolderById: (parentId, name) => {
      const { _saveToDB } = get();
      const newFolder: FileNode = { id: generateId(), parentId, name, type: FileType.FOLDER, lastModified: Date.now() };
      set(state => ({ files: [...state.files, newFolder] }));
      _saveToDB();
  },

  updateFile: (path, content) => {
    const { files, _saveToDB } = get();
    const file = findNodeByPath(files, path);
    if (!file) return `Error: File at "${path}" not found.`;
    
    const metadata = parseFrontmatter(content);
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, content, metadata, lastModified: Date.now() } : f)
    }));
    _saveToDB();
    return `Updated content of "${path}"`;
  },
  
  saveFileContent: (id, content) => {
    const { _saveToDB } = get();
    // Parse metadata on save to keep it sync
    const metadata = parseFrontmatter(content);
    set(state => ({
        files: state.files.map(f => f.id === id ? { ...f, content, metadata, lastModified: Date.now() } : f)
    }));
    _saveToDB();
  },

  patchFile: (path, startLine, endLine, newContent) => {
    const { files, _saveToDB } = get();
    const file = findNodeByPath(files, path);
    if (!file) return `Error: File not found.`;
    
    const allLines = (file.content || '').split(/\r?\n/);
    const totalLines = allLines.length;
    const safeEndLine = Math.min(Math.max(startLine, endLine), totalLines);
    
    const before = allLines.slice(0, startLine - 1);
    const after = allLines.slice(safeEndLine);
    const newLines = newContent.split(/\r?\n/);
    const finalContent = [...before, ...newLines, ...after].join('\n');
    
    const metadata = parseFrontmatter(finalContent);
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, content: finalContent, metadata, lastModified: Date.now() } : f)
    }));
    _saveToDB();
    return `Successfully patched "${path}".`;
  },

  readFile: (path, startLine = 1, endLine = 200) => {
      const { files } = get();
      const file = findNodeByPath(files, path);
      if (!file) return `Error: File at "${path}" not found.`;
      
      const allLines = (file.content || '').split(/\r?\n/);
      const totalLines = allLines.length;
      const start = Math.max(1, startLine);
      const end = Math.min(totalLines, endLine);
      const linesToRead = allLines.slice(start - 1, end);
      const contentWithLineNumbers = linesToRead.map((line, idx) => `${String(start + idx).padEnd(4)} | ${line}`).join('\n');
      return `File: ${path}\nTotal Lines: ${totalLines}\nReading Range: ${start} - ${end}\n---\n${contentWithLineNumbers}\n---\n${end < totalLines ? '(Read limit reached)' : '(End of file)'}`;
  },

  searchFiles: (query) => {
    const { files } = get();
    const lowerQuery = query.toLowerCase();
    const results = files.filter(f => f.name.toLowerCase().includes(lowerQuery) || (f.content && f.content.toLowerCase().includes(lowerQuery)));
    if (results.length === 0) return `No files found matching "${query}".`;
    
    return results.map(f => {
        const path = getNodePath(f, files);
        return `${f.type === FileType.FOLDER ? '[DIR]' : '[FILE]'} ${path}`;
    }).join('\n');
  },

  deleteFile: (pathOrId) => {
    const { files, _saveToDB, activeFileId, setActiveFileId } = get();
    let targetNode = files.find(f => f.id === pathOrId) || findNodeByPath(files, pathOrId);
    if (!targetNode) return `Error: File not found`;
    
    const idsToDelete = new Set<string>();
    const collectIds = (id: string) => {
        idsToDelete.add(id);
        files.filter(f => f.parentId === id).forEach(child => collectIds(child.id));
    };
    collectIds(targetNode.id);
    
    let newFiles = files.filter(f => !idsToDelete.has(f.id));
    set({ files: newFiles });
    if (activeFileId === targetNode.id) setActiveFileId(null);
    _saveToDB();
    return `Deleted "${targetNode.name}"`;
  },

  renameFile: (oldPath, newName) => {
    const { files, _saveToDB } = get();
    const file = findNodeByPath(files, oldPath);
    if (!file) return `Error: File not found.`;
    
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, name: newName } : f)
    }));
    _saveToDB();
    return `Renamed "${oldPath}" to "${newName}"`;
  },

  listFiles: () => getFileTreeStructure(get().files)
}));
