
import { create } from 'zustand';
import { FileNode, FileType } from '../types';
import { dbAPI } from '../services/persistence';
import { createInitialFileSystem, generateId, findNodeByPath, getFileTreeStructure, getNodePath } from '../services/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import { FileService } from '../domains/file/fileService';

// Create FileService instance for domain logic
const fileService = new FileService(generateId);

export interface BatchEdit {
  startLine: number;
  endLine: number;
  newContent: string;
}

interface FileState {
  files: FileNode[];
  activeFileId: string | null;
  currentProjectId: string | null; // Track current project to avoid coupling

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
  currentProjectId: null,

  loadFiles: async (projectId: string) => {
    let loadedFiles: FileNode[] | undefined;

    try {
        // 1. Fetch from DB
        loadedFiles = await dbAPI.getFiles(projectId);
    } catch (e) {
        console.error("Failed to load files from DB, falling back to initial", e);
    }

    // 2. Fallback if empty or failed
    if (!loadedFiles || loadedFiles.length === 0) {
      console.warn("No files found for project, initializing default structure.");
      loadedFiles = createInitialFileSystem(); // Use Factory Function
      // Force save to persist this recovery
      dbAPI.saveFiles(projectId, loadedFiles);
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

    // Set currentProjectId to avoid coupling with projectStore
    set({ files: loadedFiles, currentProjectId: projectId });

    // Check and restore missing system files
    get()._restoreSystemFiles();
  },

  _restoreSystemFiles: () => {
    const { files, _saveToDB } = get();

    // Delegate to FileService for domain logic
    const updatedFiles = fileService.restoreSystemFiles(files);

    // Check if any changes were made
    if (updatedFiles.length !== files.length) {
      set({ files: updatedFiles });
      _saveToDB();
    }
  },

  setActiveFileId: (id) => set({ activeFileId: id }),

  _saveToDB: () => {
      const { files, currentProjectId } = get();
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

    // Check delete permission using FileService
    if (!fileService.canDeleteFile(targetNode)) {
      return `Error: Cannot delete protected system file "${targetNode.name}"`;
    }

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

    // Check rename permission using FileService
    if (!fileService.canRenameFile(file)) {
      return `Error: Cannot rename protected system file "${file.name}"`;
    }

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
