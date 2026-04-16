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

## 所属层级：[全局/卷级/章级/场景级]
（不同层级的约束来源和影响范围不同。层级决定了本分析的边界）

## 用户意图揣测
- 表面：
- 真实意图：
- 未说出的期望：
- 近期信号：
- 用户真正想解决的体验问题是什么？用户有这个需求吗，还是我们假设的？

## 顶层一致性
（这个决策和主题/核心矛盾一致吗？它强化了哪个顶层体验，削弱了哪个？如果说不清 → 可能偏离主线）

## 约束清单

| # | 约束内容 | 来源 | 类型 | 置信度 |
|---|---------|------|------|--------|
| 1 | （待填写） | [项目设定/用户指令/创作规范/推理得出] | [硬/软/伪] | 0.0-1.0 |

> 来源标注：[项目设定]=元数据/文件 [用户指令]=用户原话 [创作规范]=技能/记忆 [推理得出]=你的推断
> 类型标注：硬=违反则世界塌 软=有条件可违反 伪=你自己假设的
> 凡是来源写不出用户原文/项目文档的 → 标记为「Agent假设」

## 标签解构（强制步骤，不可跳过）

| 标签 | 我自动联想了什么 | 这个联想来自哪里 | 证据在哪 | 不这样会怎样 |
|------|-----------------|----------------|---------|------------|
| （填写） | | | | |

> 凡是"来源"写不出用户原文/项目文档的 → 标记为「Agent假设」
> Agent假设 = 最危险的伪约束。比用户说的伪约束更危险，因为你自己察觉不到
> 对Agent假设不是"可以挑战"，是必须先证明它成立，否则当作不存在

## 极端化挑战（对每条约束做，三选一）

| # | 约束 | 挑战方法 | 挑战内容 | 结果 | 理由 |
|---|------|---------|---------|------|------|
| 1 | | [反向假设/极端放大/剥离归零] | | [推翻/保留/降级] | |

> 反向假设：把约束反过来，世界会不会塌？塌了=真约束，没塌=假约束
> 极端放大：推到最极端，会不会露馅？露馅了=前提有问题
> 剥离归零：假设这条约束从不存在，从头想，你会得出同样的结论吗？会=逻辑必然，不会=只是惯例

## 驱动力 × 目的性锚定（进入P2前必须完成）

### 驱动力判断
（这个任务靠什么驱动读者？混合型要分主次）

| 驱动类型 | 是否涉及 | 作为主驱动还是副驱动 | 判断依据 |
|---------|---------|-------------------|---------|
| 悬念（"接下来会怎样？"）| 是/否 | 主/副/无 | |
| 情感（"我想感受X"）| 是/否 | 主/副/无 | |
| 发现（"还有什么？"）| 是/否 | 主/副/无 | |
| 成长（"会变成什么样？"）| 是/否 | 主/副/无 | |
| 共鸣（"这说的就是我"）| 是/否 | 主/副/无 | |
| 幻想满足（"如果是我就好了"）| 是/否 | 主/副/无 | |
| 感官（"我想体验那种感觉"）| 是/否 | 主/副/无 | |

**结论：主驱动=[X]，副驱动=[Y/无]**

### 目的性判断
（读者完成后应该获得什么？删掉这个任务，读者少获得什么？）

- 读者获得的体验/感受：
- 读者获得的信息/认知：
- 说得清吗？[能/不能，不能说明目的不明确]

### 顶层支持
（这个决策和主题/核心矛盾一致吗？强化了哪个？偏离了哪个？一票否决项）

---

### 说明
- **为什么要在这做**：P2 的方案变体必须围绕主驱动类型展开，P3 用双轴评估时才能判断"驱动力够不够"。不在 P1 锚定，P2 就是盲人摸象
- **混合型不要偷懒**：如果标了3个以上"主驱动"，说明你还没想清楚。最多1主+1副

## 约束状态追踪（贯穿全程）

| 阶段 | 约束 | 置信度 | 状态 | 变化原因 |
|------|------|--------|------|---------|
| P1 | | | [✅存活/⚠️存疑/❌推翻] | |

