# NovelIDE 记忆架构重构设计

**日期**: 2026-04-12
**状态**: 设计完成，待实施

---

## Context

NovelIDE 当前有一个手写的知识系统（知识图谱 + Fuse.js 模糊搜索 + Skill 触发），存在五个核心问题：
1. **记忆类型混淆** — Skill 里混了程序性记忆（方法论）和应该独立的情景记忆（文风习惯、用语忌讳）
2. **扁平无结构** — 知识只有 4 个固定分类，没有领域维度组织
3. **加载不智能** — 所有知识注入 prompt 的策略过于简单，没有按需分层
4. **提取重复且分类不准** — 自动 Agent 经常提取重复内容，无法有效去重和分类（缺少语义去重能力）
5. **文档与记忆割裂** — 文档（大纲、角色卡等）本身就是记忆的载体，不应与知识节点分离

**设计选择**: 方案 B（领域模型重构），结合：
- 神经科学记忆分类（语义/情景/程序性）
- MemPalace 的结构化记忆组织（Wing/Room + 4层记忆栈 + 自动整理）
- Hermes 的 LLM 驱动自动更新理念

**附加任务**: 语义检索升级（Transformers.js embedding）、首次加载 Loading Page

---

## 1. 创作域记忆分类（基于神经科学）

```
长期记忆
├── 声明性记忆 (Declarative) — "知道什么"
│   ├── 语义记忆 (Semantic)  — 结构化事实知识
│   │   ├── 世界设定（力量体系、地理、势力...）
│   │   ├── 规则约束（创作规则、格式规范...）
│   │   ├── 禁止事项（用语忌讳、禁用词汇...）
│   │   └── 角色设定（静态设计：背景、性格、动机）
│   │
│   └── 情景记忆 (Episodic)  — 经历过的事件
│       ├── 剧情事件（Timeline：已发生的关键剧情节点）
│       ├── 写作经验（"上次用倒叙手法效果很好"）
│       ├── 效果反馈（"读者对这段对话反应热烈"）
│       └── 关键转折（角色关系变化的事件触发点）
│
└── 程序性记忆 (Procedural) — "知道怎么做"
    └── Skill 系统（方法论：怎么写对话、怎么写战斗...）
        ← 保持现有 Skill 系统，只去掉不属于这里的内容
```

---

## 2. Wing/Room 结构化组织

```
Wing: 世界设定 (world)
  ├── Room: 力量体系
  ├── Room: 地理环境
  ├── Room: 势力分布
  └── Room: 物品道具

Wing: 创作规范 (writing_rules)
  ├── Room: 叙事规则
  ├── Room: 文风习惯      ← 从 Skill 迁出
  ├── Room: 用语忌讳      ← 从 Skill 迁出
  ├── Room: 格式规范
  └── Room: 写作技巧积累  ← 新增：情景记忆

Wing: 角色 (characters)
  ├── Room: 角色设定      ← 语义记忆（静态设计）
  ├── Room: 角色状态      ← 动态 Profile（独立于设定）
  └── Room: 关系网络      ← 指向关系图谱

Wing: 剧情 (plot)
  ├── Room: 主线剧情
  ├── Room: 支线剧情
  ├── Room: 伏笔管理
  └── Room: Timeline      ← 情景记忆（大纲事实化）

Wing: 项目 (project)
  ├── Room: 大纲          ← 约束层
  ├── Room: 项目设置
  └── Room: 模板
```

**实现方式**: 在现有 KnowledgeNode 上加 `wing` 和 `room` 可选字段。不破坏现有数据，通过迁移脚本给现有节点分配 Wing/Room。

**文档与记忆的统一视角**: 文档（大纲、角色卡、世界观文档等）本身就是记忆的原始载体。Wing/Room 是统一组织层，同时涵盖结构化知识节点和文档。文档通过文件路径映射到对应 Room，节点是文档内容的结构化摘要。记忆栈加载时两者都能拉取。

---

## 3. 4 层记忆栈加载策略

