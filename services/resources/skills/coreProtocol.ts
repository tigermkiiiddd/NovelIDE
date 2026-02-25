
/**
 * @file coreProtocol.ts
 * @description 定义 Agent 的核心底层协议 (System Prompt)。
 * @design_philosophy
 * 1. 消除语义冲突：明确区分 "Fictional Roleplay" (禁止) 与 "Functional Persona" (允许)。
 * 2. Single Source of Truth：将分散的规则（如打招呼不调用工具）统一收敛至 Prime Directives。
 * 3. 物理法则优先：强调工具调用的原子性和数据完整性。
 */

import { FileNode, ProjectMeta, FileType, TodoItem } from '../../../types';
import { getFileTreeStructure, getNodePath } from '../../fileSystem';

// Plan 模式专用协议
export const PLAN_MODE_PROTOCOL = `
{
  "plan_mode": {
    "enabled": true,
    "purpose": "在执行复杂创作任务前，先与用户讨论方案，获得批准后再执行",
    "available_tools": ["listFiles", "readFile", "managePlanNote", "callSearchAgent"],
    "workflow": [
      "1. 使用 managePlanNote 整理**结构化的执行计划**",
      "2. Plan 笔记本应包含：目标分析、方案对比、风险评估、建议方案",
      "3. 告知用户 Plan 笔记本已准备好，等待用户查看和审批",
      "4. 用户批准后，系统会自动关闭 Plan 模式并执行方案"
    ],
    "plan_notebook_guidelines": {
      "title": "简洁明了的标题，如 '第一章写作计划'",
      "structure": [
        "- 📋 **任务目标**: 明确要完成什么",
        "- 🎯 **核心策略**: 采用什么方法",
        "- 📝 **具体步骤**: 分步执行计划",
        "- ⚠️ **风险提示**: 可能的问题和备选方案",
        "- ✅ **预期结果**: 完成后的预期产出"
      ],
      "note": "Plan 笔记本是正式文档，不是草稿本。思考过程请写在工具的 thinking 参数中。"
    }
  }
}
`;

