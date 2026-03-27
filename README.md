# NovelIDE (NovelGenie IDE)

<p align="center">
  <strong>AI 驱动的小说写作 IDE / AI-Powered Novel Writing IDE</strong><br>
  专为小说作者设计的智能写作环境 / Intelligent writing environment designed for novelists
</p>

---

[中文](#简介) | [English](#introduction)

## 简介 / Introduction

**NovelIDE** 是一款面向小说作者的集成开发环境，融合了先进的 AI 技术与专业的写作工具。通过智能助手、高级编辑器和完善的项目管理功能，帮助作者专注于创作本身。

**NovelIDE** is an Integrated Development Environment (IDE) designed for novelists, blending advanced AI technology with professional writing tools. Through intelligent assistants, a high-end editor, and comprehensive project management, it helps authors stay focused on the creative process.

## 功能特性 / Features

### AI 写作助手 / AI Writing Assistant
- **多模型支持 / Multi-Model Support**: OpenAI, Google Gemini, DeepSeek, Moonshot.
- **智能对话 / Contextual Chat**: 基于项目上下文的 AI 对话系统 / AI chat system powered by project context.
- **工具调用 / Tool Calling**: AI 可读取/修改文件、管理任务、调用子代理 / AI can read/modify files, manage tasks, and invoke sub-agents.
- **粒度化审批 / Granular Approval**: 对 AI 的变更进行细粒度审批控制 / Fine-grained approval control for AI-suggested changes.

### 高级编辑器 / Advanced Editor
- **Markdown 高亮 / Markdown Highlighting**: 语法实时高亮 / Real-time syntax highlighting.
- **实时对比 / Diff View**: 变更实时差异对比 / Real-time difference comparison for changes.
- **多模式支持 / Multi-Mode**: 只读、编辑、差异对比模式 / Read-only, Edit, and Diff modes.
- **变更追踪 / Change Tracking**: 行级变更记录 / Line-level change tracking.

### 项目管理 / Project Management
- **虚拟文件系统 / Virtual File System**: 完整的项目目录管理 / Full directory and file management.
- **导入导出 / Import & Export**: 支持项目数据的灵活迁移 / Flexible project data migration.
- **统计分析 / Statistics**: 字数、章节数等实时统计 / Real-time stats for word and chapter counts.
- **技能系统 / Skill System**: 创作规范与 AI 技能配置 / Management of writing standards and AI skills.

### 计划模式 / Planning Mode
- **笔记本系统 / Notebook System**: 结构化创作规划 / Structured creative planning.
- **行级注释 / Inline Comments**: 为每行内容添加备注 / Add notes to individual lines.
- **审查状态 / Review Status**: 跟踪内容审核进度 / Track the progress of content reviews.
- **规划执行分离 / Separation of Concerns**: 先规划后执行 / Plan first, execute later.

### 长期记忆 / Long-term Memory (AI-driven)
- **自动更新 / Auto-update**: AI 代理在创作过程中自动识别、提取并更新小说设定 / AI agents automatically identify, extract, and update settings during creation.
- **可视化知识图谱 / Visual Knowledge Graph**: 直观展现长期记忆的结构与关联 / Visually display the structure and associations of long-term memory.
- **智能关联 / Smart Linking**: 支持设定节点的新增、修改和实体间的逻辑链接 / Support for adding/editing nodes and logical links between entities.
- **创作协同 / Creative Synergy**: AI 实时调取长期记忆，确保剧情发展与设定一致 / AI recalls memory in real-time to ensure plot and character consistency.
- **本地存储 / Local Storage**: 与 IndexedDB 同步，保证数据安全与离线可用 / Sync with IndexedDB for data security and offline availability.

## 软件设计思路 / Design Philosophy

NovelIDE 的设计核心是让 AI 更好地理解和维护长篇小说的连贯性。
The core design of NovelIDE is to enable AI to better understand and maintain the consistency of long-form novels.

### 1. 知识图谱化的持久上下文 / Knowledge Graph-based Persistent Context
为了防止 AI 在长篇创作中“由于遗忘导致逻辑混乱”，我们将关键设定存入结构化的知识图谱。
To prevent AI from "losing context" in long-form writing, key settings (geography, abilities, items, etc.) are stored in a structured knowledge graph.

### 2. 专用 AI 工具 (Sub-Agents) / Specialized AI Sub-Agents
针对特定任务设计了专用 Agent，解决通用模型逻辑局限。
Specialized agents are designed for specific tasks to overcome the logical limitations of general-purpose models.
- **时间线工具 / Timeline Tool**: 记录和校验剧情发生的时间点 / Records and verifies plot timestamps.
- **章节分析器 / Chapter Analyzer**: 自动总结冲突与看点 / Automatically summarizes conflicts and highlights.
- **设定提取器 / Entity Extractor**: 自动识别并更新设定库 / Automatically identifies and updates the settings library.

### 3. 设置与角色的历史追踪 / Version History for Characters & Settings
小说创作中设定需要微调，系统提供历史版本记录方便回看。
Novel settings often evolve; the system provides historical version records for key characters and world-building assets.

### 4. 局部更新优化体验 (Patching) / Patch-based Partial Updates
采用“局部打补丁”技术，AI 只修改需要变动的段落，提升响应速度与 Diff 清晰度。
We use "patching" technology where the AI only modifies the necessary segments, ensuring faster response times and clearer Diff views.

### 5. 可扩展的技能体系 (Skill System) / Extensible Skill System
所有的创作规范、格式和调用逻辑通过独立文件定义，支持跨题材（玄幻、都市等）扩展。
All writing standards, formats, and tool logics are defined in separate files, allowing extensions for different genres (Fantasy, Urban, Mystery, etc.).

### 6. 基于审批的交互流程 / Approval-based Workflow
确保作者的核心主导权，所有的写操作都会展示 Diff 预览供审查、通过或驳回。
To keep the author in control, all AI write operations require approval through a Diff preview flow.

## 技术栈 / Tech Stack

| 类别 / Category | 技术 / Technology |
|------|------|
| 框架 / Framework | React 19 |
| 语言 / Language | TypeScript |
| 构建 / Bundler | Vite |
| 状态管理 / State Management | Zustand |
| 本地存储 / Local Storage | IndexedDB |
| 样式 / Styling | CSS Modules |

## 快速开始 / Quick Start

### 环境要求 / Prerequisites
- Node.js 18+
- npm 9+

### 安装与运行 / Installation & Running

```bash
# 安装依赖 / Install dependencies
npm install

# 启动开发服务器 / Start development server
npm run dev
```

应用将在 http://localhost:3000 启动 / App will start at http://localhost:3000.

## 项目结构 / Project Structure

```
NovelIDE/
├── components/      # UI 组件 / React UI Components
├── stores/          # 状态管理 / Zustand State Stores
├── services/        # 业务逻辑层 / Service Layer
│   ├── agent/       # AI 代理工具 / AI Agent Tools & Runner
│   ├── resources/   # 技能与指南 / Skills & Writing Guides
│   └── subAgents/   # 专用子代理 / Specialized Sub-Agents
├── hooks/           # 自定义 Hooks / Custom React Hooks
├── domains/         # 领域逻辑 / Domain Logic (DDD)
├── utils/           # 工具函数 / Utility Functions
├── types/           # 类型定义 / TypeScript Type Definitions
└── src/test/        # 测试框架 / Test Infrastructure
```

---

<p align="center">
  Made with ❤️ for novel writers / 为小说创作者倾心打造
</p>
