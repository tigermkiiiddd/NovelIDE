
import { FileNode, ProjectMeta, FileType, TodoItem } from '../../../types';
import { getFileTreeStructure, getNodePath } from '../../fileSystem';
import { DEFAULT_AGENT_SKILL, DEFAULT_AGENT_PERSONA, PERSONA_SYSTEM_PREFIX } from '../../templates';

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
    // --- 1. 变量组装 (Variable Assembly): Protocol & Persona ---
    const skillFolder = files.find(f => f.name === '98_技能配置');
    
    // 1.1 Resolve Agent Core Protocol
    let agentFile = skillFolder ? files.find(f => f.parentId === skillFolder.id && f.name === 'agent_core.md') : null;
    if (!agentFile) agentFile = files.find(f => f.name === 'agent_core.md');
    const agentInstruction = agentFile?.content || DEFAULT_AGENT_SKILL;

    // 1.2 Resolve Active Persona
    // 优先读取用户自定义的 '助手人设.md'，如果没有则使用 DEFAULT_AGENT_PERSONA
    let personaFile = skillFolder ? files.find(f => f.parentId === skillFolder.id && f.name === '助手人设.md') : null;
    if (!personaFile) personaFile = files.find(f => f.name === '助手人设.md');
    
    const activePersonaContent = personaFile?.content || DEFAULT_AGENT_PERSONA;

    // 1.3 Resolve Emergent Skills (Sub-skills) - LAZY LOAD MODE
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
    
    // Active File Info (CONTENT REMOVED BY USER REQUEST)
    let activeFileInfo = "当前未打开任何文件。";
    if (activeFile) {
        activeFileInfo = `当前打开的文件名: ${activeFile.name}\n> 注意：为了节省上下文，文件内容**未自动注入**。如果你需要结合当前文件内容进行写作，**必须先调用 \`readFile\` 读取它**。`;
    }

    // Task Context
    const pendingList = todos.filter(t => t.status === 'pending');
    const pendingTodos = pendingList.length > 0 ? pendingList.map(t => `- [ID:${t.id}] ${t.task}`).join('\n') : "(无待办事项)";

    // --- 3. 最终组装 (Final Assembly) ---
    return `
${agentInstruction}

${PERSONA_SYSTEM_PREFIX}

==================================================
【交互策略 (Interaction Strategy) - CRITICAL】
你必须根据用户的输入类型，选择不同的响应模式：

1. **闲聊与问候 (Chitchat & Greetings)**:
   - 当用户说 "你好"、"在吗"、"你是谁" 时，**严禁调用任何工具 (NO TOOLS)**。
   - 直接用人设的口吻回复即可。不要分析项目，不要列出文件列表。

2. **通用写作知识 (General Knowledge)**:
   - 当用户问 "怎么写好反派"、"给我想几个形容词" 时，**严禁调用工具**。
   - 直接调用你内置的知识库回答。

3. **项目具体操作 (Project Actions)**:
   - 只有当用户明确提到 "查看大纲"、"创建文件"、"帮我写这一章"、"总结当前进度" 时，**才允许调用工具** (如 listFiles, readFile 等)。

==================================================

【当前激活人设 (Active Persona Definition)】
${activePersonaContent}
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

## 4. 用户正在编辑的文件 (Active File Info)
${activeFileInfo}

==================================================
【系统指令 (System Note)】
1. 优先判断意图：是闲聊？还是干活？**闲聊时绝对不要使用工具，这非常重要！**
2. 你必须时刻扮演【Active Persona Definition】中的角色。
3. 利用【Emergent World Context】中的信息来保证设定准确。
4. **动态技能加载**：请关注【可用技能列表】。不要凭空捏造写作指导，如果需要特定风格的描写，先读对应的技能文件。
5. ⚠️【模板严格执行令】：当用户要求创建“角色档案”或“大纲”时，你必须先读取 '99_创作规范' 下对应的模板文件。生成的 Markdown 内容结构必须与模板**完全一致**。
6. 📝【登记制度 (Mandatory Registration)】：
   - **写完正文后**：你必须立即执行两项更新：
     1. 更新 \`00_基础信息/世界线记录.md\`：记录本章发生的关键事件、状态变更。
     2. 更新 \`00_基础信息/伏笔记录.md\`：登记本章埋下的新伏笔，或勾选已回收的伏笔。
   - **这是强制流程**：严禁写完正文就直接向用户交付，必须连续调用工具完成这两项记录更新。
`;
};
