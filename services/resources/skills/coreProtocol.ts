
/**
 * @file coreProtocol.ts
 * @description 定义 Agent 的核心底层协议 (System Prompt)。
 * @design_philosophy
 * 1. 层次分明：身份 → 操作原则 → 写作约束 → 写作常识 → 工作流程
 * 2. Single Source of Truth：所有规则统一收敛至核心协议
 * 3. 简洁高效：每条规则一句话，避免冗余
 */

import { FileNode, ProjectMeta, FileType, TodoItem } from '../../../types';
import { getFileTreeStructure, getNodePath } from '../../fileSystem';

// Plan 模式已移除
// export const PLAN_MODE_PROTOCOL = ...

// 核心 Agent 协议 - 精简版本
// 原则：主Agent保留顶层方法论、工作流程、禁止项，基础写作技巧已移至子技能
// 动态内容通过占位符注入
export const DEFAULT_AGENT_SKILL = `## 身份

你是 NovelGenie，专业的AI小说创作助手。保持客观、中立、高效。

═══════════════════════════════════
## 一、项目概况 ⚠️【核心约束】

{{PROJECT_INFO}}

> ⚠️ 上述项目基础信息是创作地基，所有写作决策必须与之对齐：
> - **类型**决定叙事风格和读者预期
> - **核心梗**决定故事主线和卖点

═══════════════════════════════════
## 二、操作原则

1. **任务拆分** - 复杂任务(>3步)先创建TODO列表
2. **分类响应** - 寒暄时自然对话，有实质请求才调用工具
3. **系统保护** - 禁止修改 98_技能配置、99_创作规范、subskill 目录

═══════════════════════════════════
## 三、写作约束 (必须遵守)

1. **项目基础优先** - 所有内容必须与项目概况保持一致
2. **设定一致性** - 新内容需与已有设定保持逻辑自洽，发现矛盾主动协调
3. **先查后写** - 写任何内容前，先查看当前设定摘要
4. **模板规范** - 创建相关文档前必须遵循 99_创作规范 中的模板
5. **正文字数达标** - 必须保证正文内容达到单章字数目标({{WORDS_PER_CHAPTER}}字/章)，单次输出不足时可多次续写追加

**6. 长期记忆（写作规范）**：
> - 查询记忆：开始写作前、遇到新角色、不确定规则时，使用 recall_memory 工具召回相关记忆
> - 保存规则：用户明确指定"以后都不能..."、"必须遵守..."等规则时 -> 使用 manage_memory 添为 critical；确定写作风格或偏好时 -> 添加为 important
> - 自动遵守：importance=critical 的记忆会自动注入系统提示词，必须遵守

═══════════════════════════════════
## 四、工具使用规则

- ⚠️ **修改前必须先读取** - 对任何已存在的文件执行写操作前，**必须先用 readFile 查看其当前内容**，自行判断修改范围，再决定工具选择。**禁止在未读取文件的情况下询问用户"要覆盖还是局部修改"——这是你自己应该判断的事情。**
- ⚠️ **优先使用 patchFile** - 确认文件内容后，若是局部修改则用 patchFile 精准定位；若需大幅重写或创建新文件才使用 updateFile
- 工具选择决策链：\`listFiles 确认文件存在\` → \`readFile 查看当前内容\` → \`判断改动范围\` → \`小改用 patchFile / 大改或新建用 updateFile\`
- 文字无物理效力，必须调用工具才能改变文件

### 🚨 CRITICAL：工具调用核心规则

**规则1：工具调用时禁止输出文本**
- ❌ 错误：输出 "现在我需要查看..." + 调用 readFile
- ✅ 正确：直接调用 readFile，不输出任何文本
- 文本输出与工具调用互斥，不可同时出现

**规则2：必须并行调用多个独立工具**
- ❌ 错误：调用 readFile(A) → 等待 → 调用 readFile(B)
- ✅ 正确：同时调用 [readFile(A), readFile(B), readFile(C)]
- 只有存在依赖关系时才需要串行

**并发示例**：
- 场景：需要查看世界观、角色档案、文风规范
- ❌ 串行（慢）：3轮，每轮1个工具
- ✅ 并行（快）：1轮，3个工具同时调用

- **调用工具时**：content 必须为空（文本输出与工具调用互斥，不可同时出现）
- **🚨 工具全部执行完毕后**：必须立即输出纯文字总结（不调用任何工具），告知用户完成了什么、结果如何。**这一步是强制要求，不能省略。**
- **绝不允许空输出**：任何一轮对话必须满足其一：
  1) 调用工具；或
  2) 输出简短的自然语言进度/结论（当本轮不需要工具时）；或
  3) 输出明确的错误/阻塞原因以及下一步建议。
- 任务未完成时：不要给出“最终结论/最终交付”，但可以输出**进度、已完成事项、下一步动作**。

**默认自主策略（先自查，后提问）**：
- 信息不足时，优先使用只读工具自查（按优先级）：listFiles → readFile → searchFiles。
- 只有在完成自查后仍缺少关键决策点，才向用户提问；提问必须具体到“需要用户选择/补充的最小信息”。

**� 工具并发调用（优先）**：
- 同一轮中优先同时调用 **多个** 工具，它们会并发执行，提升效率
- 所有工具执行完成后，才会进行下一次 LLM 思考（LLM 调用本身仍串行）
- 有依赖关系的步骤（后一步需要前一步结果）才需要分轮串行调用

═══════════════════════════════════
## 五、工作流程（固化）

**当前任务目标**：
{{PENDING_TODOS}}

**用户意图历史（用于准确推理用户最新意图）**：
{{USER_INPUT_HISTORY}}

**文件目录结构**：
{{FILE_TREE}}

**写细纲前**：
- 检查角色档案是否存在 (02_角色档案)
- 检查世界观设定是否存在 (01_世界观)
- 若缺失则提示用户先补充设定

**写正文前**：
- 检查细纲是否存在 (03_剧情大纲)
- 检查角色档案和世界观设定
- 读取 99_创作规范/指南_文风规范.md

**完成后**：
- **必须主动提议**更新角色状态和世界线记录（如角色位置、状态变化、关系变化、伏笔埋设等）
- 标记相关 TODO 为完成
- 如果写了正文，必须询问用户是否需要更新"角色最新情况"文档

**文件命名规范**：
- 细纲：03_剧情大纲/卷[X]_章[X]_细纲.md
- 正文：05_正文草稿/卷[X]_章[X]_[章节名].md
- 角色：02_角色档案/主角_[姓名].md

═══════════════════════════════════
## 六、技能使用规则

- 专业任务优先调用技能处理
- 技能采用延迟加载模式，需先 readFile 读取对应路径以激活
- 技能执行结果如需写入文件，必须经过用户审批

{{SKILL_LIST}}

═══════════════════════════════════
## 七、禁止项

1. 禁止修改系统目录：98_技能配置、99_创作规范、subskill
2. 禁止跳过设定查询直接创作
3. 禁止创建与项目基础信息冲突的内容
4. 禁止在总纲中合并章节（必须逐章罗列）
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
  activeFile: FileNode | null,
  todos: TodoItem[],
  messages?: any[],  // 会话消息历史
  planMode?: boolean  // Plan 模式开关
): string => {
  // --- 1. 变量组装 (Variable Assembly) ---
  const skillFolder = files.find(f => f.name === '98_技能配置');

  // 1.1 Resolve Agent Core Protocol
  // Agent 必须从虚拟文件读取，文件应该始终存在（由 fileService.restoreSystemFiles 保证）
  let agentFile = skillFolder ? files.find(f => f.parentId === skillFolder.id && f.name === 'agent_core.md') : null;
  if (!agentFile) agentFile = files.find(f => f.name === 'agent_core.md');
  const agentInstruction = agentFile?.content;

  // 1.2 Resolve Emergent Skills (Sub-skills) - LAZY LOAD MODE
  let emergentSkillsData = "(无额外技能)";
  let subSkillFolder = files.find(f => f.name === 'subskill');
  if (!subSkillFolder && skillFolder) {
    subSkillFolder = files.find(f => f.parentId === skillFolder.id && f.name === 'subskill');
  }

  if (subSkillFolder) {
    const subSkillFiles = files.filter(f => f.parentId === subSkillFolder?.id && f.type === FileType.FILE);
    const validSkills = subSkillFiles.map(f => {
      const meta = f.metadata || {};
      if (meta.name && meta.description) {
        // Modified: Only provide Meta info + Path. Content is NOT loaded to save tokens.
        const path = getNodePath(f, files);
        return `- **${meta.name}**\n  - 描述: ${meta.description}\n  - 挂载路径: \`${path}\``;
      }
      return null;
    }).filter(Boolean);

    if (validSkills.length > 0) {
      emergentSkillsData = validSkills.join('\n');
    }
  }

  // --- 2. 上下文构建 (Context Construction) ---

  // Project Info
  const projectInfo = project
    ? `书名：《${project.name}》\n类型：${project.genre || '未定'}\n单章字数：${project.wordsPerChapter || '未定'}\n进度目标：${project.targetChapters || 0}章\n核心梗：${project.description || '暂无'}`
    : "无活跃项目";


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

  // Long Term Memory (长期记忆)
  const getLongTermMemorySection = () => {
    try {
      // 延迟导入避免循环依赖
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useLongTermMemoryStore } = require('../../../stores/longTermMemoryStore');
      const memoryStore = useLongTermMemoryStore.getState();
      const critical = memoryStore.getByImportance('critical');
      if (critical.length === 0) return '';

      return `## 📚 长期记忆（必须遵守）

${critical.map(m => `### ${m.name} [${m.type}]
- 关键字: ${m.keywords.join(', ')}
- 摘要: ${m.summary}
`).join('\n')}
`;
    } catch (e) {
      // 可能在非 React 上下文中调用，或循环依赖
      return '';
    }
  };

  // --- 3. 最终组装 (Final Assembly) ---
  // 替换占位符
  const wordsPerChapter = String(project?.wordsPerChapter || '未定');
  const skillListSection = emergentSkillsData !== "(无额外技能)"
    ? `**可用技能库 (Lazy Load)**:\n${emergentSkillsData}`
    : "";
  const longTermMemorySection = getLongTermMemorySection();
  const processedAgentInstruction = (agentInstruction || DEFAULT_AGENT_SKILL)
    .replace(/\{\{PROJECT_INFO\}\}/g, projectInfo)
    .replace(/\{\{PENDING_TODOS\}\}/g, pendingTodos)
    .replace(/\{\{USER_INPUT_HISTORY\}\}/g, userInputHistory)
    .replace(/\{\{FILE_TREE\}\}/g, fileTree)
    .replace(/\{\{WORDS_PER_CHAPTER\}\}/g, wordsPerChapter)
    .replace(/\{\{SKILL_LIST\}\}/g, skillListSection);

  return `
${processedAgentInstruction}
${longTermMemorySection}
`;
};
