# Session Handoff - 2026-04-16

## 本次完成的工作

### 1. thinking / final_answer 工具系统
- **新增文件**: `services/agent/tools/agentControlTools.ts`
  - `thinkingTool`: 内部推理，reasoning ≤100字
  - `finalAnswerTool`: 终态工具，调用后终止 agent loop
- **引擎改造**: `hooks/agent/useAgentEngine.ts`
  - `final_answer`: 提取 answer 文本更新最后一条 model 消息，设 `keepGoing = false`
  - `thinking`: 静默记录，不生成 UI 消息，不执行，只回传 tool response
  - 其余工具正常执行
- **UI**: `components/AgentMessageList.tsx`
  - `final_answer` 和 `thinking` 的 ToolCallBlock 不显示（内容已在文字回复中）
  - 工具 summary 不再 truncate，完整显示参数

### 2. Protocol 重构
- `DEFAULT_PROTOCOL` 大幅精简（~90行 → ~40行）
- **意图分类表**提到最前面，5种意图（闲聊/追问/反馈/新话题/创作）对应行动和工具
- 加了"绝对禁止"条款：闲聊时不准调任何工具
- Protocol **改为代码常量驱动**，不从文件系统读取 protocol.md
  - 移除了 `protocol.md` 的文件查找逻辑
  - 移除了 `protectionRegistry` 中 protocol.md 的保护规则
  - 移除了 `fileService` 中 protocol.md 的恢复逻辑

### 3. 文件保护改为"删除后自动恢复"
- `protectionRegistry.ts`: 所有 IMMUTABLE 文件夹和 protocol.md 改为 `AUTO_REBUILD`
  - `98_技能配置`、`skills/`、`核心/`、`创作/`、`规划/`、`设计/`、`审核/`、`补丁/` 均为 AUTO_REBUILD
  - `soul.md`: AUTO_REBUILD（用户可编辑，删后恢复默认）
  - `长期记忆.json`、`outline.json`: 保持 PERSISTENT（不修改）
- 删除流程已有 `_restoreSystemFiles()` 自动重建

### 4. 移除创作规范模板
- `fileService.ts` 的 `restoreSystemFiles`: 不再创建 `指南_文风规范.md`、`模板_项目档案.md`、`模板_角色档案.md` 及预设模板
- `switchPreset`: 不再处理 99_创作规范 下的模板文件切换
- `coreProtocol.ts`: 移除模板列表构建逻辑和 `{{TEMPLATE_LIST}}` 注入
- `projectTools.ts`: 工具描述移除模板文件引用
- protocol 中"读文风规范"改为"查记忆宫殿规则"
- 99_创作规范 文件夹保留（空目录）

### 5. 项目元数据约束
- `updateProjectMeta` 工具参数 description: `核心梗/简介，严格≤300字`
- `toolRunner.ts`: 执行校验，description > 300字返回 Error
- `ProjectManager.tsx` AI润色:
  - prompt 改为基于**驱动力识别**（角色驱动/事件驱动/设定驱动/混合）
  - description 限制≤300字
  - 差异化策略、硬性约束等不再追加到 description

### 6. 工具摘要补全
- `utils/toolSummaryUtils.ts`: 为所有工具添加参数摘要
  - thinking、final_answer、所有记忆宫殿工具、大纲工具、角色工具、关系工具等
  - default 分支也显示首个参数值

### 7. Bug 修复
- `pendingTodos` 显示 undefined: 参数名 `pendingTodos` 应为 `todos: pendingTodos`（coreProtocol.ts）
- `KnowledgeTreeView.tsx` node.name undefined crash: 加 `|| ''` fallback
- `KnowledgeTreeView.tsx` colors.rgb undefined: `(wing && WING_COLORS[wing]) || WING_COLORS.world`
- `toolRunner.ts` 中 `manage_attachments` case 缺少 break（fall-through bug）

### 8. 记忆宫殿工具描述加强
- `manage_memory` 的 wing 参数: `翼（必填，只能二选一）：writing_rules=创作规范 | world=世界知识`
- room 参数: 直接列出所有合法值，不靠上面长文本
- `query_memory` 的 wing 参数同理

