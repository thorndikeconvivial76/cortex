# Architecture

Deep dive into Cortex's internal architecture, data flows, and design decisions.

## Table of Contents

- [System Overview](#system-overview)
- [Component Diagram](#component-diagram)
- [Data Flow: Session Start](#data-flow-session-start)
- [Data Flow: Memory Save](#data-flow-memory-save)
- [Data Flow: Sync Cycle](#data-flow-sync-cycle)
- [Database Schema](#database-schema)
- [MCP Protocol Integration](#mcp-protocol-integration)
- [SSE Event System](#sse-event-system)
- [Quality Gate Rules](#quality-gate-rules)
- [Project Detection](#project-detection)
- [Sync Architecture](#sync-architecture)
- [Monorepo Structure](#monorepo-structure)

---

## System Overview

Cortex is a persistent memory layer for Claude Code. It runs as a local daemon that exposes two interfaces:

1. **MCP Server** (stdio) -- Claude Code connects via the Model Context Protocol to save and retrieve memories
2. **REST API** (HTTP on port 7434) -- Dashboard, CLI, desktop app, and VS Code extension connect here

Both interfaces share the same SQLite database and quality gate. An optional sync worker pushes/pulls memories to Turso for multi-machine use.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Layer                               │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐  ┌────────┐  │
│  │ Claude   │  │   CLI    │  │Dashboard │  │VS Code│  │Electron│  │
│  │  Code    │  │(Commander│  │ (Next.js)│  │  Ext  │  │  App   │  │
│  │          │  │   .js)   │  │          │  │       │  │        │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬───┘  └───┬────┘  │
│       │ MCP/stdio    │ HTTP       │ HTTP       │ HTTP     │ HTTP   │
└───────┼──────────────┼────────────┼────────────┼─────────┼────────┘
        │              │            │            │         │
┌───────▼──────────────▼────────────▼────────────▼─────────▼────────┐
│                         Cortex Daemon                              │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Transport Layer                          │  │
│  │                                                              │  │
│  │  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐  │  │
│  │  │   MCP Server   │  │  Fastify REST   │  │  SSE Emitter │  │  │
│  │  │ @modelcontext  │  │  API Server     │  │  /api/events │  │  │
│  │  │ protocol/sdk   │  │  127.0.0.1:7434 │  │              │  │  │
│  │  └───────┬────────┘  └───────┬─────────┘  └──────┬───────┘  │  │
│  └──────────┼───────────────────┼────────────────────┼──────────┘  │
│             │                   │                    │              │
│  ┌──────────▼───────────────────▼────────────────────▼──────────┐  │
│  │                    Business Logic                             │  │
│  │                                                               │  │
│  │  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │  Quality Gate   │  │   Context    │  │    Project      │  │  │
│  │  │  (6 rules)      │  │   Builder    │  │    Detector     │  │  │
│  │  └─────────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │                                                               │  │
│  │  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │  Memory Repo    │  │ Project Repo │  │  Session Repo   │  │  │
│  │  └─────────────────┘  └──────────────┘  └─────────────────┘  │  │
│  └──────────────────────────┬────────────────────────────────────┘  │
│                             │                                      │
│  ┌──────────────────────────▼────────────────────────────────────┐  │
│  │                    Storage Layer                               │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                SQLite (better-sqlite3)                   │  │  │
│  │  │  ~/.cortex/memory.db                                     │  │  │
│  │  │                                                          │  │  │
│  │  │  Tables: memories, projects, sessions, machines,         │  │  │
│  │  │          conflicts, archived_memories, pending_summaries,│  │  │
│  │  │          rate_limit_log, memory_access_log,              │  │  │
│  │  │          memory_ratings, memory_links, symbols           │  │  │
│  │  │                                                          │  │  │
│  │  │  FTS5: memories_fts (content, tags)                      │  │  │
│  │  └──────────────────────┬──────────────────────────────────┘  │  │
│  │                         │ (optional)                          │  │
│  │  ┌──────────────────────▼──────────────────────────────────┐  │  │
│  │  │               Sync Worker                                │  │  │
│  │  │  push/pull every 30s · batch 100 · LWW conflicts        │  │  │
│  │  │  backoff on 429 · offline queue up to 5000               │  │  │
│  │  └──────────────────────┬──────────────────────────────────┘  │  │
│  │                         │                                     │  │
│  │  ┌──────────────────────▼──────────────────────────────────┐  │  │
│  │  │              Turso (libsql)                              │  │  │
│  │  │  Remote DB: memories, projects, machines                 │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Session Start

When Claude Code opens a new session, it connects to Cortex via MCP stdio and calls `get_memories`:

```
 Claude Code                 Cortex MCP Server              Database
     │                            │                            │
     │  connect(stdio)            │                            │
     │───────────────────────────>│                            │
     │                            │  detectProject(cwd)        │
     │                            │───────────────────────────>│
     │                            │  project_id, project_name  │
     │                            │<───────────────────────────│
     │                            │                            │
     │                            │  sessionRepo.create()      │
     │                            │───────────────────────────>│
     │                            │  session { id, project_id }│
     │                            │<───────────────────────────│
     │                            │                            │
     │  call: get_memories        │                            │
     │───────────────────────────>│                            │
     │                            │  buildContextBlock()       │
     │                            │───────────────────────────>│
     │                            │  memories sorted by type   │
     │                            │  and importance             │
     │                            │<───────────────────────────│
     │                            │                            │
     │  context block (text)      │                            │
     │<───────────────────────────│                            │
     │                            │                            │
     │  (Claude is now informed)  │                            │
```

## Data Flow: Memory Save

When Claude identifies something worth remembering during a session:

```
 Claude Code              MCP Server           Quality Gate         Database
     │                        │                     │                  │
     │  call: save_memory     │                     │                  │
     │  { content, type,      │                     │                  │
     │    reason, tags,       │                     │                  │
     │    importance }        │                     │                  │
     │───────────────────────>│                     │                  │
     │                        │  runQualityGate()   │                  │
     │                        │────────────────────>│                  │
     │                        │                     │                  │
     │                        │   Rule 1: length    │                  │
     │                        │   Rule 2: banned    │                  │
     │                        │   Rule 3: sensitive │                  │
     │                        │   Rule 4: quality   │                  │
     │                        │   Rule 5: duplicate─┼─────────────────>│
     │                        │          (reads existing memories)     │
     │                        │   Rule 6: rate limit┼─────────────────>│
     │                        │          (reads rate_limit_log)        │
     │                        │                     │                  │
     │                        │  { passed: true }   │                  │
     │                        │<────────────────────│                  │
     │                        │                     │                  │
     │                        │  memRepo.create()   │                  │
     │                        │────────────────────────────────────────>│
     │                        │  memory { id }      │                  │
     │                        │<────────────────────────────────────────│
     │                        │                     │                  │
     │                        │  recordToolCall()   │                  │
     │                        │────────────────────────────────────────>│
     │                        │                     │                  │
     │  { memory_id, type,    │                     │                  │
     │    importance }        │                     │                  │
     │<───────────────────────│                     │                  │
```

If any quality gate rule fails, the save is rejected with a specific error code and message. The error includes guidance on how to fix the content.

## Data Flow: Sync Cycle

Every 30 seconds when sync is enabled:

```
 Sync Worker              Local SQLite             Turso Cloud
     │                        │                        │
     │  health check          │                        │
     │─────────────────────────────────────────────────>│
     │  { healthy: true }     │                        │
     │<─────────────────────────────────────────────────│
     │                        │                        │
     │  ── PUSH ──            │                        │
     │                        │                        │
     │  SELECT unsynced       │                        │
     │  (synced_at IS NULL)   │                        │
     │───────────────────────>│                        │
     │  rows[]                │                        │
     │<───────────────────────│                        │
     │                        │                        │
     │  for each batch(100):  │                        │
     │  INSERT OR REPLACE     │                        │
     │─────────────────────────────────────────────────>│
     │                        │                        │
     │  UPDATE synced_at      │                        │
     │───────────────────────>│                        │
     │                        │                        │
     │  ── PULL ──            │                        │
     │                        │                        │
     │  SELECT WHERE          │                        │
     │  updated_at > last_pull│                        │
     │  AND machine_id != me  │                        │
     │─────────────────────────────────────────────────>│
     │  remote_rows[]         │                        │
     │<─────────────────────────────────────────────────│
     │                        │                        │
     │  for each remote_row:  │                        │
     │  if NOT exists locally:│                        │
     │    INSERT              │                        │
     │  if exists AND remote  │                        │
     │    is newer:           │                        │
     │    log conflict        │                        │
     │    UPDATE local        │                        │
     │───────────────────────>│                        │
     │                        │                        │
     │  UPDATE last_pull_at   │                        │
     │───────────────────────>│                        │
     │                        │                        │
     │  broadcast SSE:        │                        │
     │  sync.completed        │                        │
```

## Database Schema

Cortex uses SQLite with 4 schema migrations. All timestamps are ISO 8601 UTC strings.

### Table: `memories`

The core table. Stores all structured memories.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `project_id` | TEXT | NOT NULL, FK projects(id) | Parent project |
| `type` | TEXT | NOT NULL, CHECK IN 6 types | decision, context, preference, thread, error, learning |
| `content` | TEXT | NOT NULL, CHECK len 50-2000 | The memory content |
| `reason` | TEXT | NOT NULL, CHECK len >= 10 | Why this memory matters |
| `tags` | TEXT | DEFAULT '[]' | JSON array of string tags |
| `importance` | INTEGER | DEFAULT 5, CHECK 1-10 | Importance score |
| `confidence` | INTEGER | DEFAULT 3, CHECK 1-5 | Confidence score |
| `superseded_by` | TEXT | FK memories(id) | Points to replacement memory |
| `expires_at` | TEXT | | ISO datetime for auto-expiry |
| `reviewed_at` | TEXT | | Last review timestamp |
| `session_id` | TEXT | FK sessions(id) | Session that created this memory |
| `machine_id` | TEXT | | Machine that created this memory |
| `created_at` | TEXT | NOT NULL, DEFAULT now | Creation timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | Last update timestamp |
| `synced_at` | TEXT | | Last sync to Turso |
| `deleted_at` | TEXT | | Soft delete timestamp |

### Table: `projects`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | Project display name |
| `path` | TEXT | | Filesystem path |
| `git_remote` | TEXT | | Git remote URL |
| `tech_stack` | TEXT | DEFAULT '[]' | JSON array of technologies |
| `context_budget` | INTEGER | DEFAULT 4000, CHECK 1000-12000 | Max context tokens |
| `memory_limit` | INTEGER | DEFAULT 500, CHECK 50-10000 | Max memories per project |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `last_session_at` | TEXT | | Last session timestamp |

### Table: `sessions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `project_id` | TEXT | NOT NULL, FK projects(id) CASCADE | |
| `machine_id` | TEXT | | Machine identifier |
| `started_at` | TEXT | NOT NULL, DEFAULT now | |
| `ended_at` | TEXT | | |
| `memory_count` | INTEGER | DEFAULT 0 | Memories saved in this session |
| `summarized` | INTEGER | DEFAULT 0 | Whether session was summarized |
| `transcript_path` | TEXT | | Path to session transcript |
| `transcript_deleted_at` | TEXT | | When transcript was cleaned up |

### Table: `machines`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | Machine display name |
| `hostname` | TEXT | NOT NULL | OS hostname |
| `platform` | TEXT | NOT NULL, CHECK IN (darwin, linux, win32) | OS platform |
| `last_turso_pull_at` | TEXT | | Last successful pull from Turso |
| `registered_at` | TEXT | DEFAULT now | |
| `last_seen_at` | TEXT | DEFAULT now | |

### Table: `conflicts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `memory_id` | TEXT | NOT NULL, FK memories(id) | Conflicting memory |
| `winning_machine_id` | TEXT | NOT NULL, FK machines(id) | Which machine won |
| `losing_content` | TEXT | NOT NULL | Overwritten content |
| `losing_updated_at` | TEXT | NOT NULL | Overwritten timestamp |
| `resolved_at` | TEXT | DEFAULT now | |

### Table: `archived_memories`

Same schema as `memories` plus `archived_at TEXT DEFAULT now`. Used for garbage-collected or manually archived memories.

### Table: `pending_summaries`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `session_id` | TEXT | NOT NULL, FK sessions(id) | |
| `candidates_json` | TEXT | NOT NULL | JSON array of memory candidates |
| `status` | TEXT | DEFAULT 'pending', CHECK IN 4 | pending, reviewed, expired, failed |
| `created_at` | TEXT | DEFAULT now | |
| `reviewed_at` | TEXT | | |
| `expires_at` | TEXT | NOT NULL | |

### Table: `rate_limit_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `tool_name` | TEXT | NOT NULL | MCP tool name |
| `project_id` | TEXT | | |
| `session_id` | TEXT | | |
| `called_at` | TEXT | DEFAULT now | |

### Table: `memory_access_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `memory_id` | TEXT | NOT NULL, FK memories(id) | |
| `project_id` | TEXT | NOT NULL, FK projects(id) | |
| `accessed_at` | TEXT | DEFAULT now | |
| `access_type` | TEXT | CHECK IN (injection, search, api) | |

### Table: `memory_ratings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `session_id` | TEXT | FK sessions(id) | |
| `project_id` | TEXT | NOT NULL, FK projects(id) | |
| `memory_id` | TEXT | NOT NULL, FK memories(id) | |
| `rating` | INTEGER | NOT NULL, CHECK 1-5 | |
| `rated_at` | TEXT | DEFAULT now | |

### Table: `memory_links`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `source_memory_id` | TEXT | NOT NULL, FK memories(id) | |
| `target_project_id` | TEXT | NOT NULL, FK projects(id) | |
| `created_at` | TEXT | DEFAULT now | |
| `deleted_at` | TEXT | | |

### Table: `symbols`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `project_id` | TEXT | NOT NULL, FK projects(id) | |
| `file_path` | TEXT | NOT NULL | |
| `symbol_name` | TEXT | NOT NULL | |
| `last_seen_at` | TEXT | DEFAULT now | |

### Virtual Table: `memories_fts`

FTS5 full-text search index on `content` and `tags` columns of the `memories` table. Kept in sync via INSERT/UPDATE/DELETE triggers.

### Indexes

```sql
-- Core memory indexes
idx_mem_project      ON memories(project_id) WHERE deleted_at IS NULL
idx_mem_type         ON memories(type)
idx_mem_importance   ON memories(importance DESC)
idx_mem_created      ON memories(created_at DESC)
idx_mem_stale        ON memories(reviewed_at) WHERE reviewed_at IS NULL AND deleted_at IS NULL
idx_mem_expires      ON memories(expires_at) WHERE expires_at IS NOT NULL
idx_mem_deleted      ON memories(deleted_at) WHERE deleted_at IS NOT NULL
idx_mem_unsynced     ON memories(synced_at) WHERE synced_at IS NULL
idx_memories_project_id  ON memories(project_id)
idx_memories_session_id  ON memories(session_id)
idx_memories_deleted_at  ON memories(deleted_at) WHERE deleted_at IS NULL

-- Session indexes
idx_sessions_project_id  ON sessions(project_id)

-- Analytics indexes
idx_rate_limit       ON rate_limit_log(project_id, tool_name, called_at)
idx_access_log       ON memory_access_log(memory_id, accessed_at DESC)
idx_ratings_date     ON memory_ratings(rated_at DESC)
idx_links_target     ON memory_links(target_project_id) WHERE deleted_at IS NULL
idx_symbols          ON symbols(project_id, symbol_name)
```

## MCP Protocol Integration

Cortex implements 7 MCP tools via the `@modelcontextprotocol/sdk`:

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `save_memory` | Save a structured memory | content, type, reason |
| `get_memories` | Retrieve project context block | (none) |
| `search_memories` | Full-text search | query |
| `list_projects` | List all projects with counts | (none) |
| `delete_memory` | Soft-delete a memory | memory_id |
| `supersede_memory` | Replace with new content | memory_id, content, reason |
| `update_memory` | Update metadata only | memory_id |

### MCP Transport

Cortex uses **stdio transport** for MCP communication. Claude Code launches the Cortex MCP server as a child process and communicates via stdin/stdout using JSON-RPC 2.0.

The MCP server is registered in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "cortex",
      "args": ["server", "--stdio"]
    }
  }
}
```

### Project Detection

On MCP connection, Cortex detects the current project from the working directory (`cwd`). Detection strategy:

1. Check if `cwd` matches an existing project's `path` in the database
2. Check if `cwd` has a `.git` directory and match by `git_remote`
3. If no match, create a new project entry from directory name

### Context Builder

The `buildContextBlock()` function assembles a structured text block from memories:

1. Query active (non-deleted, non-superseded) memories for the project
2. Sort by type, then by importance (descending)
3. Group into sections: DECISIONS, PREFERENCES, OPEN THREADS, RECENT CHANGES, CONTEXT, ERRORS, LEARNINGS
4. Respect the project's `context_budget` (default 4000 tokens)
5. Format as a readable text block with `=== CORTEX MEMORY ===` delimiters

## SSE Event System

The SSE emitter provides real-time event streaming at `GET /api/events`.

### Event Types

| Event Type | Payload | Emitted When |
|------------|---------|-------------|
| `memory.saved` | `{ memory_id, project_id, memory_type, importance }` | Memory successfully saved |
| `memory.deleted` | `{ memory_id, project_id }` | Memory soft-deleted |
| `memory.superseded` | `{ old_memory_id, new_memory_id, project_id }` | Memory replaced |
| `sync.completed` | `{ pushed, pulled, conflicts }` | Sync cycle completed |
| `sync.conflict` | `{ conflict_id, memory_id, project_id }` | Sync conflict resolved |
| `sync.offline` | `{ offlineCount, latency_ms }` | Turso unreachable |

### SSE Features

- **Last-Event-ID replay**: Reconnecting clients can resume from last seen event
- **5-minute replay window**: Events are retained for 5 minutes (max 1000 events)
- **Keepalive pings**: Heartbeat comments sent every 30 seconds to prevent proxy timeouts
- **Max connections**: Oldest client evicted when limit (10) reached
- **X-Accel-Buffering**: Disabled for nginx compatibility

### Message Format

```
id: <uuid>
event: <event-type>
data: <json-payload>

```

## Quality Gate Rules

Every memory save passes through 6 sequential rules. Execution stops at the first failure.

### Rule 1: Length Check

- Content must be 50-2000 characters
- Reason must be at least 10 characters
- Error codes: `CONTENT_TOO_SHORT`, `CONTENT_TOO_LONG`, `QUALITY_GATE_FAILED`

### Rule 2: Banned Phrases

- Content is checked against a list of 50+ generic phrases
- Prevents storage of session narration ("I helped the user...", "We discussed...")
- Forces specificity over vague descriptions
- Error code: `QUALITY_GATE_FAILED`

### Rule 3: Sensitive Data Scan

- Regex-based scan for API keys, tokens, passwords, credentials
- Configurable with extra patterns per project
- Error code: `SENSITIVE_DATA_DETECTED`

### Rule 4: Quality Score

Composite score (1-5 scale) based on:
- **Length score (0-3)**: >= 200 chars = 3, >= 100 = 2, >= 50 = 1
- **Specificity score (0-3)**: +1 for numbers, +1 for technical terms, +1 for proper nouns
- **Type validity (0-1)**: +1 for valid memory type
- **Reason quality (0-1)**: +1 for reason >= 20 chars

Minimum passing score: **3/5**

Error code: `QUALITY_GATE_FAILED`

### Rule 5: Duplicate Detection

- TF-IDF cosine similarity computed against all existing project memories
- Threshold: **0.85** (85% similarity = duplicate)
- If duplicate detected, guides user to use `supersede_memory` instead
- Error code: `DUPLICATE_DETECTED`

### Rule 6: Rate Limit

- **Per session**: 50 `save_memory` calls
- **Per day**: 200 `save_memory` calls
- Calls are tracked in `rate_limit_log` table
- Error code: `RATE_LIMIT_EXCEEDED`

## Project Detection

When a new MCP session starts, Cortex detects which project it's working with:

```
detectProject(cwd, db)
  │
  ├─ Check: does any project.path match cwd?
  │   └─ YES: return existing project
  │
  ├─ Check: does cwd contain .git?
  │   └─ YES: read git remote URL
  │       └─ Match against project.git_remote?
  │           └─ YES: return existing project
  │
  └─ No match: create new project
      ├─ name = directory basename
      ├─ path = cwd
      ├─ git_remote = git remote URL (if .git exists)
      └─ tech_stack = detected from package.json, etc.
```

## Sync Architecture

### Overview

Cortex sync uses a **push-pull model** with **last-write-wins (LWW)** conflict resolution. The sync worker runs as a background timer inside the daemon process.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SYNC_INTERVAL_SECONDS` | 30 | Seconds between sync cycles |
| `SYNC_BATCH_SIZE` | 100 | Memories pushed per batch |
| `SYNC_INITIAL_BATCH_SIZE` | 500 | Memories per batch during initial sync |
| `SYNC_LARGE_QUEUE_THRESHOLD` | 1000 | Queue size that triggers inter-batch delays |
| `SYNC_LARGE_QUEUE_DELAY_MS` | 1000 | Delay between batches for large queues |
| `SYNC_MAX_OFFLINE_QUEUE` | 5000 | Max unsynced memories to push in one cycle |

### Conflict Resolution

Conflicts are resolved using **last-write-wins** based on the `updated_at` timestamp:

1. If remote memory has a newer `updated_at` than local: remote wins
2. If local memory has a newer `updated_at`: local wins (will be pushed on next cycle)
3. All conflicts are logged in the `conflicts` table with the losing content preserved

### Offline Behavior

- Memories continue to be saved locally with `synced_at = NULL`
- Up to 5000 unsynced memories are queued
- When connectivity resumes, the queue is pushed in batches of 100
- Large queues (> 1000) introduce 1-second delays between batches

### Rate Limit Backoff

If Turso returns HTTP 429:
1. Backoff starts at 1 second
2. Doubles on each subsequent 429 (exponential backoff)
3. Caps at 5 minutes (300 seconds)
4. Resets on successful sync

### Credential Security

- Turso auth tokens are encrypted with AES-256-GCM
- Key derived from machine identity via HKDF-SHA256
- Stored in `~/.cortex/config.json` as `turso_token_encrypted`
- Legacy plaintext tokens are auto-migrated to encrypted on first read

## Monorepo Structure

```
cortex/
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm workspace definition
├── turbo.json                # Turborepo build pipeline
├── tsconfig.json             # Shared TypeScript config
├── packages/
│   ├── server/               # Daemon: MCP, REST API, quality gate, sync
│   │   └── src/
│   │       ├── mcp/          # MCP server (stdio)
│   │       ├── api/          # Fastify REST API
│   │       │   ├── routes/   # memories, projects, system, sync, events
│   │       │   └── sse/      # SSE emitter
│   │       ├── db/           # Database setup, migrations, repositories
│   │       ├── quality/      # Quality gate rules
│   │       ├── sync/         # Turso sync worker
│   │       ├── detection/    # Project detector
│   │       └── context/      # Context block builder
│   ├── cli/                  # CLI (Commander.js)
│   │   └── src/
│   │       ├── index.ts      # All commands
│   │       ├── api-client.ts # HTTP client for daemon API
│   │       └── format.ts     # Terminal formatting utilities
│   ├── shared/               # Shared types, schemas, constants
│   │   └── src/
│   │       ├── types/        # TypeScript interfaces
│   │       ├── schemas/      # Zod validation schemas
│   │       └── constants/    # Quality gate, rate limits, sync config
│   ├── dashboard/            # Next.js web dashboard
│   ├── web/                  # Marketing site
│   ├── vscode/               # VS Code extension
│   ├── electron/             # Electron desktop app
│   └── installer/            # Installation scripts
├── scripts/                  # Build and release scripts
├── demos/                    # Demo files and recordings
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

### Build System

- **Turborepo** for task orchestration (build, test, lint, typecheck)
- **pnpm** for package management (workspaces)
- **TypeScript** throughout (shared tsconfig)
- **Node.js >= 18** required
