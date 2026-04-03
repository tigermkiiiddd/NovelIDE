# 重构 skillTriggerStore：复用 LifecycleManager 作为统一的 round 来源

## Context

之前已经发现 `LifecycleManager` (`domains/agentContext/toolLifecycle.ts`) 有完整的 round 衰减机制，但 `skillTriggerStore` 又造了一套几乎一样的轮次递增逻辑。两个系统各自维护 `currentRound`，既冗余又容易出 bug（跨项目切换时竞态条件）。

目标是让 `LifecycleManager` 成为唯一的 round 来源，`skillTriggerStore` 只负责管理技能记录本身。

## 方案

保持 `LifecycleManager` 的 stored counter 模式（不改语义），给它加个初始化方法，导出单例，然后让 store 委托过去。

## 实施步骤

### 1. 修改 `LifecycleManager` - 导出单例，加初始化方法

**文件**: `domains/agentContext/toolLifecycle.ts`

- 新增 `setCurrentRound(round)` 方法
- 新增 `reset()` 方法
- 模块级导出单例: `export const lifecycleManager = new LifecycleManager()`

### 2. 重构 `skillTriggerStore` - 移除自己的 currentRound

**文件**: `stores/skillTriggerStore.ts`

- 引入 `lifecycleManager`
- 从 state 接口和初始值中移除 `currentRound` 和 `isLoading`
- `advanceRound`: 改为 `lifecycleManager.advanceRound()`
- `triggerSkill`: 改为 `lifecycleManager.getCurrentRound()`
- `getActiveSkills`: 改为 `lifecycleManager.getCurrentRound()`
- `loadFromDB`: 加载后调用 `lifecycleManager.setCurrentRound(state.currentRound)`
- `reset`: 改为 `lifecycleManager.reset()`
- `recalibrate`: 改为 `lifecycleManager.setCurrentRound(newMessageCount)`
- 持久化改为只保存 `records`（`currentRound` 来自 manager）

### 3. 修改 `useAgentEngine` - 直接调用 manager

**文件**: `hooks/agent/useAgentEngine.ts`

- 引入 `lifecycleManager`
- 第 77 行 `useSkillTriggerStore.getState().advanceRound()` 改为 `lifecycleManager.advanceRound()`

### 4. 修改 `constructSystemPrompt` - 用 manager 获取 round

**文件**: `services/resources/skills/coreProtocol.ts`

- 引入 `lifecycleManager`
- 第 782 行 `getRemainingRounds(record, triggerStore.currentRound)` 改为 `getRemainingRounds(record, lifecycleManager.getCurrentRound())`
- 整段 `triggeredSkillsSection` 逻辑里不再需要 `triggerStore`

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `domains/agentContext/toolLifecycle.ts` | +setCurrentRound, +reset, 导出单例 |
| `stores/skillTriggerStore.ts` | 移除 currentRound/isLoading，委托给 manager |
| `hooks/agent/useAgentEngine.ts` | 直接调用 manager.advanceRound() |
| `services/resources/skills/coreProtocol.ts` | 用 manager.getCurrentRound() |

## 验证方式

1. `npm run build` 确认无编译错误
2. 切换项目后检查 console 无 `[SkillTrigger] advanceRound: 加载中` 日志
3. 项目A激活技能 → 切换项目B → 新会话不应注入项目A的技能
4. 跨项目切换后 round 从 0 开始计数（而不是继承旧值）
