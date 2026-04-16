/**
 * ProtectionRegistry - 声明式文件保护注册表
 *
 * 集中管理所有文件/文件夹的保护等级，替代分散的 if/else 逻辑。
 * 保护等级决定了用户可以对文件执行哪些操作（删除、重命名、修改内容）。
 */

export enum ProtectionLevel {
  NONE = 'none',               // 无保护：可删除、可修改内容、可重命名
  IMMUTABLE = 'immutable',     // 完全保护：禁止删除、禁止修改内容、禁止重命名
  PERSISTENT = 'persistent',   // 存在保护：禁止删除、禁止重命名，但允许修改内容
  AUTO_REBUILD = 'auto_rebuild', // 存在恢复：可删除可修改可重命名，删除后自动从默认值重建
}

interface ProtectionRule {
  level: ProtectionLevel;
  /** Return true if this rule applies to the given path */
  match: (filePath: string, isFolder: boolean) => boolean;
}

// --- Rule Matchers ---

const matchExactFolder = (folderName: string) => (filePath: string, isFolder: boolean) =>
  isFolder && (filePath === '/' + folderName);

const matchExactFile = (fileName: string) => (filePath: string, isFolder: boolean) =>
  !isFolder && (filePath === '/' + fileName || filePath.endsWith('/' + fileName));

const matchUnderDir = (dirPath: string) => (filePath: string, isFolder: boolean) =>
  !isFolder && filePath.startsWith(dirPath + '/');

const matchPrefixInDir = (dirPath: string, prefix: string) =>
  (filePath: string, isFolder: boolean) =>
    !isFolder && filePath.startsWith(dirPath + '/') && filePath.slice(dirPath.length + 1).startsWith(prefix);

// --- Rules (ordered by priority: most specific first) ---

const RULES: ProtectionRule[] = [
  // AUTO_REBUILD folders: 可删除，删除后自动恢复目录结构
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('98_技能配置') },
  // DEPRECATED: 99_创作规范 protection removed — content migrating to memory palace + skills
  // { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('99_创作规范') },

  // AUTO_REBUILD: skills 根目录和分类子目录（可删除，自动恢复）
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('skills') },
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('核心') },
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('创作') },
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('规划') },
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('设计') },
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('审核') },
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFolder('补丁') },

  // AUTO_REBUILD: soul.md (用户可编辑，删除后从默认值重建)
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFile('soul.md') },

  // AUTO_REBUILD: skill files under 98_技能配置/skills/*/ (技能_*.md)
  {
    level: ProtectionLevel.AUTO_REBUILD,
    match: (filePath: string, isFolder: boolean) =>
      !isFolder &&
      filePath.startsWith('/98_技能配置/skills/') &&
      filePath.includes('技能_'),
  },

  // AUTO_REBUILD: patch files under 98_技能配置/skills/补丁/
  {
    level: ProtectionLevel.AUTO_REBUILD,
    match: (filePath: string, isFolder: boolean) =>
      !isFolder &&
      filePath.startsWith('/98_技能配置/skills/补丁/'),
  },

  // DEPRECATED: subskill folder kept as legacy reference (no protection)

  // DEPRECATED: 99_创作规范 files no longer auto-rebuild — content migrating to skills
  // { level: ProtectionLevel.AUTO_REBUILD, match: matchUnderDir('/99_创作规范') },

  // PERSISTENT: 长期记忆.json (any location)
  { level: ProtectionLevel.PERSISTENT, match: matchExactFile('长期记忆.json') },

  // PERSISTENT: outline.json (any location)
  { level: ProtectionLevel.PERSISTENT, match: matchExactFile('outline.json') },

  // AUTO_REBUILD: 章节分析.json
  { level: ProtectionLevel.AUTO_REBUILD, match: matchExactFile('章节分析.json') },
];

/**
 * 获取文件/文件夹的保护等级
 * @param filePath 文件的完整路径（如 /98_技能配置/skills/创作/技能_正文扩写.md）
 * @param isFolder 是否为文件夹
 */
export function getProtectionLevel(filePath: string, isFolder: boolean): ProtectionLevel {
  for (const rule of RULES) {
    if (rule.match(filePath, isFolder)) {
      return rule.level;
    }
  }
  return ProtectionLevel.NONE;
}

/**
 * 判断文件是否可删除
 * IMMUTABLE 和 PERSISTENT 不可删除
 */
export function canDelete(level: ProtectionLevel): boolean {
  return level === ProtectionLevel.NONE || level === ProtectionLevel.AUTO_REBUILD;
}

/**
 * 判断文件是否可重命名
 * 与删除权限一致
 */
export function canRename(level: ProtectionLevel): boolean {
  return canDelete(level);
}

/**
 * 判断文件内容是否可修改
 * 仅 IMMUTABLE 不可修改
 */
export function canModifyContent(level: ProtectionLevel): boolean {
  return level !== ProtectionLevel.IMMUTABLE;
}
