/**
 * 数据安全工具模块
 *
 * 解决的问题：
 * 1. JSON解析崩溃导致数据丢失
 * 2. 并发写入导致数据覆盖
 * 3. 损坏数据无法恢复
 */

// ========== 写入锁机制 ==========

const writeLocks = new Map<string, Promise<void>>();

/**
 * 带锁的异步操作执行器
 * 防止同一key的并发写入
 */
export async function withWriteLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // 等待之前的锁释放
  while (writeLocks.has(key)) {
    await writeLocks.get(key);
  }

  // 创建新锁
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  writeLocks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    writeLocks.delete(key);
    releaseLock!();
  }
}

// ========== 安全JSON解析 ==========

export interface SafeParseResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  rawContent: string;
}

/**
 * 安全的JSON解析，带详细错误信息
 */
export function safeJSONParse<T>(
  content: string | undefined | null,
  fallback: T,
  context?: string
): { data: T; error: string | null } {
  if (!content) {
    return { data: fallback, error: null };
  }

  try {
    const parsed = JSON.parse(content);
    return { data: parsed, error: null };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const position = errorMsg.match(/position (\d+)/)?.[1];
    const contextInfo = context ? ` [${context}]` : '';

    let detailedError = `JSON解析失败${contextInfo}: ${errorMsg}`;
    if (position) {
      const pos = parseInt(position, 10);
      const start = Math.max(0, pos - 30);
      const end = Math.min(content.length, pos + 30);
      const snippet = content.slice(start, end);
      const pointer = ' '.repeat(Math.min(pos - start, 30)) + '^';
      detailedError += `\n位置 ${pos} 附近内容:\n...${snippet}...\n  ${pointer}`;
    }

    console.error(detailedError);
    console.error(`[dataSafety] 损坏的JSON内容前500字符:\n`, content.slice(0, 500));

    return { data: fallback, error: detailedError };
  }
}

/**
 * 尝试修复常见的JSON格式问题
 */
export function tryRepairJSON(content: string): string | null {
  let repaired = content.trim();

  // 尝试移除尾部逗号
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // 尝试修复未闭合的引号（简单情况）
  // 这个比较危险，可能引入更多问题，暂时跳过

  // 验证修复后的JSON
  try {
    JSON.parse(repaired);
    console.log('[dataSafety] JSON自动修复成功');
    return repaired;
  } catch {
    return null;
  }
}

// ========== 备份机制 ==========

const BACKUP_PREFIX = 'novel-ide-backup-';
const MAX_BACKUPS = 5;

interface BackupEntry {
  timestamp: number;
  key: string;
  content: string;
}

/**
 * 创建数据备份（存到 localStorage，有大小限制但足够应急）
 */
export function createBackup(key: string, content: string): void {
  try {
    const backupKey = `${BACKUP_PREFIX}${key}`;
    const backup: BackupEntry = {
      timestamp: Date.now(),
      key,
      content,
    };

    // 获取现有备份列表
    const existingBackups = getBackups(key);

    // 添加新备份
    existingBackups.push(backup);

    // 只保留最近的几个备份
    const toKeep = existingBackups.slice(-MAX_BACKUPS);

    localStorage.setItem(backupKey, JSON.stringify(toKeep));
    console.log(`[dataSafety] 已创建备份: ${key}, 时间: ${new Date().toISOString()}`);
  } catch (e) {
    // localStorage 可能满了，尝试清理旧备份
    console.warn('[dataSafety] 创建备份失败，尝试清理旧备份:', e);
    cleanupOldBackups();
    try {
      const backupKey = `${BACKUP_PREFIX}${key}`;
      const backup: BackupEntry = {
        timestamp: Date.now(),
        key,
        content,
      };
      localStorage.setItem(backupKey, JSON.stringify([backup]));
    } catch {
      console.error('[dataSafety] 重试创建备份仍然失败');
    }
  }
}

/**
 * 获取指定key的备份列表
 */
