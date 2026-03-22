# C●rtex

### Persistent Memory for Claude Code

**Every time you open Claude Code, it forgets everything. Cortex fixes that.**

[![npm version](https://img.shields.io/npm/v/@cortex-memory/cli?color=cb3837&label=npm)](https://www.npmjs.com/package/@cortex-memory/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/ProductionLineHQ/cortex?style=social)](https://github.com/ProductionLineHQ/cortex)
[![CI](https://img.shields.io/github/actions/workflow/status/ProductionLineHQ/cortex/ci.yml?label=CI)](https://github.com/ProductionLineHQ/cortex/actions)

---

## The Problem

Claude Code has amnesia. Every session starts from zero. You explain your architecture, your preferences, your conventions -- and tomorrow it asks again. You lose context, repeat yourself, and waste time re-establishing what the AI should already know.

## The Solution

Cortex is a persistent memory layer that runs as a local daemon alongside Claude Code. It captures decisions, preferences, open threads, and project context as structured memories -- then silently injects them into every new session via MCP. Your AI starts every conversation fully informed.

## Features

- **Persistent Memory** -- decisions, preferences, open threads, and learnings survive across sessions
- **Multi-Machine Sync** -- Turso-powered cloud sync, your database, your control
- **Quality Gate** -- 6-rule engine ensures only high-quality, non-duplicate memories are saved
- **Dashboard** -- Next.js web UI at `localhost:7434`
- **Desktop App** -- Native SwiftUI Mac app + Electron for Windows/Linux
- **VS Code Extension** -- Save memories from your editor, hover to peek
- **Session Summarizer** -- AI reviews your sessions, extracts memories you missed
- **Local-First** -- SQLite on your machine, nothing leaves unless you enable sync
- **One Command Install** -- brew, npx, or curl

## Quick Start

```bash
# Install via npx
npx @cortex-memory/cli init

# Or install globally
npm install -g @cortex-memory/cli
cortex init
```

That's it. Open Claude Code in any project. Cortex starts learning.

### Verify Installation

```bash
cortex doctor
```

```
Cortex Doctor — Running diagnostics...

 ✓ Daemon running
 ✓ SQLite accessible
 ✓ Schema version: v4
 ✓ 47 memories in database
 ✓ DB size: 0.3 MB
 ✓ Claude Code settings: MCP server registered
 ✓ Node.js: v22.12.0
 ✓ Data directory: /Users/you/.cortex

8 passed, 0 failed
 ✓ All checks passed!
```

## How It Works

### 1. Install -- one command

Cortex creates `~/.cortex/`, initializes an SQLite database, and registers itself as an MCP server in Claude Code's settings.

### 2. Cortex learns -- silently captures context

During your Claude Code sessions, Cortex provides 7 MCP tools. When Claude identifies something worth remembering -- a decision, a preference, an error pattern -- it calls `save_memory`:

```
save_memory({
  content: "Using Fastify instead of Express for the API layer.
             Rationale: 2x throughput in benchmarks, built-in
             schema validation via Zod, and first-class TypeScript.",
  type: "decision",
  reason: "Architectural decision that affects all future API work",
  importance: 8,
  tags: ["api", "fastify", "architecture"]
})
```

Every memory passes through a **quality gate** before being stored -- ensuring no duplicates, no sensitive data, no generic fluff.

### 3. Next session -- Claude starts fully informed

When you open Claude Code again, it calls `get_memories` and receives a structured context block:

```
=== CORTEX MEMORY: my-project ===

## DECISIONS
- [importance: 8] Using Fastify instead of Express for the API layer...
- [importance: 7] PostgreSQL with Drizzle ORM, not Prisma...

## PREFERENCES
- [importance: 9] Always use pnpm, never npm or yarn...
- [importance: 6] Prefer named exports over default exports...

## OPEN THREADS
- [importance: 7] Authentication flow not yet implemented...

## RECENT CHANGES
- [2 days ago] Migrated from REST to tRPC for internal APIs...

=== END CORTEX MEMORY ===
```

### 4. Sync -- memories follow you across machines

Enable optional Turso cloud sync and your memories follow you everywhere. Every 30 seconds, Cortex pushes local changes and pulls remote ones. Last-write-wins conflict resolution keeps things simple.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Claude Code                      │
│              (via MCP Protocol)                   │
└──────────────────┬───────────────────────────────┘
                   │ stdio
┌──────────────────▼───────────────────────────────┐
│                Cortex Daemon                      │
│                                                   │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ MCP Server │ │  REST API  │ │  SSE Events  │  │
│  │  (stdio)   │ │ (port 7434)│ │ /api/events  │  │
│  └─────┬──────┘ └─────┬──────┘ └──────┬───────┘  │
│        │              │               │           │
│  ┌─────▼──────────────▼───────────────▼───────┐  │
│  │              Quality Gate                   │  │
│  │  length · banned · sensitive · quality ·    │  │
│  │         duplicate · rate-limit              │  │
│  └────────────────────┬───────────────────────┘  │
│                       │                           │
│  ┌────────────────────▼───────────────────────┐  │
│  │           SQLite (local-first)              │  │
│  │        ~/.cortex/memory.db                  │  │
│  │  FTS5 full-text search · 4 migrations       │  │
│  └────────────────────┬───────────────────────┘  │
│                       │ (optional)                │
│  ┌────────────────────▼───────────────────────┐  │
│  │          Turso Cloud Sync                   │  │
│  │    push/pull every 30s · batch 100          │  │
│  │    last-write-wins · conflict log           │  │
│  │    your database, your control              │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Memory Types

Cortex stores 6 structured types of memory:

| Type | Description | Example |
|------|-------------|---------|
| `decision` | Architectural and technology choices | "Using Fastify instead of Express" |
| `context` | Project state and environment facts | "Monorepo with 6 packages using pnpm" |
| `preference` | Working style and convention preferences | "Always use named exports" |
| `thread` | Open problems and unfinished work | "Auth flow not yet implemented" |
| `error` | Bugs, gotchas, and failure patterns | "SQLite WAL mode required for concurrency" |
| `learning` | Facts and knowledge discovered during work | "Turso supports embedded replicas" |

## CLI Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `cortex init` | Initialize Cortex -- create DB, start daemon, wire Claude Code |
| `cortex status` | Show daemon status, DB size, memory count |
| `cortex doctor` | Run 8 diagnostic checks, auto-fix with `--fix` |
| `cortex dashboard` | Open the web dashboard in your browser |
| `cortex version` | Show CLI and daemon version |

### Memory Commands

| Command | Description |
|---------|-------------|
| `cortex show [project]` | Display memories for current or specified project |
| `cortex search <query>` | Full-text search across all memories |
| `cortex add <text>` | Manually add a memory |
| `cortex edit <id>` | Edit memory metadata (importance, tags, etc.) |
| `cortex delete <id>` | Soft-delete a memory |
| `cortex supersede <id> <content>` | Replace a memory with updated content |
| `cortex memory pin <id>` | Pin a memory (importance 10, never garbage-collected) |
| `cortex memory unpin <id>` | Unpin a memory (reset to importance 5) |
| `cortex timeline [project]` | Chronological memory history grouped by date |
| `cortex link <id> --to <project>` | Link a memory to another project |
| `cortex review` | Interactive review of stale memories |

### Project Commands

| Command | Description |
|---------|-------------|
| `cortex projects` | List all projects |
| `cortex project list` | List all projects (alias) |
| `cortex project switch <name>` | Set the active project |
| `cortex project rename <id> <name>` | Rename a project |
| `cortex project archive <id>` | Archive a project |

### Sync Commands

| Command | Description |
|---------|-------------|
| `cortex sync status` | Show sync state, queue size, connected machines |
| `cortex sync setup` | Interactive Turso credential configuration |
| `cortex sync now` | Force an immediate sync cycle |
| `cortex sync pause` | Pause automatic sync |
| `cortex sync resume` | Resume automatic sync |

### Data Commands

| Command | Description |
|---------|-------------|
| `cortex export` | Export all memories to JSON |
| `cortex import <file>` | Import memories from a JSON file |
| `cortex clear [project]` | Delete memories (creates backup first) |
| `cortex analytics` | Usage stats: memory counts, creation rate, type distribution |

### Config Commands

| Command | Description |
|---------|-------------|
| `cortex config show` | Display current configuration |
| `cortex config set <key> <value>` | Set a configuration value |
| `cortex config reset` | Reset all configuration to defaults |

### System Commands

| Command | Description |
|---------|-------------|
| `cortex upgrade` | Check for and install updates |
| `cortex uninstall` | Remove Cortex completely (with `--dry-run` preview) |
| `cortex summarize` | Manually trigger the session summarizer |
| `cortex subscribe <email>` | Verify newsletter subscription for sync access |
| `cortex template list` | Browse starter memory templates |
| `cortex template apply <name>` | Apply a template to the current project |

> Every command supports `--json` for machine-readable output. See [docs/CLI.md](docs/CLI.md) for the full reference with all flags and examples.

## Configuration

Cortex stores its configuration in `~/.cortex/config.json`:

```json
{
  "sync": {
    "turso_url": "libsql://your-db.turso.io",
    "turso_token_encrypted": "...",
    "enabled": true
  }
}
```

### Configurable Options

| Key | Default | Description |
|-----|---------|-------------|
| `auto_summarize` | `true` | Auto-summarize sessions on end |
| `quality_threshold` | `0.5` | Quality gate threshold |
| `max_memories_per_session` | `50` | Per-session save limit |
| `sync_enabled` | `false` | Enable Turso cloud sync |
| `active_project` | `null` | Currently active project |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CORTEX_LOG_LEVEL` | Daemon log level (`info`, `debug`, `warn`, `error`) |
| `CORTEX_WEB_URL` | Cortex web server URL for subscriber verification |

## Security

### Trust Model

- **Local-first**: All data lives in `~/.cortex/memory.db` on your machine
- **No telemetry**: Cortex sends zero data to any server unless you enable sync
- **No code reading**: Cortex never reads your source code. It only stores structured memories that Claude explicitly saves via MCP tools
- **Encrypted credentials**: Turso sync tokens are encrypted with AES-256-GCM using a machine-derived key
- **Localhost-only API**: The REST API binds exclusively to `127.0.0.1:7434`
- **CORS restricted**: Only `localhost`, `file://`, and `vscode-webview://` origins are allowed

### What Cortex Does NOT Do

- Read or index your source code
- Send data to any external server (without explicit sync setup)
- Store API keys, passwords, or credentials (the quality gate blocks them)
- Run with elevated permissions
- Modify your files or project structure

### Data Ownership

Your memory database is a single SQLite file at `~/.cortex/memory.db`. You own it entirely. Export with `cortex export`, back it up, move it, delete it. If you enable sync, the Turso database is yours too -- you create the account, you hold the credentials.

## Packages

Cortex is a TypeScript monorepo with 7 packages:

| Package | Description |
|---------|-------------|
| `packages/server` | Daemon: MCP server, REST API, SSE, quality gate, sync worker |
| `packages/cli` | Command-line interface (Commander.js) |
| `packages/shared` | Shared types, schemas, constants, and utilities |
| `packages/dashboard` | Next.js web dashboard |
| `packages/web` | Marketing site and documentation |
| `packages/vscode` | VS Code extension |
| `packages/electron` | Electron desktop app (Windows/Linux) |

## Roadmap

### Shipped

- [x] MCP server with 7 tools (save, get, search, list, delete, supersede, update)
- [x] Quality gate with 6 rules
- [x] Full-text search via FTS5
- [x] REST API with 20+ endpoints
- [x] SSE real-time events
- [x] CLI with 30+ commands
- [x] Turso cloud sync with conflict resolution
- [x] Session summarizer
- [x] Memory templates
- [x] Analytics and insights
- [x] Export/import
- [x] Doctor diagnostics (8 checks)
- [x] Memory linking across projects
- [x] Timeline view
- [x] Pin/unpin memories
- [x] Memory ratings

### Coming Next

- [ ] VS Code extension (hover to peek, gutter icons)
- [ ] Native SwiftUI Mac app
- [ ] Electron desktop app (Windows/Linux)
- [ ] Next.js dashboard
- [ ] Interactive TUI for memory review
- [ ] Memory decay and auto-archival
- [ ] Semantic search with embeddings
- [ ] Team memory sharing
- [ ] Plugin system for custom quality rules

## Development

```bash
# Clone
git clone https://github.com/ProductionLineHQ/cortex.git
cd cortex

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Development mode (watch)
pnpm dev
```

**Requirements**: Node.js >= 18, pnpm >= 9

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT -- [K2N2 Studio](https://k2n2studio.com)

Built by [Koundinya Lanka](https://github.com/koundinyalanka).
