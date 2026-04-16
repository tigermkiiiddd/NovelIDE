/**
 * @file deepThinkingTools.ts
 * @description 深度思考工具：管理"3页虚拟纸"的思考空间
 *
 * 提供 deep_thinking 工具的执行逻辑和 .thinking/ 虚拟文件系统路由。
 * 虚拟文件存储在 ChatSession.thinkingPads 中，同时同步到 fileStore 供用户在 editor 中查看。
 */

import { ToolDefinition } from '../types';
import type { ChatSession, ThinkingPad, ThinkingPage, ChangelogEntry } from '../../../types';
import type { FileNode } from '../../../types';
import { FileType } from '../../../types';
import { generateId } from '../../fileSystem';
import { useFileStore } from '../../../stores/fileStore';

// ==================== FileStore 同步 ====================

const THINKING_FOLDER_NAME = '.thinking';

/**
 * 获取或创建 .thinking/ 根文件夹
 */
function ensureThinkingRoot(): string {
  const { files } = useFileStore.getState();
  const root = files.find(f => f.name === THINKING_FOLDER_NAME && f.parentId === null && f.type === FileType.FOLDER);
  if (root) return root.id;

  const id = generateId();
  const folder: FileNode = {
    id,
    parentId: null,
    name: THINKING_FOLDER_NAME,
    type: FileType.FOLDER,
    lastModified: Date.now(),
  };
  useFileStore.setState(s => ({ files: [...s.files, folder] }));
  return id;
}

/**
 * 获取或创建 pad 子文件夹
 */
function ensurePadFolder(padId: string, title: string): string {
  const rootId = ensureThinkingRoot();
  const slug = titleToSlug(title);
  const { files } = useFileStore.getState();
  // 按 padId 在 metadata 中查找，或按 slug 查找文件夹名
  const existing = files.find(f =>
    f.parentId === rootId && f.type === FileType.FOLDER &&
    (f.name === slug || f.metadata?.padId === padId)
  );
  if (existing) {
    // 确保 metadata 中有 padId
    if (!existing.metadata?.padId) {
      useFileStore.setState(s => ({
        files: s.files.map(f => f.id === existing.id ? { ...f, metadata: { ...f.metadata, padId } } : f),
      }));
    }
    return existing.id;
  }

  const id = generateId();
  const folder: FileNode = {
    id,
    parentId: rootId,
    name: slug,
    type: FileType.FOLDER,
    lastModified: Date.now(),
    metadata: { padId, thinkingPadTitle: title },
  };
  useFileStore.setState(s => ({ files: [...s.files, folder] }));
  return id;
}

/**
 * 将 pad 的 3 页同步到 fileStore（创建或更新）
 */
export function syncPadToFileStore(pad: ThinkingPad): void {
  const folderId = ensurePadFolder(pad.id, pad.title);
  const { files } = useFileStore.getState();
  const now = Date.now();

  const pageEntries: [keyof typeof pad.pages, string][] = [
    ['p1_constraint', '01_约束.md'],
    ['p2_breadth', '02_广度.md'],
    ['p3_depth', '03_深度.md'],
  ];

  const updatedFiles = [...files];

  for (const [pageKey, fileName] of pageEntries) {
    const existingIdx = updatedFiles.findIndex(
      f => f.name === fileName && f.parentId === folderId && f.type === FileType.FILE,
    );

    const content = pad.pages[pageKey].content;
    const statusTag = '';

    if (existingIdx >= 0) {
      // 更新内容
      updatedFiles[existingIdx] = {
        ...updatedFiles[existingIdx],
        content,
        lastModified: now,
      };
    } else {
      // 新建文件
      const fileNode: FileNode = {
        id: generateId(),
        parentId: folderId,
        name: fileName,
        type: FileType.FILE,
        content,
        lastModified: now,
        metadata: { virtualThinkingFile: true },
      };
      updatedFiles.push(fileNode);
    }
  }

  useFileStore.setState({ files: updatedFiles });
}

/**
 * 从 fileStore 中移除 pad 的虚拟文件（仅在需要清理时调用，归档不调用）
 */
export function removePadFromFileStore(padId: string): void {
  const { files } = useFileStore.getState();
  const root = files.find(f => f.name === THINKING_FOLDER_NAME && f.parentId === null);
  if (!root) return;

  const folder = files.find(f => f.name === padId && f.parentId === root.id);
  if (!folder) return;

  // 删除文件夹及其下所有文件
  const idsToRemove = new Set([folder.id]);
  for (const f of files) {
    if (f.parentId === folder.id) idsToRemove.add(f.id);
  }
  useFileStore.setState({ files: files.filter(f => !idsToRemove.has(f.id)) });
}

