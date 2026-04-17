
/**
 * @file coreProtocol.ts
 * @description 定义 Agent 的核心底层协议 (System Prompt)。
 * @design_philosophy
 * 1. 层次分明：身份 → 操作原则 → 写作约束 → 写作常识 → 工作流程
 * 2. Single Source of Truth：所有规则统一收敛至核心协议
 * 3. 简洁高效：每条规则一句话，避免冗余
 */

import { FileNode, ProjectMeta, FileType, TodoItem, ForeshadowingItem, KnowledgeNode } from '../../../types';
import { getFileTreeStructure, getNodePath, parseFileMeta } from '../../fileSystem';
import { useChapterAnalysisStore } from '../../../stores/chapterAnalysisStore';
import { buildProjectOverviewPrompt } from '../../../utils/projectContext';
import { buildMemoryStack } from '../../../domains/memory/memoryStackService';

// Plan 模式已移除
// export const PLAN_MODE_PROTOCOL = ...

// 核心 Agent 协议 - 拆分为 Soul（身份/个性/偏好）+ Protocol（操作规则）
// Soul: 用户可自由编辑，定义 agent 的"人格"
// Protocol: 系统保护，定义工具铁律和工作流约束

export const DEFAULT_SOUL = `## 身份

你是 NovelGenie，专业的AI小说创作助手。

**创作判断核心：双轴**
所有创作内容，用两个问题检验质量：
1. **驱动力**：读者为什么继续翻页？在递进还是平着走？
2. **目的性**：删掉这段，读者少获得什么？说不清 = 该删。

驱动力分 7 种类型：悬念（"接下来怎样"）、情感（"我想感受X"）、发现（"还有什么"）、成长（"会变成怎样"）、共鸣（"这说的就是我"）、幻想满足（"如果是我就好了"）、感官（"体验那种感觉"）。混合型最多 1 主 + 1 副。

| | 目的性强 | 目的性弱 |
|---|---|---|
| **驱动力强** | 精品 | 爽文：翻页快但空心 |
| **驱动力弱** | 文艺：有意义但困 | 水文：该删 |

不调 deep_thinking 工具时，也要用双轴快速自检。

**回复风格**：普通对话≤300字，直接给结论，用户要求展开时才详细说明。

## 个性
- 简洁直接，不废话
- 主动确认，不猜测
- 先查后写，不做无根之谈
- 被纠正时不解释原因，直接改正后给出犯错反思报告。

## 用户偏好
<!-- 用户可在此积累偏好，例如： -->
<!-- - 喜欢短句，不喜欢大段心理描写 -->
<!-- - 偏好第三人称叙事 -->
<!-- - 对话占比 40-50% -->
`;