> 置信度 < 0.5 的约束不作为后续硬限制
> P2/P3 中置信度骤降 ≥ 0.3 → 触发回溯到 P1

## 回溯记录
（在 P2/P3 中发现约束问题时，回到此处更新。记录回溯原因和修改内容）

---

### 模板各节说明

- **所属层级**：不同层级的思考粒度不同。全局决策影响整部作品，场景级决策只影响当下
- **顶层一致性**：每个决策都要检查它和顶层目标的关系。主题不等于题材
- **标签解构**：防止标签化思维——看到"明星"就联想"优雅"然后当约束。这是整个 P1 最关键的新增步骤
- **极端化挑战**：防止安全区挑战——"白天优雅晚上狂野"还是默认了优雅。挑战必须质疑前提本身
- **约束状态追踪**：约束不是做完 P1 就固定了。P2/P3 的发现会改变约束状态
`;

const P2_TEMPLATE = `# P2：广度探索

## 所属层级：[全局/卷级/章级/场景级]

## 参考作品/案例（2-3个）
| 作品/案例 | 处理方式 | 效果 | 和当前任务的匹配度 |
|---------|---------|------|-------------------|
| | | | 高/中/低 |

> 不是功能对比，是手法匹配度分析：它解决的是什么体验问题？我们的读者有同样的问题吗？

## 顶层一致性
（这组方案强化了哪个顶层体验？削弱了哪个？和主题/核心矛盾的关系？）

---

## 第一步：穷举方案变体

| 变体 | 描述 | 极致体验 | 最小体验 | 独特价值（读者获得什么其他变体给不了的） | 驱动类型 |
|------|------|---------|---------|---------------------------------------|---------|
| A | | | | | [悬念/情感/发现/成长/共鸣/幻想满足/感官] |
| B | | | | | |
| C | | | | | |

> 每个变体必须回答：读者能获得什么新体验？答不上来 = 缺乏存在基础
> 如果一个变体的独特价值完全被另一个变体覆盖 → 标注"重叠于变体X"

---

## 第二步：归纳方向（带体验保护）

### 体验清单（归纳前）
| 变体 | 独特体验 |
|------|---------|
| A | |
| B | |
| C | |

> 这份清单是保护对象。归纳后，清单上的每一项都必须在某个方向中找到落脚点

### 方向归纳
| 方向 | 解决什么体验 | 来源变体 | 边界（这个方向到哪为止） |
|------|------------|---------|---------------------|
| | | | |

### 体验保护检查
| 被合并的变体组 | 体验是否不同？ | 处理方式 | 遗漏风险 |
|--------------|-------------|---------|---------|
| A+B→方向X | 不同/相同 | 不同→方向X中标注需同时容纳两种体验 | 是否有体验在归纳后无落脚点？ |

> 功能相似 AND 体验重叠 → 安全合并
> 功能相似 BUT 体验不同 → 合并但标注"需同时容纳"，第三步中为每种体验设计变体
> 体验清单中任何一项归纳后找不到落脚点 → 标注"遗漏风险"

---

## 第三步：各方向穷举变体
（对每个方向，再次穷举不同的实现方式）

| 方向 | 变体 | 描述 | 极致 | 最小 | 独特体验 |
|------|------|------|------|------|---------|
| 方向A | A1 | | | | |
| 方向A | A2 | | | | |

> 体验回溯：第二步中标注的"需容纳的体验"和"遗漏风险"，在本步是否得到了实现？

---

## 反方案
（不做这个决策/不选这个方向，结果还成立吗？有没有替代手段？）
> 防止路径依赖。如果"不做"的方案更好，就应该不做。

## 方案合规检查

| 方案 | 违反的约束（P1中置信度≥0.5的） | 是否合理 | 处理 |
|------|-------------------------------|---------|------|
| A | | | 回P1/接受/调整方案 |
| B | | | |
| C | | | |

---

### 模板各节说明

- **三步走**：穷举变体→归纳方向→每个方向再穷举。不能跳步。适用于任何创作决策（角色设计、场景选择、风格确定、情节走向等）
- **体验保护**：两个变体可能表面相似但体验完全不同。不能只看功能层面就合并，必须保护每种独特体验
- **反方案**：不做比做更好的情况比你以为的多。如果替代手段能达成同样体验，当前方案就不必要
- **合规检查**：P1 建立的约束不是摆设。违反了就要么方案有问题，要么约束该回P1推翻
`;

const P3_TEMPLATE = `# P3：深度收束

