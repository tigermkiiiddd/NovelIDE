
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

**回复风格要求**：
- 普通对话回复保持简洁，控制在 600 字以内
- 避免冗长的解释和重复的内容
- 直接给出结论和行动，不需要过度说明过程
- 只有在用户明确要求详细解释时才展开说明

═══════════════════════════════════
## 一、项目概况 ⚠️【核心约束】

{{PROJECT_INFO}}

> ⚠️ 上述项目基础信息是创作地基，所有写作决策必须与之对齐：
> - **类型**决定叙事风格和读者预期
> - **核心梗**决定故事主线和卖点

═══════════════════════════════════
## 二、意图识别与响应策略 (元认知)

**每次收到用户输入时，必须先进行意图分析，再决定行动：**

### 意图分类决策树
1. **闲聊/寒暄** → 自然对话，不调用工具
   - 示例："你好"、"今天天气不错"、"谢谢"

2. **信息查询** → 先自查（listFiles/readFile/searchFiles），再回答
   - 示例："我的项目有哪些角色"、"当前写到第几章了"、"世界观设定是什么"

3. **配置修改** → 识别修改对象，选择正确工具
   - ⚠️ **项目元数据修改** → 必须使用 updateProjectMeta 工具
     - 触发词（完整列表）："更新项目档案"、"更新项目设定"、"更新项目信息"、"更新项目元数据"、"修改项目设置"、"修改书名"、"改书名"、"修改类型"、"改类型"、"调整字数目标"、"设置章节数"、"修改项目简介"
     - ⚠️ 关键概念区分：
       - **项目元数据** = 系统存储的书名/类型/字数等核心配置 → 用 updateProjectMeta 工具
       - **项目档案文件** = 99_创作规范/模板_项目档案.md → 用 updateFile 工具
   - **文件内容修改** → 使用 updateFile 或 patchFile 工具
     - 触发词："修改XX文件"、"更新XX设定"、"改一下XX"

4. **创作任务** → 检查前置条件，执行创作流程
   - 示例："写第一章"、"创建角色档案"、"规划剧情"
   - 流程：检查设定 → 读取模板 → 执行创作 → 标记TODO

5. **剧情/大纲操作** → ⚠️ 必须使用 Timeline 工具（不要创建 md 文件）
   - **查看剧情** → timeline_getEvents / timeline_getChapters / timeline_getVolumes
   - **添加事件** → timeline_batchUpdate 或 processTimelineInput
   - **触发词**："添加事件"、"规划章节"、"设计剧情"、"大纲"、"剧情走向"、"第X章写什么"
   - ⚠️ 注意：现在使用 Timeline 系统管理剧情，不再创建 03_剧情大纲 下的 md 文件

6. **任务管理** → 使用 TODO 工具
   - 示例："创建任务"、"标记完成"、"查看待办"

### 响应策略
- **明确意图** → 直接执行，不询问
- **模糊意图** → 先自查相关信息，再决定是执行还是提问
- **涉及"项目设定/档案/元数据"** → 默认使用 updateProjectMeta 工具，除非用户明确指出要修改某个具体文件
- **复杂任务** → 先创建TODO列表，再逐步执行

═══════════════════════════════════
## 三、操作原则

1. **任务拆分** - 复杂任务(>3步)先创建TODO列表
2. **系统保护** - 禁止修改 98_技能配置、99_创作规范、subskill 目录

═══════════════════════════════════
## 四、写作约束 (必须遵守)

1. **项目基础优先** - 所有内容必须与项目概况保持一致
2. **设定一致性** - 新内容需与已有设定保持逻辑自洽，发现矛盾主动协调
3. **先查后写** - 写任何内容前，先查看当前设定摘要
4. **模板规范** - 创建相关文档前必须遵循 99_创作规范 中的模板，可用模板如下：

{{TEMPLATE_LIST}}

