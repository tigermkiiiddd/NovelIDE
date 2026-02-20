# CLAUDE.md - NovelIDE (NovelGenie IDE)

AI-powered novel writing IDE built with React 19, TypeScript, and Vite.

## Development Commands

```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build
npm run build:cf     # Cloudflare-compatible build
npm test             # Run Jest tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

### Running a Single Test
```bash
npm test -- path/to/test.file.test.ts
npm test -- --testNamePattern="test name"
```

## Architecture Overview

### Project Structure
```
├── components/      # React UI components
├── stores/          # Zustand state management
├── services/        # Business logic layer
│   ├── agent/       # AI agent tools and runner
│   ├── resources/   # Skills and writing guides
│   └── subAgents/   # Specialized sub-agents
├── hooks/           # Custom React hooks
│   └── agent/       # Layered agent hook system
├── domains/         # DDD domain logic
├── utils/           # Utility functions
└── types/           # TypeScript definitions
```

### State Management (Zustand Stores)
- `projectStore` - Project metadata and settings
- `fileStore` - File tree and content management
- `agentStore` - AI chat sessions and messages
- `uiStore` - UI state (panels, modals)
- `diffStore` - Diff viewing state
- `planStore` - Plan mode notebook data (lines, annotations, review status)

Stores use `createPersistingStore.ts` for IndexedDB persistence with debounced saves (default 1s).

**Important**: When accessing store state from outside React components (e.g., in tool execution), use `useStoreName.getState()` to get the latest state, not the stale closure value.

### Agent System Layers (`hooks/agent/`)
The agent system uses a layered architecture:
1. `useAgentContext.ts` - Session management, AI service lifecycle
2. `useAgentTools.ts` - Tool definitions and execution
3. `useAgentEngine.ts` - Core chat loop and message handling

### AI Tools (`services/agent/tools/`)
- `fileReadTools.ts` / `fileWriteTools.ts` - File operations
- `projectTools.ts` - Project management
- `todoTools.ts` - Task tracking
- `subAgentTools.ts` - Sub-agent orchestration
- `planTools.ts` - Plan notebook management (Plan mode only)

### Tool Execution Flow (`services/agent/toolRunner.ts`)
1. **Write operations** (create/update/patch/delete/rename) return `APPROVAL_REQUIRED` with diff preview
2. **Read operations** execute immediately and return `EXECUTED`
3. **Sub-agents** (e.g., `call_search_agent`) run autonomous search tasks
4. The UI displays approval dialogs for write operations before executing `executeApprovedChange()`

### Agent Engine Loop (`hooks/agent/useAgentEngine.ts`)
The ReAct loop:
1. Build system prompt via `constructSystemPrompt()` (includes project context, todos, skills)
2. Call LLM with tool definitions
3. If tool calls returned → execute tools → feed results back → repeat
4. If no tool calls → end conversation turn
5. Maximum 10 tool loops per turn (protection against infinite loops)

### File Domain (`domains/file/`)
`fileService.ts` contains:
- System file protection logic (protected folders/files)
- File tree building and validation
- Protected folders: `98_技能配置`, `99_创作规范`, `subskill`
- Protected prefixes: `技能_`, `指南_`, `模板_`

## Key Patterns

### System Prompt Construction (`services/resources/skills/coreProtocol.ts`)
- `DEFAULT_AGENT_SKILL` - Core protocol defining agent behavior, prime directives, and workflow SOP
- `PLAN_MODE_PROTOCOL` - Additional rules when Plan mode is active (restricts write operations)
- `constructSystemPrompt()` - Assembles: agent protocol + plan mode + project context + todos + file tree
- Lazy-loads sub-skills: only paths are injected; agent must `readFile` to activate

### Persisting Store Pattern
```typescript
// stores/createPersistingStore.ts
export function createPersistingStore<T>({
  name,
  initialState,
  saver,
  debounceMs = 1000
})
```
Creates Zustand stores with automatic debounced persistence to IndexedDB.

### AI Provider Support
Multi-provider support via `services/geminiService.ts`:
- Google Gemini
- DeepSeek
- Moonshot
- OpenAI

Configure via AI settings in the UI.

## Testing

Jest with ts-jest, located in `__tests__/`:
- `unit/stores/` - Store tests
- `unit/domains/` - Domain logic tests
- `unit/` - Service tests

Test setup: `src/test/setup.ts`
Test utilities: `src/test/utils/testHelpers.ts`

## Configuration Files

- `vite.config.ts` - Vite config with `@` alias mapping to project root
- `tsconfig.json` - TypeScript config
- `jest.config.cjs` - Jest config with jsdom environment

## File Organization

The project uses a flat structure at root level (not inside `src/`):
- `components/`, `stores/`, `hooks/`, `services/`, `domains/`, `utils/`, `types/` are at project root
- Only test infrastructure is in `src/test/`
- Entry points: `index.tsx`, `App.tsx` at root
