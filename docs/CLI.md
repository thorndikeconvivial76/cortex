# CLI Reference

Complete reference for the `cortex` command-line interface.

## Table of Contents

- [Global Flags](#global-flags)
- [Core Commands](#core-commands)
- [Memory Commands](#memory-commands)
- [Project Commands](#project-commands)
- [Sync Commands](#sync-commands)
- [Data Commands](#data-commands)
- [Config Commands](#config-commands)
- [System Commands](#system-commands)
- [Scripting Guide](#scripting-guide)

---

## Global Flags

These flags are available on every command:

| Flag | Description |
|------|-------------|
| `--help` | Show help for any command |
| `--version` | Show CLI version |

Most commands also support:

| Flag | Description |
|------|-------------|
| `--json` | Output machine-readable JSON instead of formatted text |

---

## Core Commands

### `cortex init`

Initialize Cortex -- creates the database, data directory, and registers the MCP server with Claude Code.

```
cortex init [options]
```

| Flag | Description |
|------|-------------|
| `--no-daemon` | Skip daemon start |
| `--db-path <path>` | Custom database file path |

**What it does:**

1. Checks Node.js version (>= 18 required)
2. Detects Claude Code installation
3. Creates `~/.cortex/` data directory
4. Initializes SQLite database with schema
5. Registers MCP server in `~/.claude/settings.json`

**Example:**

```bash
$ cortex init
Cortex Init

 ✓ Node.js v22.12.0
 ✓ Claude Code detected
 ✓ Created ~/.cortex/
 ✓ Database initialized
 ✓ Configuration written
 ✓ Registered Cortex MCP server in Claude Code

 ✓ Cortex is ready. Open Claude Code in any project to start.
```

---

### `cortex status`

Show daemon health, database stats, and memory count.

```
cortex status [--json]
```

**Example:**

```bash
$ cortex status
Cortex Status
 ✓ Daemon: ok
   Version: 1.0.0
   Memories: 142
   DB size: 0.8 MB
   Uptime: 3842s
   Schema: v4
```

**JSON output:**

```bash
$ cortex status --json
{
  "status": "ok",
  "version": "1.0.0",
  "db_ok": true,
  "sync_ok": true,
  "uptime_s": 3842,
  "memory_count": 142,
  "db_size_mb": 0.8,
  "schema_version": 4
}
```

---

### `cortex doctor`

Run diagnostic checks and optionally auto-fix issues.

```
cortex doctor [options]
```

| Flag | Description |
|------|-------------|
| `--fix` | Auto-fix issues where possible |
| `--verbose` | Show detailed output |

**Checks performed:**

1. Daemon running
2. SQLite accessible
3. Schema version
4. Memory count
5. DB size (warns if > 500 MB)
6. Claude Code MCP registration
7. Node.js version
8. Data directory exists

**Example:**

```bash
$ cortex doctor
Cortex Doctor — Running diagnostics...

 ✓ Daemon running
 ✓ SQLite accessible
 ✓ Schema version: v4
   47 memories in database
 ✓ DB size: 0.3 MB
 ✓ Claude Code settings: MCP server registered
 ✓ Node.js: v22.12.0
 ✓ Data directory: /Users/you/.cortex

8 passed, 0 failed
 ✓ All checks passed!
```

---

### `cortex dashboard`

Open the Cortex web dashboard in your default browser.

```
cortex dashboard [--port <n>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port <n>` | `7434` | Daemon port |

---

### `cortex version`

Show CLI and daemon version.

```
cortex version
```

**Example:**

```bash
$ cortex version
cortex v1.0.0
daemon v1.0.0 (ok)
```

---

## Memory Commands

### `cortex show [project]`

Display memories for the current or specified project.

```
cortex show [project] [options]
```

| Flag | Description |
|------|-------------|
| `--type <type>` | Filter by memory type (decision, context, preference, thread, error, learning) |
| `--limit <n>` | Max memories to show (default: 20) |
| `--all` | Show all memories (up to 200) |
| `--stale` | Show only stale (unreviewed > 90 days) memories |
| `--json` | Output as JSON |

**Example:**

```bash
$ cortex show my-project --type decision --limit 5
5 memories:

[decision] importance: 8  confidence: 4
Using Fastify instead of Express for the API layer. Rationale: 2x throughput
in benchmarks, built-in schema validation via Zod, and first-class TypeScript.
ID: a1b2c3d4-...  Created: 3d ago

[decision] importance: 7  confidence: 3
PostgreSQL with Drizzle ORM instead of Prisma. Drizzle generates SQL that
we can audit, and the query builder is closer to raw SQL.
ID: e5f6g7h8-...  Created: 5d ago
```

---

### `cortex search <query>`

Full-text search across all memories using FTS5.

```
cortex search <query> [options]
```

| Flag | Description |
|------|-------------|
| `--project <id>` | Scope search to a project |
| `--type <type>` | Filter by memory type |
| `--limit <n>` | Max results (default: 10) |
| `--json` | Output as JSON |

**Example:**

```bash
$ cortex search "authentication"
3 results for "authentication":

[thread] importance: 7
Authentication flow not yet implemented. Need OAuth2 with Google and GitHub
providers. Session management via httpOnly cookies.
ID: 1234-...  Created: 2d ago

[decision] importance: 6
Using Lucia for authentication instead of NextAuth. Better TypeScript
support and more control over session handling.
ID: 5678-...  Created: 4d ago
```

---

### `cortex add <text>`

Manually add a memory.

```
cortex add <text> [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--type <type>` | `context` | Memory type |
| `--importance <n>` | `5` | Importance score (1-10) |
| `--tags <tags>` | | Comma-separated tags |
| `--project <id>` | (first project) | Target project ID |

**Example:**

```bash
$ cortex add "Always run database migrations before deploying. The CI pipeline \
checks this but local dev requires manual migration via 'pnpm db:migrate'." \
--type preference --importance 7 --tags "database,deployment"

 ✓ Memory saved: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

---

### `cortex edit <id>`

Edit memory metadata (importance, tags, confidence, expiry). Content changes require `supersede`.

```
cortex edit <id> [options]
```

| Flag | Description |
|------|-------------|
| `--importance <n>` | New importance (1-10) |
| `--tags <tags>` | New comma-separated tags |
| `--confidence <n>` | New confidence (1-5) |
| `--expires <date>` | New expiry date (ISO 8601) |

**Example:**

```bash
$ cortex edit a1b2c3d4 --importance 9 --tags "critical,architecture"
 ✓ Memory a1b2c3d4 updated.
```

---

### `cortex delete <id>`

Soft-delete a memory (can be recovered).

```
cortex delete <id> [--force]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation |

---

### `cortex supersede <id> <content>`

Replace a memory with new content. The old memory is marked as superseded and a new one is created.

```
cortex supersede <id> <content> [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--reason <reason>` | "Updated via CLI" | Why this memory is being updated |

**Example:**

```bash
$ cortex supersede a1b2c3d4 "Using Fastify v5 (upgraded from v4). \
The new version has better async hooks support and 15% faster routing." \
--reason "Upgraded Fastify version"

 ✓ Memory superseded. New ID: x9y8z7w6-...
```

---

### `cortex memory pin <id>`

Pin a memory (sets importance to 10). Pinned memories are never garbage-collected or auto-archived.

```
cortex memory pin <id>
```

---

### `cortex memory unpin <id>`

Unpin a memory (resets importance to 5).

```
cortex memory unpin <id>
```

---

### `cortex timeline [project]`

Show a chronological history of memories grouped by date.

```
cortex timeline [project] [options]
```

| Flag | Description |
|------|-------------|
| `--as-of <date>` | Show state at a specific date |
| `--limit <n>` | Max memories (default: 50) |
| `--json` | Output as JSON |

**Example:**

```bash
$ cortex timeline
Timeline — 23 memories

  2026-03-22
  ────────────────────────────────────────
  14:32  [decision] Using Fastify v5 for the API layer...
  14:15  [context] Monorepo restructured to 6 packages...
  10:02  [preference] Always use pnpm workspaces for...

  2026-03-21
  ────────────────────────────────────────
  16:45  [thread] Auth flow needs OAuth2 providers...
  11:20  [learning] Turso supports embedded replicas...
```

---

### `cortex link <id>`

Link a memory to another project. Creates a copy of the memory in the target project.

```
cortex link <id> --to <project-id>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--to <project-id>` | Yes | Target project ID |

---

### `cortex review`

Interactive review of stale and pending memories. Stale memories are those not reviewed in > 90 days.

```
cortex review [--project <id>]
```

---

## Project Commands

### `cortex projects`

List all projects with memory counts.

```
cortex projects [--json]
```

---

### `cortex project list`

Alias for `cortex projects`.

---

### `cortex project switch <name>`

Set the active project for display purposes.

```
cortex project switch <name>
```

---

### `cortex project rename <id> <name>`

Rename a project.

```
cortex project rename <id> <name>
```

---

### `cortex project archive <id>`

Archive a project. Archived projects are hidden from default listings.

```
cortex project archive <id>
```

---

## Sync Commands

### `cortex sync status`

Show current sync state including queue size and connected machines.

```
cortex sync status [--json]
```

**Example:**

```bash
$ cortex sync status
Sync Status

   State: running
   Last sync: 12s ago
   Queue size: 0

Machines:
  machine-a1b2c3d4 — last seen 12s ago
  machine-e5f6g7h8 — last seen 2m ago
```

---

### `cortex sync setup`

Interactive setup for Turso sync credentials. Requires a verified newsletter subscription.

```
cortex sync setup
```

**Flow:**

1. Checks for valid subscriber token
2. Prompts for Turso URL and auth token
3. Tests the connection
4. Sets up remote schema
5. Starts sync worker

---

### `cortex sync now`

Force an immediate sync cycle instead of waiting for the 30-second timer.

```
cortex sync now [--json]
```

**Example:**

```bash
$ cortex sync now
 ✓ Sync completed.
   Pushed: 3
   Pulled: 1
   Conflicts: 0
```

---

### `cortex sync pause`

Pause automatic sync. Memories continue to be saved locally.

```
cortex sync pause
```

---

### `cortex sync resume`

Resume automatic sync after a pause.

```
cortex sync resume
```

---

## Data Commands

### `cortex export`

Export all memories to a JSON file.

```
cortex export [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--project <id>` | (all) | Export specific project only |
| `--output <file>` | `cortex-export.json` | Output file path |

**Example:**

```bash
$ cortex export --output backup.json
 ✓ Exported to backup.json — 3 projects
```

---

### `cortex import <file>`

Import memories from a JSON file. Memories pass through the quality gate.

```
cortex import <file> [options]
```

| Flag | Description |
|------|-------------|
| `--project <id>` | Override target project ID |

**Example:**

```bash
$ cortex import backup.json
 ✓ Imported 47 memories, skipped 2
```

---

### `cortex clear [project]`

Delete all memories. Creates a backup file first unless `--no-backup` is specified.

```
cortex clear [project] [options]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation prompt |
| `--no-backup` | Skip automatic backup |

**Example:**

```bash
$ cortex clear my-project
   Backup saved to cortex-backup-1711234567890.json
Type DELETE to confirm clearing memories for project a1b2c3d4: DELETE
 ✓ Cleared 23 memories from project a1b2c3d4.
```

---

### `cortex analytics`

Display usage statistics and insights.

```
cortex analytics [--json]
```

**Example:**

```bash
$ cortex analytics
Cortex Analytics

   Total memories: 142
   Active projects (30d): 3
   Creation rate (7d avg): 4.3/day
   Avg importance: 5.8
   Stale memories: 7

Type Distribution:
  decision: 38
  context: 42
  preference: 21
  thread: 15
  error: 12
  learning: 14
```

---

## Config Commands

### `cortex config show`

Display all current configuration values.

```
cortex config show [--json]
```

---

### `cortex config set <key> <value>`

Set a configuration value. Values are auto-parsed as JSON when possible.

```
cortex config set <key> <value>
```

**Examples:**

```bash
$ cortex config set auto_summarize true
 ✓ Config "auto_summarize" set to true.

$ cortex config set quality_threshold 0.7
 ✓ Config "quality_threshold" set to 0.7.

$ cortex config set max_memories_per_session 100
 ✓ Config "max_memories_per_session" set to 100.
```

---

### `cortex config reset`

Reset all configuration to defaults.

```
cortex config reset
```

**Default values:**

| Key | Default |
|-----|---------|
| `auto_summarize` | `true` |
| `quality_threshold` | `0.5` |
| `max_memories_per_session` | `50` |
| `sync_enabled` | `false` |
| `active_project` | `null` |

---

## System Commands

### `cortex upgrade`

Check for updates and show upgrade instructions.

```
cortex upgrade [--check-only]
```

| Flag | Description |
|------|-------------|
| `--check-only` | Check without installing |

---

### `cortex uninstall`

Remove Cortex completely from your system.

```
cortex uninstall [options]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be removed without removing anything |
| `--keep-data` | Keep the `~/.cortex/` directory |
| `--force` | Skip confirmation |

**Dry run example:**

```bash
$ cortex uninstall --dry-run
Cortex Uninstall — Dry Run

Would remove:
  /Users/you/.cortex (data, config, logs)
  /Users/you/Library/LaunchAgents/com.cortex.daemon.plist (launchd service)
  Cortex MCP entry from ~/.claude/settings.json
```

---

### `cortex summarize`

Manually trigger the session summarizer.

```
cortex summarize [options]
```

| Flag | Description |
|------|-------------|
| `--session-id <id>` | Summarize a specific session |
| `--setup` | Configure summarizer AI provider |
| `--json` | Output as JSON |

---

### `cortex subscribe <email>`

Verify your newsletter subscription to unlock sync features.

```
cortex subscribe <email> [--server <url>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--server <url>` | `https://cortex.sh` | Verification server URL |

---

### `cortex template list`

Browse available memory templates.

```
cortex template list
```

**Example:**

```bash
$ cortex template list
Available Templates:

typescript-monorepo        TypeScript monorepo starter              4 memories
nestjs-api                 NestJS API starter                       4 memories
nextjs-app                 Next.js App Router starter               3 memories
aws-cdk                    AWS CDK infrastructure starter           3 memories
tauri-app                  Tauri 2 desktop app starter              3 memories
blank                      Empty — start fresh                      0 memories

Apply with: cortex template apply <name>
```

---

### `cortex template apply <name>`

Apply a starter template to the current project.

```
cortex template apply <name> [--preview]
```

| Flag | Description |
|------|-------------|
| `--preview` | Preview template contents without applying |

---

## Scripting Guide

### JSON Output

Every command that displays data supports `--json` for machine-readable output. This is useful for piping into `jq`, scripts, or other tools.

```bash
# Get memory count as a number
cortex status --json | jq '.memory_count'

# List all decision memories as JSON
cortex show --type decision --json | jq '.[].content'

# Search and extract IDs
cortex search "authentication" --json | jq '.[].id'

# Export analytics for monitoring
cortex analytics --json > /tmp/cortex-metrics.json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Daemon not running |

### Daemon Dependency

Most commands require the Cortex daemon to be running. Commands that work without the daemon:

- `cortex init` (starts the daemon)
- `cortex version` (shows "daemon: not running" if down)
- `cortex doctor` (reports daemon status)
- `cortex uninstall`
- `cortex template list`

All other commands will print an error and suggest running `cortex doctor --fix` if the daemon is unreachable.
