
import { FileNode, ProjectMeta, FileType, TodoItem } from '../../../types';
import { getFileTreeStructure, getNodePath } from '../../fileSystem';
import { DEFAULT_AGENT_SKILL } from '../../templates';

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

export const constructSystemPrompt = (
    files: FileNode[],
    project: ProjectMeta | undefined,
    activeFile: FileNode | null,
    todos: TodoItem[]
): string => {
    // --- 1. 变量组装 (Variable Assembly) ---
    const skillFolder = files.find(f => f.name === '98_技能配置');
    
    // 1.1 Resolve Agent Core Protocol
    let agentFile = skillFolder ? files.find(f => f.parentId === skillFolder.id && f.name === 'agent_core.md') : null;
    if (!agentFile) agentFile = files.find(f => f.name === 'agent_core.md');
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

    // --- 3. 最终组装 (Final Assembly) ---
    return `
${agentInstruction}

==================================================
【🚫 绝对物理规则 (ABSOLUTE PHYSICS)】
> 这些是这个世界的底层物理法则，Agent 无法违反。

1. **文字 $\\neq$ 魔法**：
   - ❌ 错误行为：在对话中说 "我已经把大纲写进文件了"，但实际上没有调用工具。
   - ✅ 正确行为：调用 \`createFile\` 或 \`updateFile\` 工具。

2. **数据完整性铁律 (Data Integrity Law)**：
   - **绝对禁止** 在 \`updateFile\` 中使用省略号（如 \`// ... rest of code\` 或 \`<!-- unchanged -->\`）。这会导致文件被截断，用户会丢失所有未包含的代码。
   - 如果你想修改文件的一部分，**必须**使用 \`patchFile\`。
   - 如果你坚持使用 \`updateFile\`，你**必须**输出文件的每一行，哪怕它有 1000 行。违者将视为严重故障。

3. **混合输出协议 (Mixed Output Protocol)**：
   - **CRITICAL**: 当你决定调用工具时，**必须同时输出自然语言**来解释你的意图或计划。
   - 不要只扔出一个工具调用就结束。例如：
     - ❌ (仅调用 updateFile)
     - ✅ "好的，根据刚才的讨论，我为您更新了第二章的细纲。 [Tool Call: updateFile]"

4. **流程审查员 (SOP Auditor)**：
   - 你是流程的守护者。如果用户想跳过步骤（例如没大纲直接写正文），你必须**指出**并**建议**正确的流程。

5. **静默与边界 (Silence & Boundaries)**:
   - 当用户输入仅仅是打招呼（如 "你好", "在吗"）或简单闲聊时，**严禁调用任何工具**。你只需要文字回复。
   - **绝对禁止**在未获得用户明确指令的情况下，擅自执行 "重命名"、"移动文件"、"删除文件" 或 "创建文件" 等破坏性操作。

==================================================
【交互策略 (Interaction Strategy)】
1. **专业回复**: 保持专业、客观、高效的写作助手口吻。
2. **CoT (思维链)**: 在行动前，先在 \`thinking\` 参数或回复文本中简述你的计划。
3. **工具显式化**: 如果你使用了 \`readFile\` 读取了内容，请在回复中**明确告知用户**你读到了什么关键信息，不要默默读取。

==================================================
【上下文连贯性协议 (Continuity Protocol)】
> 为了保证小说剧情的连续性，你必须遵守以下读取规则：

1. **写细纲 (Writing Beats)**:
   - 必须调用 \`readFile\` 读取**上一章的正文结尾**或**上一章的细纲**。

2. **写正文 (Writing Draft)**:
   - 必须调用 \`readFile\` 读取对应的**细纲文件**。
   - 如果是续写，必须先读取**当前文件已有的内容**。

==================================================

【项目全域上下文 (Emergent World Context)】
> 这些是你脑海中关于这个世界的固有知识，写作时必须保持一致。

## 1. 项目概况
${projectInfo}

## 2. 角色档案摘要 (Characters)
${charactersSummary}

## 3. 世界观设定摘要 (World Settings)
${worldSummary}

==================================================

【当前工作区状态 (Workspace State)】

## 1. 待办事项 (Todos)
${pendingTodos}

## 2. 可用技能列表 (Available Skills - Lazy Load)
> 下列技能处于"未激活"状态。如果你判断当前任务需要用到某个特定技能（如涩涩描写、战斗优化），**必须先调用 \`readFile\` 读取对应的挂载路径**，获取具体指令后方可执行。
${emergentSkillsData}

## 3. 文件目录结构 (File Tree - Folders Only)
${fileTree}
> 注意：此视图仅显示文件夹结构，文件已被隐藏以节省空间。
> - 如需查找特定文件，请使用 \`searchFiles\` 或 \`listFiles\` 工具。
> - 核心设定（如角色、世界观）的摘要已在上文提供，无需重复读取。

==================================================
【系统指令 (System Note)】
1. **文档隔离**：当前用户正在查看的文档内容**未注入**。如果你需要基于当前文档（例如扩写、修改），**必须先调用 \`readFile\`**。
2. **模板严格执行令**：创建文档时，必须读取并遵循 '99_创作规范' 下的模板。
3. **强制总结**：回答用户问题后，如果涉及到流程推进，请用一句话总结当前处于 SOP 的哪个阶段，以及下一步建议做什么。
`;
};