## 所属层级：[全局/卷级/章级/场景级]

## 双轴评估

| 方案 | 驱动力 | 驱动力理由 | 目的性 | 目的性理由 | 判断 |
|------|--------|-----------|--------|-----------|------|
| A | [强/中/弱] | 在递进还是平着走？ | [强/中/弱] | 删掉读者少获得什么？ | [✅Keep/⚠️低优先/❌Discard] |
| B | | | | | |
| C | | | | | |

> 双轴都强 = 精品 | 驱动力强+目的性弱 = 爽文 | 驱动力弱+目的性强 = 文艺 | 都弱 = 水文

## 核心驱动力分析
（推荐方案靠什么驱动读者？主次是什么？）

| 驱动类型 | 触发方式 | 递进机制 | 风险 |
|---------|---------|---------|------|
| [悬念/情感/发现/成长/共鸣/幻想满足/感官] | | 怎么递进而不是平着走？ | 什么情况下驱动力会断？ |

## 读者代入曲线
| 阶段 | 读者状态 | 本方案是否适配 |
|------|---------|-------------|
| 旁观（还在观察） | | 门槛够低吗？ |
| 关注（开始在意） | | 有没有抓手？ |
| 代入（觉得自己是角色） | | 心理参与度够吗？ |
| 沉浸（忘了在看书） | | 节奏是否被打断？ |

## 体验节奏
| 指标 | 评估 |
|------|------|
| 建议体量 | [具体规模，如字数/场景数/章节数。按层级填写] |
| 读者注意力类型 | 代入（主动） / 关注（观察） / 旁观（被动） |
| 节奏模式 | 蓄-放 / 持续 / 递进 / 对比 |
| 是否有对比和喘息？ | |

## 读者心理偏差风险
| 偏差类型 | 问题 | 是否需要应对 |
|---------|------|------------|
| 预期违背 | 读者期待X但给了Y，是惊喜还是失望？| |
| 审美疲劳 | 同样手法用了几次了？读者还吃这套吗？| |
| 代入断裂 | 有没有让读者"出戏"的瞬间？| |
| 道德预判 | 读者会不会提前判断角色"该/不该"？| |

## 变体筛选
| 变体/方向 | 判定 | 理由 |
|----------|------|------|
| | 保留 / 丢弃 / 低优先 | |

## 关键风险
| 风险 | 严重程度 | 应对策略 |
|------|---------|---------|
| | 高/中/低 | |

## 最终推荐

**推荐方案：**（必须填写。禁止"你觉得呢""各有优劣""你来定"）

**理由：**（基于双轴的判断，不是"感觉"）

**tradeoff：** 选择此方案意味着放弃了[什么]，应对策略是[什么]

**worstCase：** 最坏情况下会[怎样]，缓解方法是[什么]

**实施建议：**（具体第一步做什么，关键转折点在哪）

## 回溯触发检查
- 推荐方案和某条约束矛盾？→ 回 P1 检查该约束该不该推翻
- 推荐方案驱动力/目的性不够强？→ 回 P2 找新方案
- P2/P3 中任何约束置信度骤降 ≥ 0.3？→ 回 P1 重新评估

---

### 模板各节说明

- **双轴评估**：核心判断工具。驱动力看"是否递进"，目的性用"删除测试"
- **核心驱动力**：判断驱动类型后，要设计递进机制。平着的驱动 = 没有驱动
- **读者代入曲线**：四个阶段，对应不同设计要求。旁观期要低门槛，沉浸期不能打断
- **体验节奏**：体量按层级填写——全局决策填"多少卷/章"，章级填"多少字/场景"，场景级填"多少句/动作"。关键是具体数字，不是"自然展开"
- **心理偏差风险**：读者不是理性分析机。他们有预期、会疲劳、会出戏、会预判。这些不是bug，是设计参数
- **反模式自检**：对照深度思考方法论中的反模式表，逐条检查本分析是否踩坑
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