/**
 * 同步 session 中所有 pad 到 fileStore（用于会话恢复）
 */
export function syncAllPadsToFileStore(session: ChatSession): void {
  const pads = session.thinkingPads || [];
  for (const pad of pads) {
    syncPadToFileStore(pad);
  }
}

// ==================== 工具定义 ====================

export const deepThinkingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'deep_thinking',
    description: `深度分析工具。当 thinking 工具判断任务复杂度高时调用。

⚠️ 首次使用前，先用 skills_list 查看可用技能，再用 activate_skill 加载"深度思考方法论"。activate_skill 会直接在 tool response 中返回完整方法论内容。

管理"3页虚拟纸"的思考空间：
- P1 约束分析 + 意图揣测（.thinking/{标题}/01_约束.md）
- P2 广度枚举（.thinking/{标题}/02_广度.md）：至少3个方案变体
- P3 深度评估（.thinking/{标题}/03_深度.md）：必须给出推荐结论

创建后，使用 read/write/edit 工具操作 .thinking/ 下的虚拟文件。
文件路径使用 create 返回的路径。也可以直接用标题构造路径。
思考内容持久保留，用户可在编辑器中查看。

触发条件（满足任一即应触发）：
- 任务涉及3个以上约束条件
- 需要在多个方案间做选择
- 用户表达了不满或纠正
- 涉及角色/情节/设定的重大变更
- 用户说"仔细想想"/"深度分析"/"认真考虑"`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'view_log'],
          description: 'create=新建思考空间 | list=列出所有思考空间 | view_log=查看变更日志',
        },
        title: {
          type: 'string',
          description: '思考空间标题。仅用简短中文，不含符号、标点、空格。如"主角身份设计"、"风格基调平衡"、"元信息重写"',
        },
        padId: {
          type: 'string',
          description: '思考空间ID（archive/view_log 时需要）',
        },
        page: {
          type: 'string',
          enum: ['p1', 'p2', 'p3'],
          description: '查看哪一页的变更日志（view_log 时使用，默认 p1）',
        },
      },
      required: ['action'],
    },
  },
};

// ==================== 模板内容 ====================

const P1_TEMPLATE = `# P1：约束分析 + 意图揣测

## 用户意图揣测
- 表面：
- 真实意图：
- 未说出的期望：
- 近期信号：

## 约束清单

| # | 约束内容 | 来源 | 类型 | 合理性判断 |
|---|---------|------|------|----------|
| 1 | （待填写） | | | |

## 类型说明
- **硬约束**：有明确证据的绝对规则。尊重但可验证。找到反例 → 降级
- **软约束**：有条件可违反的规则。不是偏好，而是在特定情况下可以打破。主动质疑：违反的条件成立吗？
- **伪约束**：自己假设的、未经确认的。必须找证据推翻

## 约束挑战区
（对每条约束问：这条约束该不该存在？来源可靠吗？前提假设成立吗？推翻后设计空间会更好吗？）

## 回溯记录

## 回溯记录
（在 P2/P3 中发现约束问题时，回到此处更新。记录回溯原因和修改内容）
`;

const P2_TEMPLATE = `# P2：广度探索

## 方案清单

### 方案 A：（待命名）
- **核心思路**：
- **独有价值**（uniqueValue）：
- **极端推演**（推到极限会怎样）：
- **风险**：

### 方案 B：（待命名）
- **核心思路**：
- **独有价值**（uniqueValue）：
- **极端推演**（推到极限会怎样）：
- **风险**：

### 方案 C：（待命名）
- **核心思路**：
- **独有价值**（uniqueValue）：
- **极端推演**（推到极限会怎样）：
- **风险**：

## 差异化检查
（如果两个方案的极端推演场景相同 → 它们是同一个方案，合并）
`;

const P3_TEMPLATE = `# P3：深度收束

## 方案评估

### 方案 A 评估
- 优势：
- 劣势：
- 适用场景：

### 方案 B 评估
- 优势：
- 劣势：
- 适用场景：

### 方案 C 评估
- 优势：
- 劣势：
- 适用场景：

## 最终推荐

**推荐方案：**（必须填写，禁止甩给用户选择）

**理由：**

**tradeoff：** 选择此方案意味着放弃了...

**worstCase：** 最坏情况下会...

**实施建议：**
`;

// ==================== 虚拟文件路径工具 ====================

const THINKING_PREFIX = '.thinking/';

/**
 * 将标题转为文件夹安全名（去特殊字符，空格转下划线）
 */