| 层 | 内容 | Token 预算 | 加载时机 | 存储位置 |
|----|------|-----------|---------|---------|
| **L0 身份** | Agent 身份 + 项目元信息 | ~100 | 每次始终加载 | system prompt 基础部分 |
| **L1 关键事实** | critical 知识节点 + 世界设定摘要 + 角色设定索引 | ~500 | 每次始终加载 | Wing/Room 索引 |
| **L2 项目上下文** | 当前写作上下文相关的 important 知识 + 角色 Profile + 近期 Timeline | ~800 | **按需：跨 Wing 语义聚合** | 向量检索 + Fuse.js |
| **L3 深度检索** | 所有 normal 知识 + 情景记忆 + 写作经验 | 按需 | 用户/Agent 显式查询时 | 向量语义检索 |

**加载策略变化（vs 现状）**:
- **现状**: critical 全量注入 + important 索引注入 + normal 不注入。Agent 靠 read 工具自己调查约束，system prompt 压力大。
- **新设计**: L0/L1 始终注入，L2 **跨 Wing 语义聚合**（根据上下文 embedding 自动匹配所有 Wing 中的相关节点），L3 仅工具查询。
- **核心改进**: L2 从"所有 important 节点"变为"跨 Wing 语义相关的节点"——Agent 不再需要靠 read 工具自己去调查约束，系统自动预加载。

**L2 跨 Wing 语义聚合流程**:
1. 当前上下文（最近对话 + 正在编辑的文件）→ 生成 context embedding
2. 跨所有 Wing 做 cosine similarity 搜索
3. 取 top-K 相关节点（K 由 token 预算控制）
4. Wing/Room 作为组织结构（方便浏览和管理），但检索是跨 Wing 的

---

## 4. 语义检索升级

**方案**: Transformers.js + IndexedDB

- **Embedding 模型**: `bge-small-zh-v1.5`（中文优化，512 维）或 `multilingual-e5-small`（384 维）
- **首次加载**: Loading Page 中下载模型（~30MB），缓存到 IndexedDB
- **向量存储**: 每个知识节点加 `embedding: number[]` 字段，存 IndexedDB
- **检索流程**:
  1. 用户消息 → 生成 query embedding
  2. 向量相似度搜索（cosine similarity）过滤候选
  3. Fuse.js 模糊搜索补充
  4. 复合排序: `semantic(0.5) + fuzzy(0.3) + importance(0.2)`
  5. 按层策略返回结果

---

## 5. LLM 驱动自动更新（混合 Hermes + MemPalace）

**保留现有能力（Hermes 式提取）**:
- `knowledgeExtractionAgent.ts` — 两阶段知识提取（QuickEval + Decision）
- `chapterAnalysisAgent.ts` — 章节分析提取角色状态/伏笔/情节点
- `knowledgeDecisionAgent.ts` — 知识决策（add/update/link/skip）

**新增能力（MemPalace 式组织 + 语义增强）**:
- **语义去重**: 新知识生成 embedding 后，先和已有节点做 cosine similarity，> 0.85 判定为重复 → 走 update 而非 add（解决重复提取问题）
- **自动分类入库**: 给决策 Agent 提供 Wing/Room 分类表作为上下文，从预定义选项中选择而非自由填写（解决分类不准问题）
- **跨 Wing 关联**: 自动发现不同 Room 间关联并建立 edge（如角色状态变化 → Timeline 事件）
- **矛盾检测**: Decision Agent 增加 "contradict" 操作类型，检测到与现有知识冲突时标记
- **记忆压缩**: Context 压缩时自动提取关键信息存入情景记忆
- **定期整理**: 批量扫描高相似度节点对建议合并，清理孤立/过时节点
- **重要性衰减优化**: 现有 `knowledgeIntelligence.ts` 的半衰期机制保留，新增访问频率权重

---

## 6. 关键文件变更清单

### 新增文件
- `stores/memoryStackStore.ts` — 4层记忆栈状态管理
- `domains/memory/memoryStackService.ts` — 记忆栈加载策略实现
- `domains/memory/embeddingService.ts` — Transformers.js embedding 封装
- `domains/memory/vectorSearchService.ts` — 向量检索 + 混合排序
- `components/LoadingPage.tsx` — 首次加载页面（模型下载进度）
- `services/resources/skills/migrationGuide.ts` — Skill → 记忆迁移指引

