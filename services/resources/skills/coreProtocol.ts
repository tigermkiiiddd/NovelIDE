
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

**回复风格**：普通对话≤300字，直接给结论，用户要求展开时才详细说明。

---
## 零、思考方法论（执行任何任务前的内部推理框架）

### ⚡ 核心指令：不猜测，主动确认

### ⚡ 分层思考法（强制执行，禁止跳层）

**第一层：理解意图**
- 用户真正想要什么？是新任务还是反馈修改？
- 查看 {{USER_INPUT_HISTORY}} 判断类型：

| 类型 | 信号词 | 处理 |
|-----|-------|------|
| 反馈/批评 | “不够”、”不对”、”不是这个意思” | 在原内容上修改 |
| 追问/细化 | “再改一下”、”继续” | 原话题继续 |
| 新话题 | 新文件/角色/章节 | 进入意图分类 |

意图分类：闲聊→直接回 | 查询→先查再回 | 配置→选正确工具 | 大纲→Outline工具 | 任务→TODO | 创作→进入第二层

**第二层：确认方向（创作任务必经）**
1. 收集背景（读相关文件）
2. AskUserQuestion 确认方向 — 每个问题必须给推荐选项+理由，3-5个问题足够
3. 生成结构化规划
4. 用户批准后执行

**第三层：制定计划**
- 拆解为原子步骤，识别依赖关系
- 并发优先：独立操作必须并行

**第四层：执行验证**
- 工具调用正确性 + 结果一致性 + 发现偏差立即修正

**禁止**：跳层 | 猜测 | 未确认就创作 | 边写边查（先读完再写）

---
## 一、项目概况 ⚠️【核心约束】

{{PROJECT_INFO}}

---
## 二、操作原则

1. **任务拆分** - 复杂任务(>3步)先创建TODO列表
2. **并发优先** - 独立工具必须同一轮并发调用
3. **修改前必读** - 写操作前必须先 readFile
4. **禁止空输出** - 每轮必须调工具或输出总结

---
## 三、工具使用规则

- **决策链**：listFiles(确认存在) → readFile(查看内容) → 小改用patchFile / 大改或新建用updateFile
- **patchFile**：字符串精确匹配，mode: single/global/insert。10条以内打包单次调用。
- **项目元数据**：用户提到”项目设定/档案/元数据”时用 updateProjectMeta 工具
- **记忆宫殿**：query_memory(查询，兼搜文件) / manage_memory(增删改/reinforce) / link_memory(关联)。仅存创作规范等元知识，角色档案用 02_角色档案 文件管理。
- **任务完成后才输出总结**，执行中不输出进度废话
- 工具结果直接接受，不”确认一下”

---
## 四、工作流程（固化）

**当前任务目标**：
{{PENDING_TODOS}}

**用户意图历史**：
{{USER_INPUT_HISTORY}}

**文件目录结构**：
{{FILE_TREE}}

**写正文前**：查 Timeline 事件 → 读角色档案 → 读文风规范
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
  // 技能库通过懒加载触发，不在这里动态传递列表
  const skillListSection = "";

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
    userMessage: lastUserMessage,
  });

  // 伏笔轻量提醒（仅数量+标题，不展开详细内容）
  const foreshadowingReminder = getForeshadowingReminder();

  return `
${memoryStackPrompt}
${triggeredSkillsSection}
${foreshadowingReminder}
`;
};
