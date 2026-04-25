/**
 * @file displayUtils.ts
 * @description Display helper functions for translating internal names to user-facing text.
 */

import i18n from '../i18n';
import { FileType, FileNode } from '../types';

/**
 * Get the display name for a file/folder node.
 *
 * Virtual directory names like `00_基础信息` are file-system paths that CANNOT be renamed,
 * but should be shown translated in the UI. User-created folders and all files keep their
 * original names.
 *
 * @param node - The FileNode to display
 * @returns The translated display name for folders with i18n keys, or the original name otherwise
 */
export function getFolderDisplayName(name: string): string {
  const key = `folders.${name}`;
  const translated = i18n.t(key);
  // If no translation found, i18next returns the key itself (e.g. "folders.MyCustomFolder")
  // In that case, fall back to the original name
  return translated === key ? name : translated;
}

/**
 * Get the display name for a FileNode, translating folder names when available.
 */
export function getNodeDisplayName(node: FileNode): string {
  if (node.type === FileType.FOLDER) {
    return getFolderDisplayName(node.name);
  }
  return node.name;
}