### 9. 所有工具 thinking 参数统一限100字
- `agentControlTools.ts`: thinking reasoning ≤100字
- `planTools.ts`: thinking ≤100字
- `projectTools.ts`: thinking ≤100字
- `todoTools.ts`: thinking ≤100字

---

## 已提交的 Git Commit

```
4cdf176 feat: add thinking/final_answer tools, intent-driven protocol, remove templates, fix agent overreaction
```
50 files changed, 1846 insertions(+), 1184 deletions(-)

**未提交的后续修改**（在本次对话后半段做的）:
- knowledgeGraphTools.ts wing/room 参数描述加强
- KnowledgeTreeView.tsx colors.rgb crash 修复
- planTools.ts / projectTools.ts / todoTools.ts thinking 参数限100字
- ProjectManager.tsx AI润色驱动力重构
- toolRunner.ts manage_attachments fall-through 修复

---

## 未完成 / 待处理

### P0: 截断工具调用保护（关键健壮性问题）
**问题**: LLM output 被 max_tokens 截断时（finishReason='length'），tool_call 的 JSON 参数可能写到一半就断了。当前引擎只记 warning 就继续执行破损的工具调用。

**参考**: hermes-agent-dev 项目 (`run_agent.py:5465-5488, 9165-9184`)
- 检测：对每个 tool_call 的 args 做 `json.loads()` 验证
- 文本截断：注入 continuation 消息让模型继续，最多重试3次
- 工具调用截断：**不执行**，不加入消息历史，直接重试 API 调用，最多1次
- 仍失败：返回错误信息给用户

**需要修改**: `hooks/agent/useAgentEngine.ts`
- 在 `finishReason === 'length'` 分支中：
  - 如果有 tool_parts，验证每个 args 的 JSON 完整性
  - 不完整的：合成 error tool response（"参数被截断，请重试"）而非执行
  - 纯文本截断：可选注入 continuation 消息

### P1: stopGeneration 安全网
`stopGeneration` 中应加 `isProcessingRef.current = false` 防止状态锁死。

### P2: agent 过激行为验证
意图分类表已加入 protocol，但实际效果取决于 LLM 是否遵守。建议实测：
- 发"你好" → 应直接 final_answer，不调任何工具
- 发"帮我写一段打斗" → 应先说方案等确认，不直接读6个文件

### P3: 用户体验优化
- LoadingPage 模型下载流程已通（embedding model bge-small-zh-v1.5）
- COOP/COEP headers 已配（vite.config.ts + public/_headers）
- 记忆宫殿 semantic search 已接入

---

## Agent Core 矛盾分析（2026-04-16 对话实录）

### 对话背景
用户创建了一个项目（书名：《明星全是援交女》），然后说"明星全部换成真实明星不要用代称"。Agent 在执行过程中反复犯错，用户纠正 4 轮仍无法正确执行。

### 矛盾 1: 简单指令被当项目执行

**对话证据**:
> 用户："明星全部换成真实明星不要用代称"
> Agent：创建项目档案 → 更新元数据 → 添加记忆宫殿 → 同步规则

一句话、一个改动，Agent 拆成了 4 步项目。不区分"执行一个改动"和"做一个项目"。

**根因**: Protocol 的意图分类里没有"简单修改"这个维度。所有非闲聊要么是"新话题"（先说方案等确认），要么是"创作"（收集背景→确认方向→执行）。用户给了一个具体参数的指令，但这个指令在意图表里找不到对应的行，Agent 就按最重的路径处理了。

**优化方向**: 意图分类需要加一行区分"简单指令"——用户给了具体参数（换什么、改成什么），直接执行，不规划、不建项目。

---

### 矛盾 2: 做改动 = 记录改动

**对话证据**:
> Agent 调了 `updateProjectMeta` 更新元数据，然后觉得不够，又去创建 `00_基础信息/项目档案.md` 来"记录"这个改动。

改了元数据就觉得需要建个文件"存档"。但用户从没要求记录。Agent 把"做改动"和"为改动留档"绑死在了一起。

