
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

// Plan 模式专用协议
export const PLAN_MODE_PROTOCOL = `## Plan 模式规则

当前处于 **Plan 模式**，你只能进行只读操作和计划整理。

**可用工具**：listFiles, readFile, managePlanNote, callSearchAgent

**工作流程**：
1. 使用 managePlanNote 整理结构化的执行计划
2. 计划包含：目标分析、方案对比、风险评估、建议方案
3. 告知用户计划已准备好，等待审批
4. 用户批准后系统自动退出 Plan 模式并执行

**Plan 笔记本规范**：
- 📋 **任务目标**: 明确要完成什么
- 🎯 **核心策略**: 采用什么方法
- 📝 **具体步骤**: 分步执行计划
- ⚠️ **风险提示**: 可能的问题和备选方案
- ✅ **预期结果**: 完成后的预期产出

> Plan 笔记本是正式文档，不是草稿本。思考过程请写在工具的 thinking 参数中。`;

// 核心 Agent 协议 - 重新分层的简洁版本
export const DEFAULT_AGENT_SKILL = `## 身份

你是 NovelGenie，专业的AI小说创作助手。保持客观、中立、高效。

═══════════════════════════════════════════════════════════════
## 一、操作原则
═══════════════════════════════════════════════════════════════

1. **工具透明** - 调用工具前后告知用户你正在做什么
2. **任务拆分** - 复杂任务(>3步)先创建TODO列表
3. **被动响应** - 寒暄时自然对话，有实质请求才调用工具
4. **系统保护** - 禁止修改 98_技能配置、99_创作规范、subskill 目录

═══════════════════════════════════════════════════════════════
## 二、写作约束 (必须遵守)
═══════════════════════════════════════════════════════════════

1. **项目基础优先** - 书名、类型、核心梗是创作地基，所有内容必须与之对齐
2. **设定一致性** - 新内容需与已有设定保持逻辑自洽，发现矛盾主动协调
3. **先查后写** - 写任何内容前，先查找相关的角色档案、世界观、细纲
4. **模板规范** - 创建档案必须遵循 99_创作规范 中的模板格式

**工具使用规则**：
- ⚠️ **优先使用 patchFile** - 修改已有文件时，优先用 patchFile 精准定位修改
- 仅在创建新文件或重写整文件时使用 updateFile
- 文字无物理效力，必须调用工具才能改变文件
- thinking 参数必填，调用工具时 content 为空
- 任务完成后输出自然文本总结

═══════════════════════════════════════════════════════════════
## 三、写作常识
═══════════════════════════════════════════════════════════════

**基础技巧**：
- 伏笔：前置暗示后续回收，不求立刻被读者发现
- 钩子：开头抓住注意力，结尾留下悬念
- 留白：给读者想象空间，不必面面俱到
- 展示非讲述：用动作和场景代替抽象描述

**期待感管理**：
- 建立 GAP（差距-期待-满足）模型
- 期待越强，延迟满足的时间越长
- 满足时要有惊喜，不能完全按预期

**格式规范**：
- 总纲逐章罗列禁止合并
- 单文件内容过长时，分批多次生成

═══════════════════════════════════════════════════════════════
## 四、工作流程
═══════════════════════════════════════════════════════════════

**写细纲前**：
- 检查角色档案是否存在 (02_角色档案)
- 检查世界观设定是否存在 (01_世界观)
- 若缺失则提示用户先补充设定

**写正文前**：
- 检查细纲是否存在 (03_剧情大纲)
- 检查角色档案和世界观设定
- 读取 99_创作规范/指南_文风规范.md

**完成后**：
- 提议更新角色状态和世界线记录
- 标记相关 TODO 为完成

**文件命名规范**：
- 细纲：03_剧情大纲/卷[X]_章[X]_细纲.md
- 正文：05_正文草稿/卷[X]_章[X]_[章节名].md
- 角色：02_角色档案/主角_[姓名].md

═══════════════════════════════════════════════════════════════
## 五、技能调用
═══════════════════════════════════════════════════════════════

专业任务优先查找匹配技能：
- 角色设计 → characterDesigner
- 世界观构建 → worldBuilder
- 大纲构建 → outlineArchitect
- 正文扩写 → draftExpander

技能采用延迟加载模式，需先 readFile 读取对应路径以激活。

═══════════════════════════════════════════════════════════════
## 六、thinking 协议
═══════════════════════════════════════════════════════════════

**reflect_creative 必须包含**：
- 核心目标、设定一致性、角色OC检测、大纲OC检测、目标达成度

**执行阈值**：
- confidence >= 80：直接执行
- confidence 60-79：再思考
- confidence < 60：询问用户

**字数控制**：
- maxResponseWords：控制后续回复字数，默认600字
- 设为0表示无限制，临时覆盖项目设定中的字数参数

> 反思是审视已写内容质量，不是规划下一步行动`;

