# NovelIDE (NovelGenie IDE)

<p align="center">
  <strong>AI 驱动的小说写作 IDE</strong><br>
  专为小说作者设计的智能写作环境
</p>

---

## 简介

NovelIDE 是一款面向小说作者的集成开发环境，融合了先进的 AI 技术与专业的写作工具。通过智能助手、高级编辑器和完善的项目管理功能，帮助作者专注于创作本身。

## 功能特性

### AI 写作助手
- 多模型支持：OpenAI、Google Gemini、DeepSeek、Moonshot
- 智能对话：基于项目上下文的 AI 对话系统
- 工具调用：AI 可读取/修改文件、管理任务、调用子代理
- 粒度化审批：对 AI 的变更进行细粒度审批控制

### 高级编辑器
- Markdown 语法高亮
- 实时差异对比（Diff View）
- 多种编辑模式（只读/编辑/差异）
- 行级变更追踪

### 项目管理
- 完整的虚拟文件系统
- 项目导入/导出
- 项目统计（字数、章节数等）
- 技能配置与创作规范管理

### 计划模式
- 笔记本系统：结构化创作规划
- 行级注释：为每行内容添加备注
- 审查状态：跟踪内容审核进度
- 计划与执行分离：先规划后执行

### 长期记忆 (AI-driven Long-term Memory)
- **自动更新**：AI 代理在创作过程中自动识别、提取并更新小说设定与知识点
- **可视化知识图谱**：通过树状图直观展现长期记忆的结构与关联
- **智能关联**：支持设定节点的新增、修改和实体间的逻辑链接
- **创作协同**：AI 实时调取长期记忆，确保剧情发展与人物设定的一致性
- **本地存储**：与 IndexedDB 实时同步，保证记忆数据的离线可用与安全性

### 用户体验
- 响应式设计，支持移动端
- 离线支持（IndexedDB 本地存储）
- 深色/浅色主题
- 多面板布局

## 软件设计思路

NovelIDE 的设计核心在于解决 AI 在长篇创作中容易出现的“遗忘”和“逻辑崩溃”问题，通过架构层面的创新实现真正的 AI 协同创作。

### 1. 记忆优先架构 (Memory-First Architecture)
传统的创作工具以“文件”为中心，而 NovelIDE 以“记忆”为中心。
- 我们将小说设定、人物关系和世界观提炼为结构化的**知识图谱**。
- 这个图谱不是静态的文档，而是 AI 的实时上下文，确保 AI 在第 100 章仍能精准记住第 1 章设置的伏笔。

### 2. 自主代理集群 (Autonomous Agent Swarm)
放弃单一的庞大 AI 模型，采用专家辅助机制。
- **核心代理**负责与用户对话，理解高层意图。
- **专用子代理**（如时间线代理、剧情分析代理、知识提取代理）在后台并行工作，负责维护逻辑的一致性。

### 3. 以实体为中心的内容版本控制 (Entity-Centric Versioning)
小说中的角色和设定是“活”的实体。
- 系统为每个角色和关键设定维护独立的**版本历史**。
- 当 AI 建议修改角色性格或背景时，用户可以清晰地对比版本差异，并回溯到任何一个历史状态。

### 4. 增量式编辑器同步 (Incremental Patching)
为了解决大文件场景下 AI 改写带来的性能瓶颈：
- 引入了**高精度 Patch 机制**，AI 生成的是对原文的局部打补丁建议，而非全量重写。
- 配合虚拟文件系统与本地持久化，实现了毫秒级的流畅编辑体验。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 |
| 语言 | TypeScript |
| 构建 | Vite |
| 状态管理 | Zustand |
| 本地存储 | IndexedDB |
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

应用将在 http://localhost:3000 启动

### 其他命令

```bash
# 生产构建
npm run build

# Cloudflare 兼容构建
npm run build:cf

# 运行测试
npm test

# 测试监听模式
npm run test:watch

# 测试覆盖率报告
npm run test:coverage

# 运行单个测试
npm test -- path/to/test.file.test.ts
npm test -- --testNamePattern="test name"
```

## 项目结构

```
NovelIDE/
├── components/      # React UI 组件
├── stores/          # Zustand 状态管理
├── services/        # 业务逻辑层
│   ├── agent/       # AI 代理工具和运行器
│   ├── resources/   # 技能和写作指南
│   └── subAgents/   # 专用子代理 (Timeline, Knowledge Decision等)
├── hooks/           # 自定义 React Hooks
│   ├── agent/       # 分层代理 Hook 系统
│   └── useAgent.ts  # 核心代理交互 Hook
├── domains/         # 领域驱动设计（DDD）领域逻辑
├── utils/           # 工具函数
├── types/           # TypeScript 类型定义
└── src/test/        # 测试基础设施
```

## 架构亮点

### 状态管理
使用 Zustand 配合 IndexedDB 实现持久化存储，支持：
- 项目元数据和设置
- 文件树和内容管理
- AI 会话和消息
- UI 状态（面板、模态框）

### 代理系统
采用分层架构设计：
1. **Context 层** - 会话管理、AI 服务生命周期
2. **Tools 层** - 工具定义和执行
3. **Engine 层** - 核心对话循环和消息处理

### 工具执行流程
1. 写操作返回 `APPROVAL_REQUIRED` 并展示差异预览
2. 读操作立即执行并返回 `EXECUTED`
3. UI 显示审批对话框，用户确认后执行

## 配置文件

| 文件 | 说明 |
|------|------|
| `vite.config.ts` | Vite 配置，`@` 别名映射 |
| `tsconfig.json` | TypeScript 配置 |
| `jest.config.cjs` | Jest 测试配置 |

## 许可证

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ for novel writers
</p>