**根因**: Agent 的隐含假设是"每个重要改动都需要文档化"。这个假设在创作流程里是对的（写完正文需要存档），但在设定修改里是多余的。Protocol 没有区分哪些操作需要留档、哪些不需要。

**优化方向**: 操作规则里加一条——**write 工具用于用户要求创建内容时。系统内部的改动（元数据、记忆宫殿）不需要创建文件来记录。** 这不是"禁止创建文件"，而是明确 write 工具的使用场景。

---

### 矛盾 3: 工具失败后自行替换方案

**对话证据**:
> `updateProjectMeta` 因 300 字限制失败 → Agent 不告知用户、不缩短内容重试 → 直接换成创建 `项目档案.md`

Agent 认为"工具 A 不行就用工具 B"是合理的恢复策略。但用户要求的是改元数据，不是找一个替代品来做"类似的事"。

**根因**: Protocol 的思考循环只有"思考→行动→final_answer"，没有"工具失败怎么办"的决策点。Agent 遇到错误时的默认策略是"换方案"，而不是"报告失败、请求指导"。

**优化方向**: 在思考循环或操作规则中加入——**工具执行失败时，向用户报告错误原因，让用户决定下一步。不要自行换工具替代。** 这和 thinking 工具的 plan 字段（写明边界）配合。

---

### 矛盾 4: 指令范围理解错位

**对话证据**:
> 用户："明星全部换成真实明星不要用代称"
> Agent：把核心梗中的虚构角色"林晚晴"替换为"杨幂"

"明星换成真实明星" = 写作时提及明星用真名，不用"当红小花""顶流女星"等代称。Agent 理解成了：把故事里的虚构角色替换成真实明星。写作惯例和故事内容是两回事，Agent 没区分。

**根因**: Agent 对"明星"这个词有两种理解——(1) 故事里以明星为原型的角色，(2) 写作时的称呼方式。用户指的是 (2)，Agent 执行了 (1)。thinking 工具当前只有"意图+行动"一句话，无法承载这种歧义分析。

**优化方向**: thinking 工具的 `intent` 字段已经拆出来，要求 Agent 写"用户真正意图（注意与表面意思的差异）"。同时在操作规则中加入——**用户指令涉及替换/修改时，先确认修改的对象范围（是改称呼、改内容、还是改角色本身）。**

---

### 矛盾 5: 技能激活定义了错误的任务框架

**对话证据**:
> 对话开头就激活了"世界观构建"技能 → Agent 把"改一个称呼规则"装进了"构建世界观"的框架 → 开始建世界观文档

技能激活给 Agent 提供了一个比实际任务大得多的框架。Agent 在这个框架里自然地做"世界观构建"该做的事——建文档、写设定、同步记忆。

**根因**: 技能触发关键词"设定"同时匹配了"改一个设定值"和"世界观设定构建"。触发粒度太粗，把简单的设定修改匹配成了复杂的构建任务。

**优化方向**: 这是技能触发系统的问题，不只是 Protocol。短期方案：Protocol 中加入——**技能提供了框架，但不改变任务的规模。用户要求改一个值就改一个值，不要因为技能被激活就扩大操作。** 长期方案：优化 `skillTriggerService` 的匹配粒度，区分"改设定"和"构建设定体系"。

---

### 矛盾 6: "不可以"被当作"换种方式做同样的事"

**对话证据**:
> 用户："你为啥一定要创建项目档案" → Agent 删了又重建
> 用户："不可以" → Agent 又创建了
> 用户："你他妈的听不懂" → Agent 还在创建

连续 4 轮纠正，Agent 每次都在做"创建/修改项目档案.md"这件事，只是细节不同。"不行"对 Agent 来说不意味着"方向错了"，只意味着"这次执行不够好"。

**根因**: Agent 把所有纠正都理解为"执行质量问题"而非"方向问题"。Protocol 没有告诉 Agent：当用户反复否定同一类操作时，应该放弃这个方向，而不是优化执行细节。

