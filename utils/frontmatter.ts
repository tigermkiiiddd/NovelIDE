
import yaml from 'js-yaml';
import { FileMetadata } from '../types';

/**
 * Parses YAML frontmatter from a markdown string.
 */
export const parseFrontmatter = (content: string): FileMetadata => {
  if (!content) return {};
  
  // Robust regex to capture frontmatter block at the start of the file
  const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = content.match(frontMatterRegex);
  
  if (match) {
    try {
      const parsed = yaml.load(match[1]);
      return (typeof parsed === 'object' && parsed !== null) ? parsed as FileMetadata : {};
    } catch (e) {
      console.warn("Frontmatter parse error:", e);
      return {};
    }
  }
  return {};
};

/**
 * Injects or updates frontmatter in a markdown string.
 * This reconstructs the file content.
 */
export const injectFrontmatter = (content: string, metadata: FileMetadata): string => {
  const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = content.match(frontMatterRegex);
  
  let body = content;
  if (match) {
    body = content.replace(frontMatterRegex, '');
  }
  
  // Dump yaml
  const yamlStr = yaml.dump(metadata, { lineWidth: -1 }).trim();
  return `---\n${yamlStr}\n---\n${body}`;
};
