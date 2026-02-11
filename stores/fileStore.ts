
import { create } from 'zustand';
import { FileNode, FileType } from '../types';
import { dbAPI } from '../services/persistence';
import { initialFileSystem, generateId, findNodeByPath, getFileTreeStructure, getNodePath } from '../services/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import { useProjectStore } from './projectStore';
import { 
  DEFAULT_AGENT_SKILL,
  STYLE_GUIDE_TEMPLATE,
  PROJECT_PROFILE_TEMPLATE,
  CHARACTER_CARD_TEMPLATE,
  OUTLINE_MASTER_TEMPLATE,
  OUTLINE_CHAPTER_TEMPLATE,
  SKILL_EROTIC_WRITER,
  SKILL_WORLD_BUILDER,
  SKILL_OUTLINE_ARCHITECT,
  SKILL_CHARACTER_DESIGNER,
  SKILL_DRAFT_EXPANDER,
  SKILL_EDITOR_REVIEW,
  SKILL_HUMANIZER_STYLE
} from '../services/templates';

const TEMPLATE_WORLD_TIMELINE = `---
summarys: ["此文件为标准的世界线记录模板，提供了表格格式以供复制使用，旨在规范化记录剧情事件与状态变更。"]
tags: ["模板"]
---
# 世界线记录

| 章节 | 事件 | 状态变更 | 伏笔 |
|---|---|---|---|
`;

const TEMPLATE_CLUES = `---
summarys: ["此文件为标准的伏笔追踪模板，采用了任务列表的格式，方便作者在创作过程中随时添加和勾选已回收的伏笔。"]
tags: ["模板"]
---
# 伏笔记录

- [ ] [章节名] 伏笔内容 (未回收)
`;

// Define Protected Content Structure (The "Source of Truth" for system integrity)
const PROTECTED_FILES: Record<string, Record<string, string>> = {
  '98_技能配置': {
    'agent_core.md': DEFAULT_AGENT_SKILL
  },
  '99_创作规范': {
    '指南_文风规范.md': STYLE_GUIDE_TEMPLATE,
    '模板_项目档案.md': PROJECT_PROFILE_TEMPLATE,
    '模板_角色档案.md': CHARACTER_CARD_TEMPLATE,
    '模板_全书总纲.md': OUTLINE_MASTER_TEMPLATE,
    '模板_章节细纲.md': OUTLINE_CHAPTER_TEMPLATE,
    '模板_世界线记录.md': TEMPLATE_WORLD_TIMELINE,
    '模板_伏笔记录.md': TEMPLATE_CLUES
  },
  'subskill': {
      '技能_涩涩扩写.md': SKILL_EROTIC_WRITER,
      '技能_世界观构建.md': SKILL_WORLD_BUILDER,
      '技能_大纲构建.md': SKILL_OUTLINE_ARCHITECT,
      '技能_角色设计.md': SKILL_CHARACTER_DESIGNER,
      '技能_正文扩写.md': SKILL_DRAFT_EXPANDER,
      '技能_编辑审核.md': SKILL_EDITOR_REVIEW,
      '技能_去AI化文风.md': SKILL_HUMANIZER_STYLE
  }
};

