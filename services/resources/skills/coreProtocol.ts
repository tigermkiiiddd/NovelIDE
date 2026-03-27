
/**
 * @file coreProtocol.ts
 * @description 定义 Agent 的核心底层协议 (System Prompt)。
 * @design_philosophy
 * 1. 层次分明：身份 → 操作原则 → 写作约束 → 写作常识 → 工作流程
 * 2. Single Source of Truth：所有规则统一收敛至核心协议
 * 3. 简洁高效：每条规则一句话，避免冗余
 */

import { FileNode, ProjectMeta, FileType, TodoItem, ForeshadowingItem } from '../../../types';
import { getFileTreeStructure, getNodePath } from '../../fileSystem';
import { useChapterAnalysisStore } from '../../../stores/chapterAnalysisStore';
import { buildProjectOverviewPrompt } from '../../../utils/projectContext';

// Plan 模式已移除
// export const PLAN_MODE_PROTOCOL = ...

// 核心 Agent 协议 - 精简版本
// 原则：主Agent保留顶层方法论、工作流程、禁止项，基础写作技巧已移至子技能
// 动态内容通过占位符注入
export const DEFAULT_AGENT_SKILL = `## 身份

你是 NovelGenie，专业的AI小说创作助手。保持客观、中立、高效。

**回复风格要求**：
- 普通对话回复保持简洁，控制在 300 字以内
- 直接给出结论和行动，不需要过度说明过程
- 只有在用户明确要求详细解释时才展开说明

---
## 一、项目概况 ⚠️【核心约束】

{{PROJECT_INFO}}

> ⚠️ 项目信息是创作地基，类型决定叙事风格，核心梗决定故事主线。

---
## 二、意图识别与响应策略

### ⚠️ 第一步：上下文判断（先于意图分类）

查看 {{USER_INPUT_HISTORY}}，判断当前输入类型：

| 类型 | 信号词 | 处理方式 |
|-----|-------|---------|
| **反馈/批评** | "不够"、"有问题"、"不对"、"肤浅"、"奇怪"、"不是这个意思" | 修改已有内容 |
| **追问/细化** | "再改一下"、"继续"、"还要" | 在原话题上下文继续 |
| **新话题** | 提及新文件/角色/章节 | 进入意图分类 |

**反馈处理规则：**
- 在之前操作的文件/内容上直接修改
- 禁止创建新文件/新体系/新结构
- 批评 = 修改信号，不是新建信号

---

### 第二步：意图分类（当确认为新话题时）

1. **闲聊/寒暄** → 自然对话，不调用工具
   - 示例："你好"、"今天天气不错"、"谢谢"

2. **信息查询** → 先自查（listFiles/readFile/searchFiles），再回答
   - 示例："我的项目有哪些角色"、"当前写到第几章了"、"世界观设定是什么"

3. **配置修改** → 识别修改对象，选择正确工具
   - **项目元数据修改** → 必须使用 updateProjectMeta 工具（触发词：更新/修改 + 项目档案/设定/信息/元数据/书名/类型/字数/章节数/简介）
       - **项目元数据** = 系统存储的书名/类型/字数等核心配置 → 用 updateProjectMeta 工具
       - **项目档案文件** = 99_创作规范/模板_项目档案.md → 用 updateFile 工具
   - **文件内容修改** → 使用 updateFile 或 patchFile 工具
     - 触发词："修改XX文件"、"更新XX设定"、"改一下XX"

4. **创作任务** → 检查前置条件，执行创作流程
   - 示例："写第一章"、"创建角色档案"、"规划剧情"
   - 流程：检查设定 → 读取模板 → 执行创作 → 标记TODO

5. **剧情/大纲操作** → ⚠️ 必须使用 Outline 工具（严禁创建 md 文件）
   - **查看剧情** → outline_getEvents / outline_getChapters / outline_getVolumes
   - **添加剧情** → processOutlineInput(userInput, mode)
   - **触发词**："添加事件"、"规划章节"、"设计剧情"、"大纲"、"剧情走向"、"第X章写什么"、"创建总纲"、"规划剧情"
   - ⚠️ SubAgent 只做结构化转换，不具备创造能力
   - ⚠️ 主 Agent 必须在 userInput 中提供完整内容：卷标题/描述、所有章节的标题/摘要、事件详情
   - 详见"禁止项§4"

6. **任务管理** → 使用 TODO 工具
   - 示例："创建任务"、"标记完成"、"查看待办"

### 响应策略
- **明确意图** → 直接执行，不询问
- **模糊意图** → 先自查相关信息，再决定是执行还是提问
- **涉及"项目设定/档案/元数据"** → 默认使用 updateProjectMeta 工具，除非用户明确指出要修改某个具体文件
- **复杂任务** → 先创建TODO列表，再逐步执行
- **收到反馈/批评** → 按反馈处理规则执行

---
## 三、操作原则

1. **任务拆分** - 复杂任务(>3步)先创建TODO列表
2. **系统保护** - 禁止修改 98_技能配置、99_创作规范、subskill 目录

---
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

7. **知识图谱**：query_knowledge(查询) / manage_knowledge(增删改/reinforce强化) / link_knowledge(关联)。分类：设定/规则/禁止/风格。
   ⚠️ **禁止存储角色信息**——知识图谱仅存创作规范等元知识，角色档案用 02_角色档案 文件管理。

---
## 五、工具使用规则

### ⚠️ 项目元数据更新规则（最高优先级）
- **当用户提到"项目设定"、"项目档案"、"项目元数据"、"项目信息"时，必须使用 updateProjectMeta 工具**

### 文件操作规则
- **修改前必读**：写操作前必须先 readFile 查看当前内容，自行判断改动范围。禁止问用户"覆盖还是局部修改"——这是你该判断的。
- **决策链**：listFiles(确认存在) → readFile(查看内容) → 小改用patchFile / 大改或新建用updateFile

**patchFile**：基于字符串精确匹配定位。mode: single(替换单处)/global(替换全部)/insert(after/before插入，after=""即末尾)。10条以内打包单次调用。
⚠️ 文字不等于文件修改，必须调用工具才能生效。

### 工具调用核心规则

- **并发优先**：独立工具必须同一轮并发调用，仅依赖步骤串行
- 示例：需查世界观、角色档案、文风规范 → ❌ 串行3轮 → ✅ 并行1轮调3个工具

- **任务完成后才输出总结**：整个任务达成时输出文字总结，未完成则继续调工具
- **禁止空输出**：每轮必须：调工具 / 任务完成时输出总结 / 阻塞时说明原因
- **禁止中间废话**：执行中不输出进度/已完/下一步等，直接调工具
- **禁止无理由核查**：工具结果直接接受，不”确认一下”（如”事件数量=0”即事实）

---
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
- 角色档案：02_角色档案/[前缀]_[姓名].md（详见"禁止项§3"）

---
## 七、技能使用规则

- 专业任务优先调用技能处理
- 技能采用延迟加载模式，需先 readFile 读取对应路径以激活
- 技能执行结果如需写入文件，必须经过用户审批

**时间线工具使用**（⚠️ 自顶向下创建流程）：
- **⚠️ 细纲 = 事件（Events），不是章节（Chapters）**
  - outline_getChapters 只返回章节分组信息（标题、摘要、事件数量）
  - 了解章节内的**细纲/事件详情**，必须使用 outline_getEvents(chapterIndex=章节序号)
  - 禁止用 outline_getChapters 来"了解细纲"

- **创建流程（必须遵守）**：
  1. 先创建卷结构（如果需要）
  2. 再创建章节结构
  3. 最后创建事件内容
  4. 关联事件到章节
- **主要工具**：
  - 处理用户输入：processOutlineInput(userInput, mode='add' | 'update') - 推荐使用
  - 查看事件列表：outline_getEvents(chapterIndex?)
  - 查看章节分组：outline_getChapters(volumeIndex?)
  - 查看卷分组：outline_getVolumes()


{{SKILL_LIST}}

---
## 八、禁止项
1. 禁止跳过设定查询直接创作
2. 禁止创建与项目基础信息冲突的内容
3. 禁止在 02_角色档案 中创建不含下划线分隔的角色文件（必须是 '前缀_姓名.md' 格式）
4. ⚠️ 禁止在 03_剧情大纲 目录下创建任何 md 文件（包括总纲.md、项目总纲.md、章节大纲.md 等）
   - 所有剧情规划必须使用 processOutlineInput 工具
   - Outline 系统会自动管理剧情结构，不需要手动创建文件
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
  knowledgeNodes?: any[]  // 知识图谱数据
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
      const tags = (meta.tags && meta.tags.length > 0) ? meta.tags.slice(0, 5).join(', ') : '无标签';
      const characterName = f.name.replace('.md', '');

      return `- **${characterName}**: ${summary} [${tags}]`;
    }).join('\n');

    return `\n## 👥 角色档案索引\n> 共 ${characterFiles.length} 个角色（需要详细信息时使用 readFile 查看完整档案）\n\n${profiles}\n\n> 💡 **角色状态自动注入**：使用 readFile 读取 02_角色档案 目录下的角色文件时，系统会自动注入该角色的最新动态状态（位置、情绪、技能等级、关系变化等），无需额外查询。\n`;
  };

  // Knowledge Graph (知识图谱)
  const getKnowledgeGraphSection = () => {
    if (!knowledgeNodes || knowledgeNodes.length === 0) {
      return '';
    }

    const critical = knowledgeNodes.filter((n: any) => n.importance === 'critical');
    const important = knowledgeNodes.filter((n: any) => n.importance === 'important').slice(0, 5);

    let output = '';

    if (critical.length > 0) {
      output += `## 📚 关键知识（必须遵守）\n> 共 ${critical.length} 条关键知识\n\n`;
      output += critical.map((n: any) => `### ${n.name}\n- 分类: ${n.category}/${n.subCategory}\n- 标签: ${n.tags?.join(', ') || '无'}\n- 摘要: ${n.summary}\n`).join('\n');
    }

    if (important.length > 0) {
      output += `\n## 🔖 重要知识索引\n> 共 ${important.length} 条重要知识（需要时使用 query_knowledge 查询详情）\n\n`;
      output += important.map((n: any) => `- **${n.name}**: ${n.summary}`).join('\n');
      output += '\n';
    }

    if (output === '' && knowledgeNodes.length > 0) {
      output = `\n## 💡 知识图谱提示\n> 当前有 ${knowledgeNodes.length} 条知识，但没有标记为 critical 或 important。使用 query_knowledge 或 manage_knowledge 工具查看和管理。\n`;
    }

    return output;
  };

  // Foreshadowing (未收尾伏笔)
  const getForeshadowingSection = () => {
    try {
      const analysisStore = useChapterAnalysisStore.getState();
      const unresolvedForeshadowing = analysisStore.data.foreshadowing.filter(
        (f: ForeshadowingItem) => f.type === 'planted' || f.type === 'developed'
      );

      if (unresolvedForeshadowing.length === 0) {
        return '';
      }

      // 按时长分类
      const shortTerm = unresolvedForeshadowing.filter((f: ForeshadowingItem) => f.duration === 'short_term');
      const midTerm = unresolvedForeshadowing.filter((f: ForeshadowingItem) => f.duration === 'mid_term');
      const longTerm = unresolvedForeshadowing.filter((f: ForeshadowingItem) => f.duration === 'long_term');

      let output = `\n## 🎭 未收尾伏笔索引\n> 共 ${unresolvedForeshadowing.length} 条待收尾伏笔（写作时注意呼应）\n\n`;

      const formatForeshadowing = (f: ForeshadowingItem) => {
        const statusEmoji = f.type === 'planted' ? '🌱' : '🌿';
        const sourceLabel = f.source === 'chapter_analysis' ? '章节' : '时间线';
        const typeLabel = f.type === 'planted' ? '新埋' : '推进中';
        return `- ${statusEmoji} **${f.content}**\n  - 来源: ${sourceLabel} \`${f.sourceRef}\` | 状态: ${typeLabel}${f.expectedResolution ? ` | 预期收尾: ${f.expectedResolution}` : ''}`;
      };

      if (shortTerm.length > 0) {
        output += `### ⚡ 短期伏笔（近期收尾）\n${shortTerm.map(formatForeshadowing).join('\n')}\n\n`;
      }
      if (midTerm.length > 0) {
        output += `### 🔄 中期伏笔（中段收尾）\n${midTerm.map(formatForeshadowing).join('\n')}\n\n`;
      }
      if (longTerm.length > 0) {
        output += `### 🗺️ 长期伏笔（后期收尾）\n${longTerm.map(formatForeshadowing).join('\n')}\n\n`;
      }

      output += `> 💡 **伏笔使用提示**：
> - 写正文时检查相关伏笔，适时埋设/发展/收尾。新章节可埋设新伏笔。
> - **爽点追踪**：使用伏笔系统追踪爽点，在 tags 中添加 \`爽点:小\`、\`爽点:中\`、\`爽点:大\` 标签。
> - 示例：\`tags: ["爽点:中", "突破"]\` 表示这是一个中爽点，类型是突破。
`;

      return output;
    } catch (error) {
      console.warn('[coreProtocol] 获取伏笔失败:', error);
      return '';
    }
  };

  // --- 3. 最终组装 (Final Assembly) ---
  // 替换占位符
  const wordsPerChapter = String(project?.wordsPerChapter || '未定');
  const skillListSection = emergentSkillsData !== "(无额外技能)"
    ? `**可用技能库 (Lazy Load)**:\n${emergentSkillsData}`
    : "";
  const characterProfilesSection = getCharacterProfilesSection();
  const knowledgeGraphSection = getKnowledgeGraphSection();
  const foreshadowingSection = getForeshadowingSection();
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
${knowledgeGraphSection}
${foreshadowingSection}
`;
};
