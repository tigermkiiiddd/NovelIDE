import { DiffSessionState, FilePatch, PendingChange, FileNode } from '../../types';

/**
 * 创建mock文件系统
 */
export const mockFileSystem = (): FileNode[] => {
  return [
    {
      id: 'file-1',
      parentId: 'root',
      name: 'file1.ts',
      type: 'FILE',
      content: 'console.log("Hello World");',
      lastModified: Date.now()
    },
    {
      id: 'file-2',
      parentId: 'root',
      name: 'file2.ts',
      type: 'FILE',
      content: 'console.log("Goodbye World");',
      lastModified: Date.now()
    },
    {
      id: 'folder-1',
      parentId: 'root',
      name: 'src',
      type: 'FOLDER',
      lastModified: Date.now()
    }
  ];
};

/**
 * 创建mock diff session
 */
export const mockDiffSession = (overrides?: Partial<DiffSessionState>): DiffSessionState => ({
  sourceSnapshot: 'Original content',
  sourceFileName: 'test.ts',
  patchQueue: [],
  ...overrides
});

/**
 * 创建mock patch
 */
export const mockPatch = (overrides?: Partial<FilePatch>): FilePatch => ({
  id: 'patch-1',
  type: 'accept',
  hunkId: 'hunk-1',
  startLineOriginal: 1,
  endLineOriginal: 2,
  newContent: 'New content',
  timestamp: Date.now(),
  ...overrides
});

/**
 * 创建mock pending change
 */
export const mockPendingChange = (overrides?: Partial<PendingChange>): PendingChange => ({
  id: 'change-1',
  toolName: 'file_write',
  args: { filePath: '/test.ts' },
  fileName: '/test.ts',
  originalContent: 'Original',
  newContent: 'Modified',
  timestamp: Date.now(),
  description: 'Modify test.ts',
  ...overrides
});

/**
 * 等待React useEffect执行完成
 */
export const waitForEffects = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

/**
 * 等待指定时间
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mock IndexedDB for testing
 */
export class MockIndexedDB {
  private stores: Map<string, Map<any, any>> = new Map();

  constructor() {
    this.stores.set('projects', new Map());
    this.stores.set('files', new Map());
    this.stores.set('sessions', new Map());
    this.stores.set('settings', new Map());
    this.stores.set('diffSessions', new Map());
    this.stores.set('uiSettings', new Map());
  }

  async get(storeName: string, key: string) {
    const store = this.stores.get(storeName);
    if (!store) {
      console.warn(`Store ${storeName} not found`);
      return undefined;
    }
    return store.get(key);
  }

  async put(storeName: string, value: any, key?: string) {
    const store = this.stores.get(storeName);
    if (!store) {
      console.warn(`Store ${storeName} not found`);
      return;
    }
    const actualKey = key || value.id || value.key;
    store.set(actualKey, value);
  }

  async delete(storeName: string, key: string) {
    const store = this.stores.get(storeName);
    if (!store) {
      console.warn(`Store ${storeName} not found`);
      return;
    }
    store.delete(key);
  }

  async getAll(storeName: string) {
    const store = this.stores.get(storeName);
    if (!store) {
      console.warn(`Store ${storeName} not found`);
      return [];
    }
    return Array.from(store.values());
  }

  async getAllKeys(storeName: string) {
    const store = this.stores.get(storeName);
    if (!store) {
      console.warn(`Store ${storeName} not found`);
      return [];
    }
    return Array.from(store.keys());
  }

  clear() {
    for (const store of this.stores.values()) {
      store.clear();
    }
  }

  // Helper for testing
  getStoreSize(storeName: string): number {
    const store = this.stores.get(storeName);
    return store ? store.size : 0;
  }
}
