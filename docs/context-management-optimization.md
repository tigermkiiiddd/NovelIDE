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

## Current Risks

1. Dynamic system prompt churn

   `constructSystemPrompt` currently receives project state, todos, messages, and memory inputs.
   This makes the first part of the request change often, which lowers prefix-cache reuse.

2. Fixed window replaces dynamic history decay

   `buildSimpleHistory` now keeps a fixed recent transcript and does not strip tool args, remove old
   model text by age, or rewrite previous messages. Tool call/result legality is repaired after
   slicing. Fiction continuity should come from canon assets and workflow retrieval instead of
   dynamic chat-history decay.

3. Tool-name drift

   The visible tool protocol now prefers `glob`, `read`, `grep`, `write`, and `edit`, while parts of
   the history classifier still identify older names such as `listFiles`, `readFile`, `writeFile`,
   and `patchFile`. New tool calls can fall into `UNKNOWN`, so decay policies no longer match the
   intended tool semantics.

4. Lazy tool refresh timing

   Tool definitions are prepared once before the ReAct loop. If `search_tools` or `activate_skill`
   unlocks new categories, the next model call in the same user turn should see the refreshed tool
   set.

5. Duplicate window integrity logic

   Context window repair exists in `domains/agentContext/windowing.ts`, but a second local copy also
   exists in `useAgentEngine`. Duplicate logic increases the chance of behavior drift.

## Target Design

### L0 Stable Protocol

Cache-friendly and deterministic. Contains Soul summary, protocol, core tool guidance, and the
stable skill index. It should avoid current user input, volatile todos, file tree changes, and
retrieved memory.

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

Expose per-request context stats:

- stable prompt tokens
- runtime context tokens
- memory tokens
- transcript tokens
- tool schema tokens
- cache hit/miss tokens
- dropped message count
- cleared tool result count
- generated observation count

## Success Criteria

- New and legacy tool names classify into the same decay categories.
- Tool activation takes effect on the next LLM call within the same user turn.
- The engine has a single source of truth for context window integrity.
- Cache hit ratio improves when users continue working in the same project/session.
- Long sessions retain decisions and project facts through canon assets and workflow recall, without
  carrying stale raw tool dumps.
