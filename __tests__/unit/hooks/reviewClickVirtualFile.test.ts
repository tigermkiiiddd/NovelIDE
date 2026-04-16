/**
 * Bug Regression Test: handleReviewClick 虚拟文件创建
 *
 * 根因：handleReviewClick 只为 toolName==='createFile' 创建虚拟文件预览，
 * 但协议已改用 'write' 工具创建文件，导致 diff panel 无法打开。
 *
 * 修复：条件从 toolName==='createFile' 放宽为 newContent!==null。
 *
 * 本测试验证 handleReviewClick 中虚拟文件创建的决策逻辑，
 * 确保所有能创建新文件的工具都能正确触发虚拟文件创建。
 */

import { PendingChange, FileNode, FileType } from '../../../types';

/**
 * 内联 findNodeByPath 避免触发 OpenAI 等重量级依赖链
 * 逻辑与 services/fileSystem.ts 中一致
 */
function findNodeByPath(files: FileNode[], path: string): FileNode | undefined {
  const parts = path.split('/').map(p => p.trim()).filter(p => p);
  if (parts.length === 0) return undefined;
  let currentParentId = 'root';
  let currentNode: FileNode | undefined;
  for (let i = 0; i < parts.length; i++) {
    currentNode = files.find(f => f.parentId === currentParentId && f.name === parts[i] && !f.hidden);
    if (!currentNode) return undefined;
    currentParentId = currentNode.id;
  }
  return currentNode;
}

// --- 提取 handleReviewClick 的决策逻辑为纯函数用于测试 ---

type ReviewAction =
  | { type: 'setActiveFileById'; fileId: string }
  | { type: 'setActiveFileByNode'; nodeId: string }
  | { type: 'createVirtualFile'; virtualFile: FileNode }
  | { type: 'noAction' };

/**
 * 模拟 handleReviewClick 的决策逻辑（与 AgentChat.tsx 中一致）
 */
function resolveReviewAction(
  change: PendingChange,
  files: FileNode[]
): ReviewAction {
  // Branch 1: fileId 已知（现有文件）
  if (change.fileId) {
    return { type: 'setActiveFileById', fileId: change.fileId };
  }

  // Branch 2: 通过路径找到文件
  const node = findNodeByPath(files, change.fileName);
  if (node) {
    return { type: 'setActiveFileByNode', nodeId: node.id };
  }

  // Branch 3: 新文件创建 → 创建虚拟文件
  // 关键修复点：不再限制 toolName==='createFile'，而是检查 newContent!==null
  if (change.newContent !== null) {
    const fileName = change.fileName.split('/').pop() || 'New File';
    return {
      type: 'createVirtualFile',
      virtualFile: {
        id: `virtual_${change.id}`,
        parentId: 'root',
        name: fileName,
        type: FileType.FILE,
        content: change.newContent,
        metadata: {
          ...change.metadata,
          virtualFilePath: change.fileName,
        },
        lastModified: Date.now(),
      },
    };
  }

  return { type: 'noAction' };
}

// --- Helpers ---

function makeChange(overrides: Partial<PendingChange> & { toolName: string }): PendingChange {
  return {
    id: 'change-1',
    args: {},
    fileName: '05_正文草稿/第一章.md',
    fileId: undefined,
    originalContent: '',
    newContent: '# 第一章\n\n这是第一章的内容。',
    timestamp: Date.now(),
    description: `Create file`,
    ...overrides,
  };
}

function makeExistingFile(path: string): { files: FileNode[]; fileId: string } {
  const parts = path.split('/');
  const fileId = 'existing-file-id';
  if (parts.length === 1) {
    return {
      fileId,
      files: [{
        id: fileId,
        parentId: 'root',
        name: parts[0],
        type: FileType.FILE,
        content: 'old content',
        lastModified: Date.now(),
      }],
    };
  }
  // 多级路径：创建文件夹 + 文件
  const folderId = 'folder-id';
  return {
    fileId,
    files: [
      {
        id: folderId,
        parentId: 'root',
        name: parts[0],
        type: FileType.FOLDER,
        lastModified: Date.now(),
      },
      {
        id: fileId,
        parentId: folderId,
        name: parts[1],
        type: FileType.FILE,
        content: 'old content',
        lastModified: Date.now(),
      },
    ],
  };
}

// --- Tests ---

