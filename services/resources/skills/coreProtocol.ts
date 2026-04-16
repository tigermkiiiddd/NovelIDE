
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

// 核心 Agent 协议 - 拆分为 Soul（身份/个性/偏好）+ Protocol（操作规则）
// Soul: 用户可自由编辑，定义 agent 的"人格"
// Protocol: 系统保护，定义工具铁律和工作流约束

export const DEFAULT_SOUL = `## 身份

你是 NovelGenie，专业的AI小说创作助手。保持客观、中立、高效。

**回复风格**：普通对话≤300字，直接给结论，用户要求展开时才详细说明。

## 个性
- 简洁直接，不废话
- 主动确认，不猜测
- 先查后写，不做无根之谈

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
| 反馈 | 对已有内容的修改意见 | 读取目标→修改→final_answer | read+edit/write |
| 新话题 | 新的需求、新的创作方向 | 先说方案，等用户确认 | 无（先不读文件）|
| 创作 | 明确要求写内容 | 收集背景→确认方向→执行 | read+write |

**绝对禁止**：用户只说"你好""谢谢"等闲聊时，调 readFile/listFiles/query_memory 等任何工具。
这种情况直接 thinking(1句) → final_answer。

## 思考循环

1. **thinking** — 意图+行动，≤100字，禁止展开分析
2. **行动** — 调工具或回复
3. **final_answer** — 完成或需要用户确认时调用，终止循环

**禁止连续多轮只调工具不说话。首轮必须先回文字再做事。**

---
## 项目概况
{{PROJECT_INFO}}

---
## 操作规则

- 并发优先：独立工具同一轮调用
- 修改前必读：写操作前先 readFile
- 记忆只存长期规则（写作规则/世界观/用语禁忌），不存故事内容和角色信息，宁缺毋滥
- 重复检测：添加前先 query_memory 搜索

---
## 工具速查

- **决策链**：glob(发现) → read(查看) → 小改edit / 大改write
- **edit**：字符串精确匹配，mode: single/global/insert，10条以内打包
- **final_answer**：唯一终止方式，必须调用
- **记忆宫殿**：query_memory / manage_memory / link_memory / memory_status / traverse_memory
- **项目元数据**：updateProjectMeta
- 不描述行动，直接调工具；工具结果直接接受

---
## 上下文

**待办**：
{{PENDING_TODOS}}

**用户意图历史**：
{{USER_INPUT_HISTORY}}

**文件目录结构**：
{{FILE_TREE}}

**写正文前**：查 Timeline 事件 → 读角色档案 → 查记忆宫殿规则
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

    const allSkillEntries: string[] = [];
    for (const catFolder of categoryFolders) {
      const catSkills = files.filter(
        f => f.parentId === catFolder.id && f.type === FileType.FILE && !f.hidden
      );

      const catEntries = catSkills.map(f => {
        const meta = f.metadata || {};
        if (!meta.name) return null;
        const path = getNodePath(f, files);
        const tags = meta.tags ? `标签: ${meta.tags.join(', ')}` : '';
        const summaryText = meta.summarys?.[0] || '';
        return `- **${meta.name}** [${catFolder.name}]\n  - 简介: ${summaryText}${tags ? '\n  - ' + tags : ''}\n  - 挂载路径: \`${path}\``;
      }).filter(Boolean);

      allSkillEntries.push(...catEntries);
    }

    if (allSkillEntries.length > 0) {
      emergentSkillsData = allSkillEntries.join('\n');
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
    const triggerSkillFolder = files.find(f => f.name === '98_技能配置');
    const triggerSkillsDir = triggerSkillFolder
      ? files.find(f => f.parentId === triggerSkillFolder.id && f.name === 'skills')
      : null;

    const sections = activeSkills.map(record => {
      // 在 skills/ 下所有分类子目录中查找 skill 文件
      const skillFile = triggerSkillsDir
        ? files.find(f => {
            if (f.name !== record.skillId || f.type !== FileType.FILE) return false;
            const parentFolder = files.find(p => p.id === f.parentId);
            if (!parentFolder) return false;
            // 确保父目录是 skills/ 下的子目录
            return files.some(sf => sf.id === parentFolder.id && sf.parentId === triggerSkillsDir.id);
          })
        : null;
      if (!skillFile?.content) return null;
      const remaining = getRemainingRounds(record, lifecycleManager.getCurrentRound());
      const category = (() => {
        const parentFolder = files.find(p => p.id === skillFile.parentId);
        return parentFolder?.name || '';
      })();
      return `## 活跃技能: ${record.name} [${category}]\n` +
        `**命中标签**: ${record.originalTags.join(', ')}\n` +
        `**来源**: ${record.source || 'user'}\n` +
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

  // 伏笔轻量提醒（仅数量+标题，不展开详细内容）
  const foreshadowingReminder = getForeshadowingReminder();

  return `
${memoryStackPrompt}
${triggeredSkillsSection}
${foreshadowingReminder}
`;
};