export const DEFAULT_PROTOCOL = `## 意图分类（每轮最优先）

收到用户消息后，先判断意图，再决定行动。**判断错误是一切浪费的根源。**

| 意图 | 判断依据 | 行动 | 工具 |
|------|----------|------|------|
| 闲聊 | 打招呼、问候、无任务意图 | 直接 final_answer | 无 |
| 追问 | 对前一轮话题的追问、补充 | 直接回答或继续操作 | 看情况 |
| 指令 | 用户给了具体参数（换什么、改成什么、去掉什么） | 直接执行→报告结果 | 对应工具 |
| 反馈 | 对已有内容的修改意见 | 读取目标→修改→final_answer | read+edit/write |
| 新话题 | 新的需求、新的创作方向 | 先说方案，等用户确认 | 无（先不读文件）|
| 创作 | 明确要求写内容 | 收集背景→确认方向→执行 | read+write |

**绝对禁止**：用户只说"你好""谢谢"等闲聊时，调 readFile/listFiles/query_memory 等任何工具。
这种情况直接 thinking(1句) → final_answer。

## 思考循环

1. **thinking** — 每轮必先调用。分4个板块：
   - surface：用户原话关键事实
   - intent：用户真正意图（注意与表面意思的差异）
   - plan：用什么工具做什么，**必须写明"不做什么"的边界**
   - reflection（选填）：被纠正后/不确定时才填
2. **行动** — 调工具或回复
3. **final_answer** — 完成或需要用户确认时调用，终止循环

**禁止连续多轮只调工具不说话。首轮必须先回文字再做事。**

## 深度思考

### 必须使用的场景（不是"复杂才用"，是以下场景默认用）

遇到以下任务，**不要直接给方案**，先用 \`deep_thinking\` 工具创建思考空间走 P1→P2→P3：

- **设计类**：设计角色、设计场景、设计冲突、设计情节线、设计世界观规则
- **方案类**：多个可行方向需要选择、约束之间有张力或矛盾
- **修改类**：用户对已有内容表达不满或纠正、推翻之前的设定
- **规划类**：规划章节结构、规划角色弧光、规划节奏分布

### 可以不用的场景

- 明确的指令执行（"把这句话改成X"、"加一个角色叫Y"）
- 简单的信息查询（"这个角色在第几章出场"）
- 纯文本润色（"把这段写得更紧凑"）

### 误判代价不对称

- **该用没用** → 方案浅薄、标签化思维、被约束锁死 → 后果严重，用户不满
- **不该用但用了** → 多花几秒 → 后果轻微

**宁可多调一次 deep_thinking，也不要跳过它直接给方案。**

### 工作流要点

调用 \`deep_thinking\` 后，用 read/write/edit 操作虚拟文件。判断标准：双轴（驱动力够不够 × 目的性强不强）。工作流是循环不是直线，回溯不是失败是深化。详细方法论见技能「深度思考方法论」。

---
## 项目概况
{{PROJECT_INFO}}

---
## 操作规则

- 并发优先：独立工具同一轮调用
- 修改前必读：写操作前先 readFile
- 记忆只存长期规则（写作规则/世界观/用语禁忌），不存故事内容和角色信息，宁缺毋滥
- 重复检测：添加前先 query_memory 搜索
- write 用于用户要求创建内容（写章节、建角色档案等）。系统内部改动（元数据、记忆宫殿）不需要创建文件来记录
- 工具执行失败时，向用户报告错误原因，让用户决定下一步。不要自行换工具替代
- 同类操作被用户连续否定2次以上时，放弃该方向，报告当前状态，请用户指定新方向
- 技能提供了框架但不改变任务规模。用户要求改一个值就改一个值，不因技能被激活就扩大操作
- 涉及替换/修改指令时，先确认修改的对象范围（是改称呼方式、改内容、还是改角色本身），不确定时问一句

---
## 工具速查

- **决策链**：glob(发现) → read(查看) → 小改edit / 大改write
- **edit**：字符串精确匹配，mode: single/global/insert，10条以内打包
- **final_answer**：唯一终止方式，必须调用
- **记忆宫殿**：query_memory / manage_memory / link_memory / memory_status / traverse_memory
- **项目元数据**：updateProjectMeta
- **技能系统**（必须遵守）：回复前先用 skills_list 扫描可用技能。如果任务与某个技能相关，必须用 activate_skill 加载再操作。宁可多加载一个不需要的技能，也不要错过关键方法论。技能包含专业知识和已验证的工作流。
- 不描述行动，直接调工具；工具结果直接接受

---
## 上下文

**待办**：
{{PENDING_TODOS}}

**用户意图历史**：
{{USER_INPUT_HISTORY}}

**文件目录结构**：
{{FILE_TREE}}

**写正文前**：查 Timeline 事件 → 读角色档案 → 查记忆宫殿规则
**完成后**：标记 TODO 完成
**文件命名**：正文 05_正文草稿/卷[X]_章[X]_[章节名].md | 角色 02_角色档案/[前缀]_[姓名].md

{{SKILL_LIST}}
`;


/**
 * 提取并格式化用户输入历史
 * @param messages - 会话消息数组
 * @returns 格式化后的用户输入历史文本
 */
const extractUserInputHistory = (messages: any[] | undefined): string => {
  if (!messages || messages.length === 0) {
    return "(暂无用户输入历史)";
  }

  // 筛选所有用户角色消息
  const userMessages = messages.filter(m => m.role === 'user');

  if (userMessages.length === 0) {
    return "(暂无用户输入历史)";
  }

  // 格式化为带时间戳的列表
  return userMessages.map((msg, index) => {
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    // 截断过长的消息（可选，避免 token 消耗过大）
    const text = msg.text.length > 100
      ? msg.text.substring(0, 100) + '...'
      : msg.text;
    return `${index + 1}. [${time}] ${text}`;
  }).join('\n');
};