function titleToSlug(title: string): string {
  return title
    .replace(/[/\\:*?"<>|：＋+（）()【】\[\]{}!！?？.。，,、]/g, '')  // 去掉所有特殊字符
    .replace(/\s+/g, '')                                              // 去空格
    .slice(0, 30);                                                     // 截断30字
}

/**
 * 规范化字符串用于比较（去特殊字符、统一分隔符）
 */
function normalizeForCompare(s: string): string {
  return s.replace(/[/\\:：+＋?？*\"<>|]/g, '').replace(/[\s_\-—]/g, '').toLowerCase();
}

/**
 * 通过路径中的文件夹名查找 pad（支持 padId 精确匹配 + 标题模糊匹配）
 */
function findPadByPathSegment(segment: string, pads: ThinkingPad[]): ThinkingPad | undefined {
  if (pads.length === 0) return undefined;

  // 1. 精确匹配 padId
  const byId = pads.find(p => p.id === segment);
  if (byId) return byId;

  // 2. 精确匹配标题 slug
  const bySlug = pads.find(p => titleToSlug(p.title) === segment);
  if (bySlug) return bySlug;

  // 3. 模糊匹配：规范化后比较
  const normalized = normalizeForCompare(segment);
  return pads.find(p => {
    const normTitle = normalizeForCompare(p.title);
    return normTitle.includes(normalized) || normalized.includes(normTitle);
  });
}

/**
 * 获取 pad 的文件夹名（优先用 slug，便于用户识别）
 */
function getPadFolderName(pad: ThinkingPad): string {
  return titleToSlug(pad.title);
}

/**
 * 判断路径是否为虚拟思考文件
 */
export function isVirtualThinkingPath(path: string): boolean {
  return path.startsWith(THINKING_PREFIX);
}

/**
 * 文件名到 page key 的映射
 */
function filenameToPageKey(filename: string): 'p1_constraint' | 'p2_breadth' | 'p3_depth' | null {
  if (filename.includes('约束') || filename.startsWith('01')) return 'p1_constraint';
  if (filename.includes('广度') || filename.startsWith('02')) return 'p2_breadth';
  if (filename.includes('深度') || filename.startsWith('03')) return 'p3_depth';
  return null;
}

/**
 * 解析虚拟文件路径，返回对应 ThinkingPage 的 content
 * 路径格式：.thinking/{padId_or_title}/{filename}
 * 支持按 padId、标题 slug、或模糊标题匹配查找
 */
export function resolveVirtualFile(path: string, session: ChatSession): string | null {
  const parts = path.replace(THINKING_PREFIX, '').split('/');
  if (parts.length < 2) return null;

  const folderSegment = parts.slice(0, -1).join('/');  // 以防标题里有 /
  const filename = parts[parts.length - 1];
  const pageKey = filenameToPageKey(filename);
  if (!pageKey) return null;

  const pads = session.thinkingPads || [];
  const pad = findPadByPathSegment(folderSegment, pads);
  if (!pad) return null;

  return pad.pages[pageKey].content;
}

/**
 * 获取虚拟文件对应的完整路径列表（用于 listFiles 等场景）
 */
export function listVirtualFiles(session: ChatSession): string[] {
  const pads = session.thinkingPads || [];
  const files: string[] = [];
  for (const pad of pads) {
    const folder = getPadFolderName(pad);
    files.push(
      `${THINKING_PREFIX}${folder}/01_约束.md`,
      `${THINKING_PREFIX}${folder}/02_广度.md`,
      `${THINKING_PREFIX}${folder}/03_深度.md`,
    );
  }
  return files;
}

/**
 * 写入虚拟文件，自动追加 changelog
 */
export function writeVirtualFile(
  path: string,
  newContent: string,
  session: ChatSession,
  action: 'update' | 'append' | 'refine',
): ThinkingPad[] {
  const parts = path.replace(THINKING_PREFIX, '').split('/');
  if (parts.length < 2) return session.thinkingPads || [];

  const folderSegment = parts.slice(0, -1).join('/');
  const filename = parts[parts.length - 1];
  const pageKey = filenameToPageKey(filename);
  if (!pageKey) return session.thinkingPads || [];

  const targetPad = findPadByPathSegment(folderSegment, session.thinkingPads || []);
  if (!targetPad) return session.thinkingPads || [];

  const pads = (session.thinkingPads || []).map(pad => {
    if (pad.id !== targetPad.id) return pad;

    const page = pad.pages[pageKey];
    const oldContent = page.content;

    // 生成 changelog 摘要（取新旧内容差异的前50字）
    const summary = newContent.length > oldContent.length
      ? `新增内容：${newContent.slice(oldContent.length, oldContent.length + 50)}`
      : `更新内容（${newContent.length}字）`;

    const changelogEntry: ChangelogEntry = {
      timestamp: Date.now(),
      action,
      summary: summary.slice(0, 50),
      diff: oldContent.length > 0 && oldContent !== newContent
        ? oldContent.slice(0, 200)
        : undefined,
    };

    return {
      ...pad,
      updatedAt: Date.now(),
      pages: {
        ...pad.pages,
        [pageKey]: {
          content: newContent,
          changelog: [...page.changelog, changelogEntry],
        },
      },
    };
  });

  return pads;
}

// ==================== deep_thinking 工具执行 ====================

interface DeepThinkingArgs {
  action: string;
  title?: string;
  padId?: string;
  page?: string;
}

interface DeepThinkingResult {
  result: string;
  updatedPads?: ThinkingPad[];
}

export function executeDeepThinking(
  args: DeepThinkingArgs,
  session: ChatSession,
): DeepThinkingResult {
  const pads = session.thinkingPads || [];

  switch (args.action) {
    case 'create': {
      const padId = generateId();
      const title = args.title || '未命名思考任务';
      const now = Date.now();

      const createChangelog = (): ChangelogEntry[] => [{
        timestamp: now,
        action: 'create' as const,
        summary: '创建思考空间',
      }];

      const newPad: ThinkingPad = {
        id: padId,
        title,
        pages: {
          p1_constraint: { content: P1_TEMPLATE, changelog: createChangelog() },
          p2_breadth: { content: P2_TEMPLATE, changelog: createChangelog() },
          p3_depth: { content: P3_TEMPLATE, changelog: createChangelog() },
        },
        createdAt: now,
        updatedAt: now,
      };

      const updatedPads = [...pads, newPad];
      syncPadToFileStore(newPad);

      return {
        result: `思考空间已创建：${title}\n\nID: ${padId}\n\n虚拟文件路径（用 read/write/edit 操作）：\n- .thinking/${titleToSlug(title)}/01_约束.md\n- .thinking/${titleToSlug(title)}/02_广度.md\n- .thinking/${titleToSlug(title)}/03_深度.md\n\n请用 read 工具查看模板，用 write/edit 工具填写分析内容。按顺序完成 P1→P2→P3。`,
        updatedPads,
      };
    }

    case 'list': {
      const activePads = pads;
      if (activePads.length === 0) {
        return { result: '当前没有活跃的思考空间。' };
      }

      const lines = activePads.map((pad, idx) => {
        const p1Len = pad.pages.p1_constraint.content.length;
        const p2Len = pad.pages.p2_breadth.content.length;
        const p3Len = pad.pages.p3_depth.content.length;
        const changelogCount =
          pad.pages.p1_constraint.changelog.length +
          pad.pages.p2_breadth.changelog.length +
          pad.pages.p3_depth.changelog.length;
        return `${idx + 1}. [${pad.id.slice(0, 8)}] ${pad.title}\n   P1:${p1Len}字 P2:${p2Len}字 P3:${p3Len}字 | ${changelogCount}次编辑`;
      });

      return { result: `思考空间（${activePads.length}个）：\n\n${lines.join('\n\n')}` };
    }

    case 'view_log': {
      if (!args.padId) {
        return { result: '错误：view_log 操作需要 padId 参数。' };
      }

      const targetPad = pads.find(p => p.id === args.padId);
      if (!targetPad) {
        return { result: `错误：未找到思考空间 ${args.padId}。` };
      }

      const pageKey = (args.page === 'p2' ? 'p2_breadth' : args.page === 'p3' ? 'p3_depth' : 'p1_constraint') as
        | 'p1_constraint' | 'p2_breadth' | 'p3_depth';
      const page = targetPad.pages[pageKey];
      const pageName = pageKey === 'p1_constraint' ? 'P1约束' : pageKey === 'p2_breadth' ? 'P2广度' : 'P3深度';

      if (page.changelog.length === 0) {
        return { result: `${pageName} 页暂无编辑记录。` };
      }

      const logLines = page.changelog.map((entry, idx) => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const diffPreview = entry.diff ? `\n     旧内容: ${entry.diff.slice(0, 80)}...` : '';
        return `${idx + 1}. [${time}] ${entry.action} — ${entry.summary}${diffPreview}`;
      });

      return {
        result: `${targetPad.title} — ${pageName}页编辑历史（${page.changelog.length}条）：\n\n${logLines.join('\n')}`,
      };
    }

    default:
      return { result: `错误：未知操作 "${args.action}"。支持的操作：create, list, view_log` };
  }
}
