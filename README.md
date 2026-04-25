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
- **多模型支持 / Multi-Model Support**: OpenAI, Google Gemini, DeepSeek, Moonshot, with task-specific model routing (chat, polish, extraction, sub-agents).
- **智能对话 / Contextual Chat**: 基于项目上下文的 AI 对话系统 / AI chat system powered by project context.
- **工具调用 / Tool Calling**: AI 可读取/修改文件、管理任务、调用子代理 / AI can read/modify files, manage tasks, and invoke sub-agents.
- **粒度化审批 / Granular Approval**: 对 AI 的变更进行细粒度审批控制 / Fine-grained approval control for AI-suggested changes.
- **深度思考 / Deep Thinking**: AI 在设计、方案、规划类任务前自动创建结构化思考空间 / AI creates structured thinking workspace before design/planning tasks.
- **自我反思 / Self Reflection**: AI 在关键决策点进行自我审视，提升输出质量 / AI self-reflects at key decision points for better output quality.

### 技能体系 / Skill System
19 个专业创作技能，按需加载，激活时自动解锁配套工具：
- **规划类 / Planning**: 项目初始化（6步引导式建项目）、大纲构建（商业化节奏设计）、多线编织（多叙事线平衡）
- **设计类 / Design**: 角色设计（底色-追求-手段三维模型）、角色状态追踪（跨章节数据同步）、期望管理（GAP三角模型）
- **创作类 / Writing**: 正文写作流程（端到端章节创作 pipeline）、正文扩写、对话写作、场景描写、情绪渲染、战斗场景、去AI化润色
- **审核类 / Review**: 编辑审读（逻辑漏洞/OOC/注水检测）
- **元技能 / Meta**: 深度思考方法论、快感节奏管理

Skills are progressively disclosed — the AI first sees names/descriptions, then loads full methodology on demand with auto-unlocked tool categories.

### 长期记忆 / Long-term Memory

#### 记忆宫殿 / Memory Palace (Knowledge Graph)
- **三层架构 / 3-Tier Structure**: Wing → Room → Node，模拟物理记忆宫殿 / Wing → Room → Node, simulating a physical memory palace.
- **智能关联 / Smart Linking**: 节点间支持 belongs-to、refines、depends-on、conflicts-with 等关系类型 / Supports relationship types between nodes.
- **自动沉淀 / Auto Extraction**: AI 在对话结束时自动提取知识，过滤查询类工具结果，仅沉淀创作产出 / AI auto-extracts knowledge at conversation end, filtering read-tool results.
- **混合检索 / Hybrid Search**: 向量语义搜索 + Fuse.js 模糊匹配，复合评分 / Vector semantic search + Fuse.js fuzzy matching with composite scoring.
- **可视化知识图谱 / Visual Knowledge Graph**: 直观展现记忆结构与关联 / Visually display structure and associations.

#### 四层记忆栈 / 4-Layer Memory Stack
控制 AI 上下文窗口中的知识注入量级，按 token 预算分层加载：
- **L0** (~100 tokens): Agent 身份 + 项目元数据（常驻）
- **L1** (~500 tokens): 关键知识 + 世界/角色摘要（常驻）
- **L2** (~800 tokens): 语义聚合的上下文相关知识（动态加载）
- **L3**: 全量普通知识 + 情节记忆（按需查询）

#### 跨项目进化记忆 / Cross-Project Evolution Memory
AI 代理的跨项目自我学习系统，记录洞察、模式、纠正、用户偏好，支持重要度评级和自动过期清理。

### 伏笔与时间线 / Foreshadowing & Timeline
- **世界时间线 / World Timeline**: 绝对时间戳事件管理（天+时），卷-章-事件三级结构 / Absolute timestamp event management with volume-chapter-event hierarchy.
- **伏笔管理 / Foreshadowing Management**: 种植/发展/回收全生命周期追踪，计划回收章节，批量调整，过期预警 / Full lifecycle tracking with planned resolution chapters, batch adjustment, overdue alerts.
- **故事线 / Story Strands**: 多叙事线平衡检测与节奏控制 / Multi-strand balance detection and pacing control.
- **情绪曲线 / Emotion Curves**: 钩子情绪与节点情绪双曲线 / Dual emotion curves (hook + node emotions).

### 章节分析 / Chapter Analysis
- **角色状态提取 / Character State Extraction**: AI 自动提取每章角色位置、情绪、关系变化 / AI auto-extracts character location, emotion, relationship changes per chapter.
- **伏笔检测 / Foreshadowing Detection**: 自动识别伏笔种植/回收点 / Auto-detects foreshadowing planting/resolution points.
- **角色档案同步 / Profile Sync**: 分析结果自动同步到角色记忆库 / Analysis results auto-sync to character memory store.

### 高级编辑器 / Advanced Editor
- **Markdown 高亮 / Markdown Highlighting**: 语法实时高亮 / Real-time syntax highlighting.
- **实时对比 / Diff View**: 变更实时差异对比，支持多文件并发 / Real-time diff comparison with multi-file concurrent sessions.
- **多模式支持 / Multi-Mode**: 只读、编辑、差异对比模式 / Read-only, Edit, and Diff modes.
- **局部更新 / Patch-based Updates**: AI 只修改需要的段落，响应更快、Diff 更清晰 / AI only modifies needed segments for faster response and clearer diffs.

### 版本管理 / Version Control
- **文件版本 / File Versions**: AI 编辑前自动备份，支持手动快照、版本回退、自动清理 / Auto-backup before AI edits, manual snapshots, restore, auto-pruning.
- **实体版本 / Entity Versions**: 角色档案和章节分析的独立版本历史 / Separate version history for character profiles and chapter analyses.