### 修改文件
- `types.ts` — KnowledgeNode 增加 wing/room/embedding 字段
- `stores/knowledgeGraphStore.ts` — 增加 wing/room 字段、embedding 字段
- `services/resources/skills/coreProtocol.ts` — `constructSystemPrompt()` 重构为 4层加载
- `services/subAgents/knowledgeDecisionAgent.ts` — 增加矛盾检测 + Wing/Room 自动分类 + 语义去重
- `domains/agentContext/historyBuilder.ts` — 压缩时触发记忆提取
- `utils/knowledgeIntelligence.ts` — 增加访问频率权重
- `hooks/agent/useAgentEngine.ts` — 集成记忆栈到 Agent 循环
- `services/agent/tools/knowledgeGraphTools.ts` — 增加语义检索工具
- `services/agent/tools/searchTools.ts` — 增加向量搜索工具

### Skill 内容迁移（从 Skill 文件移入记忆系统）
- `textPolish.ts` 中的禁用词列表 → `创作规范/用语忌讳` Room
- `textPolish.ts` 中的文风标准 → `创作规范/文风习惯` Room
- `writingGuides.ts` 中的写作技巧 → `创作规范/写作技巧积累` Room

---

## 7. 数据迁移

现有知识节点迁移策略：
1. 读取所有现有 KnowledgeNode
2. 根据分类自动分配 Wing/Room:
   - `设定` → `world` Wing
   - `规则` → `writing_rules` Wing
   - `禁止` → `writing_rules/用语忌讳` Room
   - `风格` → `writing_rules/文风习惯` Room
3. 批量生成 embedding
4. 写回更新后的节点

---

## 8. Loading Page 设计

独立组件，在 App 初始化时显示：
- 检测 Transformers.js 模型是否已缓存
- 未缓存: 显示下载进度条 + 提示文字
- 已缓存: 跳过或短暂显示品牌 Logo
- 同时加载 IndexedDB 中的 store 数据
- 全部就绪后过渡到主界面

---

## 实施阶段

### Phase 1: 基础架构（Wing/Room + Loading Page）
1. KnowledgeNode 类型增加 wing/room/embedding 字段
2. 数据迁移脚本（自动分配 Wing/Room）
3. Loading Page 组件
4. memoryStackStore 创建

### Phase 2: 4层记忆栈 + Prompt 重构
1. memoryStackService 实现 L0-L3 加载策略
2. constructSystemPrompt() 重构
3. Skill 内容拆分迁移
4. 集成测试

### Phase 3: 语义检索
1. embeddingService（Transformers.js 封装）
2. vectorSearchService（向量检索 + 混合排序）
3. 知识节点批量 embedding 生成
4. 搜索工具升级

### Phase 4: LLM 自动更新增强
1. knowledgeDecisionAgent 增加 Wing/Room 自动分类（MemPalace 式）
2. knowledgeDecisionAgent 增加语义去重（基于 embedding 相似度）
3. knowledgeDecisionAgent 增加矛盾检测
4. 历史压缩时触发记忆提取
5. 定期整理: 批量扫描合并 + 孤立节点清理
6. 重要性衰减优化（新增访问频率权重）

---

## 验证方式

1. **数据迁移**: 运行迁移脚本，验证所有现有知识节点正确分配到 Wing/Room
2. **4层加载**: 开启新 session，检查 system prompt 中 L0/L1 内容正确，L2 跨 Wing 按需加载
3. **语义去重**: 提取相近内容两次，验证第二次走 update 而非 add
4. **语义检索**: 测试用语义相近但不共享关键词的查询，验证检索质量优于纯 Fuse.js
5. **Loading Page**: 首次访问验证模型下载进度，二次访问验证缓存跳过
6. **矛盾检测**: 手动创建冲突知识节点，验证 Agent 自动标记
7. **现有测试**: `npm test` 确保不破坏现有功能

---

## 风险和注意事项

1. **Transformers.js 模型体积**（~30MB）— 需要良好的 Loading Page 体验
2. **浏览器性能**: embedding 计算在主线程可能卡顿 — 考虑 Web Worker
3. **向后兼容**: Wing/Room 字段可选，旧数据迁移后才填充
4. **Skill 拆分**: 需要逐个检查 Skill 文件，确保只迁移记忆内容，方法论保留