describe('handleReviewClick: 虚拟文件创建决策', () => {

  describe('新文件创建（文件不存在于文件树中）', () => {
    it('write 工具创建新文件 → 应创建虚拟文件', () => {
      const change = makeChange({ toolName: 'write' });
      const result = resolveReviewAction(change, []);

      expect(result.type).toBe('createVirtualFile');
      if (result.type === 'createVirtualFile') {
        expect(result.virtualFile.content).toBe(change.newContent);
        expect(result.virtualFile.metadata?.virtualFilePath).toBe(change.fileName);
      }
    });

    it('createFile 工具创建新文件 → 应创建虚拟文件', () => {
      const change = makeChange({ toolName: 'createFile' });
      const result = resolveReviewAction(change, []);

      expect(result.type).toBe('createVirtualFile');
    });

    it('updateFile 工具在新路径创建文件 → 应创建虚拟文件', () => {
      // 虽然 updateFile 通常用于更新，但若路径不存在也应创建虚拟文件
      const change = makeChange({ toolName: 'updateFile' });
      const result = resolveReviewAction(change, []);

      expect(result.type).toBe('createVirtualFile');
    });

    it('任意 toolName 只要有 newContent → 都应创建虚拟文件', () => {
      const toolNames = ['write', 'createFile', 'updateFile', 'generate', 'compose'];
      for (const toolName of toolNames) {
        const change = makeChange({ toolName, id: `change-${toolName}` });
        const result = resolveReviewAction(change, []);
        expect(result.type).toBe('createVirtualFile');
      }
    });
  });

  describe('现有文件更新', () => {
    it('change.fileId 存在 → 应直接设置 activeFile', () => {
      const { files, fileId } = makeExistingFile('05_正文草稿/第一章.md');
      const change = makeChange({
        toolName: 'write',
        fileId,
        fileName: '05_正文草稿/第一章.md',
      });

      const result = resolveReviewAction(change, files);
      expect(result.type).toBe('setActiveFileById');
      if (result.type === 'setActiveFileById') {
        expect(result.fileId).toBe(fileId);
      }
    });

    it('change.fileId 缺失但路径能找到文件 → 应通过路径设置 activeFile', () => {
      const { files } = makeExistingFile('existing.md');
      const change = makeChange({
        toolName: 'write',
        fileName: 'existing.md',
        fileId: undefined,
      });

      const result = resolveReviewAction(change, files);
      expect(result.type).toBe('setActiveFileByNode');
    });
  });

  describe('删除操作（newContent 为 null）', () => {
    it('deleteFile 工具 → newContent 为 null → 不应创建虚拟文件', () => {
      const { files, fileId } = makeExistingFile('to-delete.md');
      const change = makeChange({
        toolName: 'deleteFile',
        fileName: 'to-delete.md',
        fileId,
        newContent: null,
        originalContent: 'to be deleted',
      });

      const result = resolveReviewAction(change, files);
      expect(result.type).toBe('setActiveFileById');
    });

    it('deleteFile 无 fileId 且文件不存在 → 不应创建虚拟文件', () => {
      const change = makeChange({
        toolName: 'deleteFile',
        fileName: 'nonexistent.md',
        fileId: undefined,
        newContent: null,
        originalContent: null,
      });

      const result = resolveReviewAction(change, []);
      expect(result.type).toBe('noAction');
    });
  });

  describe('虚拟文件属性', () => {
    it('虚拟文件的 id 应为 virtual_{changeId}', () => {
      const change = makeChange({ toolName: 'write', id: 'abc-123' });
      const result = resolveReviewAction(change, []);

      expect(result.type).toBe('createVirtualFile');
      if (result.type === 'createVirtualFile') {
        expect(result.virtualFile.id).toBe('virtual_abc-123');
      }
    });

    it('虚拟文件名应取路径最后一段', () => {
      const change = makeChange({
        toolName: 'write',
        fileName: '05_正文草稿/第一章.md',
      });
      const result = resolveReviewAction(change, []);

      expect(result.type).toBe('createVirtualFile');
      if (result.type === 'createVirtualFile') {
        expect(result.virtualFile.name).toBe('第一章.md');
      }
    });

    it('虚拟文件的 virtualFilePath 应保留完整路径', () => {
      const change = makeChange({
        toolName: 'write',
        fileName: '05_正文草稿/第一章.md',
      });
      const result = resolveReviewAction(change, []);

      if (result.type === 'createVirtualFile') {
        expect(result.virtualFile.metadata?.virtualFilePath).toBe('05_正文草稿/第一章.md');
      }
    });

    it('虚拟文件内容应等于 change.newContent', () => {
      const content = '# 第一章\n\n正文内容...';
      const change = makeChange({ toolName: 'write', newContent: content });
      const result = resolveReviewAction(change, []);

      if (result.type === 'createVirtualFile') {
        expect(result.virtualFile.content).toBe(content);
      }
    });
  });

  describe('回归：write 工具创建新文件的完整流程', () => {
    it('write 创建新文件 → 虚拟文件 virtualFilePath 匹配 change.fileName（用于 mergedPendingChange）', () => {
      // 这是 diff panel 能打开的关键：mergedPendingChange 通过
      // activeFile.metadata.virtualFilePath 匹配 pendingChanges
      const change = makeChange({
        toolName: 'write',
        fileName: '05_正文草稿/第一章.md',
        newContent: '新章节内容',
      });

      const result = resolveReviewAction(change, []);

      expect(result.type).toBe('createVirtualFile');
      if (result.type === 'createVirtualFile') {
        // 模拟 mergedPendingChange 的匹配逻辑
        const filePath = result.virtualFile.metadata?.virtualFilePath;
        const match = change.fileName === filePath;
        expect(match).toBe(true);
      }
    });
  });
});
