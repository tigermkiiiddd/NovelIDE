
import { create } from 'zustand';
import { FileNode, FileType, BatchEdit, FileMetadata } from '../types';
import { dbAPI } from '../services/persistence';
import { createInitialFileSystem, generateId, findNodeByPath, getFileTreeStructure, getNodePath } from '../services/fileSystem';
import { parseFrontmatter } from '../utils/frontmatter';
import { FileService } from '../domains/file/fileService';
import { formatWordCount } from '../utils/wordCount';
import { useVersionStore, VersionSource } from './versionStore';
import { applyEdits } from '../utils/patchUtils';
import { dataService } from '../services/dataService';
import { useProjectStore } from './projectStore';

// Lazy-init FileService to avoid circular dependency issues
let _fileService: FileService | null = null;
const getFileService = () => {
  if (!_fileService) {
    _fileService = new FileService(generateId);
  }
  return _fileService;
};

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
  globFiles: (pattern: string, basePath?: string, headLimit?: number) => string;
  grepFiles: (pattern: string, basePath?: string, context?: number, outputMode?: string, globFilter?: string, headLimit?: number, ignoreCase?: boolean, multiline?: boolean) => string;

  // Internal Helper
  _saveToDB: () => void;
  _restoreSystemFiles: () => void;
  _triggerEmbeddingIndex: () => void;

  // Preset Switching
  switchPreset: (newPresetId?: string) => void;
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
      // 区分"DB 读失败"和"确实无数据"：只有确实无数据时才创建默认结构
      const dbReadFailed = loadedFiles === undefined;
      if (dbReadFailed) {
        console.error("[fileStore] IndexedDB 读取失败，不自动覆盖数据。请检查数据库状态。");
        set({ files: [], currentProjectId: projectId, isFilesLoaded: true });
        return;
      }
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

    // 从 projectStore 获取 presetId，用于恢复题材特定的模板和技能
    const { currentProjectId } = get();
    const projects = useProjectStore.getState().projects;
    const currentProject = projects?.find(p => p.id === currentProjectId);
    const presetId = currentProject?.presetId;

    // Delegate to FileService for domain logic
    const updatedFiles = getFileService().restoreSystemFiles(files, presetId);

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

  _triggerEmbeddingIndex: (() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return () => {
      const { files, currentProjectId } = get();
      if (!currentProjectId) return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        import('../domains/memory/fileSearchService').then(({ indexFilesForSearch }) => {
          import('./toastStore').then(({ toast }) => {
            toast.info('正在更新搜索索引…');
            indexFilesForSearch(files, currentProjectId)
              .then(() => toast.success('搜索索引已更新'))
              .catch(() => toast.warning('搜索索引更新失败'));
          });
        });
      }, 2000); // 2秒防抖：等用户停止输入后再重建
    };
  })(),

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
    get()._triggerEmbeddingIndex();
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

    // Check content modification permission
    if (!getFileService().canModifyContent(file, files)) {
      return `Error: Cannot modify content of immutable file "${file.name}"`;
    }

    // 拒绝隐藏文件
    if (file.hidden) return `Error: File at "${path}" not found.`;

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
    get()._triggerEmbeddingIndex();
    const wordInfo = formatWordCount(content);
    return `Updated content of "${path}" (${wordInfo})`;
  },
  
  saveFileContent: (id, content) => {
    const { files, _saveToDB } = get();
    const file = files.find(f => f.id === id);

    // Check content modification permission
    if (file && !getFileService().canModifyContent(file, files)) {
      return `Error: Cannot modify content of immutable file "${file.name}"`;
    }

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
    get()._triggerEmbeddingIndex();
  },

  patchFile: (path, edits) => {
    const { files, _saveToDB } = get();
    const file = findNodeByPath(files, path);
    if (!file) return `Error: File not found.`;

    // Check content modification permission
    if (!getFileService().canModifyContent(file, files)) {
      return `Error: Cannot modify content of immutable file "${file.name}"`;
    }

    // 拒绝隐藏文件
    if (file.hidden) return `Error: File not found.`;

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

    // 使用公共函数应用 patch（严格模式，带验证）
    const result = applyEdits(file.content || '', edits, { strict: true });

    if (!result.success) {
      return result.error || 'Unknown error';
    }

    const content = result.content;
    const metadata = parseFrontmatter(content);
    set(state => ({
        files: state.files.map(f => f.id === file.id ? { ...f, content, metadata, lastModified: Date.now() } : f)
    }));
    _saveToDB();
    get()._triggerEmbeddingIndex();
    const wordInfo = formatWordCount(content);
    return `✅ Successfully applied ${edits.length} patches to "${path}" (${wordInfo})\n${result.results?.join('\n') || ''}`;
  },

  readFile: (path, startLine = 1, endLine) => {
      const { files } = get();
      // 禁止 LLM 访问 .json 文件（业务数据隔离）
      if (path.toLowerCase().endsWith('.json')) return `Error: .json 文件禁止访问（业务数据隔离）。`;
      const file = findNodeByPath(files, path);
      if (!file || file.hidden) return `Error: File at "${path}" not found.`;

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
    const results = files.filter(f => !f.hidden && !f.name.toLowerCase().endsWith('.json') && (f.name.toLowerCase().includes(lowerQuery) || (f.content && f.content.toLowerCase().includes(lowerQuery))));
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
    const { files, _saveToDB, activeFileId, setActiveFileId, _restoreSystemFiles, currentProjectId } = get();
    let targetNode = files.find(f => f.id === pathOrId) || findNodeByPath(files, pathOrId);
    if (!targetNode) return `Error: File not found`;

    // Check delete permission using FileService
    if (!getFileService().canDeleteFile(targetNode, files)) {
      return `Error: Cannot delete protected system file "${targetNode.name}"`;
    }

    // 获取文件路径用于级联删除
    const filePath = getNodePath(targetNode, files);

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

    // 级联删除：通过 DataService 删除关联的专用表数据
    if (currentProjectId) {
      dataService.deleteFileCascade(filePath, currentProjectId).catch(console.error);
    }

    // Trigger auto-restore for system files immediately after deletion
    _restoreSystemFiles();

    return `Deleted "${targetNode.name}"`;
  },

  renameFile: (oldPath, newName) => {
    const { files, _saveToDB, _restoreSystemFiles } = get();
    const file = findNodeByPath(files, oldPath);
    if (!file) return `Error: File not found.`;

    // Check rename permission using FileService
    if (!getFileService().canRenameFile(file, files)) {
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

  listFiles: () => {
    // 过滤掉 .json 文件，LLM 不应看到业务数据文件
    const visibleFiles = get().files.filter(f => !f.name.toLowerCase().endsWith('.json'));
    return getFileTreeStructure(visibleFiles);
  },

  globFiles: (pattern: string, basePath?: string, headLimit?: number) => {
    const { files } = get();

    // Convert glob pattern to regex
    const globToRegex = (p: string): RegExp => {
      const escaped = p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/{{GLOBSTAR}}/g, '.*');
      return new RegExp(`^${escaped}$`, 'i');
    };

    const regex = globToRegex(pattern);

    // Collect descendants of a folder (for path scoping)
    const getDescendantIds = (folderId: string): Set<string> => {
      const ids = new Set<string>();
      const queue = [folderId];
      while (queue.length > 0) {
        const pid = queue.shift()!;
        for (const f of files) {
          if (f.parentId === pid && !ids.has(f.id)) {
            ids.add(f.id);
            if (f.type === FileType.FOLDER) queue.push(f.id);
          }
        }
      }
      return ids;
    };

    let scopeIds: Set<string> | null = null;
    if (basePath) {
      const baseFolder = findNodeByPath(files, basePath);
      if (baseFolder) scopeIds = getDescendantIds(baseFolder.id);
    }

    let matched = files
      .filter(f => !f.hidden && f.type === FileType.FILE && !f.name.toLowerCase().endsWith('.json'))
      .map(f => ({ node: f, path: getNodePath(f, files) }))
      .filter(({ node, path }) => {
        if (scopeIds && !scopeIds.has(node.id)) return false;
        return regex.test(path);
      });

    if (headLimit && headLimit > 0) {
      matched = matched.slice(0, headLimit);
    }

    if (matched.length === 0) {
      return `No files matching "${pattern}"${basePath ? ` in ${basePath}` : ''}.`;
    }

    const total = matched.length;
    const truncated = headLimit && total >= headLimit;

    const lines = matched.map(({ node, path }) => {
      const meta = (node.metadata || {}) as FileMetadata;
      const tags = meta.tags?.length ? ` [Tags: ${meta.tags.join(',')}]` : '';
      const summary = meta.summarys?.length ? ` [Sum: ${meta.summarys[0]}]` : '';
      const characters = (meta as any).characters?.length ? ` [Chars: ${(meta as any).characters.join(',')}]` : '';
      return `[FILE] ${path}${tags}${characters}${summary}`;
    });

    if (truncated) lines.push(`\n(showing first ${headLimit} results)`);

    return lines.join('\n');
  },

  grepFiles: (pattern: string, basePath?: string, context: number = 2, outputMode: string = 'content', globFilter?: string, headLimit?: number, ignoreCase: boolean = true, multiline: boolean = false) => {
    const { files } = get();

    // Build regex
    const flags = `${ignoreCase ? 'i' : ''}${multiline ? 's' : ''}g`;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    }

    // --- File scoping helpers ---
    const getDescendantIds = (folderId: string): Set<string> => {
      const ids = new Set<string>();
      const queue = [folderId];
      while (queue.length > 0) {
        const pid = queue.shift()!;
        for (const f of files) {
          if (f.parentId === pid && !ids.has(f.id)) {
            ids.add(f.id);
            if (f.type === FileType.FOLDER) queue.push(f.id);
          }
        }
      }
      return ids;
    };

    // Glob filter regex
    let globRegex: RegExp | null = null;
    if (globFilter) {
      const escaped = globFilter
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/{{GLOBSTAR}}/g, '.*');
      globRegex = new RegExp(`^${escaped}$`, 'i');
    }

    // Scope files
    let scopeIds: Set<string> | null = null;
    if (basePath) {
      const baseFolder = findNodeByPath(files, basePath);
      if (baseFolder) scopeIds = getDescendantIds(baseFolder.id);
    }

    const scopeFiles = files.filter(f => {
      if (f.hidden || f.type !== FileType.FILE || !f.content || f.name.toLowerCase().endsWith('.json')) return false;
      if (scopeIds && !scopeIds.has(f.id)) return false;
      if (globRegex) {
        const path = getNodePath(f, files);
        if (!globRegex.test(path)) return false;
      }
      return true;
    });

    // --- Search ---
    const results: string[] = [];
    let totalEntries = 0;
    let truncated = false;

    // Strip YAML frontmatter, return body content and body start line
    const stripFrontmatter = (text: string): { body: string; bodyStartLine: number } => {
      const match = text.match(/^---\n([\s\S]*?)\n---\n/);
      if (!match) return { body: text, bodyStartLine: 0 };
      return { body: text.slice(match[0].length), bodyStartLine: match[0].split('\n').length - 1 };
    };

    for (const file of scopeFiles) {
      if (truncated) break;

      const path = getNodePath(file, files);
      const fullContent = file.content!;
      const { body: bodyContent, bodyStartLine } = stripFrontmatter(fullContent);

      // Multiline mode: search body content only
      if (multiline) {
        regex.lastIndex = 0;
        const matches = [...bodyContent.matchAll(regex)];
        if (matches.length === 0) continue;

        if (outputMode === 'files_with_matches') {
          results.push(path);
          totalEntries++;
          if (headLimit && totalEntries >= headLimit) { truncated = true; break; }
          continue;
        }
        if (outputMode === 'count') {
          results.push(`${path}: ${matches.length}`);
          totalEntries++;
          if (headLimit && totalEntries >= headLimit) { truncated = true; break; }
          continue;
        }

        // content mode — report match positions
        const lines = bodyContent.split('\n');
        let shown = 0;
        for (const m of matches) {
          if (headLimit && totalEntries >= headLimit) { truncated = true; break; }
          const beforeMatch = bodyContent.substring(0, m.index!);
          const startLine = beforeMatch.split('\n').length - 1;
          const matchText = m[0];
          const matchLineCount = matchText.split('\n').length;
          const endLine = startLine + matchLineCount - 1;

          const ctxStart = Math.max(0, startLine - context);
          const ctxEnd = Math.min(lines.length - 1, endLine + context);

          if (shown === 0) results.push(`--- ${path} ---`);
          for (let i = ctxStart; i <= ctxEnd; i++) {
            const marker = (i >= startLine && i <= endLine) ? '>' : ' ';
            const lineText = lines[i].length > 200 ? lines[i].substring(0, 200) + '...' : lines[i];
            // Offset line numbers by bodyStartLine so they match the real file
            results.push(`  ${String(i + 1 + bodyStartLine).padStart(4)}${marker}| ${lineText}`);
          }
          results.push('');
          shown++;
          totalEntries++;
        }
        continue;
      }

      // Line-by-line mode (default): search body only
      const lines = bodyContent.split('\n');
      const matchLines: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          matchLines.push(i);
        }
      }

      if (matchLines.length === 0) continue;

      if (outputMode === 'files_with_matches') {
        results.push(path);
        totalEntries++;
        if (headLimit && totalEntries >= headLimit) { truncated = true; break; }
        continue;
      }

      if (outputMode === 'count') {
        results.push(`${path}: ${matchLines.length}`);
        totalEntries++;
        if (headLimit && totalEntries >= headLimit) { truncated = true; break; }
        continue;
      }

      // content mode
      results.push(`--- ${path} (${matchLines.length} matches) ---`);
      for (const lineIdx of matchLines) {
        if (headLimit && totalEntries >= headLimit) { truncated = true; break; }
        const start = Math.max(0, lineIdx - context);
        const end = Math.min(lines.length - 1, lineIdx + context);
        for (let i = start; i <= end; i++) {
          const marker = i === lineIdx ? '>' : ' ';
          const lineText = lines[i].length > 200 ? lines[i].substring(0, 200) + '...' : lines[i];
          // Offset line numbers by bodyStartLine so they match the real file
          results.push(`  ${String(i + 1 + bodyStartLine).padStart(4)}${marker}| ${lineText}`);
        }
        results.push('');
        totalEntries++;
      }
    }

    if (results.length === 0) {
      return `No matches for "${pattern}"${basePath ? ` in ${basePath}` : ''}.`;
    }

    if (truncated) results.push(`\n(truncated at ${headLimit} entries)`);

    return results.join('\n');
  },

  switchPreset: (newPresetId?: string) => {
    const { files, _saveToDB } = get();
    const updatedFiles = getFileService().switchPreset(files, newPresetId);
    set({ files: updatedFiles });
    _saveToDB();
  }
}));
