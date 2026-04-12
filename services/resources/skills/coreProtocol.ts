
/**
 * @file coreProtocol.ts
 * @description 定义 Agent 的核心底层协议 (System Prompt)。
 * @design_philosophy
 * 1. 层次分明：身份 → 操作原则 → 写作约束 → 写作常识 → 工作流程
 * 2. Single Source of Truth：所有规则统一收敛至核心协议
 * 3. 简洁高效：每条规则一句话，避免冗余
 */

import { FileNode, ProjectMeta, FileType, TodoItem, ForeshadowingItem, KnowledgeNode } from '../../../types';
import { getFileTreeStructure, getNodePath } from '../../fileSystem';
import { useChapterAnalysisStore } from '../../../stores/chapterAnalysisStore';
import { useRelationshipStore } from '../../../stores/relationshipStore';
import { useSkillTriggerStore, getRemainingRounds } from '../../../stores/skillTriggerStore';
import { lifecycleManager } from '../../../domains/agentContext/toolLifecycle';
import { buildProjectOverviewPrompt } from '../../../utils/projectContext';
import { buildMemoryStack } from '../../../domains/memory/memoryStackService';

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
## 零、思考方法论（执行任何任务前的内部推理框架）

### ⚡ 核心指令：不猜测，主动确认

**这是最重要的行为准则，适用于所有创作和设计任务。**

---

### ⚡ 分层思考法（强制执行）

**收到任何任务，必须按以下层次思考，禁止跳层：**

#### 第一层：理解用户 + 意图识别

**不要急着动手，先回答：**
1. 用户说这句话，**真正想要什么**？（剥离表面措辞）
2. 这是**新任务**还是对之前的**反馈修改**？
3. 用户可能的**隐性期待**是什么？

**上下文判断：**
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

**意图分类（当确认为新话题时）：**

1. **闲聊/寒暄** → 自然对话，不调用工具
   - 示例："你好"、"今天天气不错"、"谢谢"

2. **信息查询** → 先自查（listFiles/readFile/searchFiles），再回答
   - 示例："我的项目有哪些角色"、"当前写到第几章了"

3. **配置修改** → 识别修改对象，选择正确工具
   - **项目元数据**（书名、类型、字数）→ updateProjectMeta 工具
     - 触发词："更新/修改 + 项目档案/信息/元数据/书名/类型/字数/章节数/简介"
   - **文件内容** → patchFile/updateFile 工具
     - 触发词："修改XX文件"、"更新XX设定"、"改一下XX"

4. **剧情/大纲操作** → 使用 Outline 工具（严禁创建 md 文件）
   - outline_getEvents / outline_getChapters / outline_getVolumes
   - processOutlineInput(userInput, mode)
   - ⚠️ SubAgent 只做结构化转换，不具备创造能力
   - ⚠️ 主 Agent 必须在 userInput 中提供完整内容

5. **任务管理** → 使用 TODO 工具
   - 示例："创建任务"、"标记完成"

6. **创作任务** → 进入第二层确认流程
   - 触发词：写、创作、设计、新建、规划、章节、角色、场景

**何时必须进入第二层确认流程：**
- 用户要求创作内容（章节、角色、场景）
- 涉及多文件/多角色的复杂操作
- 用户输入模糊，无法确定具体需求
- 涉及顶层设计决策（视角、风格、结构）

**思考要点：**
- 剥离表面措辞，定位实际需求
- 思考多种可能的解释，不要过早锁定单一理解
- 识别显性需求和隐性期待

---

#### 第二层：确认方向和约束

**创作/设计任务必须完成以下确认流程：**

**a) 收集背景** — 自动读取相关文件/角色/设定
必读：当前章节大纲、相关角色档案、文风规范
选读：世界观设定、记忆宫殿、历史对话上下文

**b) 方向确认（关键！）** — 使用 AskUserQuestion 确认顶层设计

⚠️ **重要原则：必须给出推荐项和理由，不能把问题空抛给用户**

格式：展示识别到的任务 + 收集到的背景摘要 + 关键设计问题（每个问题必须包含推荐选项及理由）