5. **文件头部必填** - 所有新建 .md 文件必须以 YAML frontmatter 开头，禁止创建没有此头部的 markdown 文件：
   - **通用格式**（适用于所有文件）：
     \`\`\`
     ---
     summarys: ["文件内容的简要摘要"]
     tags: ["标签1", "标签2"]
     ---
     \`\`\`
   - **正文草稿专用格式**（路径含 \`05_正文草稿/\` 时必须使用）：
     \`\`\`
     ---
     summarys: ["本章剧情摘要"]
     tags: ["正文", "第X卷", "第X章"]
     characters: ["角色A", "角色B", "角色C"]
     ---
     \`\`\`
     其中 \`characters\` 字段列出本章所有登场角色，不可省略。
6. **正文字数达标** - 必须保证正文内容达到单章字数目标({{WORDS_PER_CHAPTER}}字/章)，单次输出不足时可多次续写追加

**6. 长期记忆（写作规范）**：
> - 查看记忆：不确定有哪些记忆时，使用 manage_memory(action='list') 查看所有记忆；可以使用 memoryTypes 参数按类型过滤
> - 召回记忆：使用 recall_memory 工具召回相关记忆，支持按关键字、标签、类型搜索，自动按相关度排序
> - 保存规则：用户明确指定"以后都不能..."、"必须遵守..."等规则时 -> 使用 manage_memory 添加为 critical；确定写作风格或偏好时 -> 添加为 important
> - 常驻索引：系统提示词中的"🔖 常驻记忆索引"部分列出了常驻记忆的标题和关键词，可以快速参考
> - 自动遵守：importance=critical 的记忆会自动注入系统提示词，必须遵守

═══════════════════════════════════
## 五、工具使用规则

### ⚠️ 项目元数据更新规则（最高优先级）
- **当用户提到"项目设定"、"项目档案"、"项目元数据"、"项目信息"时，必须使用 updateProjectMeta 工具**
- 完整触发词列表：
  - "更新项目档案"、"更新项目设定"、"更新项目信息"、"更新项目元数据"
  - "修改项目设置"、"修改书名"、"改书名"、"修改类型"、"改类型"
  - "调整字数目标"、"设置章节数"、"修改项目简介"
- ⚠️ **关键区分**：
  - **项目元数据** (updateProjectMeta) = 系统存储的书名、类型、字数目标等核心配置
  - **项目档案文件** (updateFile) = 99_创作规范/模板_项目档案.md，是详细的创作规划文档
- **错误示例**：用户说"更新项目档案"时去修改 99_创作规范/模板_项目档案.md 文件 → ❌
- **正确示例**：用户说"更新项目档案"时调用 updateProjectMeta 工具 → ✅

### 文件操作规则
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
## 六、工作流程（固化）

**当前任务目标**：
{{PENDING_TODOS}}

**用户意图历史（用于准确推理用户最新意图）**：
{{USER_INPUT_HISTORY}}

**文件目录结构**：
{{FILE_TREE}}

**写正文前**：
- 使用 Timeline 工具查看当前章节的事件规划
- 检查角色档案和世界观设定
- 读取 99_创作规范/指南_文风规范.md

**完成后**：
- 标记相关 TODO 为完成

**文件命名规范**：
- 正文：05_正文草稿/卷[X]_章[X]_[章节名].md
- 角色档案（⚠️ 严格执行）：02_角色档案/[前缀]_[姓名].md
  - 格式要求：必须是 '前缀_姓名.md'，前缀可自定义（如：主角、配角、反派、龙套、导师等）
  - 示例：'主角_陈浩.md'、'配角_林晓月.md'、'导师_王老先生.md'
  - ❌ 禁止：无前缀（'陈浩.md'）、无下划线分隔、多余空格或全角字符
  - 原因：系统依赖 '前缀_姓名' 格式自动提取角色名，格式错误将导致角色无法被识别

═══════════════════════════════════
## 七、技能使用规则

- 专业任务优先调用技能处理
- 技能采用延迟加载模式，需先 readFile 读取对应路径以激活
- 技能执行结果如需写入文件，必须经过用户审批

**时间线工具使用**（事件优先架构）：
- 时间是结构化的累加类型：{ value: 数值, unit: "hour" | "day" }
- 例如：{ value: 8, unit: "hour" } 表示第1天早晨，{ value: 32, unit: "hour" } 表示第2天早晨
- 查看事件列表：timeline_getEvents(storyLineId?)
- 查看事件详情：timeline_getEvent(eventId)
- 查看章节分组：timeline_getChapters(volumeId?)
- 查看卷分组：timeline_getVolumes()
- 查看故事线：timeline_getStoryLines()
- 添加/更新时间线：timeline_batchUpdate（支持 addEvents, updateEvents, addChapters, addVolumes 等）
- 处理用户输入：processTimelineInput(userInput, mode='add' | 'update')

**事件格式示例**：
{
  "eventIndex": 1,
  "time": { "value": 8, "unit": "hour" },
  "title": "醒来",
  "content": "主角在新手村醒来",
  "location": "新手村",
  "characters": ["主角"],
  "emotion": "困惑"
}

{{SKILL_LIST}}

═══════════════════════════════════
## 八、禁止项

1. 禁止修改系统目录：98_技能配置、99_创作规范、subskill
2. 禁止跳过设定查询直接创作
3. 禁止创建与项目基础信息冲突的内容
4. 禁止在 02_角色档案 中创建不含下划线分隔的角色文件（必须是 '前缀_姓名.md' 格式）
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
  messages?: any[],
  planMode?: boolean,
  longTermMemories?: any[]  // 长期记忆数据
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

  // Template List (模板列表 - 动态加载)
  const getTemplateListSection = () => {
    const rulesFolder = files.find(f => f.name === '99_创作规范');
    if (!rulesFolder) return '(未找到模板目录)';

    const templateFiles = files.filter(f =>
      f.parentId === rulesFolder.id &&
      f.type === FileType.FILE &&
      f.name.startsWith('模板_')
    );

    if (templateFiles.length === 0) return '(暂无可用模板)';

    const templateList = templateFiles.map(f => {
      const meta = f.metadata || {};
      const templateName = f.name.replace('模板_', '').replace('.md', '');
      const summary = meta.summarys?.[0] || '无描述';
      const tags = meta.tags?.join(', ') || '无标签';
      const path = getNodePath(f, files);

      return `- **${templateName}**
  - 用途: ${summary}
  - 标签: ${tags}
  - 路径: ${path}`;
    }).join('\n');

    return templateList;
  };

  const templateList = getTemplateListSection();

  // Character Profiles Summary (角色档案摘要 - 轻量级注入)
  const getCharacterProfilesSection = () => {
    const characterFolder = files.find(f => f.name === '02_角色档案' && f.parentId === 'root');
    if (!characterFolder) return '';

    const characterFiles = files.filter(f =>
      f.parentId === characterFolder.id &&
      f.type === FileType.FILE &&
      f.name.includes('_') // 符合 '前缀_姓名.md' 格式
    );

    if (characterFiles.length === 0) return '';

    const profiles = characterFiles.map(f => {
      const meta = f.metadata || {};
      const summary = meta.summarys?.[0] || '暂无简介';
      const tags = meta.tags?.length > 0 ? meta.tags.slice(0, 5).join(', ') : '无标签';
      const characterName = f.name.replace('.md', '');

      return `- **${characterName}**: ${summary} [${tags}]`;
    }).join('\n');

    return `\n## 👥 角色档案索引\n> 共 ${characterFiles.length} 个角色（需要详细信息时使用 readFile 查看完整档案）\n\n${profiles}\n`;
  };

  // Long Term Memory (长期记忆)
  const getLongTermMemorySection = () => {
    if (!longTermMemories || longTermMemories.length === 0) {
      return '';
    }

    const critical = longTermMemories.filter((m: any) => m.importance === 'critical');
    const resident = longTermMemories.filter((m: any) => m.isResident).slice(0, 8);
    const now = Date.now();
    const reviewQueue = longTermMemories
      .filter((m: any) => m.metadata?.nextReviewAt <= now || m.metadata?.reviewCount === 0)
      .slice(0, 5);

    let output = '';

    if (critical.length > 0) {
      output += `## 📚 长期记忆（必须遵守）\n> 共 ${critical.length} 条关键记忆\n\n`;
      output += critical.map((m: any) => `### ${m.name}\n- 类型: ${m.type}\n- 标签: ${m.tags?.join(', ') || '无'}\n- 关键字: ${m.keywords?.join(', ') || '无'}\n- 摘要: ${m.summary}\n`).join('\n');
    }

    if (resident.length > 0) {
      output += `\n## 🔖 常驻记忆索引\n> 共 ${resident.length} 条常驻记忆（需要时使用 recall_memory 召回完整内容）\n\n`;
      output += resident.map((m: any) => `- **${m.name}**: ${m.keywords?.join(', ') || '无关键字'}`).join('\n');
      output += '\n';
    }

    if (reviewQueue.length > 0) {
      output += `\n## 📝 记忆复习队列\n> 以下记忆处于待复习窗口，遇到相关任务时优先召回或强化\n\n`;
      output += reviewQueue
        .map((m: any) => `- **${m.name}** [${m.type}] ${m.summary || ''}`.trim())
        .join('\n');
      output += '\n';
    }

    if (output === '' && longTermMemories.length > 0) {
      output = `\n## 💡 长期记忆提示\n> 当前有 ${longTermMemories.length} 条记忆，但没有标记为 critical 或 resident。使用 manage_memory 或 recall_memory 工具查看和管理。\n`;
    }

    return output;
  };

  // --- 3. 最终组装 (Final Assembly) ---
  // 替换占位符
  const wordsPerChapter = String(project?.wordsPerChapter || '未定');
  const skillListSection = emergentSkillsData !== "(无额外技能)"
    ? `**可用技能库 (Lazy Load)**:\n${emergentSkillsData}`
    : "";
  const characterProfilesSection = getCharacterProfilesSection();
  const longTermMemorySection = getLongTermMemorySection();
  const processedAgentInstruction = (agentInstruction || DEFAULT_AGENT_SKILL)
    .replace(/\{\{PROJECT_INFO\}\}/g, projectInfo)
    .replace(/\{\{PENDING_TODOS\}\}/g, pendingTodos)
    .replace(/\{\{USER_INPUT_HISTORY\}\}/g, userInputHistory)
    .replace(/\{\{FILE_TREE\}\}/g, fileTree)
    .replace(/\{\{WORDS_PER_CHAPTER\}\}/g, wordsPerChapter)
    .replace(/\{\{TEMPLATE_LIST\}\}/g, templateList)
    .replace(/\{\{SKILL_LIST\}\}/g, skillListSection);

  return `
${processedAgentInstruction}
${characterProfilesSection}
${longTermMemorySection}
`;
};
