# NovelIDE Context Management Optimization

## Background

NovelIDE is moving from a long prompt plus chat history model toward a small Context OS:

- Stable protocol: durable behavior contract, tool rules, and skill index.
- Runtime state: current project, mode, todos, active file, and task state.
- Working memory: compact, task-local continuity for the current collaboration.
- Retrieved memory: project knowledge loaded by topic instead of always-on bulk context.
- Ephemeral transcript: recent user/model/tool messages needed for short-term continuity.

The goal is not only to reduce token count. The context manager should improve tool accuracy,
long-running coherence, and prompt-cache reuse.

## Current Risks

1. Dynamic system prompt churn

   `constructSystemPrompt` currently receives project state, todos, messages, and memory inputs.
   This makes the first part of the request change often, which lowers prefix-cache reuse.

2. History decay mutates older messages

   `buildSimpleHistory` can strip tool args or remove old tool call/result pairs. This is useful
   for token control, but it means the same earlier conversation can serialize differently over
   time, which is unfriendly to provider prompt caches.

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

Compact task continuity. Contains current objective, completed steps, pending decisions, recent
edits, and non-negotiable constraints. This should be maintained as state, not rediscovered from
raw chat history each turn.

### L3 Retrieved Memory

Topic-based project knowledge. Character, worldbuilding, outline, user preference, and prior
creative decisions should be loaded only when relevant.

### L4 Ephemeral Transcript

Recent raw conversation and tool messages. Old tool results should eventually become stable
observations instead of remaining as raw payloads.

## Implementation Plan

### Phase 1: Correctness

- Add classifier aliases for current tool names.
- Refresh available tools inside each ReAct loop iteration.
- Remove duplicate window repair code from the engine path.

### Phase 2: Cache-Friendly Prompt Assembly

- Split prompt construction into stable protocol, runtime context, memory context, and skill context.
- Move `userInputHistory` out of the stable system prompt.
- Keep deterministic ordering for files, skills, memory sections, and tools.

### Phase 3: Observation-Based Compaction

- Preserve only the recent transcript as raw messages.
- Convert old tool calls/results into stable observations:
  - `glob`/`grep`/`read`: file observation
  - `write`/`edit`: edit record
  - review/analysis tools: decision record
  - failed tools: failure cause and retry hint
- Keep generated observations stable unless new facts supersede them.

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
- Long sessions retain decisions and project facts without carrying stale raw tool dumps.
