# NovelIDE (NovelGenie IDE) 🚀

<p align="center">
  <strong>AI-Powered Novel Writing IDE</strong><br>
  Intelligent writing environment designed for novelists
</p>

<p align="center">
  <a href="https://github.com/tigermkiiiddd/NovelIDE/stargazers"><img src="https://img.shields.io/github/stars/tigermkiiiddd/NovelIDE?style=flat&label=Stars&color=yellow" alt="GitHub Stars" /></a>
  <a href="https://github.com/tigermkiiiddd/NovelIDE/issues"><img src="https://img.shields.io/github/issues/tigermkiiiddd/NovelIDE" alt="GitHub Issues" /></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8" />
  <img src="https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white" alt="Vite 6.2" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Source_Available-FF6B6B" alt="License" /></a>
</p>

<p align="center">
  <strong>👉 English</strong> | <a href="./README.zh.md">中文</a>
</p>

---

## License

**NovelIDE is source-available, but it is not licensed for unrestricted commercial use.**

You may use this project for personal, educational, research, evaluation, and other non-commercial purposes. Commercial use requires prior written permission from the copyright holder, including but not limited to SaaS/hosted services, commercial platforms, paid products, commercial integrations, client deliverables, resale, commercial distribution, or paid writing/editing/generation/automation/consulting services powered by this software.

For commercial licensing, please contact the project owner. See [LICENSE](./LICENSE) for the full terms.

## Introduction

**NovelIDE** is an Integrated Development Environment (IDE) designed for novelists, blending advanced AI technology with professional writing tools. Through intelligent assistants, a high-end editor, and comprehensive project management, it helps authors stay focused on the creative process.

## Features

### AI Writing Assistant
- **Multi-Model Support**: OpenAI, Google Gemini, DeepSeek, Moonshot, with task-specific model routing (chat, polish, extraction, sub-agents).
- **Contextual Chat**: AI chat system powered by project context.
- **Tool Calling**: AI can read/modify files, manage tasks, and invoke sub-agents.
- **Granular Approval**: Fine-grained approval control for AI-suggested changes.
- **Deep Thinking**: AI creates structured thinking workspace before design/planning tasks.
- **Self Reflection**: AI self-reflects at key decision points for better output quality.

### Skill System
19 specialized writing skills, loaded on demand, with auto-unlocked tool categories on activation:
- **Planning**: Project initialization (6-step guided setup), outline construction (commercial pacing design), multi-strand weaving (multi-narrative balance)
- **Design**: Character design (base-desire-means 3D model), character state tracking (cross-chapter data sync), expectation management (GAP triangle model)
- **Writing**: Full chapter writing pipeline, expansion, dialogue writing, scene description, emotion rendering, combat scenes, de-AI polishing
- **Review**: Editorial review (logic gaps / OOC / filler detection)
- **Meta**: Deep thinking methodology, pleasure rhythm management

<img width="1746" height="1107" alt="image" src="https://github.com/user-attachments/assets/d6f882a0-3433-48ab-8fd2-a6bdbf5037c0" />
<img width="1386" height="1069" alt="image" src="https://github.com/user-attachments/assets/08054683-ca97-400a-b820-80de805f5e8e" />
<img width="1156" height="1107" alt="image" src="https://github.com/user-attachments/assets/f33d7094-fead-4b5c-ae8f-8b7b02908bd5" />

Skills are progressively disclosed — the AI first sees names/descriptions, then loads full methodology on demand with auto-unlocked tool categories.

### Soft Workflow
A control layer between raw prompting and hard tool calling. Authors define structured execution procedures — steps, checkpoints, anti-patterns — that guide the AI through complex creative tasks without exploding tool complexity.

- **Step-by-Step Execution**: Breaks writing tasks into actionable phases (e.g., context recall → outline alignment → draft generation → quality check).
- **Built-in Checkpoints**: Validates against story goals, character states, and foreshadowing status at each phase.
- **Anti-Pattern Guards**: Prevents common failures like "telling instead of showing," dialogue without purpose, or unmotivated actions.
- **Hybrid with Hard Tools**: Soft workflow orchestrates the creative flow; hard tools are unlocked only when data read/write is actually needed.

### Long-term Memory

#### Memory Palace (Knowledge Graph)
- **3-Tier Structure**: Wing → Room → Node, simulating a physical memory palace.
- **Smart Linking**: Supports relationship types between nodes (belongs-to, refines, depends-on, conflicts-with).
- **Auto Extraction**: AI auto-extracts knowledge at conversation end, filtering read-tool results, only persisting creative output.
- **Hybrid Search**: Vector semantic search + Fuse.js fuzzy matching with composite scoring.
- **Visual Knowledge Graph**: Visually display structure and associations.

#### 4-Layer Memory Stack
Controls knowledge injection volume in the AI context window, loading by token budget tiers:
- **L0** (~100 tokens): Agent identity + project metadata (always-on)
- **L1** (~500 tokens): Critical knowledge + world/character summaries (always-on)
- **L2** (~800 tokens): Semantically aggregated context-relevant knowledge (dynamic load)
- **L3**: Full general knowledge + plot memory (on-demand query)