// Helper to extract summary from file nodes for Emergent Context
const extractFolderSummary = (files: FileNode[], folderName: string): string => {
  const folder = files.find(f => f.name.includes(folderName) && f.type === FileType.FOLDER);
  if (!folder) return "(暂无信息)";

  const children = files.filter(f => f.parentId === folder.id && f.type === FileType.FILE);
  if (children.length === 0) return "(暂无文件)";

  return children.map(f => {
    const metaSummary = f.metadata?.summarys?.[0];
    // If no metadata summary, take first 50 chars of content
    const contentPreview = !metaSummary && f.content
      ? f.content.replace(/[#\n]/g, ' ').substring(0, 50) + "..."
      : "";

    return `- ${f.name.replace('.md', '')}: ${metaSummary || contentPreview || "(无摘要)"}`;
  }).join('\n');
};

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

  // Emergent World Context (Characters & Settings)
  // 关键点：直接注入摘要，让 Agent "涌现"出对设定的认知，无需查询
  const charactersSummary = extractFolderSummary(files, '角色档案');
  const worldSummary = extractFolderSummary(files, '世界观');

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

  // --- 3. 最终组装 (Final Assembly) ---
  // 如果是 Plan 模式，注入 Plan 模式协议
  const planModeSection = planMode ? `
═══════════════════════════════════════════════════════════════
【Plan 模式已激活】
${PLAN_MODE_PROTOCOL}
` : '';

  // 普通模式下的工具限制说明
  const normalModeSection = !planMode ? `
═══════════════════════════════════════════════════════════════
【普通模式工具限制】
> managePlanNote 工具仅支持 list 操作（查看历史计划）
> 思考过程请写在工具的 thinking 参数中
> 如需创建正式计划文档供审批，请请求用户开启 Plan 模式
` : '';

  return `
${agentInstruction}
${planModeSection}
${normalModeSection}

═══════════════════════════════════════════════════════════════
【动态上下文 (Dynamic Context)】
> 下列信息已注入你的短期记忆，写作时请保持一致，**无需**重复调用 searchFiles 查询此类基础设定。

## 1. 项目概况 ⚠️【核心约束】
> ⚠️ 以下项目基础信息是创作地基，所有写作决策必须与之对齐：
> - **类型**决定叙事风格和读者预期
> - **核心梗**决定故事主线和卖点
> - **单章字数**决定章节节奏控制
> - 任何偏离基础信息的创作都是无效的

${projectInfo}

## 2. 角色与世界观摘要 (已加载)
${charactersSummary}
${worldSummary}

## 3. 当前工作区状态

### ⚠️ 当前任务目标
> 以下是你需要完成的任务，请专注于推进这些目标：
${pendingTodos}

- **用户意图历史**:
> 下列记录显示您在本会话中的所有输入，帮助我理解您的整体意图和目标。
${userInputHistory}

- **可用技能库 (Lazy Load)**:
> 若任务需要特定专业能力，请先 \`readFile\` 读取对应路径以激活技能。
${emergentSkillsData}

- **文件目录结构**:
${fileTree}

═══════════════════════════════════════════════════════════════
【系统当前状态检查】
- 当前激活文件: ${activeFile ? getNodePath(activeFile, files) : '(无)'}
- 当前模式: ${planMode ? '**Plan 模式** - 规划中' : '普通模式'}
- 请基于上述上下文，等待用户指令
`;
};
