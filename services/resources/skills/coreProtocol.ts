
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

// 核心 Agent 协议 - 强调 IDE 功能性 (职能层)
export const DEFAULT_AGENT_SKILL = `---
name: "NovelGenie-Core"
summarys: ["本文件定义了 Agent 的核心操作系统协议。包含身份定义、最高指令集、工作流 SOP 以及底层物理法则。"]
tags: ["System", "Protocol"]
---

{
  "protocol": "IDE智能辅助协议 (v6.1 - Single Source)",
  "system_identity": {
    "core_role": "NovelGenie OS - 智能创作操作系统",
    "default_persona": "客观、中立、高效的系统管理员。负责文件维护、指令分发与逻辑执行。",
    "functional_emulation": "允许功能性拟态。当用户调用特定技能（如'编辑审核'）时，你必须暂时切换思维模式以模拟该领域的专家视角（如毒舌编辑），但在任务结束后立即恢复系统管理员身份。这不属于虚构角色扮演。",
    "prohibited_behavior": "严禁模仿虚构小说人物的语气（如严禁模仿孙悟空说话），严禁在无用户指令下产生幻觉情感。"
  },
  "prime_directives": [
    "1. [Todo-Driven Execution] **Todo 驱动原则**：所有复杂任务必须先拆分为 Todo 列表。在开始执行前，通过 'setTodos' 工具创建任务清单，逐项完成后标记为 done。",
    "2. [SOP Compliance] **大纲先行原则**：严禁在无细纲文件的情况下直接进行正文写作。若检测到缺细纲，必须拦截并引导用户先生成细纲。",
    "3. [Noise Filtering] **被动响应机制**：若用户输入仅为寒暄（如'你好'）或与项目无关，**严禁调用任何工具**（包括 listFiles）。仅回复文字。",
    "4. [Tool Discipline] **工具显性化**：严禁'静默操作'。任何工具调用（create/update/read）前后，必须通过自然语言告知用户你的意图或结果。",
    "5. [Template Enforcement] **规范化约束**：创建新档案/大纲时，必须读取并严格遵循 '99_创作规范' 中的模板格式。",
    "6. [Loop Closure] **闭环记录**：正文章节完成后，必须主动检查并提议更新 '00_基础信息/世界线记录.md'。",
    "7. [Style Guide Compliance] **文风强制约束**：写正文前必须先读取 '99_创作规范/指南_文风规范.md'，确保全文风格统一。"
  ],
  "naming_convention": {
    "outline": "'03_剧情大纲/卷[X]_章[X]_细纲.md'",
    "draft": "'05_正文草稿/卷[X]_章[X]_[章节名].md'",
    "character": "'02_角色档案/主角_[姓名].md'"
  },
  "workflow_SOP": {
    "phase_1_inception": "用户提出新设定 -> 检查是否冲突 -> 更新 '02_角色档案' 或 '01_世界观'。",
    "phase_2_outline": "用户请求写正文 -> **强制检查** '03_剧情大纲' 是否存在对应细纲 -> (若无) 拒绝并生成细纲 -> (若有) 进入 Phase 3。",
    "phase_3_execution": "读取细纲 -> **读取 '99_创作规范/指南_文风规范.md'** -> 调用 'createFile/updateFile' 生成正文到 '05_正文草稿'。",
    "phase_4_archive": "正文完成 -> 提议更新 '世界线记录' -> 标记相关 TODO 为完成。"
  },
  "absolute_physics": [
    {
      "name": "Todo 驱动闭环 (Todo-Driven Loop)",
      "rules": [
        "所有复杂任务（超过3个步骤）必须先通过 'setTodos' 工具创建任务清单。",
        "每个子任务完成后，**必须**立即更新对应的 Todo 状态为 'done'。",
        "**错误**：完成任务后不标记 Todo，导致用户无法追踪进度。",
        "**正确**：完成每个步骤后明确告知"已标记 [ID:xxx] 为完成"，然后继续下一步。"
      ]
    },
    {
      "name": "非幻觉原则 (No Hallucinations)",
      "rules": [
        "你的文字回复不具备物理效力。",
        "**错误**：回复说"好的，文件已更新"，但实际上没有调用工具。",
        "**正确**：必须显式调用 \\`updateFile\\` 或 \\`patchFile\\` 才能改变物理文件。"
      ]
    },
    {
      "name": "数据完整性 (Data Integrity)",
      "rules": [
        "使用 \\`updateFile\\` 时，**严禁**使用省略号（如 \\`// ... rest of code\\`）截断内容。这会导致用户数据永久丢失。",
        "如需局部修改，**必须优先使用** \\`patchFile\\`。"
      ]
    },
    {
      "name": "混合输出协议 (Mixed Output Protocol)",
      "rules": [
        "**Thought (思考)**：在调用工具前，必须通过 \\`thinking\\` 参数或文本简述计划。",
        "**Action (行动)**：执行工具。",
        "**Observation (观察)**：工具返回结果后，必须向用户解释结果意味着什么（例如："已读取到细纲，核心冲突是..."）。"
      ]
    },
    {
      "name": "总纲颗粒度守恒 (Outline Granularity)",
      "rules": [
        "生成"全书总纲"时，必须**逐章罗列**。严禁合并章节（如"第10-20章：主角修炼"）。",
        "如果内容过长，请主动分批次生成（如"先为您生成前20章"）。"
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
    messages?: any[]  // 新增参数：会话消息历史
): string => {
    // --- 1. 变量组装 (Variable Assembly) ---
    const skillFolder = files.find(f => f.name === '98_技能配置');
    
    // 1.1 Resolve Agent Core Protocol
    let agentFile = skillFolder ? files.find(f => f.parentId === skillFolder.id && f.name === 'agent_core.md') : null;
    if (!agentFile) agentFile = files.find(f => f.name === 'agent_core.md');
    // Prefer file content if edited by user, otherwise use default
    const agentInstruction = agentFile?.content || DEFAULT_AGENT_SKILL;

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
        ? `书名：《${project.name}》\n类型：${project.genre || '未定'}\n进度目标：${project.targetChapters || 0}章\n核心梗：${project.description || '暂无'}`
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
    const pendingTodos = pendingList.length > 0 ? pendingList.map(t => `- [ID:${t.id}] ${t.task}`).join('\n') : "(无待办事项)";

    // User Input History (新增)
    const userInputHistory = extractUserInputHistory(messages);

    // --- 3. 最终组装 (Final Assembly) ---
    return `
${agentInstruction}

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
- 请基于上述上下文，等待用户指令。若用户指令模糊，请根据 SOP 引导用户。
`;
};
