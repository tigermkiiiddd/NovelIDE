# NovelIDE (NovelGenie IDE) 🚀

<p align="center">
  <strong>AI 驱动的小说写作 IDE</strong><br>
  专为小说作者设计的智能写作环境
</p>

<p align="center">
  <a href="https://github.com/tigermkiiiddd/NovelIDE/stargazers"><img src="https://img.shields.io/github/stars/tigermkiiiddd/NovelIDE?style=flat&label=Stars&color=yellow" alt="GitHub Stars" /></a>
  <a href="https://github.com/tigermkiiiddd/NovelIDE/issues"><img src="https://img.shields.io/github/issues/tigermkiiiddd/NovelIDE" alt="GitHub Issues" /></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8" />
  <img src="https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white" alt="Vite 6.2" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Source_Available-FF6B6B" alt="License" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a> | <strong>👉 中文</strong>
</p>

---

## 授权协议

**NovelIDE 源码可见，但不是允许任意商用的开源协议。**

本项目允许个人学习、研究、评估和其他非商业用途。未经版权所有者事先书面许可，禁止商业使用，包括但不限于 SaaS/托管服务、商业平台、付费产品、商业集成、客户交付项目、二次销售、商业分发，以及使用本软件提供付费写作、编辑、生成、自动化或咨询服务。

商业授权请联系项目所有者。完整条款见 [LICENSE](./LICENSE)。

## 简介

**NovelIDE** 是一款面向小说作者的集成开发环境，融合了先进的 AI 技术与专业的写作工具。通过智能助手、高级编辑器和完善的项目管理功能，帮助作者专注于创作本身。

## 功能特性

### AI 写作助手
- **多模型支持**：OpenAI, Google Gemini, DeepSeek, Moonshot，支持按任务路由模型（聊天、润色、提取、子代理）。
- **智能对话**：基于项目上下文的 AI 对话系统。
- **工具调用**：AI 可读取/修改文件、管理任务、调用子代理。
- **粒度化审批**：对 AI 的变更进行细粒度审批控制。
- **深度思考**：AI 在设计、方案、规划类任务前自动创建结构化思考空间。
- **自我反思**：AI 在关键决策点进行自我审视，提升输出质量。

### 技能体系
19 个专业创作技能，按需加载，激活时自动解锁配套工具：
- **规划类**：项目初始化（6步引导式建项目）、大纲构建（商业化节奏设计）、多线编织（多叙事线平衡）
- **设计类**：角色设计（底色-追求-手段三维模型）、角色状态追踪（跨章节数据同步）、期望管理（GAP三角模型）
- **创作类**：正文写作流程（端到端章节创作 pipeline）、正文扩写、对话写作、场景描写、情绪渲染、战斗场景、去AI化润色
- **审核类**：编辑审读（逻辑漏洞/OOC/注水检测）
- **元技能**：深度思考方法论、快感节奏管理

<img width="1746" height="1107" alt="image" src="https://github.com/user-attachments/assets/d6f882a0-3433-48ab-8fd2-a6bdbf5037c0" />
<img width="1386" height="1069" alt="image" src="https://github.com/user-attachments/assets/08054683-ca97-400a-b820-80de805f5e8e" />
<img width="1156" height="1107" alt="image" src="https://github.com/user-attachments/assets/f33d7094-fead-4b5c-ae8f-8b7b02908bd5" />

技能采用渐进式披露机制 —— AI 首先看到技能名称和描述，然后在需要时按需加载完整方法论，并自动解锁配套工具类别。

### 长期记忆

#### 记忆宫殿（知识图谱）
- **三层架构**：Wing → Room → Node，模拟物理记忆宫殿。
- **智能关联**：节点间支持 belongs-to、refines、depends-on、conflicts-with 等关系类型。
- **自动沉淀**：AI 在对话结束时自动提取知识，过滤查询类工具结果，仅沉淀创作产出。
- **混合检索**：向量语义搜索 + Fuse.js 模糊匹配，复合评分。
- **可视化知识图谱**：直观展现记忆结构与关联。

#### 四层记忆栈
控制 AI 上下文窗口中的知识注入量级，按 token 预算分层加载：
- **L0** (~100 tokens)：Agent 身份 + 项目元数据（常驻）
- **L1** (~500 tokens)：关键知识 + 世界/角色摘要（常驻）
- **L2** (~800 tokens)：语义聚合的上下文相关知识（动态加载）
- **L3**：全量普通知识 + 情节记忆（按需查询）

#### 跨项目进化记忆
AI 代理的跨项目自我学习系统，记录洞察、模式、纠正、用户偏好，支持重要度评级和自动过期清理。

