/**
 * 计算文本的字数（中文字符数 + 英文单词数）
 * - 中文字符、全角符号：每个字符算1字
 * - 英文单词：按空格分隔，每个单词算1字
 * - 数字：连续数字算1字
 */
export function countWords(text: string): number {
  if (!text) return 0;

  let count = 0;
  let inWord = false;
  let inNumber = false;

  for (const char of text) {
    const code = char.charCodeAt(0);

    // 中文字符和全角符号 (CJK Unified Ideographs, CJK Symbols and Punctuation, etc.)
    // 常见范围: 0x4E00-0x9FFF (CJK), 0x3000-0x303F (符号), 0xFF00-0xFFEF (全角)
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Extension A
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
      (code >= 0x3000 && code <= 0x303F) ||  // CJK Symbols and Punctuation
      (code >= 0xFF00 && code <= 0xFFEF)     // Halfwidth and Fullwidth Forms
    ) {
      count++;
      inWord = false;
      inNumber = false;
    }
    // 英文字母
    else if (/[a-zA-Z]/.test(char)) {
      if (!inWord) {
        count++;
        inWord = true;
      }
      inNumber = false;
    }
    // 数字
    else if (/[0-9]/.test(char)) {
      if (!inNumber) {
        count++;
        inNumber = true;
      }
      inWord = false;
    }
    // 其他字符（空格、标点等）
    else {
      inWord = false;
      inNumber = false;
    }
  }

  return count;
}

/**
 * 格式化字数统计信息
 */
export function formatWordCount(text: string): string {
  const wordCount = countWords(text);
  const charCount = text.length;
  const lineCount = text.split(/\r?\n/).length;

  return `${wordCount}字 / ${charCount}字符 / ${lineCount}行`;
}