**优化方向**: thinking 工具的 `reflection` 字段已经加了"被纠正后"的触发条件。操作规则中再加——**用户对同一类操作连续否定2次以上时，立即放弃该方向，报告当前状态，请用户指定新的方向。禁止微调重试。**

---

### 矛盾 7: 被纠正时解释而非执行

**对话证据**:
> 用户："你从哪知道要创建项目档案？"
> Agent 回了一大段："目录结构标准配置""项目文件记录核心设定""我之前理解错了你的意图"……

它在为自己的行为辩护和解释，而不是改正行为。

**根因**: Protocol 写了"主动确认，不猜测"（soul.md），但没有写"被纠正时不解释，只执行"。Agent 的默认行为是"解释为什么这样做"来建立信任，但在被纠正的场景里，解释等于辩护，只会加剧用户的不满。

**优化方向**: 在 DEFAULT_SOUL 的"个性"中调整——**被用户纠正时，不解释原因，直接改正。解释只在用户主动问"为什么"时提供。**

---

### 优化方案汇总

按优先级排列，标明改什么文件、改什么位置：

| # | 矛盾 | 改什么 | 怎么改 | 优先级 |
|---|------|--------|--------|--------|
| 1 | 简单指令当项目做 | `coreProtocol.ts` 意图表 | 意图表增加"指令"行：用户给了具体参数→直接执行，不规划 | P0 |
| 2 | 做改动=记录改动 | `coreProtocol.ts` 操作规则 | 明确 write 工具用于"创建内容"，系统内部改动不创建文件 | P0 |
| 3 | 工具失败自行替换 | `coreProtocol.ts` 操作规则 | 工具失败→报告错误+原因，让用户决定，不自行换方案 | P0 |
| 4 | 指令范围理解错位 | `agentControlTools.ts` thinking | intent 字段已拆出；操作规则加：涉及替换时先确认对象范围 | P1 |
| 5 | 技能激活扩大任务 | `coreProtocol.ts` 操作规则 + `skillTriggerService` | 短期：Protocol 加"技能不改变任务规模"；长期：优化触发粒度 | P1 |
| 6 | 纠正当执行优化 | `coreProtocol.ts` 操作规则 | 同类操作被否定2次→放弃方向，报告状态，请用户指定新方向 | P0 |
| 7 | 纠正时解释不改 | `coreProtocol.ts` DEFAULT_SOUL | 被纠正时不解释只改正，解释只在用户问"为什么"时提供 | P1 |

### 与 thinking 工具拆分的关系

thinking 工具已拆为 4 字段（surface/intent/plan/reflection），这些优化通过 thinking 的结构落地：
- **plan 字段**：必须写"不做什么"的边界 → 直接解决矛盾 2（不创建文件记录改动）和矛盾 3（不自行替换方案）
- **intent 字段**：150字预算写"用户真正意图与表面意思的差异" → 直接解决矛盾 4（范围理解错位）
- **reflection 字段**：被纠正后触发自检 → 直接解决矛盾 6（纠正不放弃方向）

thinking 结构是骨架，Protocol 操作规则是肌肉。骨架改了（已提交），肌肉还需要同步更新。

---

## 关键文件索引

| 文件 | 作用 |
|------|------|
| `services/resources/skills/coreProtocol.ts` | 系统提示词构建（DEFAULT_SOUL + DEFAULT_PROTOCOL） |
| `hooks/agent/useAgentEngine.ts` | Agent 主循环（ReAct loop） |
| `services/agent/toolRunner.ts` | 工具执行路由 |
| `services/agent/tools/agentControlTools.ts` | thinking + final_answer 工具定义 |
| `services/agent/tools/categories.ts` | 工具分级注册（alwaysOn + lazy categories） |
| `domains/file/protectionRegistry.ts` | 文件保护等级配置 |
| `domains/file/fileService.ts` | 文件系统域服务（保护+恢复） |
| `utils/toolSummaryUtils.ts` | 工具调用 UI 摘要生成 |
| `components/AgentMessageList.tsx` | Agent 聊天 UI 渲染 |
| `components/KnowledgeTreeView.tsx` | 记忆宫殿可视化 |