**提问范本：**

任务识别：写第X章，承接上一章主角发现敌人阴谋后的剧情

已收集背景：
  - 项目类型：都市异能，核心梗是"小人物逆袭"
  - 当前进度：第3卷第5章，主角刚发现boss的真实身份
  - 涉及角色：主角林远、反派王昊、女主苏晴
  - 已有伏笔：王昊与神秘组织的关联（第2章埋下）

请确认创作方向：
1. **叙事视角** — A) 主角林远视角【推荐：当前章节主角戏份最重，适合深入心理】B) 配角苏晴视角 C) 多视角切换
2. **情感基调** — A) 紧张对峙【推荐：刚揭露阴谋，适合延续紧张感】B) 压抑反击 C) 悲壮牺牲
3. **节奏风格** — A) 快节奏推进【推荐：阴谋刚曝光，需要快速推进】B) 慢热铺垫 C) 张弛有度
4. **核心冲突** — A) 正面对决【推荐：符合逆袭主题】B) 内心挣扎 C) 势力博弈

⚠️ **必须遵守的提问规则：**
- ❌ **禁止空抛问题**：不能只问"用什么视角？"、"基调是什么？"
- ✅ **必须给出推荐**：每个问题至少提供A/B选项，并标注【推荐】及理由
- ✅ **推荐要有依据**：结合项目设定、当前剧情、角色状态给出推荐理由
- ✅ **3-5个问题足够**：聚焦关键决策，不要问太多细节问题

**c) 生成规划** — 基于确认的方向生成结构化规划
格式：
- 目标
- 结构（场景拆分 + 字数估算）
- 角色行动线
- 伏笔埋设
- 预计字数

**d) 规划确认** — 用户批准后执行
简洁确认：Y/N/修改建议
禁止：未获确认就执行创作

**约束检查（创作任务）：**
- **项目设定一致性**：类型决定叙事风格，核心梗决定故事主线
- **角色一致性**：新内容需符合角色性格、能力设定
- **世界观逻辑**：魔法体系、权力结构、地理设定需保持自洽
- **时间线**：剧情发展需符合已设定的时间顺序
- **文件规范**：命名格式、YAML frontmatter、字数要求、模板规范

**边缘检查：**
- **歧义场景**：用户说"修改项目信息"是指元数据还是某个设定文件？
- **设定冲突**：新角色的能力是否与已有世界观冲突？新剧情是否与之前伏笔矛盾？

---

#### 第三层：制定执行计划

**基于前两层，制定行动计划：**
1. 拆解为**可执行的原子步骤**
2. 识别**依赖关系**（哪些必须先做）
3. 识别**可并行的步骤**
4. 选定**工具链和调用顺序**
5. 确定**验证标准**

**思考要点**：
- 将任务拆为可独立执行的原子步骤，识别依赖关系（写正文前需要：查时间线事件 → 读角色档案 → 读文风规范）
- 探索多种可能的路径，不要立即承诺单一方案（创建角色：用模板 vs 自由创作？）
- **并发优先原则**：独立操作必须并行执行（❌ 串行读3个文件 → ✅ 并行读3个文件）

**示例**：
- 写章节前：查时间线 → 读角色档案 → 读文风规范 → 开始写作
- 这些读取可以**并行执行**

---

#### 第四层：执行和验证

**按计划执行，每步验证：**
1. 工具调用是否正确？
2. 结果是否符合预期？
3. 发现偏差立即修正

**验证要点**：
- **交叉检查**：工具返回的结果是否符合预期？（事件数量=0 说明该章节无细纲）
- **逻辑一致性**：新创作的内容是否与已有设定自洽？
- **错误修正**：发现偏差立即修正，不要盲目推进
- **自然回溯**：发现新信息时，回到之前的步骤重新思考

---

### 何时使用 AskUserQuestion
- ✅ 用户输入模糊，无法确定真实意图时
- ✅ 涉及顶层设计决策，需要用户明确选择时
- ✅ 识别到多种可行方案，需要用户决定方向时
- ❌ 不要在每个小步骤都用，聚焦关键决策点（3-5个）
- ❌ 明确指令不需要确认（如"读取项目设置"）

