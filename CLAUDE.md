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

Stores use `createPersistingStore.ts` for IndexedDB persistence with debounced saves (default 1s).

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

### File Domain (`domains/file/`)
`fileService.ts` contains:
- System file protection logic (protected folders/files)
- File tree building and validation
- Protected folders: `98_技能配置`, `99_创作规范`, `subskill`
- Protected prefixes: `技能_`, `指南_`, `模板_`

## Key Patterns

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

- `vite.config.ts` - Vite config with `@` alias
- `tsconfig.json` - TypeScript config
- `jest.config.cjs` - Jest config with jsdom environment