#### Cross-Project Evolution Memory
AI agent's cross-project self-learning system, recording insights, patterns, corrections, user preferences, with importance rating and automatic expiration cleanup.

### Foreshadowing & Timeline
- **World Timeline**: Absolute timestamp event management (day+hour), volume-chapter-event hierarchy.
- **Foreshadowing Management**: Full lifecycle tracking (plant/develop/resolve), planned resolution chapters, batch adjustment, overdue alerts.
- **Story Strands**: Multi-strand balance detection and pacing control.
- **Emotion Curves**: Dual emotion curves (hook + node emotions).

### Chapter Analysis
- **Character State Extraction**: AI auto-extracts character location, emotion, relationship changes per chapter.
- **Foreshadowing Detection**: Auto-detects foreshadowing planting/resolution points.
- **Profile Sync**: Analysis results auto-sync to character memory store.

### Advanced Editor
- **Markdown Highlighting**: Real-time syntax highlighting.
- **Diff View**: Real-time diff comparison with multi-file concurrent sessions.
- **Multi-Mode**: Read-only, Edit, and Diff modes.
- **Patch-based Updates**: AI only modifies needed segments for faster response and clearer diffs.

### Version Control
- **File Versions**: Auto-backup before AI edits, manual snapshots, restore, auto-pruning.
- **Entity Versions**: Separate version history for character profiles and chapter analyses.

### Project Management
- **Virtual File System**: Full directory and file management.
- **Import & Export**: Flexible project data migration.
- **Statistics**: Real-time stats for word and chapter counts.
- **15 Genre Presets**: Xuanhuan, Urban, System, Palace Intrigue, Mystery, Romance, Sci-Fi, Wuxia, Game, History, Infinite Flow, Primordial, Game Novel, Streaming, Cthulhu — each with customized character design, expectation management, pacing, and worldbuilding configs.
- **File Protection**: Declarative file protection system (IMMUTABLE / PERSISTENT / AUTO_REBUILD), skill config files can be edited safely.

### Planning Mode
- **Notebook System**: Structured creative planning.
- **Inline Comments**: Add notes to individual lines.
- **Review Status**: Track the progress of content reviews.

## Design Philosophy

The core design of NovelIDE is to enable AI to better understand and maintain the consistency of long-form novels.

### 1. Knowledge Graph-based Persistent Context
To prevent AI from losing context, key settings are stored in a structured knowledge graph and injected via a 4-layer memory stack with token budgets.

### 2. Progressive Tool Architecture
Tools are split into Tier 1 (17 always-on) and Tier 2 (lazy-loaded by category). Skill activation auto-unlocks dependent tool categories, saving tokens per LLM call.

### 3. Specialized Sub-Agents
Specialized agents for chapter analysis, knowledge extraction, and text polishing, routed to optimal AI models.

### 4. Approval-based Workflow
All AI write operations require approval via diff preview. Tool failure circuit breaker after 2 consecutive failures.

### 5. Extensible Skill System
All writing standards defined in separate files with genre extension support. Auto-triggering via keywords and semantic matching with 8-round decay.

### 6. Semantic Search
Browser-side vector generation with bge-small-zh-v1.5, hybrid retrieval (semantic + fuzzy + importance) for knowledge search and skill trigger matching.

### 7. Soft Workflow
Between raw prompting and rigid tool calling, soft workflow lets authors define *how* the AI executes — not just *what* it writes. Skills like the full chapter pipeline and expansion workflow are soft workflows: they provide clear trigger conditions, execution principles, checklists, and anti-patterns without requiring code-level tool invocations. This gives authors control over the AI's creative procedure itself.

## Tech Stack

| Category | Technology |
|------|------|
| Framework | React 19 |
| Language | TypeScript |
| Bundler | Vite |
| State Management | Zustand (18 stores) |
| Local Storage | IndexedDB |
| Vector Search | @huggingface/transformers (bge-small-zh-v1.5) |
| Fuzzy Search | Fuse.js |
| Styling | CSS Modules |

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

App will start at http://localhost:6388.

## Commercial Licensing

If you want to use NovelIDE in a commercial product, SaaS, internal business workflow, client project, paid service, or any other commercial scenario, please obtain written permission first.

## Project Structure

```
NovelIDE/
├── components/          # React UI Components
├── stores/              # State Stores (18 Zustand Stores)
├── services/            # Service Layer
│   ├── agent/           # AI Agent Tools & Runner
│   │   ├── tools/       # Tool Definitions & Execution
│   │   └── toolDefinitions/ # Tool Parameter Schemas
│   ├── resources/       # Skills & Writing Guides (19 Skills)
│   └── subAgents/       # Specialized Sub-Agents
├── hooks/               # Custom React Hooks
│   └── agent/           # Layered Agent Hook System
├── domains/             # Domain Logic (DDD)
│   ├── file/            # File Protection & Tree Building
│   ├── memory/          # Memory & Vector Search
│   ├── skillTrigger/    # Skill Auto-Trigger
│   └── agentContext/    # Agent Context Windowing
├── utils/               # Utility Functions
├── types/               # TypeScript Type Definitions
└── src/test/            # Test Infrastructure
```

---

<p align="center">
  Made with ❤️ for novel writers
</p>