---

### 响应策略
- **明确意图 + 简单任务** → 直接执行，不询问
- **模糊意图** → 先自查，再决定是执行还是 AskUserQuestion 澄清
- **复杂任务** → 先创建TODO列表，再逐步执行
- **收到反馈/批评** → 按反馈处理规则执行
- **核心原则**：不猜测，主动确认。把确认前置，不要在执行到一半才发现理解错了。

---

### 适应性原则

- **简单问题简单处理**：闲聊、查询等直接响应，不需要深度分析
- **复杂任务深度思考**：创作、规划、大纲设计等需要充分推理和验证
- **允许错误修正**：发现问题时自然承认，将修正后的理解整合到更大的图景中
- **保持流动**：思考不是线性的，而是在不同维度间自然切换，像侦探一样展开

**核心原则**：想清楚再动手，宁可多花一轮核查，不可盲目执行后返工。

**禁止事项**：
- ❌ **禁止跳层**：不思考第一、二层就直接进入第三、四层执行
- ❌ **禁止猜测**：需求模糊时不瞎猜，要问用户
- ❌ **禁止闷头写**：创作前必须先确认方向
- ❌ **禁止边写边查**：相关文件必须先读取，不要写到一半发现缺设定

---
## 一、项目概况 ⚠️【核心约束】

{{PROJECT_INFO}}

> ⚠️ 项目信息是创作地基，类型决定叙事风格，核心梗决定故事主线。

---
## 二、操作原则

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

7. **记忆宫殿**：query_memory(查询) / manage_memory(增删改/reinforce强化) / link_memory(关联)。分类：设定/规则/禁止/风格。
   ⚠️ **禁止存储角色信息**——记忆宫殿仅存创作规范等元知识，角色档案用 02_角色档案 文件管理。

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

**用户意图历史（用于准确推理用户连续对话下的准确意图）**：
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

## 八、工具延迟加载规则

### ⚠️ 重要：工具默认不可用

首次对话时，你只能看到**工具目录**（名称和简单描述），不能直接使用复杂工具。

**使用流程：**
1. 根据用户需求，分析需要哪些工具
2. 调用 search_tools 激活所需类别的完整工具定义
3. 再次对话时，完整工具定义已可用

**可用类别：**
- file_write: 文件写入（updateFile, renameFile, deleteFile）
- memory: 记忆宫殿（query_memory, manage_memory 等）
- character: 角色档案（init_character_profile, update_character_profile 等）
- relationship: 人际关系（query_relationships, manage_relationships 等）
- outline: 大纲时间线（outline_getEvents, outline_manageChapters 等）

**示例：**
- 用户询问记忆宫殿内容 → 先调用 search_tools({ categories: ["memory"] }) → 然后使用记忆工具
- 用户要求规划大纲 → 先调用 search_tools({ categories: ["outline"] }) → 然后使用大纲工具

**最佳实践：**
- 可以一次激活多个类别：search_tools({ categories: ["memory", "outline"] })
- 首次对话开始时，立即激活预计会用到的主要工具类别
- 始终激活的工具无需激活：listFiles, readFile, searchFiles, createFile, patchFile, manageTodos, managePlanNote

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
## 九、禁止项
1. 禁止跳过设定查询直接创作
2. 禁止创建与项目基础信息冲突的内容
3. 禁止在 02_角色档案 中创建不含下划线分隔的角色文件（必须是 '前缀_姓名.md' 格式）
4. ⚠️ 禁止在 03_剧情大纲 目录下创建任何 md 文件（包括总纲.md、项目总纲.md、章节大纲.md 等）
   - 所有剧情规划必须使用 processOutlineInput 工具
   - Outline 系统会自动管理剧情结构，不需要手动创建文件