### 项目管理 / Project Management
- **虚拟文件系统 / Virtual File System**: 完整的项目目录管理 / Full directory and file management.
- **导入导出 / Import & Export**: 支持项目数据的灵活迁移 / Flexible project data migration.
- **统计分析 / Statistics**: 字数、章节数等实时统计 / Real-time stats for word and chapter counts.
- **15种题材预设 / 15 Genre Presets**: 玄幻、都市、系统流、宫斗、悬疑、言情、科幻、武侠、游戏、历史、无限流、洪荒、游戏文、直播流、克苏鲁，每种提供定制化的角色设计、期望管理、节奏和世界观配置 / Genre-specific templates for character design, expectation management, rhythm, and worldbuilding.
- **文件保护 / File Protection**: 声明式文件保护系统（IMMUTABLE / PERSISTENT / AUTO_REBUILD），技能配置文件可安心编辑 / Declarative file protection with auto-rebuild for skill configs.

### 计划模式 / Planning Mode
- **笔记本系统 / Notebook System**: 结构化创作规划 / Structured creative planning.
- **行级注释 / Inline Comments**: 为每行内容添加备注 / Add notes to individual lines.
- **审查状态 / Review Status**: 跟踪内容审核进度 / Track the progress of content reviews.

## 软件设计思路 / Design Philosophy

NovelIDE 的设计核心是让 AI 更好地理解和维护长篇小说的连贯性。
The core design of NovelIDE is to enable AI to better understand and maintain the consistency of long-form novels.

### 1. 知识图谱化的持久上下文 / Knowledge Graph-based Persistent Context
为了防止 AI 在长篇创作中遗忘导致逻辑混乱，关键设定存入结构化知识图谱，通过四层记忆栈按预算注入上下文。
To prevent AI from losing context, key settings are stored in a structured knowledge graph and injected via a 4-layer memory stack with token budgets.

### 2. 渐进式工具体系 / Progressive Tool Architecture
工具分两层：Tier 1（17个常驻工具）和 Tier 2（按类别懒加载）。技能激活时自动解锁配套工具类别，节省每次 LLM 调用的 token 消耗。
Tools are split into Tier 1 (17 always-on) and Tier 2 (lazy-loaded by category). Skill activation auto-unlocks dependent tool categories, saving tokens per LLM call.

### 3. 专用子代理 / Specialized Sub-Agents
针对章节分析、知识提取、文本润色等任务设计了专用 Agent，通过模型路由分配到最适合的 AI 模型。
Specialized agents for chapter analysis, knowledge extraction, and text polishing, routed to optimal AI models.

### 4. 基于审批的交互流程 / Approval-based Workflow
确保作者的核心主导权，所有写操作展示 Diff 预览供审查。工具连续失败 2 次自动熔断，报告错误让用户决策。
All AI write operations require approval via diff preview. Tool failure circuit breaker after 2 consecutive failures.

### 5. 可扩展的技能体系 / Extensible Skill System
所有创作规范通过独立文件定义，支持跨题材扩展。技能支持关键词和语义两种自动触发方式，8轮未使用自动衰减。
All writing standards defined in separate files with genre extension support. Auto-triggering via keywords and semantic matching with 8-round decay.

### 6. 语义搜索 / Semantic Search
基于 bge-small-zh-v1.5 的浏览器端向量生成，混合检索（语义 + 模糊 + 重要度），用于知识检索和技能触发匹配。
Browser-side vector generation with bge-small-zh-v1.5, hybrid retrieval (semantic + fuzzy + importance) for knowledge search and skill trigger matching.

## 技术栈 / Tech Stack

| 类别 / Category | 技术 / Technology |
|------|------|
| 框架 / Framework | React 19 |
| 语言 / Language | TypeScript |
| 构建 / Bundler | Vite |
| 状态管理 / State Management | Zustand (18 stores) |
| 本地存储 / Local Storage | IndexedDB |
| 向量搜索 / Vector Search | @huggingface/transformers (bge-small-zh-v1.5) |
| 模糊搜索 / Fuzzy Search | Fuse.js |
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

应用将在 http://localhost:6388 启动 / App will start at http://localhost:6388.

## 项目结构 / Project Structure

```
NovelIDE/
├── components/          # UI 组件 / React UI Components
├── stores/              # 状态管理 (18个 Zustand Store) / State Stores
├── services/            # 业务逻辑层 / Service Layer
│   ├── agent/           # AI 代理工具与执行器 / AI Agent Tools & Runner
│   │   ├── tools/       # 工具定义与执行 / Tool Definitions & Execution
│   │   └── toolDefinitions/ # 工具参数 Schema / Tool Parameter Schemas
│   ├── resources/       # 技能与指南 (19个 Skill) / Skills & Writing Guides
│   └── subAgents/       # 专用子代理 / Specialized Sub-Agents
├── hooks/               # 自定义 Hooks / Custom React Hooks
│   └── agent/           # 分层 Agent Hook 系统 / Layered Agent Hook System
├── domains/             # 领域逻辑 / Domain Logic (DDD)
│   ├── file/            # 文件保护与树构建 / File Protection & Tree Building
│   ├── memory/          # 记忆与向量搜索 / Memory & Vector Search
│   ├── skillTrigger/    # 技能自动触发 / Skill Auto-Trigger
│   └── agentContext/    # Agent 上下文窗口管理 / Agent Context Windowing
├── utils/               # 工具函数 / Utility Functions
├── types/               # 类型定义 / TypeScript Type Definitions
└── src/test/            # 测试框架 / Test Infrastructure
```

---

<p align="center">
  Made with ❤️ for novel writers / 为小说创作者倾心打造
</p>
