
import { create } from 'zustand';
import { FileNode, FileType, BatchEdit, StringMatchEdit, MatchPosition } from '../types';
import { dbAPI } from '../services/persistence';
import { createInitialFileSystem, generateId, findNodeByPath, getFileTreeStructure, getNodePath } from '../services/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import { FileService } from '../domains/file/fileService';
import { formatWordCount } from '../utils/wordCount';
import { useVersionStore, VersionSource } from './versionStore';

// Create FileService instance for domain logic
const fileService = new FileService(generateId);

// ============================================
// 辅助函数：字符串匹配
// ============================================

/**
 * 查找所有匹配位置
 */
function findAllMatches(content: string, search: string): MatchPosition[] {
  const matches: MatchPosition[] = [];
  let currentIndex = 0;

  while (true) {
    const index = content.indexOf(search, currentIndex);
    if (index === -1) break;

    // 计算起始行号
    const beforeMatch = content.substring(0, index);
    const lines = beforeMatch.split('\n');
    const startLine = lines.length;
    const startOffset = index;
    const endOffset = index + search.length;

    // 计算结束行号
    const matchLines = search.split('\n');
    const endLine = startLine + matchLines.length - 1;

    matches.push({
      startLine,
      endLine,
      startOffset,
      endOffset
    });

    currentIndex = endOffset;
  }

  return matches;
}

