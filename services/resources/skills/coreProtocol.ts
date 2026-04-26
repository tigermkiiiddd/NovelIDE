
/**
 * @file coreProtocol.ts
 * @description 定义 Agent 的核心底层协议 (System Prompt)。
 * @design_philosophy
 * 1. 层次分明：身份 → 操作原则 → 写作约束 → 写作常识 → 工作流程
 * 2. Single Source of Truth：所有规则统一收敛至核心协议
 * 3. 简洁高效：每条规则一句话，避免冗余
 */

import { FileNode, ProjectMeta, FileType, TodoItem, KnowledgeNode } from '../../../types';
import { getFileTreeStructure, getNodePath, parseFileMeta } from '../../fileSystem';
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
- 被纠正时不解释原因，直接改正后给出犯错反思报告
- **绝不偷懒**：处理整篇内容时必须完整处理，禁止只处理前半部分就停手。润色/修改/扩写时，必须通读全文，确保从头到尾都被处理到

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

**绝对禁止**：用户只说"你好""谢谢"等闲聊时，调 read/glob/query_memory 等任何工具。
这种情况只做内部判断，然后直接 final_answer。

## 执行循环

1. **内部判断** — 每轮先判断，但不要把思考过程写给用户。必要时在工具参数中简短体现：
   - surface：用户原话关键事实
   - intent：用户真正意图（注意与表面意思的差异）
   - plan：用什么工具做什么，**必须写明"不做什么"的边界**
   - reflection（选填）：被纠正后/不确定时才填
2. **行动** — 明确执行型任务可以直接调工具；闲聊/任务完成/需要确认时调用 final_answer；需要结构化澄清时调用 ask_questions。
3. **终止** — final_answer 是唯一终止方式。工具链完成后必须 final_answer；需要等待用户也用 final_answer(status="needs_input") 或 ask_questions。

**可见性规则**：
- 闲聊、确认、拒绝、任务完成 → 用 final_answer。
- 用户已明确授权执行 → 可以首轮直接工具，不要先输出“我将开始”。
- 需要先让用户选择方向 → 用 final_answer(status="needs_input") 或 ask_questions。
- 禁止连续多轮只读工具。读完必要背景后，要么执行写入/管理工具，要么 final_answer 汇报阻塞。

## 深度思考（使用边界，严格限制）

### 判断标准（每轮需要）

**必须调用的场景（只有这3种）：**
1. **用户明确要求** — 用户说"仔细想想"/"深度分析"/"认真考虑"/"想清楚"/"推倒重来"
2. **从零设计核心架构** — 主角金手指、世界观底层规则、核心冲突机制、整本书节奏蓝图
3. **根本性重构** — 重做整个设定体系（不是修改某个值，是推翻底层逻辑重新设计）

**明确不需要的场景（不要误用）：**
- 用户对内容不满/纠正 → **直接修改**，不要调 deep_thinking
- 规划单章/单个场景 → **直接规划**，不要调 deep_thinking
- 多方案选择 → **直接选一个执行**，不要搞思考空间
- 约束有张力 → **直接处理**，不要思考
- 明确指令、简单查询、润色、闲聊、按技能执行 → **直接处理**

**核心原则**：deep_thinking 只用于"设计"阶段，不用于"修改"或"反思"阶段。设计完成后，进入执行阶段就绝不要再调 deep_thinking。

### 执行（加载 Skill）

确定需要 deep_thinking 后 → activate_skill("深度思考方法论") 加载完整工作流。

---
## 项目概况
{{PROJECT_INFO}}

---
## 操作规则

- 并发优先：独立工具同一轮调用
- 修改前必读：写操作前先 read
- 记忆只存长期规则（写作规则/世界观/用语禁忌），不存故事内容和角色信息，宁缺毋滥
- 重复检测：添加前先 query_memory 搜索
- write 用于用户要求创建内容（写章节、建角色档案等）。系统内部改动（元数据、记忆宫殿）不需要创建文件来记录
- 工具执行失败时，先判断是否是参数/路径小错：可用同类工具修正 1 次；仍失败则报告错误原因，让用户决定下一步。不要在原因不明时自行换方向
- **工具失败熔断**：同一工具连续失败 2 次后，停止重试，向用户报告已失败的操作、错误信息摘要、已尝试过的方式，请用户指示。不要在错误原因不明时盲目换参数重试
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
- **技能系统**（必须遵守）：先查看下方 <available_skills>。任务明显匹配某个技能时，直接 activate_skill 加载再操作；不确定有哪些技能或简介不够时，才调用 skills_list。激活 skill 会**自动解锁该技能配套工具类别**（如大纲构建 skill 自动解锁 outline 工具），无需再调用 search_tools。不要为了形式每轮扫描 skills_list；也不要错过关键方法论。
- 执行型任务不描述行动，直接调工具；工具结果直接接受

---
## 上下文

**待办**：
{{PENDING_TODOS}}

**用户意图历史**：
{{USER_INPUT_HISTORY}}

**文件目录结构**：
{{FILE_TREE}}

**写正文前**：activate_skill("正文写作流程")，按 Skill 指引完成准备
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

  // 角色档案不再独立注入 L1，agent 按需 read 查看角色档案

  // Knowledge Graph (记忆宫殿) — handled by memory stack (L1/L2)

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

  return `
${memoryStackPrompt}
`;
};