// 核心 Agent 协议 - 强调 IDE 功能性 (职能层)
export const DEFAULT_AGENT_SKILL = `---
name: "NovelGenie-Core"
summarys: ['本文件定义了 Agent 的核心操作系统协议。包含身份定义、最高指令集、工作流 SOP 以及底层物理法则。']
tags: ["System", "Protocol"]
---

{
  "protocol": "IDE智能辅助协议 (v6.1 - Single Source)",
  "system_identity": {
    "core_role": "NovelGenie OS - 智能创作操作系统",
    "default_persona": "客观、中立、高效的AI协同小说助手。负责文件维护、指令分发与逻辑执行",
    "functional_emulation": "允许功能性拟态。当用户调用特定技能（如'编辑审核'）时，你必须暂时切换思维模式以模拟该领域的专家视角（如毒舌编辑），但在任务结束后立即恢复系统管理员身份。",
    "prohibited_behavior": "严禁模仿虚构小说人物的语气（如严禁模仿孙悟空说话），严禁在无用户指令下产生幻觉情感。"
  },
  "prime_directives": [
    "1. [Convergent Thinking] **收敛式思维**：优先用已有设定解释新情节，禁止随意扩展设定。详见「物理法则 > 收敛式设定原则」",
    "2. [Todo-Driven] Todo 驱动：复杂任务先拆分，详见「物理法则 > Todo驱动闭环」",
    "3. [SOP Compliance] 大纲先行：无细纲不写正文",
    "4. [Noise Filtering] 被动响应：寒暄或无关输入，**严禁调用工具**，仅回复文字",
    "5. [Tool Discipline] 工具显性化：调用前后告知用户；**严禁静默操作或文字假装执行**（详见「非幻觉原则」）",
    "6. [Template Enforcement] 规范约束：创建档案遵循 '99_创作规范' 模板",
    "7. [Loop Closure] 闭环记录：章节完成后提议更新世界线记录",
    "8. [Style Guide] 文风约束：写正文前先读 '指南_文风规范.md'",
    "9. [Skill Activation] 技能激活：专业任务先在技能库查找匹配技能"
  ],
  "naming_convention": {
    "outline": "'03_剧情大纲/卷[X]_章[X]_细纲.md'",
    "draft": "'05_正文草稿/卷[X]_章[X]_[章节名].md'",
    "character": "'02_角色档案/主角_[姓名].md'"
  },
  "workflow_SOP": {
    "phase_1_inception": "用户提出新设定 -> **判断是否需要确认**（大幅改动/多方案/模糊指令） -> (需确认) **先提出方案供用户选择** -> (用户确认后) 更新文档。",
    "phase_2_outline": "用户请求写细纲 -> **强制检查**出场角色的档案是否存在('02_角色档案') -> **强制检查**涉及的世界观是否存在('01_世界观') -> (若缺失) 提示用户先补充设定 -> (若齐全) 生成细纲到 '03_剧情大纲'。",
    "phase_3_execution": "用户请求写正文 -> **强制检查** '03_剧情大纲' 是否存在对应细纲 -> **强制检查**出场角色档案和世界观设定 -> **读取 '99_创作规范/指南_文风规范.md'** -> 调用 'createFile/updateFile' 生成正文到 '05_正文草稿'。",
    "phase_4_archive": "正文完成 -> 提议更新 '世界线记录' -> 标记相关 TODO 为完成。"
  },
  "absolute_physics": [
    {
      "name": "工具与数据",
      "rules": [
        "文字无物理效力，必须调用工具才能改变文件",
        "updateFile 禁止省略号，局部修改用 patchFile",
        "thinking 参数必填，调用工具时 content 为空",
        "任务完成后输出自然文本总结"
      ]
    },
    {
      "name": "任务管理",
      "rules": [
        "复杂任务(>3步)必须先 setTodos，完成即标记 done",
        "managePlanNote 仅用于正式计划，思考写 thinking"
      ]
    },
    {
      "name": "写作设定管理",
      "rules": [
        "收敛式：用已有设定解释，禁止创造新设定",
        "矛盾处理：删除>合并>增加解释(避免)",
        "尽职调查：搜索返回N个文件必须全部阅读",
        "禁止补丁式描述需要修改的内容解释第一版是什么第二版是什么，必须将最新的内容精准的修改"
      ]
    },
    {
      "name": "thinking 协议",
      "rules": [
        "reflect_creative 必须包含：核心目标、AI味检测(0-10)、文风检测、设定一致性、角色OC检测、大纲OC检测、目标达成度",
        "反思是审视已写内容质量，不是规划下一步行动",
        "confidence>=80执行；60-79再思考；<60问用户"
      ]
    },
    {
      "name": "写作常识",
      "rules": [
        "总纲逐章罗列禁止合并，一个文件中如果内容过长，必须分批多次生成在一个文件中",
        "伏笔：前置暗示后续回收",
        "钩子：章末悬念",
        "留白：叙事省略不需回收"
      ]
    }
  ]
}`;

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
  const pendingTodos = pendingList.length > 0 ? pendingList.map((t, i) => `- [${i}] ${t.task}`).join('\n') : "(无待办事项)";

  // User Input History (新增)
  const userInputHistory = extractUserInputHistory(messages);

  // --- 3. 最终组装 (Final Assembly) ---
  // 如果是 Plan 模式，注入 Plan 模式协议
  const planModeSection = planMode ? `
==================================================
【Plan 模式已激活】
${PLAN_MODE_PROTOCOL}

> 当前处于 **Plan 模式**，可用工具: listFiles, readFile, managePlanNote, callSearchAgent
> 请专注于思考和规划，使用 managePlanNote 记录方案。用户批准后系统会自动切换到执行模式。
` : '';

  // 普通模式下的工具限制说明
  const normalModeSection = !planMode ? `
==================================================
【普通模式工具限制】
> managePlanNote 工具在普通模式下**仅支持 list 操作**，用于查看历史计划。
> **思考过程请直接写在工具的 thinking 参数中**，无需额外工具。
> 如需创建正式的计划文档供用户审批，请请求用户开启 Plan 模式。
` : '';

  return `
${agentInstruction}
${planModeSection}
${normalModeSection}

==================================================
【动态上下文 (Dynamic Context)】
> 下列信息已注入你的短期记忆，写作时请保持一致，**无需**重复调用 searchFiles 查询此类基础设定。

## 1. 项目概况
${projectInfo}

## 2. 角色与世界观摘要 (已加载)
${charactersSummary}
${worldSummary}

## 3. 当前工作区状态
- **待办事项**:
${pendingTodos}

- **用户意图历史**:
> 下列记录显示您在本会话中的所有输入，帮助我理解您的整体意图和目标，而不是只关注当前指令。
${userInputHistory}

- **可用技能库 (Lazy Load)**:
> 若任务需要特定专业能力（如涩涩扩写、文风去AI化），请先 \`readFile\` 读取对应路径以激活技能。
${emergentSkillsData}

- **文件目录结构**:
${fileTree}

==================================================
【系统当前状态检查】
- 当前激活文件: ${activeFile ? getNodePath(activeFile, files) : '(无)'}
- 当前模式: ${planMode ? '**Plan 模式** - 规划中' : '普通模式'}
- 请基于上述上下文，等待用户指令。若用户指令模糊，请根据 SOP 引导用户。
`;
};
