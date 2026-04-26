# NovelIDE Context Management Optimization

## Background

NovelIDE is moving from a long prompt plus chat history model toward a small Context OS:

- Stable protocol: durable behavior contract, tool rules, and skill index.
- Runtime state: current project, mode, todos, active file, and task state.
- Working memory: task-local continuity for the current collaboration.
- Canon retrieval: project truth loaded from the right asset/tool by workflow, not inferred from chat.
- Ephemeral transcript: recent user/model/tool messages needed for short-term continuity.

The goal is not only to reduce token count. The context manager should improve tool accuracy,
long-running coherence, and prompt-cache reuse.

## Resolved In This Pass

1. Dynamic system prompt churn reduced

   `constructSystemPrompt` now keeps the core protocol and skill index ahead of the dynamic
   `<runtime_context>`. User turn history is no longer duplicated in the system prompt.

2. Fixed window replaces dynamic history decay

   `buildSimpleHistory` now keeps a fixed recent transcript and does not strip tool args, remove old
   model text by age, or rewrite previous messages. Tool call/result legality is repaired after
   slicing. Fiction continuity should come from canon assets and workflow retrieval instead of
   dynamic chat-history decay.

3. Tool-name drift handled

   Current visible tool names (`glob`, `read`, `grep`, `write`, `edit`) map to legacy categories for
   debug/stat compatibility.

4. Lazy tool refresh timing fixed

   Tool definitions are refreshed inside the ReAct loop, so `search_tools` and `activate_skill`
   affect the next model call in the same user turn.

5. Duplicate window integrity logic removed

   Context window repair has a single source of truth in `domains/agentContext/windowing.ts`.

6. Tool history integrity hardened

   Window repair now checks tool call/result ids, and missing function-call ids are filled before
   messages enter history.

## Target Design

### L0 Stable Protocol

Cache-friendly and deterministic. Contains Soul summary, protocol, core tool guidance, and the
stable skill index. It should avoid current user input, volatile todos, file tree changes, and
retrieved memory.

Soul is now split into two layers:

- Global Soul: app-level, cross-project, stored in IndexedDB settings and edited from global settings.
  It carries NovelGenie's long-term personality, collaboration preferences, user preferences, and
  reusable style tendencies.
- Project Soul Override: project-level `98_技能配置/skills/核心/soul.md`. It only records the current
  project's special requirements and overrides the global soul when there is tension.

Default inheritance rule: user preferences and methods can cross projects; concrete story facts,
character voices, proper nouns, world rules, plot state, and a project's prose fingerprint cannot
cross projects unless the user explicitly asks to derive style from that project.

The stable protocol includes Soul update criteria:

- Global Soul accepts only long-lived cross-project collaboration preferences, communication habits,
  stable aesthetics, and high-importance corrections.
- Project Soul Override accepts only current-project tone, POV, prose-density, and project-specific
  constraints.
- Project facts, character voices, proper nouns, plot state, and foreshadowing stay in project
  assets/canon tools, not global Soul.
- If the runtime has no direct global Soul write tool, the agent must not claim it updated global
  Soul; it should record self-evolution memory or ask the user to confirm in global settings.

### L1 Runtime State

Small and dynamic. Contains mode, active file, current todos, active tool categories, and current
task status. Keep section order deterministic.

### L2 Working Memory

Task continuity. Contains current objective, completed steps, pending decisions, recent edits, and
non-negotiable constraints. This should be maintained as state, not rediscovered from raw chat
history each turn.

### L3 Canon Retrieval

Workflow-guided project truth. Skills decide which canon source to query:

- writing rules and world rules: `query_memory`
- foreshadowing: `outline_getUnresolvedForeshadowing` / `outline_getForeshadowingDetail`
- plot events and chapters: outline/timeline tools
- character state: character tools and character profile files
- prose continuity: previous chapter via `glob`/`read`

### L4 Ephemeral Transcript

Recent raw conversation and tool messages. Old tool results should eventually become stable
observations instead of remaining as raw payloads.

## Implementation Plan

### Phase 1: Correctness

- Add classifier aliases for current tool names.
- Refresh available tools inside each ReAct loop iteration.
- Remove duplicate window repair code from the engine path.
- Remove dynamic history decay; keep a fixed sliding transcript window plus tool-boundary repair.

### Phase 2: Cache-Friendly Prompt Assembly

- Split prompt construction into stable protocol, runtime context, memory context, and skill context.
- Move `userInputHistory` out of the stable system prompt.
- Keep deterministic ordering for files, skills, memory sections, and tools.

### Phase 3: Workflow-Guided Continuity Gates

- Treat compression as a fallback for unusually long ReAct chains, not as the primary fiction memory.
- Strengthen skill workflows with explicit pre-write retrieval gates and post-write sync gates.
- Ensure writing workflows query canon sources instead of relying on chat summaries.
- Keep raw transcript short; continuity should come from structured assets and tool recall.

### Phase 4: Context Telemetry

Partially implemented through existing settings/debug surfaces:

- API usage panel shows cache hit/miss aggregate and recent-call cache rate.
- History debug panel shows fixed window size, sent/dropped/skipped messages, tool call/result count,
  and estimated transcript tokens.

Remaining optional telemetry:

- stable prompt tokens
- runtime context tokens
- memory tokens
- tool schema tokens

## Success Criteria

- New and legacy tool names classify into the same decay categories.
- Tool activation takes effect on the next LLM call within the same user turn.
- The engine has a single source of truth for context window integrity.
- Cache hit ratio improves when users continue working in the same project/session.
- Long sessions retain decisions and project facts through canon assets and workflow recall, without
  carrying stale raw tool dumps.
- Context window size is configurable in settings.