### 伏笔与时间线
- **世界时间线**：绝对时间戳事件管理（天+时），卷-章-事件三级结构。
- **伏笔管理**：种植/发展/回收全生命周期追踪，计划回收章节，批量调整，过期预警。
- **故事线**：多叙事线平衡检测与节奏控制。
- **情绪曲线**：钩子情绪与节点情绪双曲线。

### 章节分析
- **角色状态提取**：AI 自动提取每章角色位置、情绪、关系变化。
- **伏笔检测**：自动识别伏笔种植/回收点。
- **角色档案同步**：分析结果自动同步到角色记忆库。

### 高级编辑器
- **Markdown 高亮**：语法实时高亮。
- **实时对比**：变更实时差异对比，支持多文件并发。
- **多模式支持**：只读、编辑、差异对比模式。
- **局部更新**：AI 只修改需要的段落，响应更快、Diff 更清晰。

### 版本管理
- **文件版本**：AI 编辑前自动备份，支持手动快照、版本回退、自动清理。
- **实体版本**：角色档案和章节分析的独立版本历史。

### 项目管理
- **虚拟文件系统**：完整的项目目录管理。
- **导入导出**：支持项目数据的灵活迁移。
- **统计分析**：字数、章节数等实时统计。
- **15种题材预设**：玄幻、都市、系统流、宫斗、悬疑、言情、科幻、武侠、游戏、历史、无限流、洪荒、游戏文、直播流、克苏鲁，每种提供定制化的角色设计、期望管理、节奏和世界观配置。
- **文件保护**：声明式文件保护系统（IMMUTABLE / PERSISTENT / AUTO_REBUILD），技能配置文件可安心编辑。

### 计划模式
- **笔记本系统**：结构化创作规划。
- **行级注释**：为每行内容添加备注。
- **审查状态**：跟踪内容审核进度。

## 软件设计思路

NovelIDE 的设计核心是让 AI 更好地理解和维护长篇小说的连贯性。

### 1. 知识图谱化的持久上下文
为了防止 AI 在长篇创作中遗忘导致逻辑混乱，关键设定存入结构化知识图谱，通过四层记忆栈按预算注入上下文。

### 2. 渐进式工具体系
工具分两层：Tier 1（17个常驻工具）和 Tier 2（按类别懒加载）。技能激活时自动解锁配套工具类别，节省每次 LLM 调用的 token 消耗。

### 3. 专用子代理
针对章节分析、知识提取、文本润色等任务设计了专用 Agent，通过模型路由分配到最适合的 AI 模型。

### 4. 基于审批的交互流程
确保作者的核心主导权，所有写操作展示 Diff 预览供审查。工具连续失败 2 次自动熔断，报告错误让用户决策。

### 5. 可扩展的技能体系
所有创作规范通过独立文件定义，支持跨题材扩展。技能支持关键词和语义两种自动触发方式，8轮未使用自动衰减。

### 6. 语义搜索
基于 bge-small-zh-v1.5 的浏览器端向量生成，混合检索（语义 + 模糊 + 重要度），用于知识检索和技能触发匹配。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 |
| 语言 | TypeScript |
| 构建 | Vite |
| 状态管理 | Zustand (18 stores) |
| 本地存储 | IndexedDB |
| 向量搜索 | @huggingface/transformers (bge-small-zh-v1.5) |
| 模糊搜索 | Fuse.js |
| 样式 | CSS Modules |

## 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

应用将在 http://localhost:6388 启动。

## 商业授权

如需将 NovelIDE 用于商业产品、SaaS、企业内部商业流程、客户项目、付费服务或其他商业场景，请先取得书面授权。

## 项目结构

```
NovelIDE/
├── components/          # UI 组件
├── stores/              # 状态管理 (18个 Zustand Store)
├── services/            # 业务逻辑层
│   ├── agent/           # AI 代理工具与执行器
│   │   ├── tools/       # 工具定义与执行
│   │   └── toolDefinitions/ # 工具参数 Schema
│   ├── resources/       # 技能与指南 (19个 Skill)
│   └── subAgents/       # 专用子代理
├── hooks/               # 自定义 Hooks
│   └── agent/           # 分层 Agent Hook 系统
├── domains/             # 领域逻辑 (DDD)
│   ├── file/            # 文件保护与树构建
│   ├── memory/          # 记忆与向量搜索
│   ├── skillTrigger/    # 技能自动触发
│   └── agentContext/    # Agent 上下文窗口管理
├── utils/               # 工具函数
├── types/               # 类型定义
└── src/test/            # 测试框架
```

---

<p align="center">
  为小说创作者倾心打造 ❤️
</p>
