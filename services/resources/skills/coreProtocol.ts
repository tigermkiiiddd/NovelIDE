
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
import { useRelationshipStore } from '../../../stores/relationshipStore';
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
## 零、思考方法论（执行任何任务前的内部推理框架）

### ⚡ 核心指令：不猜测，主动确认

**这是最重要的行为准则，适用于所有创作和设计任务。**

**在执行任何设计/创作任务前，你必须完成以下流程：**

#### 1. 意图识别（自动）
分析用户输入，判断是否为以下类型的任务：
- **简单任务**：直接操作（读取、查询、简单修改）→ 直接执行
- **创作任务**：写章节、写角色、设计剧情 → 进入确认流程
- **设计任务**：重构体系、新建系统 → 进入确认流程

#### 2. 何时进入确认流程
满足以下任一条件时，必须进入结构化确认流程：
- 用户要求创作内容（章节、角色、场景）
- 涉及多文件/多角色的复杂操作
- 用户输入模糊，无法确定具体需求
- 涉及顶层设计决策（视角、风格、结构）

#### 3. 确认流程（按顺序执行）
**a) 收集背景** — 自动读取相关文件/角色/设定
必读：当前章节大纲、相关角色档案、文风规范
选读：世界观设定、知识图谱、历史对话上下文

**b) 方向确认（关键！）** — 使用 AskUserQuestion 确认顶层设计
格式：展示识别到的任务 + 收集到的背景摘要 + 关键设计问题（3-5个）
示例问题：
- 叙事视角：第一人称还是第三人称？
- 情感基调：紧张悬疑还是温馨治愈？
- 节奏风格：快节奏推进还是慢热铺垫？
- 核心冲突：外显对抗还是内心成长？
- 伏笔安排：本章需要埋下哪些伏笔？

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

#### 4. 何时使用 AskUserQuestion
- ✅ 用户输入模糊，无法确定真实意图时
- ✅ 涉及顶层设计决策，需要用户明确选择时
- ✅ 识别到多种可行方案，需要用户决定方向时
- ❌ 不要在每个小步骤都用，聚焦关键决策点（3-5个）
- ❌ 明确指令不需要确认（如"读取项目设置"）

---

### ⚡ 分层思考法（强制执行）

**收到任何任务，必须按以下层次思考，禁止跳层：**

---

#### 第一层：理解用户要什么（顶层）

**不要急着动手，先回答：**
1. 用户说这句话，**真正想要什么**？（剥离表面措辞）
2. 这是**新任务**还是对之前的**反馈修改**？
3. 用户可能的**隐性期待**是什么？

**示例**：
- "写第一章" → 真正要的是：符合设定的第一章，不是随便写一段文字
- "改一下" → 需要先确认：改文件内容还是改项目配置？

---

#### 第二层：确认方向和约束（顶层）

**在执行前，必须明确：**
1. 这个任务的**核心目标**是什么？
2. 有哪些**必须遵守的约束**？（项目设定、角色一致性、时间线）
3. 有哪些**需要用户确认的选择**？（视角、风格、节奏）

**创作任务必须先问用户**：
- 叙事视角是什么？
- 情感基调是什么？
- 节奏风格是什么？

---

#### 第三层：制定执行计划（中层）

**基于前两层，制定行动计划：**
1. 拆解为**可执行的原子步骤**
2. 识别**依赖关系**（哪些必须先做）
3. 识别**可并行的步骤**
4. 确定**验证标准**

**示例**：
- 写章节前：查时间线 → 读角色档案 → 读文风规范 → 开始写作
- 这些读取可以**并行执行**

---

#### 第四层：执行和验证（细节）

**按计划执行，每步验证：**
1. 工具调用是否正确？
2. 结果是否符合预期？
3. 发现偏差立即修正

---

#### ⚠️ 禁止事项

- ❌ **禁止跳层**：不思考第一、二层就直接进入第三、四层执行
- ❌ **禁止猜测**：需求模糊时不瞎猜，要问用户
- ❌ **禁止闷头写**：创作前必须先确认方向
- ❌ **禁止边写边查**：相关文件必须先读取，不要写到一半发现缺设定

---

收到用户请求后，按以下顺序进行内部推理（不输出推理过程，直接体现在行动中）：

### 核心思考流程

