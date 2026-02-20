import { countWords, formatWordCount } from '../../../utils/wordCount';

describe('wordCount', () => {
  describe('countWords', () => {
    it('should return 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(countWords(null as any)).toBe(0);
      expect(countWords(undefined as any)).toBe(0);
    });

    it('should count Chinese characters', () => {
      expect(countWords('你好世界')).toBe(4);
    });

    it('should count English words', () => {
      expect(countWords('hello world')).toBe(2);
    });

    it('should count mixed Chinese and English', () => {
      // 你好 (2) + hello (1) + 世界 (2) + world (1) = 6
      expect(countWords('你好hello世界world')).toBe(6);
    });

    it('should count numbers as single word', () => {
      expect(countWords('123 456')).toBe(2);
      expect(countWords('123abc')).toBe(2); // number + word
    });

    it('should handle punctuation (fullwidth counted)', () => {
      // 你好 (2) + ，(1) + 世界 (2) + ！(1) = 6 (fullwidth punctuation is counted)
      expect(countWords('你好，世界！')).toBe(6);
    });

    it('should handle multiple spaces', () => {
      expect(countWords('hello   world')).toBe(2);
    });

    it('should handle newlines', () => {
      // 你好 (2) + 世界 (2) = 4 (newline is not counted)
      expect(countWords('你好\n世界')).toBe(4);
    });

    it('should handle complex mixed content', () => {
      // 这是一个测试 means "this is a test"
      const text = '这是一个测试 This is a test 123';
      // 中文字符: 这、是、一、个、测、试 = 6
      // 英文单词: This, is, a, test = 4
      // 数字: 123 = 1
      // 总计: 11
      expect(countWords(text)).toBe(11);
    });
  });

  describe('formatWordCount', () => {
    it('should format word count info', () => {
      const text = '你好世界';
      const result = formatWordCount(text);
      expect(result).toBe('4字 / 4字符 / 1行');
    });

    it('should handle multiline text', () => {
      const text = '你好\n世界';
      const result = formatWordCount(text);
      // 你好 (2) + 世界 (2) = 4字, 5字符（包含换行符）, 2行
      expect(result).toBe('4字 / 5字符 / 2行');
    });

    it('should handle empty string', () => {
      const result = formatWordCount('');
      expect(result).toBe('0字 / 0字符 / 1行');
    });
  });
});