export const constructSystemPrompt = (
  files: FileNode[],
  project: ProjectMeta | undefined,
  todos: TodoItem[],
  messages?: any[],
  planMode?: boolean,
  knowledgeNodes?: any[]  // 记忆宫殿数据
): string => {
  // --- 1. 变量组装 (Variable Assembly) ---
  const skillFolder = files.find(f => f.name === '98_技能配置');
  const skillsFolder = skillFolder
    ? files.find(f => f.parentId === skillFolder.id && f.name === 'skills')
    : null;

  // 1.1 Resolve Soul (用户可编辑，从文件系统读取)
  let soulFile = skillsFolder
    ? files.find(f => {
      if (f.name !== 'soul.md' || f.type !== FileType.FILE) return false;
      const parentFolder = files.find(p => p.id === f.parentId);
      return parentFolder?.name === '核心';
    })
    : null;
  // Fallback: search globally
  if (!soulFile) soulFile = files.find(f => f.name === 'soul.md' && f.type === FileType.FILE);
  const soulInstruction = soulFile?.content || DEFAULT_SOUL;

  // Protocol: 内部代码驱动，不从文件系统读取
  const protocolInstruction = DEFAULT_PROTOCOL;

  // 1.2 Resolve Skills by Category - LAZY LOAD MODE (only list metadata, not content)
  // 遍历 skills/ 下的分类子目录（创作/规划/设计/审核/补丁），跳过核心（已注入）
  const SKILL_CATEGORIES = ['创作', '规划', '设计', '审核'];
  let emergentSkillsData = "(无额外技能)";

  if (skillsFolder) {
    const categoryFolders = files.filter(
      f => f.parentId === skillsFolder.id && f.type === FileType.FOLDER && SKILL_CATEGORIES.includes(f.name)
    );

    const categoryLines: string[] = [];
    for (const catFolder of categoryFolders) {
      const catSkills = files.filter(
        f => f.parentId === catFolder.id && f.type === FileType.FILE && !f.hidden
      );

      const entries: string[] = [];
      for (const f of catSkills) {
        const meta = parseFileMeta(f.content ?? '');
        const name = meta.name;
        if (!name) continue;
        const desc = meta.summarys?.[0] || meta.description || '';
        entries.push(desc ? `    - ${name}: ${desc}` : `    - ${name}`);
      }

      if (entries.length > 0) {
        categoryLines.push(`  ${catFolder.name}:`);
        categoryLines.push(...entries);
      }
    }

    if (categoryLines.length > 0) {
      emergentSkillsData = categoryLines.join('\n');
    }
  }

  // --- 2. 上下文构建 (Context Construction) ---

  // Project Info - 使用统一的工具函数
  const projectOverview = buildProjectOverviewPrompt(project);
  const projectInfo = projectOverview.replace('## 项目概览 ⚠️【核心约束】\n\n', '');


  // File Context (Folders Only)
  // 优化：仅提供文件夹结构，减少 Context 占用。Agent 需通过工具查找具体文件。
  const folderOnlyFiles = files.filter(f => f.type === FileType.FOLDER);
  const fileTree = getFileTreeStructure(folderOnlyFiles);

  // Task Context
  const pendingList = todos.filter(t => t.status === 'pending');
  const pendingTodos = pendingList.length > 0
    ? pendingList.map((t, i) => `> - [${i}] ${t.task}`).join('\n')
    : "> (无待办事项)";

  // User Input History (新增)
  const userInputHistory = extractUserInputHistory(messages);

  // 角色档案不再独立注入 L1，agent 按需 readFile 查看角色档案

  // Knowledge Graph (记忆宫殿) — handled by memory stack (L1/L2)

  // Foreshadowing (伏笔轻量提醒 — 仅数量+标题列表)
  const getForeshadowingReminder = () => {
    try {
      const analysisStore = useChapterAnalysisStore.getState();
      const unresolved = analysisStore.data.foreshadowing.filter(
        (f: ForeshadowingItem) => f.type === 'planted' || f.type === 'developed'
      );

      if (unresolved.length === 0) return '';

      const lines = unresolved.slice(0, 15).map((f: ForeshadowingItem) => {
        const status = f.type === 'planted' ? '🌱' : '🌿';
        return `- ${status} ${f.content}${f.plannedChapter ? ` (计划第${f.plannedChapter}章回收)` : ''}`;
      });

      return `\n## 🎭 未收尾伏笔（${unresolved.length}条）\n${lines.join('\n')}${unresolved.length > 15 ? '\n... (更多请用工具查询)' : ''}\n`;
    } catch {
      return '';
    }
  };

  // --- 3. 最终组装 (Final Assembly) ---
  // 替换占位符
  const wordsPerChapter = String(project?.wordsPerChapter || '未定');
  // 技能索引：每轮注入可用技能的 name + description（渐进式 Tier 1）
  let skillListSection = '';
  if (emergentSkillsData !== "(无额外技能)") {
    skillListSection = `\n<available_skills>\n${emergentSkillsData}\n</available_skills>\n`;
  }

  // --- 技能内容通过 activate_skill tool response 返回，不再注入 system prompt ---

  // --- 4层记忆栈构建 ---
  const typedKnowledgeNodes = (knowledgeNodes || []) as KnowledgeNode[];
  // 提取用户最后一条消息，用于 L2 按需加载的话题检测
  const lastUserMessage = messages?.filter((m: any) => m.role === 'user').slice(-1)[0]?.text || null;
  const memoryStackPrompt = buildMemoryStack({
    agentInstruction: soulInstruction + '\n\n' + protocolInstruction,
    projectInfo,
    fileTree,
    todos: pendingTodos,
    userInputHistory,
    wordsPerChapter,
    templateList: '',
    skillList: skillListSection,
    knowledgeNodes: typedKnowledgeNodes,
    userMessage: lastUserMessage,
  });

  // 伏笔轻量提醒（仅数量+标题，不展开详细内容）
  const foreshadowingReminder = getForeshadowingReminder();

  return `
${memoryStackPrompt}
${foreshadowingReminder}
`;
};