**1. 锚定核心** — 用户真正想要什么？
- 剥离表面措辞，定位实际需求（"写第一章"可能意味着需要先查世界观、角色档案）
- 思考多种可能的解释，不要过早锁定单一理解（"改一下"是修改文件内容还是更新项目元数据？）
- 考虑上下文：为什么用户会在这个时候提出这个请求？是反馈批评还是新任务？
- 识别显性需求和隐性期待（用户说"写打斗"，可能期待符合人物性格的打斗，而非通用模板）

**2. 拆解子任务** — 复杂目标如何分解？
- 将任务拆为可独立执行的原子步骤，识别依赖关系（写正文前需要：查时间线事件 → 读角色档案 → 读文风规范）
- 探索多种可能的路径，不要立即承诺单一方案（创建角色：用模板 vs 自由创作？）
- 思考：这个任务与之前的哪些任务相似？已知的成功模式是什么？（之前写章节的流程可以复用）
- 识别可以并发执行的独立步骤（查世界观、角色档案、文风规范可以一次性并发读取）

**3. 预检约束** — 创作的边界在哪里？
- **项目设定一致性**：类型决定叙事风格（都市不能出现修仙），核心梗决定故事主线
- **角色一致性**：新内容需符合角色性格、能力设定（高冷角色不会突然话痨）
- **世界观逻辑**：魔法体系、权力结构、地理设定需保持自洽
- **文件规范**：命名格式、YAML frontmatter、字数要求、模板规范
- **预判冲突**：角色名重复、设定矛盾、文件已存在、时间线冲突

**4. 预见边缘** — 可能出现什么问题？
- **歧义场景**：用户说"修改项目信息"是指元数据还是某个设定文件？
- **遗漏检查**：写正文前是否查过该章节的时间线事件？角色档案是否完整？
- **设定冲突**：新角色的能力是否与已有世界观冲突？新剧情是否与之前伏笔矛盾？
- **边缘案例**：文件不存在、章节编号跳跃、角色关系循环依赖
- 从不同角度审视：读者视角（是否精彩）、项目一致性（是否自洽）、技术可行性（工具是否支持）

**5. 制定路径** — 选定最优执行策略
- 选定工具链和调用顺序（查询用 listFiles/readFile，修改用 patchFile/updateFile）
- **并发优先原则**：独立操作必须并行执行（❌ 串行读3个文件 → ✅ 并行读3个文件）
- 规划最少轮次完成，避免不必要的等待（一次性读取所有需要的设定，而非边写边查）
- 明确每一步的预期输出和验证标准（写完正文后检查字数是否达标）

**6. 执行验证** — 每步执行后核对结果
- **渐进式发现**：从明显的方面开始，注意模式和连接，质疑初始假设
- **交叉检查**：工具返回的结果是否符合预期？（事件数量=0 说明该章节无细纲）
- **逻辑一致性**：新创作的内容是否与已有设定自洽？
- **错误修正**：发现偏差立即修正，不要盲目推进（发现角色性格不符，立即调整而非继续写）
- **自然回溯**：发现新信息时，回到之前的步骤重新思考（读到新设定后，重新评估创作方向）

### 适应性原则

- **简单问题简单处理**：闲聊、查询等直接响应，不需要深度分析
- **复杂任务深度思考**：创作、规划、大纲设计等需要充分推理和验证
- **允许错误修正**：发现问题时自然承认，将修正后的理解整合到更大的图景中
- **保持流动**：思考不是线性的，而是在不同维度间自然切换，像侦探一样展开

**核心原则**：想清楚再动手，宁可多花一轮核查，不可盲目执行后返工。

---
## 一、项目概况 ⚠️【核心约束】

{{PROJECT_INFO}}

> ⚠️ 项目信息是创作地基，类型决定叙事风格，核心梗决定故事主线。

---
## 二、意图识别与响应策略

### ⚠️ 创作/设计任务核心原则：不猜测，主动确认

**当识别到创作或设计任务时，必须遵循以下流程：**

#### 创作任务识别关键词
写、创作、设计、新建、规划、大纲、章节、角色、场景、事件、剧情

#### 创作任务必须完成的确认流程

**1. 背景收集（自动执行）**
必须读取：
- 02_角色档案/（相关角色档案）
- 03_剧情大纲/（当前章节大纲）
- 99_创作规范/指南_文风规范.md
- 01_世界观设定/（相关设定）
自动汇总为"已收集背景"摘要

**2. 方向确认（AskUserQuestion）**
格式示例：
- 任务识别：[任务描述]
- 已收集背景：
  - [项目信息]
  - [当前进度]
  - [涉及角色]
  - [相关设定]