export interface BatchEdit {
  startLine: number;
  endLine: number;
  newContent: string;
}

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
  patchFile: (path: string, edits: BatchEdit[]) => string; 
  readFile: (path: string, startLine?: number, endLine?: number) => string;
  searchFiles: (query: string) => string;
  deleteFile: (pathOrId: string) => string;
  renameFile: (oldPath: string, newPath: string) => string;
  listFiles: () => string;
  
  // Internal Helper
  _saveToDB: () => void;
  _restoreSystemFiles: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  activeFileId: null,

  loadFiles: async (projectId: string) => {
    // 1. Fetch from DB
    let loadedFiles = await dbAPI.getFiles(projectId);
    
    if (!loadedFiles) {
      loadedFiles = JSON.parse(JSON.stringify(initialFileSystem)); // Deep copy initial
    }
    
    let hasChanges = false;

    // --- MIGRATION & FIXES ---
    // Fix: 98_灵感碎片 -> 04_灵感碎片 (Legacy fix)
    const oldInspiration = loadedFiles.find(f => f.name === '98_灵感碎片');
    if (oldInspiration) {
        loadedFiles = loadedFiles.map(f => f.id === oldInspiration.id ? { ...f, name: '04_灵感碎片' } : f);
        hasChanges = true;
    }

    // Sync Metadata
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
    
    if (hasChanges) {
       dbAPI.saveFiles(projectId, loadedFiles);
    }

    set({ files: loadedFiles });
    
    // Check and restore missing system files
    get()._restoreSystemFiles();
  },

  _restoreSystemFiles: () => {
    const { files, _saveToDB } = get();
    // Clone to avoid mutating state directly in loops before set
    const updatedFiles = [...files];
    let hasChanges = false;

    // Helper to ensure folder existence
    const ensureFolder = (name: string, parentId: string) => {
        let folder = updatedFiles.find(f => f.name === name && f.parentId === parentId && f.type === FileType.FOLDER);
        if (!folder) {
            folder = { id: generateId(), parentId, name, type: FileType.FOLDER, lastModified: Date.now() };
            updatedFiles.push(folder);
            hasChanges = true;
            console.log(`[Auto-Restore] Created missing folder: ${name}`);
        }
        return folder;
    };

    // Helper to ensure file existence (and restore content if missing)
    const ensureFile = (name: string, parentId: string, defaultContent: string) => {
        const file = updatedFiles.find(f => f.name === name && f.parentId === parentId && f.type === FileType.FILE);
        if (!file) {
             updatedFiles.push({ 
                id: generateId(), 
                parentId, 
                name, 
                type: FileType.FILE, 
                content: defaultContent, 
                metadata: parseFrontmatter(defaultContent),
                lastModified: Date.now() 
            });
            hasChanges = true;
            console.log(`[Auto-Restore] Created missing file: ${name}`);
        }
    };

    // 1. Ensure 98_技能配置 & Files
    const skillFolder = ensureFolder('98_技能配置', 'root');
    Object.entries(PROTECTED_FILES['98_技能配置']).forEach(([fName, fContent]) => {
        ensureFile(fName, skillFolder.id, fContent);
    });

    // 2. Ensure 99_创作规范 & Files
    const rulesFolder = ensureFolder('99_创作规范', 'root');
    Object.entries(PROTECTED_FILES['99_创作规范']).forEach(([fName, fContent]) => {
        ensureFile(fName, rulesFolder.id, fContent);
    });

    // 3. Ensure subskill & Files
    const subskillFolder = ensureFolder('subskill', skillFolder.id);
    Object.entries(PROTECTED_FILES['subskill']).forEach(([fName, fContent]) => {
        ensureFile(fName, subskillFolder.id, fContent);
    });

    if (hasChanges) {
        set({ files: updatedFiles });
        _saveToDB();
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

  patchFile: (path, edits) => {
    const { files, _saveToDB } = get();
    const file = findNodeByPath(files, path);
    if (!file) return `Error: File not found.`;
    
    const allLines = (file.content || '').split(/\r?\n/);
    
    // Sort edits descending by startLine to ensure index stability
    const sortedEdits = [...edits].sort((a, b) => b.startLine - a.startLine);
    
    for (const edit of sortedEdits) {
        const { startLine, endLine, newContent } = edit;
        const startIdx = Math.max(0, startLine - 1);
        // deleteCount: number of lines to remove from startLine to endLine (inclusive)
        const deleteCount = Math.max(0, endLine - startLine + 1);
        
        // FIX: Remove trailing newline from split to avoid extra empty line at end of block
        // FIX: Handle empty string properly (as deletion)
        const newLines = newContent ? newContent.replace(/\r?\n$/, '').split(/\r?\n/) : [];
        
        // FIX: Allow appending to the immediate end of file (when startIdx == length)
        // Also clamp startIdx to ensure it doesn't gap wildly (though splice handles gaps by just appending)
        const safeStartIdx = Math.min(startIdx, allLines.length);

        allLines.splice(safeStartIdx, deleteCount, ...newLines);
    }
    
    const finalContent = allLines.join('\n');
    
    const metadata = parseFrontmatter(finalContent);
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, content: finalContent, metadata, lastModified: Date.now() } : f)
    }));
    _saveToDB();
    return `Successfully applied ${edits.length} patches to "${path}".`;
  },

  readFile: (path, startLine = 1, endLine) => {
      const { files } = get();
      const file = findNodeByPath(files, path);
      if (!file) return `Error: File at "${path}" not found.`;
      
      const allLines = (file.content || '').split(/\r?\n/);
      const totalLines = allLines.length;
      const start = Math.max(1, startLine);

      // Smart Default: If endLine is NOT provided, default to reading the next 299 lines (300 total).
      // This fixes the bug where defaulting to '200' caused reading range error when startLine > 200.
      let effectiveEnd = endLine;
      if (effectiveEnd === undefined) {
          effectiveEnd = start + 299;
      }

      const end = Math.min(totalLines, effectiveEnd);
      
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
    const { files, _saveToDB, activeFileId, setActiveFileId, _restoreSystemFiles } = get();
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

    // Trigger auto-restore for system files immediately after deletion
    _restoreSystemFiles();

    return `Deleted "${targetNode.name}"`;
  },

  renameFile: (oldPath, newName) => {
    const { files, _saveToDB, _restoreSystemFiles } = get();
    const file = findNodeByPath(files, oldPath);
    if (!file) return `Error: File not found.`;
    
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, name: newName } : f)
    }));
    _saveToDB();

    // Trigger auto-restore (e.g., if we renamed a protected file, restore the original)
    _restoreSystemFiles();

    return `Renamed "${oldPath}" to "${newName}"`;
  },

  listFiles: () => getFileTreeStructure(get().files)
}));
