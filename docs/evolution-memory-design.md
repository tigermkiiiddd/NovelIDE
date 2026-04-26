# NovelIDE 自进化记忆系统设计

## 目标

让 NovelGenie agent 具备类似 Hermes 的持久记忆能力：

1. **自动创建技能** — 任务完成后提炼方法论为可复用技能
2. **优化已有技能** — 发现技能不足时自动 patch
3. **记录最佳工作范式** — 跨项目积累写作流程经验
4. **跨项目人格** — soul.md 跨项目共享，不重置
5. **短期跨会话记忆** — 记住最近 N 次会话的要点，不丢失上下文

## 现有基础设施

```
98_技能配置/skills/
  ├── 核心/        (soul.md, protocol.md)
  ├── 创作/        (技能_深度思考方法论.md, ...)
  ├── 规划/        (技能_章节规划.md, ...)
  ├── 设计/        (技能_角色设计.md, ...)
  ├── 审核/        (技能_内容审核.md, ...)
  └── 补丁/        ({题材}_{技能}.md)

domains/memory/memoryStackService.ts — 4层记忆栈 L0-L3
stores/memoryStackStore.ts — Zustand store
services/agent/tools/knowledgeGraphTools.ts — 记忆宫殿 CRUD
services/agent/tools/skillTools.ts — skills_list + activate_skill
```

## 设计方案

### 1. 新增 Store: `stores/agentMemoryStore.ts`

跨项目持久化 agent 的个人记忆（IndexedDB），不随项目切换丢失。

```typescript
interface AgentMemoryEntry {
  id: string;
  type: 'insight' | 'pattern' | 'correction' | 'workflow' | 'preference';
  content: string;         // 记忆内容
  context: string;         // 触发上下文（用户说了什么/做了什么）
  relatedSkills?: string[];// 关联的技能名
  projectGenre?: string;   // 来自哪个项目类型
  importance: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}
```

### 2. 新增 Domain: `domains/agentMemory/`

- `agentMemoryService.ts` — CRUD + 搜索 + 自动摘要
- 持久化到 IndexedDB（复用 createPersistingStore）
- 跨项目共享（不绑 project ID）

### 3. 新增工具: `services/agent/tools/evolutionTools.ts`

```
manage_evolution(action, ...)
  - record_insight   — 记录一次洞察（任务完成后主动调用）
  - record_pattern   — 记录最佳工作范式
  - record_correction— 记录被用户纠正的内容
  - recall           — 搜索相关记忆
  - list             — 列出所有记忆（按类型/重要性过滤）
  - create_skill     — 从积累的 insight/pattern 自动生成技能文件
  - optimize_skill   — 分析现有技能，基于使用经验补全/修正
```

### 4. 系统 Prompt 注入

在 coreProtocol.ts 的 `constructSystemPrompt()` 中：

```
## 自进化记忆（跨项目持久）
{{AGENT_MEMORY}}

## 自进化指令
- 完成复杂任务后，用 manage_evolution(action="record_insight") 记录学到的经验
- 被用户纠正时，用 manage_evolution(action="record_correction") 记住
- 发现重复模式 3 次以上时，用 manage_evolution(action="create_skill") 固化为技能
- 定期用 manage_evolution(action="optimize_skill") 优化已有技能
```

### 5. 跨项目人格

全局 Soul 已作为正式能力接入：`stores/globalSoulStore.ts` 通过 IndexedDB settings
保存 `globalSoul`，设置弹窗提供“全局 Soul”编辑页。项目内的
`98_技能配置/skills/核心/soul.md` 不再承担主人格职责，只作为当前项目覆盖层。

```
全局 soul (IndexedDB settings.globalSoul)
  └── 用户偏好、通用写作风格、沟通习惯
项目 soul (项目文件)
  └── 项目特定设定（题材风格、角色语气等）
```

合成顺序：`globalSoul + projectSoulOverride`。若项目 `soul.md` 仍是旧版默认 soul，
系统将其视为未设置覆盖，避免重复注入。

### 6. 短期跨会话记忆

`agentMemoryStore` 中维护一个 `recentSessions` 数组：

```typescript
interface SessionSummary {
  sessionId: string;
  projectId: string;
  summary: string;        // 本次会话做了什么
  keyDecisions: string[]; // 关键决策
  unresolvedTopics: string[]; // 未完成的话题
  timestamp: number;
}
```

每次会话结束时（final_answer 或用户离开），agent 自动调用
`manage_evolution(action="summarize_session")` 生成摘要。
下次开新会话时注入最近 3-5 条 session summary。

## 文件清单

### 新增
- `stores/agentMemoryStore.ts` — 自进化记忆 Zustand store
- `domains/agentMemory/agentMemoryService.ts` — 记忆服务层
- `services/agent/tools/evolutionTools.ts` — 自进化工具定义+执行
- `types/agentMemory.ts` — 类型定义

### 修改
- `services/resources/skills/coreProtocol.ts` — 注入自进化记忆 + 指令
- `services/agent/tools/categories.ts` — 注册 evolution 工具到 alwaysOn
- `services/agent/tools/index.ts` — re-export
- `services/agent/toolRunner.ts` — 添加 evolution 工具 dispatch
- `services/agent/tools/toolCatalog.ts` — 添加工具描述
