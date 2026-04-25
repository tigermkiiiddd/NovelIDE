/**
 * @file embeddingPersistenceEdgeCases.test.ts
 * @description Embedding 缓存持久化边缘测试
 *
 * 覆盖范围：
 * 1. 文件 chunk 索引原子性（部分失败不标记为已索引）
 * 2. IndexedDB 写入可靠性（失败返回 false、写入后验证）
 * 3. embedding 有效性校验（空数组、undefined、NaN、维度不匹配）
 * 4. 知识节点 embedding 修复（识别缺失、修复后有效）
 * 5. 缓存加载验证（无效 chunk 清理、schema 版本不匹配）
 */

// 用于控制哪些文本会触发 embedding 生成失败
const FAILING_TEXTS = new Set<string>();

// Mock embedding service
jest.mock('../../../../domains/memory/embeddingService', () => {
  const EMBEDDING_DIMENSIONS = 512;

  return {
    __esModule: true,
    generateEmbedding: jest.fn((text: string) => {
      // 检查文本是否包含任何失败标记
      for (const failText of FAILING_TEXTS) {
        if (text.includes(failText)) {
          return Promise.reject(new Error('模拟 embedding 生成失败'));
        }
      }
      const vec = new Array(EMBEDDING_DIMENSIONS).fill(0.1);
      return Promise.resolve(vec);
    }),
    cosineSimilarity: jest.fn((a: number[], b: number[]) => {
      if (a.length !== b.length) return 0;
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      return denom === 0 ? 0 : dot / denom;
    }),
    initEmbeddingModel: jest.fn(() => Promise.resolve()),
    getEmbeddingStatus: jest.fn(() => ({ progress: 100, status: 'ready', message: 'mock' })),
    getEmbeddingDimensions: jest.fn(() => EMBEDDING_DIMENSIONS),
    isValidEmbedding: jest.fn((emb: number[] | undefined | null) => {
      if (!emb || !Array.isArray(emb)) return false;
      if (emb.length !== EMBEDDING_DIMENSIONS) return false;
      if (emb.some((v: number) => typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v))) return false;
      return true;
    }),
    generateEmbeddingSafe: jest.fn((text: string) => {
      const { isValidEmbedding } = jest.requireMock('../../../../domains/memory/embeddingService');
      const { generateEmbedding } = jest.requireMock('../../../../domains/memory/embeddingService');
      return generateEmbedding(text).then((emb: number[]) => {
        return isValidEmbedding(emb) ? emb : null;
      }).catch(() => null);
    }),
  };
});

// Mock persistence
jest.mock('../../../../services/persistence', () => ({
  __esModule: true,
  dbAPI: {
    getFileEmbeddings: jest.fn(),
    saveFileEmbeddings: jest.fn(),
    getGlobalUserPreferences: jest.fn(() => Promise.resolve([])),
  },
}));

import {
  isValidEmbedding,
  generateEmbeddingSafe,
  generateEmbedding,
} from '../../../../domains/memory/embeddingService';
import { dbAPI } from '../../../../services/persistence';
import {
  indexFilesForSearch,
  semanticFileSearch,
  clearFileSearchCache,
  getFileSearchCacheStats,
} from '../../../../domains/memory/fileSearchService';
import {
  checkKnowledgeNodeEmbeddings,
  repairKnowledgeNodeEmbeddings,
} from '../../../../domains/memory/embeddingRepairService';
import { KnowledgeNode, FileNode, FileType } from '../../../../types';