export function getBackups(key: string): BackupEntry[] {
  try {
    const backupKey = `${BACKUP_PREFIX}${key}`;
    const raw = localStorage.getItem(backupKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 从备份恢复数据
 */
export function restoreFromBackup(key: string): string | null {
  const backups = getBackups(key);
  if (backups.length === 0) {
    console.log(`[dataSafety] 没有找到 ${key} 的备份`);
    return null;
  }

  // 返回最新的有效备份
  for (let i = backups.length - 1; i >= 0; i--) {
    const backup = backups[i];
    try {
      // 验证备份内容是否是有效JSON
      JSON.parse(backup.content);
      console.log(
        `[dataSafety] 从备份恢复: ${key}, 时间: ${new Date(backup.timestamp).toISOString()}`
      );
      return backup.content;
    } catch {
      console.warn(`[dataSafety] 备份 ${i} 损坏，尝试更早的备份`);
    }
  }

  return null;
}

/**
 * 清理所有旧备份
 */
function cleanupOldBackups(): void {
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(BACKUP_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  // 删除一半的旧备份
  const toRemove = keysToRemove.slice(0, Math.ceil(keysToRemove.length / 2));
  toRemove.forEach((key) => localStorage.removeItem(key));
  console.log(`[dataSafety] 清理了 ${toRemove.length} 个旧备份`);
}

// ========== 写入前验证 ==========

/**
 * 验证数据是否可以安全序列化
 */
export function validateForSerialization(data: unknown): { valid: boolean; error?: string } {
  try {
    const serialized = JSON.stringify(data);

    // 验证大小（50MB限制）
    if (serialized.length > 50_000_000) {
      return { valid: false, error: '数据过大（超过50MB），可能导致性能问题' };
    }

    // 验证可以重新解析
    JSON.parse(serialized);

    return { valid: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { valid: false, error: `序列化验证失败: ${error}` };
  }
}

// ========== 损坏数据恢复工具 ==========

/**
 * 尝试从损坏状态恢复记忆数据
 */
export async function attemptMemoryRecovery(
  projectId: string,
  corruptedContent: string
): Promise<{ memories: unknown[]; edges: unknown[] } | null> {
  console.log('[dataSafety] 尝试恢复损坏的记忆数据...');

  // 1. 尝试自动修复
  const repaired = tryRepairJSON(corruptedContent);
  if (repaired) {
    try {
      const parsed = JSON.parse(repaired);
      console.log('[dataSafety] 自动修复成功');
      return { memories: parsed.memories || [], edges: parsed.edges || [] };
    } catch {
      // 继续尝试其他方法
    }
  }

  // 2. 尝试从备份恢复
  const backupContent = restoreFromBackup(`memory-${projectId}`);
  if (backupContent) {
    try {
      const parsed = JSON.parse(backupContent);
      console.log('[dataSafety] 从备份恢复成功');
      return { memories: parsed.memories || [], edges: parsed.edges || [] };
    } catch {
      // 备份也损坏了
    }
  }

  // 3. 尝试提取部分数据（从损坏的JSON中抢救）
  const extracted = extractPartialData(corruptedContent);
  if (extracted) {
    console.log(`[dataSafety] 部分数据恢复成功: ${extracted.memories.length} 条记忆`);
    return extracted;
  }

  console.error('[dataSafety] 所有恢复尝试失败');
  return null;
}

/**
 * 从损坏的JSON中提取部分数据
 */
function extractPartialData(content: string): { memories: unknown[]; edges: unknown[] } | null {
  // 尝试用正则提取 memories 数组
  const memoriesMatch = content.match(/"memories"\s*:\s*\[([\s\S]*?)(?=\s*\]|"edges")/);
  const edgesMatch = content.match(/"edges"\s*:\s*\[([\s\S]*?)(?=\s*\]|$)/);

  const memories: unknown[] = [];
  const edges: unknown[] = [];

  // 尝试解析单个记忆对象
  if (memoriesMatch) {
    const memoryObjects = memoriesMatch[1].match(/\{[^{}]*"(id|name)"[^{}]*\}/g);
    if (memoryObjects) {
      for (const obj of memoryObjects) {
        try {
          memories.push(JSON.parse(obj));
        } catch {
          // 跳过无法解析的对象
        }
      }
    }
  }

  if (edgesMatch) {
    const edgeObjects = edgesMatch[1].match(/\{[^{}]*"id"[^{}]*\}/g);
    if (edgeObjects) {
      for (const obj of edgeObjects) {
        try {
          edges.push(JSON.parse(obj));
        } catch {
          // 跳过无法解析的对象
        }
      }
    }
  }

  if (memories.length > 0 || edges.length > 0) {
    return { memories, edges };
  }

  return null;
}

// ========== 全局错误保护 ==========

/**
 * 包装保存函数，添加备份和验证
 */
export function wrapSaveFunction<T>(
  key: string,
  saveFn: (data: T) => Promise<void>
): (data: T) => Promise<void> {
  return async (data: T) => {
    return withWriteLock(key, async () => {
      // 验证数据
      const validation = validateForSerialization(data);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // 创建备份
      const serialized = JSON.stringify(data);
      createBackup(key, serialized);

      // 执行保存
      await saveFn(data);
    });
  };
}
