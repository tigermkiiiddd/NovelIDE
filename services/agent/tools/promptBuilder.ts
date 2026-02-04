
import { FileNode, ProjectMeta, FileType, TodoItem } from '../../../types';
import { getFileTreeStructure } from '../../fileSystem';
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

    // 1.3 Resolve Emergent Skills (Sub-skills)
    let emergentSkillsData = "";
    let subSkillFolder = files.find(f => f.name === 'subskill');
    if (!subSkillFolder && skillFolder) {
        subSkillFolder = files.find(f => f.parentId === skillFolder.id && f.name === 'subskill');
    }
    if (subSkillFolder) {
        const subSkillFiles = files.filter(f => f.parentId === subSkillFolder?.id && f.type === FileType.FILE);
        const validSkills = subSkillFiles.map(f => {
            const meta = f.metadata || {};
            if (meta.name && meta.description) {
                return `### 技能模块: ${meta.name}\n> 描述: ${meta.description}\n${f.content}`;
            }
            return null;
        }).filter(Boolean);
        if (validSkills.length > 0) emergentSkillsData = validSkills.join('\n\n');
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
    
    // File Context
    const fileTree = getFileTreeStructure(files);
    
    // Active File
    let activeFileContext = "当前未打开任何文件。";
    if (activeFile) {
        const content = activeFile.content || '';
        const lines = content.split('\n');
        // Truncate if too long to save tokens, but keep head/tail
        if (lines.length > 800) {
            const head = lines.slice(0, 100).join('\n');
            const tail = lines.slice(-300).join('\n');
            activeFileContext = `文件名: ${activeFile.name} (已截断显示)\n---\n${head}\n\n... [中间 ${lines.length - 400} 行已隐藏] ...\n\n${tail}`;
        } else {
            activeFileContext = `文件名: ${activeFile.name}\n---\n${content}`;
        }
    }

    // Task Context
    const pendingList = todos.filter(t => t.status === 'pending');
    const pendingTodos = pendingList.length > 0 ? pendingList.map(t => `- [ID:${t.id}] ${t.task}`).join('\n') : "(无待办事项)";

    // --- 3. 最终组装 (Final Assembly) ---
    // 必须使用显式的字符串拼接，确保指令层级清晰
    // 即使 Agent 不查文件，也能直接通过这里的 activePersonaContent 获得人设
    return `
${agentInstruction}

${PERSONA_SYSTEM_PREFIX}

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

## 2. 挂载的特殊技能 (Emergent Skills)
${emergentSkillsData || "(无额外技能)"}

## 3. 文件目录结构 (File Tree)
${fileTree}

## 4. 用户正在编辑的文件 (Active Editor Content)
${activeFileContext}

==================================================
【系统指令 (System Note)】
1. 你必须时刻扮演【Active Persona Definition】中的角色。
2. 利用【Emergent World Context】中的信息来保证设定准确。
3. 如果用户要求修改文件，请使用相应的写工具。
4. ⚠️【模板严格执行令】：当用户要求创建“角色档案”或“大纲”时，你必须先读取 '99_创作规范' 下对应的模板文件。生成的 Markdown 内容结构必须与模板**完全一致**（包括标题层级、字段名称）。绝对禁止 Agent 自作聪明添加“生平经历”、“能力数值”等模板里没有的章节，除非用户显式要求增加。
`;
};