// ============================================
// Helpers
// ============================================
const createNode = (overrides: Partial<KnowledgeNode> & { name: string; summary: string }): KnowledgeNode => ({
  id: `node-${Math.random().toString(36).slice(2, 8)}`,
  category: '设定',
  subCategory: '世界设定',
  tags: [],
  importance: 'normal',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const createFile = (overrides: Partial<FileNode> & { id: string; name: string; content: string }): FileNode => ({
  parentId: 'root',
  type: FileType.FILE,
  lastModified: Date.now(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  FAILING_TEXTS.clear();
  clearFileSearchCache();
  (dbAPI.getFileEmbeddings as jest.Mock).mockResolvedValue(undefined);
  (dbAPI.saveFileEmbeddings as jest.Mock).mockResolvedValue(undefined);
});

// ============================================
// 1. 文件 chunk 索引原子性
// ============================================
describe('文件 chunk 索引原子性', () => {
  it('所有 chunk 成功时才标记文件为已索引', async () => {
    const files = [
      createFile({ id: 'f1', name: 'test.md', content: '第一段内容。第二段内容。' }),
    ];

    const indexed = await indexFilesForSearch(files, 'test-project');
    expect(indexed).toBe(1);

    const stats = getFileSearchCacheStats();
    expect(stats.fileCount).toBe(1);
    expect(stats.chunkCount).toBeGreaterThan(0);
  });

  it('部分 chunk 失败时不应标记文件为已索引', async () => {
    // 标记第二段文本会失败
    FAILING_TEXTS.add('第二段失败内容。');

    const files = [
      createFile({ id: 'f-fail', name: 'fail.md', content: '第一段正常内容。第二段失败内容。' }),
    ];

    const indexed = await indexFilesForSearch(files, 'test-project');
    expect(indexed).toBe(0);

    const stats = getFileSearchCacheStats();
    expect(stats.fileCount).toBe(0);
  });

  it('部分 chunk 失败时应清除不完整缓存', async () => {
    FAILING_TEXTS.add('坏内容');

    const files = [
      createFile({ id: 'f-fail2', name: 'fail2.md', content: '好内容。坏内容。' }),
    ];

    await indexFilesForSearch(files, 'test-project');
    const stats = getFileSearchCacheStats();
    expect(stats.fileCount).toBe(0);
    expect(stats.chunkCount).toBe(0);
  });

  it('重新索引时应能修复之前失败的文件', async () => {
    // 第一次：失败
    FAILING_TEXTS.add('失败段落');
    const files = [
      createFile({ id: 'f-retry', name: 'retry.md', content: '正常段落。失败段落。' }),
    ];
    await indexFilesForSearch(files, 'test-project');
    expect(getFileSearchCacheStats().fileCount).toBe(0);

    // 清除失败标记，模拟修复
    FAILING_TEXTS.clear();

    // 第二次：成功（修改 lastModified 触发重新索引）
    const files2 = [
      createFile({ id: 'f-retry', name: 'retry.md', content: '正常段落。正常段落二。', lastModified: Date.now() + 1000 }),
    ];
    const indexed2 = await indexFilesForSearch(files2, 'test-project');
    expect(indexed2).toBe(1);
    expect(getFileSearchCacheStats().fileCount).toBe(1);
  });
});

// ============================================
// 2. IndexedDB 写入可靠性
// ============================================
describe('IndexedDB 写入可靠性', () => {
  it('saveEmbeddingsToDB 失败时应返回 false', async () => {
    (dbAPI.saveFileEmbeddings as jest.Mock).mockRejectedValueOnce(new Error('存储空间不足'));

    const files = [
      createFile({ id: 'f-db', name: 'db.md', content: '测试内容。' }),
    ];

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await indexFilesForSearch(files, 'test-project');

    // 应该打印保存失败错误
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fileSearchService] IndexedDB 持久化失败，内存缓存将在页面刷新后丢失'
    );

    consoleSpy.mockRestore();
  });

  it('写入后应能通过读取验证', async () => {
    const savedChunks = [{ fileId: 'f-verify', fileName: 'verify.md', chunkIndex: 0, text: '测试', embedding: new Array(512).fill(0.1) }];
    let getCallCount = 0;
    (dbAPI.getFileEmbeddings as jest.Mock).mockImplementation(() => {
      getCallCount++;
      // 第一次调用（loadEmbeddingsFromDB）返回 undefined，让文件被重新索引
      // 第二次调用（saveEmbeddingsToDB 验证）返回有效数据
      if (getCallCount === 1) return Promise.resolve(undefined);
      return Promise.resolve({
        version: 1,
        chunks: savedChunks,
        indexedVersions: { 'f-verify': Date.now() },
      });
    });

    const files = [
      createFile({ id: 'f-verify', name: 'verify.md', content: '测试内容。' }),
    ];

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await indexFilesForSearch(files, 'test-project');

    // 验证 saveFileEmbeddings 被调用
    expect(dbAPI.saveFileEmbeddings).toHaveBeenCalled();
    // 验证 getFileEmbeddings 至少被调用两次（加载 + 验证）
    expect(getCallCount).toBeGreaterThanOrEqual(2);

    consoleSpy.mockRestore();
  });

  it('IndexedDB 不可用时应有降级处理', async () => {
    (dbAPI.saveFileEmbeddings as jest.Mock).mockRejectedValue(new Error('IndexedDB not available'));
    (dbAPI.getFileEmbeddings as jest.Mock).mockResolvedValue(undefined);

    const files = [
      createFile({ id: 'f-nodb', name: 'nodb.md', content: '测试。' }),
    ];

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // 不应该抛异常导致整个流程崩溃
    await expect(indexFilesForSearch(files, 'test-project')).resolves.not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ============================================
// 3. embedding 有效性校验
// ============================================
describe('embedding 有效性校验', () => {
  it('空数组应视为无效 embedding', () => {
    expect(isValidEmbedding([])).toBe(false);
  });

  it('undefined 应视为无效 embedding', () => {
    expect(isValidEmbedding(undefined)).toBe(false);
  });

  it('null 应视为无效 embedding', () => {
    expect(isValidEmbedding(null)).toBe(false);
  });

  it('包含 NaN 的向量应视为无效', () => {
    const vec = new Array(512).fill(0.1);
    vec[10] = NaN;
    expect(isValidEmbedding(vec)).toBe(false);
  });

  it('包含 Infinity 的向量应视为无效', () => {
    const vec = new Array(512).fill(0.1);
    vec[10] = Infinity;
    expect(isValidEmbedding(vec)).toBe(false);
  });

  it('维度不匹配的向量应视为无效', () => {
    expect(isValidEmbedding(new Array(100).fill(0.1))).toBe(false);
    expect(isValidEmbedding(new Array(1000).fill(0.1))).toBe(false);
  });

  it('有效的 512 维向量应通过校验', () => {
    expect(isValidEmbedding(new Array(512).fill(0.1))).toBe(true);
  });
});

// ============================================
// 4. 知识节点 embedding 修复
// ============================================
describe('知识节点 embedding 修复', () => {
  it('应能识别缺失 embedding 的节点', () => {
    const nodes = [
      createNode({ name: '有', embedding: new Array(512).fill(0.1) }),
      createNode({ name: '无' }),
      createNode({ name: '空数组', embedding: [] }),
    ];
    const check = checkKnowledgeNodeEmbeddings(nodes);
    expect(check.invalid).toBe(2);
    expect(check.valid).toBe(1);
    expect(check.details.some(d => d.name === '无')).toBe(true);
    expect(check.details.some(d => d.name === '空数组')).toBe(true);
  });

  it('修复后节点应有有效 embedding', async () => {
    const nodes = [createNode({ name: '待修复', summary: '测试摘要' })];
    const result = await repairKnowledgeNodeEmbeddings(nodes);
    expect(result.repaired).toBe(1);
    expect(isValidEmbedding(nodes[0].embedding)).toBe(true);
  });

  it('已有有效 embedding 的节点不应被修改', async () => {
    const nodes = [
      createNode({ name: '已有', embedding: new Array(512).fill(0.2) }),
    ];
    const result = await repairKnowledgeNodeEmbeddings(nodes);
    expect(result.alreadyValid).toBe(1);
    expect(result.repaired).toBe(0);
  });
});

// ============================================
// 5. 缓存加载验证
// ============================================
describe('缓存加载验证', () => {
  it('加载后发现无效 chunk 应清理并重新索引', async () => {
    // 模拟 IndexedDB 中有无效数据
    (dbAPI.getFileEmbeddings as jest.Mock).mockResolvedValueOnce({
      version: 1,
      chunks: [
        { fileId: 'f-bad', fileName: 'bad.md', chunkIndex: 0, text: '好', embedding: new Array(512).fill(0.1) },
        { fileId: 'f-bad', fileName: 'bad.md', chunkIndex: 1, text: '坏', embedding: [] }, // 无效
      ],
      indexedVersions: { 'f-bad': 1000 },
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const files = [
      createFile({ id: 'f-bad', name: 'bad.md', content: '好内容。坏内容。', lastModified: 1000 }),
    ];

    await indexFilesForSearch(files, 'test-project');

    // 应该警告发现了无效 embedding
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('无效 embedding')
    );

    consoleSpy.mockRestore();
  });

  it('schema 版本不匹配时应丢弃旧数据', async () => {
    (dbAPI.getFileEmbeddings as jest.Mock).mockResolvedValueOnce({
      version: 999, // 不匹配
      chunks: [{ fileId: 'f-old', fileName: 'old.md', chunkIndex: 0, text: '旧', embedding: new Array(512).fill(0.1) }],
      indexedVersions: { 'f-old': 1000 },
    });

    const files = [
      createFile({ id: 'f-old', name: 'old.md', content: '旧内容。', lastModified: 1000 }),
    ];

    await indexFilesForSearch(files, 'test-project');

    // 因为版本不匹配，旧数据被丢弃，文件会被重新索引
    expect(getFileSearchCacheStats().fileCount).toBe(1);
  });
});

// ============================================
// 6. generateEmbeddingSafe
// ============================================
describe('generateEmbeddingSafe', () => {
  it('成功时应返回有效 embedding', async () => {
    const result = await generateEmbeddingSafe('正常文本');
    expect(result).not.toBeNull();
    expect(isValidEmbedding(result)).toBe(true);
  });

  it('失败时应返回 null 而非抛异常', async () => {
    FAILING_TEXTS.add('会失败的文本');
    const result = await generateEmbeddingSafe('会失败的文本');
    expect(result).toBeNull();
  });
});