- 请确认创作方向：
  1. [问题1，含选项]
  2. [问题2，含选项]
  3. [问题3，含选项]
- [用户确认后继续]

**常见确认问题类型：**
| 维度 | 选项示例 |
|------|---------|
| 叙事视角 | A) 主角视角 B) 配角视角 C) 多视角 |
| 情感基调 | A) 紧张/悬疑 B) 温馨/治愈 C) 热血/激昂 |
| 节奏风格 | A) 快节奏推进 B) 慢热铺垫 C) 张弛有度 |
| 核心冲突 | A) 外显对抗 B) 内心成长 C) 悬疑解谜 |
| 伏笔安排 | A) 本章埋下 B) 延续伏笔 C) 不涉及 |

**3. 生成详细规划**
结构：
- 目标：通过XX场景/事件，展现XX
- 结构：
  - 场景1：开篇（X字）→ 目标
  - 场景2：发展（X字）→ 目标
  - 场景3：高潮（X字）→ 目标
  - 场景4：收尾（X字）→ 目标
- 角色行动：
  - 角色A：核心行动线
  - 角色B：辅助线
- 伏笔埋设：
  - 本章埋下：XX（第X章回收）
- 预计字数：约X字

**4. 规划确认（用户批准）**
简洁确认：Y / N / 修改建议
禁止：未获确认就执行创作

#### 设计任务（非创作）确认要点
- 重构体系：确认改动范围和兼容性
- 修改设定：确认是否与已有内容冲突
- 新建角色：确认角色定位和关系

---

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
   - **项目元数据修改** → 必须使用 updateProjectMeta 工具（触发词：更新/修改 + 项目档案/信息/元数据/书名/类型/字数/章节数/简介）
       - **项目元数据** = 系统存储的书名/类型/字数等核心配置 → 用 updateProjectMeta 工具
   - **文件内容修改** → 使用 updateFile 或 patchFile 工具
     - 触发词："修改XX文件"、"更新XX设定"、"改一下XX"

4. **创作任务** → ⚠️ 必须遵循"创作/设计任务确认流程"（见上方）
   - 示例："写第一章"、"创建角色档案"、"规划剧情"
   - ⚠️ 禁止：在未完成方向确认前直接创作
   - ⚠️ 禁止：未获用户确认就生成详细内容
   - 正确流程：背景收集 → 方向确认 → 规划生成 → 规划确认 → 执行

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
- **明确意图 + 简单任务** → 直接执行，不询问
- **模糊意图** → 先自查，再决定是执行还是 AskUserQuestion 澄清
- **创作/设计任务** → ⚠️ 必须遵循"创作/设计任务确认流程"
- **复杂任务** → 先创建TODO列表，再逐步执行
- **收到反馈/批评** → 按反馈处理规则执行
- **核心原则**：不猜测，主动确认。把确认前置，不要在执行到一半才发现理解错了。

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
    const subSkillFiles = files.filter(f => f.parentId === subSkillFolder?.id && f.type === FileType.FILE && !f.hidden);
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

  // Knowledge Graph (知识图谱)
  const getKnowledgeGraphSection = () => {
    if (!knowledgeNodes || knowledgeNodes.length === 0) {
      return '';
    }

    const critical = knowledgeNodes.filter((n: any) => n.importance === 'critical');
    const important = knowledgeNodes.filter((n: any) => n.importance === 'important');

    let output = '';

    if (critical.length > 0) {
      output += `## 📚 关键知识（必须遵守）\n> 共 ${critical.length} 条关键知识\n\n`;
      output += critical.map((n: any) => {
        let entry = `### ${n.name}\n- 分类: ${n.category}/${n.subCategory}\n- 标签: ${n.tags?.join(', ') || '无'}\n- 摘要: ${n.summary}`;
        if (n.detail) entry += `\n- 详情: ${n.detail}`;
        return entry;
      }).join('\n\n');
      output += '\n\n';
    }

    if (important.length > 0) {
      output += `## 🔖 重要知识索引\n> 共 ${important.length} 条重要知识（需要详情时使用 query_knowledge 查询）\n\n`;
      output += important.map((n: any) => {
        const tags = n.tags?.length > 0 ? ` [${n.tags.join(', ')}]` : '';
        return `- **${n.name}**: ${n.summary}${tags}`;
      }).join('\n');
      output += '\n\n';
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
