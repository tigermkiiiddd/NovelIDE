/**
 * Patch Utilities - 统一的 patch 应用逻辑
 *
 * 这个模块提供 patch 应用的核心逻辑，避免代码重复。
 * 被 fileStore.ts, toolRunner.ts, patchQueue.ts 共用。
 */

import { BatchEdit, StringMatchEdit, MatchPosition } from '../types';

/**
 * 查找所有匹配位置
 */
export const findAllMatches = (content: string, search: string): MatchPosition[] => {
  const matches: MatchPosition[] = [];
  let currentIndex = 0;

  while (true) {
    const index = content.indexOf(search, currentIndex);
    if (index === -1) break;

    const beforeMatch = content.substring(0, index);
    const lines = beforeMatch.split('\n');
    const startLine = lines.length;
    const startOffset = index;
    const endOffset = index + search.length;

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
};

/**
 * 截断字符串
 */
const truncate = (str: string, maxLen: number): string => {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
};

export interface ApplyEditsOptions {
  /** 严格模式：启用验证和错误信息（fileStore 使用） */
  strict?: boolean;
}

export interface ApplyEditsResult {
  content: string;
  success: boolean;
  error?: string;
  results?: string[];
}

/**
 * 应用一组 edits 到内容
 *
 * @param content 原始内容
 * @param edits 编辑列表
 * @param options 选项
 * @returns 应用结果
 */
export const applyEdits = (
  content: string,
  edits: BatchEdit[],
  options: ApplyEditsOptions = {}
): ApplyEditsResult => {
  const { strict = false } = options;
  let result = content;
  const messages: string[] = [];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i] as StringMatchEdit;

    // 检查是否为旧格式（行号模式）
    if ('startLine' in edit || 'endLine' in edit) {
      if (strict) {
        return {
          content: result,
          success: false,
          error: `❌ edit 失败: 参数格式已更新，不再支持行号模式。`
        };
      }
      continue;
    }

    const { mode, oldContent, newContent, after, before } = edit;

    // 验证 mode
    if (!mode) {
      if (strict) {
        return {
          content: result,
          success: false,
          error: `❌ edit 失败 (Edit ${i + 1}): 必须指定 mode ("single", "global", "insert")`
        };
      }
      continue;
    }

    // === INSERT 模式 ===
    if (mode === 'insert') {
      if (after === undefined && before === undefined) {
        if (strict) {
          return {
            content: result,
            success: false,
            error: `❌ edit 失败 (Edit ${i + 1}): insert 模式必须指定 after 或 before`
          };
        }
        continue;
      }

      if (after !== undefined) {
        if (after === '') {
          // 文件末尾插入
          result = result + (newContent || '');
          messages.push(`Edit ${i + 1}: 已插入到文件末尾`);
        } else {
          if (strict) {
            const matches = findAllMatches(result, after);
            if (matches.length === 0) {
              return {
                content: result,
                success: false,
                error: `❌ edit 失败 (Edit ${i + 1}): 未找到 after 内容`
              };
            }
            if (matches.length > 1) {
              return {
                content: result,
                success: false,
                error: `❌ edit 失败 (Edit ${i + 1}): after 内容匹配 ${matches.length} 处，需要更精确`
              };
            }
            const match = matches[0];
            result = result.slice(0, match.endOffset) + (newContent || '') + result.slice(match.endOffset);
          } else {
            // 非严格模式：简单处理
            const index = result.indexOf(after);
            if (index !== -1) {
              const insertPos = index + after.length;
              result = result.slice(0, insertPos) + (newContent || '') + result.slice(insertPos);
            }
          }
          messages.push(`Edit ${i + 1}: 已插入到指定位置之后`);
        }
      } else if (before !== undefined) {
        if (strict) {
          const matches = findAllMatches(result, before);
          if (matches.length === 0) {
            return {
              content: result,
              success: false,
              error: `❌ edit 失败 (Edit ${i + 1}): 未找到 before 内容`
            };
          }
          if (matches.length > 1) {
            return {
              content: result,
              success: false,
              error: `❌ edit 失败 (Edit ${i + 1}): before 内容匹配 ${matches.length} 处，需要更精确`
            };
          }
          const match = matches[0];
          result = result.slice(0, match.startOffset) + (newContent || '') + result.slice(match.startOffset);
        } else {
          // 非严格模式：简单处理
          const index = result.indexOf(before);
          if (index !== -1) {
            result = result.slice(0, index) + (newContent || '') + result.slice(index);
          }
        }
        messages.push(`Edit ${i + 1}: 已插入到指定位置之前`);
      }
      continue;
    }

    // === SINGLE / GLOBAL 模式 ===
    if (!oldContent) {
      if (strict) {
        return {
          content: result,
          success: false,
          error: `❌ edit 失败 (Edit ${i + 1}): oldContent 不能为空`
        };
      }
      continue;
    }

    const matches = findAllMatches(result, oldContent);

    console.log(`[applyEdits] Edit ${i + 1} - Finding matches:`, {
      mode,
      oldContentLength: oldContent.length,
      oldContentPreview: oldContent.substring(0, 100),
      matchesCount: matches.length,
      resultLength: result.length,
      resultPreview: result.substring(0, 100)
    });

    // 严格模式验证
    if (strict && mode === 'single') {
      if (matches.length === 0) {
        return {
          content: result,
          success: false,
          error: `❌ edit 失败 (Edit ${i + 1}): 未找到匹配内容。

【可能原因】
1. oldContent 与原文不完全一致（空格、换行、标点差异）
2. 文件已被修改，内容已变化

【搜索内容】
"${truncate(oldContent, 200)}"`
        };
      }
      if (matches.length > 1) {
        const positions = matches.map(m => `行 ${m.startLine}-${m.endLine}`).join(', ');
        return {
          content: result,
          success: false,
          error: `❌ edit 失败 (Edit ${i + 1}): 找到 ${matches.length} 处匹配，但使用的是单点模式。

【匹配位置】
${positions}

【建议】
1. 提供更多上下文使 oldContent 更精确、唯一
2. 或改用 mode: "global" 进行全局替换`
        };
      }
    }

    // 执行替换
    if (mode === 'global') {
      if (matches.length === 0) {
        console.warn(`[applyEdits] Edit ${i + 1}: No matches found, skipping`);
        messages.push(`Edit ${i + 1}: 未找到匹配，跳过`);
      } else {
        result = result.split(oldContent).join(newContent || '');
        console.log(`[applyEdits] Edit ${i + 1}: Replaced ${matches.length} occurrences`);
        messages.push(`Edit ${i + 1}: ${matches.length} 处已替换`);
      }
    } else {
      // single 模式
      if (matches.length > 0) {
        result = result.replace(oldContent, newContent || '');
        console.log(`[applyEdits] Edit ${i + 1}: Replaced 1 occurrence`);
        messages.push(`Edit ${i + 1}: 1 处已替换`);
      } else if (strict) {
        // 严格模式下已经在上面的验证中处理了
      } else {
        console.warn(`[applyEdits] Edit ${i + 1}: No matches found in single mode, skipping`);
        messages.push(`Edit ${i + 1}: 未找到匹配，跳过`);
      }
    }
  }

  return {
    content: result,
    success: true,
    results: messages
  };
};

/**
 * 简化版：直接返回修改后的内容（用于预览和合并）
 */
export const applyEditsSimple = (content: string, edits: BatchEdit[]): string => {
  const result = applyEdits(content, edits, { strict: false });
  return result.content;
};