/**
 * 截断字符串
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

interface FileState {
  files: FileNode[];
  activeFileId: string | null;
  currentProjectId: string | null; // Track current project to avoid coupling
  virtualFile: FileNode | null; // Virtual file for previewing pending changes (createFile)
  isFilesLoaded: boolean; // 标记文件是否已加载完成

  // Actions
  loadFiles: (projectId: string) => Promise<void>;
  setActiveFileId: (id: string | null) => void;
  setVirtualFile: (file: FileNode | null) => void;

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
  virtualFile: null,
  isFilesLoaded: false,

  loadFiles: async (projectId: string) => {
    set({ isFilesLoaded: false }); // 开始加载
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
    set({ files: loadedFiles, currentProjectId: projectId, isFilesLoaded: true });

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

  setVirtualFile: (file) => set({ virtualFile: file, activeFileId: file?.id || null }),

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
    const wordInfo = formatWordCount(content);
    return `Created file at: "${path}" (${wordInfo})`;
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

    // 创建修改前版本（仅在内容有变化时）
    if (file.content !== content) {
      useVersionStore.getState().createVersion(
        file.id,
        file.name,
        path,
        file.content || '',
        'user',
        '修改前自动备份'
      );
    }

    const metadata = parseFrontmatter(content);
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, content, metadata, lastModified: Date.now() } : f)
    }));
    _saveToDB();
    const wordInfo = formatWordCount(content);
    return `Updated content of "${path}" (${wordInfo})`;
  },
  
  saveFileContent: (id, content) => {
    const { files, _saveToDB } = get();
    const file = files.find(f => f.id === id);

    // 创建修改前版本（仅在内容有变化时）
    if (file && file.content !== content) {
      const filePath = getNodePath(file, files);
      useVersionStore.getState().createVersion(
        id,
        file.name,
        filePath,
        file.content || '',
        'user',
        '保存前自动备份'
      );
    }

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

    // 创建修改前版本
    if (file.content) {
      useVersionStore.getState().createVersion(
        file.id,
        file.name,
        path,
        file.content,
        'agent',
        'Patch 修改前自动备份'
      );
    }

    let content = file.content || '';
    const results: string[] = [];

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i] as StringMatchEdit;

      // 检查是否为旧格式（行号模式）
      if ('startLine' in edit || 'endLine' in edit) {
        return `❌ patchFile 失败: 参数格式已更新，不再支持行号模式。`;
      }

      const { mode, oldContent, newContent, after, before } = edit;

      // 验证 mode
      if (!mode) {
        return `❌ patchFile 失败 (Edit ${i + 1}): 必须指定 mode ("single", "global", "insert")`;
      }

      // === INSERT 模式 ===
      if (mode === 'insert') {
        // 必须指定 after 或 before 其中之一
        if (after === undefined && before === undefined) {
          return `❌ patchFile 失败 (Edit ${i + 1}): insert 模式必须指定 after 或 before`;
        }
        if (after !== undefined && before !== undefined) {
          return `❌ patchFile 失败 (Edit ${i + 1}): insert 模式只能指定 after 或 before，不能同时指定`;
        }

        if (after !== undefined) {
          // after 模式
          if (after === '') {
            // 空字符串 = 文件末尾插入
            content = content + newContent;
            results.push(`Edit ${i + 1}: 已插入到文件末尾`);
          } else {
            // 在 after 内容之后插入
            const matches = findAllMatches(content, after);
            if (matches.length === 0) {
              return `❌ patchFile 失败 (Edit ${i + 1}): 未找到 after 内容`;
            }
            if (matches.length > 1) {
              return `❌ patchFile 失败 (Edit ${i + 1}): after 内容匹配 ${matches.length} 处，需要更精确`;
            }
            const match = matches[0];
            content = content.slice(0, match.endOffset) + newContent + content.slice(match.endOffset);
            results.push(`Edit ${i + 1}: 已插入到指定位置之后`);
          }
        } else {
          // before 模式
          const matches = findAllMatches(content, before!);
          if (matches.length === 0) {
            return `❌ patchFile 失败 (Edit ${i + 1}): 未找到 before 内容`;
          }
          if (matches.length > 1) {
            return `❌ patchFile 失败 (Edit ${i + 1}): before 内容匹配 ${matches.length} 处，需要更精确`;
          }
          const match = matches[0];
          content = content.slice(0, match.startOffset) + newContent + content.slice(match.startOffset);
          results.push(`Edit ${i + 1}: 已插入到指定位置之前`);
        }
        continue;
      }

      // === SINGLE / GLOBAL 模式 ===
      if (!oldContent) {
        return `❌ patchFile 失败 (Edit ${i + 1}): oldContent 不能为空`;
      }

      // 查找所有匹配位置
      const matches = findAllMatches(content, oldContent);

      // 根据模式验证
      if (mode === 'single') {
        if (matches.length === 0) {
          return `❌ patchFile 失败 (Edit ${i + 1}): 未找到匹配内容。

【可能原因】
1. oldContent 与原文不完全一致（空格、换行、标点差异）
2. 文件已被修改，内容已变化

【搜索内容】
"${truncate(oldContent, 200)}"`;
        }
        if (matches.length > 1) {
          const positions = matches.map(m => `行 ${m.startLine}-${m.endLine}`).join(', ');
          return `❌ patchFile 失败 (Edit ${i + 1}): 找到 ${matches.length} 处匹配，但使用的是单点模式。

【匹配位置】
${positions}

【建议】
1. 提供更多上下文使 oldContent 更精确、唯一
2. 或改用 mode: "global" 进行全局替换`;
        }
      }

      // 执行替换
      if (mode === 'global') {
        if (matches.length === 0) {
          results.push(`Edit ${i + 1}: 未找到匹配，跳过`);
        } else {
          content = content.split(oldContent).join(newContent);
          results.push(`Edit ${i + 1}: ${matches.length} 处已替换`);
        }
      } else {
        // single 模式（已验证只有一处匹配）
        content = content.replace(oldContent, newContent);
        results.push(`Edit ${i + 1}: 1 处已替换`);
      }
    }

    const metadata = parseFrontmatter(content);
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, content, metadata, lastModified: Date.now() } : f)
    }));
    _saveToDB();
    const wordInfo = formatWordCount(content);
    return `✅ Successfully applied ${edits.length} patches to "${path}" (${wordInfo})\n${results.join('\n')}`;
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
      const wordInfo = formatWordCount(file.content || '');
      return `File: ${path}\nWord Count: ${wordInfo}\nTotal Lines: ${totalLines}\nReading Range: ${start} - ${end}\n---\n${contentWithLineNumbers}\n---\n${end < totalLines ? '(Read limit reached)' : '(End of file)'}`;
  },

  searchFiles: (query) => {
    const { files } = get();
    const lowerQuery = query.toLowerCase();
    const results = files.filter(f => f.name.toLowerCase().includes(lowerQuery) || (f.content && f.content.toLowerCase().includes(lowerQuery)));
    if (results.length === 0) return `No files found matching "${query}".`;

    // 分类：只统计文件数量（用于提示）
    const fileResults = results.filter(f => f.type === FileType.FILE);

    // 构建结果列表
    const resultList = results.map(f => {
        const path = getNodePath(f, files);
        return `${f.type === FileType.FOLDER ? '[DIR]' : '[FILE]'} ${path}`;
    }).join('\n');

    // 添加尽职调查提示
    const diligenceWarning = fileResults.length > 1
      ? `\n\n==================================================
⚠️ 【尽职调查提醒】
搜索返回了 **${fileResults.length} 个相关文件**。根据「尽职调查原则」：
- 你**必须逐一阅读所有 ${fileResults.length} 个文件**，不能只读1个就下结论
- 阅读时如果发现引用了其他文件，需要继续追查
- 只有阅读完所有相关文件后，才能形成结论

待阅读文件列表：
${fileResults.map(f => `  - readFile("${getNodePath(f, files)}")`).join('\n')}
==================================================`
      : fileResults.length === 1
        ? `\n\n> 提示：只有1个相关文件，请阅读后形成结论。`
        : '';

    return resultList + diligenceWarning;
  },

  deleteFile: (pathOrId) => {
    const { files, _saveToDB, activeFileId, setActiveFileId, _restoreSystemFiles } = get();
    let targetNode = files.find(f => f.id === pathOrId) || findNodeByPath(files, pathOrId);
    if (!targetNode) return `Error: File not found`;

    // Check delete permission using FileService
    if (!fileService.canDeleteFile(targetNode, files)) {
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
    if (!fileService.canRenameFile(file, files)) {
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