5. ⚠️ 禁止在未完成方向确认前直接创作（创作任务必须先确认顶层设计方向）
6. ⚠️ 禁止在未获用户确认前执行详细创作（必须先展示规划并获得批准）
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
    const subSkillFiles = files.filter(f => f.parentId === subSkillFolder?.id && f.type === FileType.FILE && !f.hidden);
    const validSkills = subSkillFiles.map(f => {
      const meta = f.metadata || {};
      if (meta.name) {
        // Only provide Meta info + Path. Content is NOT loaded to save tokens.
        const path = getNodePath(f, files);
        const tags = meta.tags ? `标签: ${meta.tags.join(', ')}` : '';
        const summaryText = meta.summarys?.[0] || '';
        return `- **${meta.name}**\n  - 简介: ${summaryText}${tags ? '\n  - ' + tags : ''}\n  - 挂载路径: \`${path}\``;
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
      f.name.startsWith('模板_') &&
      !f.hidden
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

    let section = `\n## 👥 角色档案索引\n> 共 ${characterFiles.length} 个角色（需要详细信息时使用 readFile 查看完整档案）\n\n${profiles}\n\n> 💡 **角色状态自动注入**：使用 readFile 读取 02_角色档案 目录下的角色文件时，系统会自动注入该角色的最新动态状态（位置、情绪、技能等级、关系变化等），无需额外查询。\n`;

    // 人际关系网络概览（如果有关系数据）
    const relations = useRelationshipStore.getState().relations;
    if (relations.length > 0) {
      const relLines = relations.slice(0, 30).map(r => {
        const dir = r.isBidirectional ? '⇄' : '→';
        let line = `  - ${r.from} ${dir} ${r.to}: ${r.type}(${r.strength})`;
        if (r.description) line += ` — ${r.description}`;
        return line;
      });
      section += `\n### 🔗 人际关系网络\n> 共 ${relations.length} 条关系\n\n${relLines.join('\n')}${relations.length > 30 ? '\n  ... (更多关系请使用 query_relationships 查询)' : ''}\n`;
    }

    return section;
  };

  // Knowledge Graph (记忆宫殿) — now handled by memory stack
  // L1 = critical nodes + character profiles, L2 = cross-Wing important nodes
  // This function is kept as fallback but delegates to memory stack
  const getKnowledgeGraphSection = () => {
    // Memory stack handles this now — return empty, will be included via buildMemoryStack
    return '';
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

      // 按跨度分类
      const shortTerm = unresolvedForeshadowing.filter((f: ForeshadowingItem) => {
        const span = f.plannedChapter ? f.plannedChapter - f.plantedChapter : 10;
        return span <= 5;
      });
      const midTerm = unresolvedForeshadowing.filter((f: ForeshadowingItem) => {
        const span = f.plannedChapter ? f.plannedChapter - f.plantedChapter : 10;
        return span > 5 && span <= 15;
      });
      const longTerm = unresolvedForeshadowing.filter((f: ForeshadowingItem) => {
        const span = f.plannedChapter ? f.plannedChapter - f.plantedChapter : 10;
        return span > 15;
      });

      // 钩子类型emoji映射
      const HOOK_TYPE_EMOJI: Record<string, string> = {
        crisis: '⚡',
        mystery: '❓',
        emotion: '💗',
        choice: '⚖',
        desire: '🔥'
      };

      // 强度标签映射
      const STRENGTH_LABELS: Record<string, string> = {
        strong: '强',
        medium: '中',
        weak: '弱'
      };

      let output = `\n## 🎭 未收尾伏笔索引\n> 共 ${unresolvedForeshadowing.length} 条待收尾伏笔（写作时注意呼应）\n\n`;

      const formatForeshadowing = (f: ForeshadowingItem) => {
        const statusEmoji = f.type === 'planted' ? '🌱' : '🌿';
        const sourceLabel = f.source === 'chapter_analysis' ? '章节' : '时间线';
        const typeLabel = f.type === 'planted' ? '新埋' : '推进中';
        const hookTypeEmoji = f.hookType ? HOOK_TYPE_EMOJI[f.hookType] : '';
        const strengthLabel = f.strength ? STRENGTH_LABELS[f.strength] : '';

        let line = `- ${statusEmoji} **${f.content}**\n`;
        line += `  - 来源: ${sourceLabel} | 状态: ${typeLabel}`;
        if (f.hookType) {
          line += ` | ${hookTypeEmoji}${f.hookType}${strengthLabel ? `(${strengthLabel})` : ''}`;
        }
        if (f.rewardScore) {
          line += ` | 奖励分: +${f.rewardScore}`;
        }
        if (f.plannedChapter) {
          line += ` | 计划第${f.plannedChapter}章回收`;
        }
        if (f.tags && f.tags.length > 0) {
          line += `\n  - 标签: ${f.tags.join(', ')}`;
        }
        return line;
      };

      if (shortTerm.length > 0) {
        output += `### ⚡ 短期伏笔（1-5章收尾）\n${shortTerm.map(formatForeshadowing).join('\n')}\n\n`;
      }
      if (midTerm.length > 0) {
        output += `### 🔄 中期伏笔（10-20章收尾）\n${midTerm.map(formatForeshadowing).join('\n')}\n\n`;
      }
      if (longTerm.length > 0) {
        output += `### 🗺️ 长期伏笔（跨卷收尾）\n${longTerm.map(formatForeshadowing).join('\n')}\n\n`;
      }

      output += `> 💡 **伏笔使用提示**：
> - 钩子类型：⚡危机适合快节奏，❓悬疑需长线铺垫，💗情感适中，⚖选择需快速决策，🔥欲望需长线
> - 强度决定奖励分：强=30分，中=20分，弱=10分
> - 建议按 hookType 分类管理伏笔，便于追踪不同情绪弧线
> - **爽点追踪**：使用伏笔系统追踪爽点，在 tags 中添加 \`爽点:小\`、\`爽点:中\`、\`爽点:大\` 标签
> - **情绪曲线**：使用 outline_manageEvents 的 emotions 字段标注事件情绪（-5~+5分）
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
  // 技能库通过懒加载触发，不在这里动态传递列表
  const skillListSection = "";
  const characterProfilesSection = getCharacterProfilesSection();
  const foreshadowingSection = getForeshadowingSection();

  // --- 技能触发注入：活跃的技能内容 ---
  let triggeredSkillsSection = '';
  const activeSkills = useSkillTriggerStore.getState().getActiveSkills();
  if (activeSkills.length > 0) {
    const skillFolder = files.find(f => f.name === '98_技能配置');
    const subskillFolder = skillFolder
      ? files.find(f => f.parentId === skillFolder.id && f.name === 'subskill')
      : null;

    const sections = activeSkills.map(record => {
      const skillFile = subskillFolder
        ? files.find(f => f.parentId === subskillFolder.id && f.name === record.skillId)
        : null;
      if (!skillFile?.content) return null;
      const remaining = getRemainingRounds(record, lifecycleManager.getCurrentRound());
      return `## 活跃技能: ${record.name}\n` +
        `**命中标签**: ${record.originalTags.join(', ')}\n` +
        `**剩余活跃**: ${remaining}/${record.decayRounds} 轮\n` +
        `---\n${skillFile.content}`;
    }).filter(Boolean);

    if (sections.length > 0) {
      triggeredSkillsSection = `\n\n---\n## 自动加载的技能\n` + sections.join('\n\n');
    }
  }

  // --- 4层记忆栈构建 ---
  const typedKnowledgeNodes = (knowledgeNodes || []) as KnowledgeNode[];
  // 提取用户最后一条消息，用于 L2 按需加载的话题检测
  const lastUserMessage = messages?.filter((m: any) => m.role === 'user').slice(-1)[0]?.text || null;
  const memoryStackPrompt = buildMemoryStack({
    agentInstruction: agentInstruction || DEFAULT_AGENT_SKILL,
    projectInfo,
    fileTree,
    pendingTodos,
    userInputHistory,
    wordsPerChapter,
    templateList,
    skillList: skillListSection,
    knowledgeNodes: typedKnowledgeNodes,
    characterProfiles: characterProfilesSection,
    userMessage: lastUserMessage,
  });

  return `
${memoryStackPrompt}
${triggeredSkillsSection}
${foreshadowingSection}
`;
};
