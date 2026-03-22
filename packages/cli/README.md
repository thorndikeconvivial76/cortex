# Cortex

Persistent memory for Claude Code. Cortex gives your AI agent memory that survives across sessions, projects, and machines.

## Install

```bash
# Homebrew (recommended)
brew install ProductionLineHQ/tap/cortex

# npx (no install)
npx @cortex-memory/cli init

# npm global
npm install -g @cortex-memory/cli

# curl
curl -fsSL https://cortex.sh/install.sh | sh
```

## Quick Start

```bash
# Initialize Cortex (creates DB, starts daemon, wires into Claude Code)
cortex init

# Open Claude Code — Cortex is now active as an MCP server
claude
```

That's it. Claude Code will automatically read and write memories through the MCP connection. Use the CLI to browse, search, and manage memories directly.

## Commands

| Command | Description |
|---|---|
| `cortex init` | Initialize Cortex -- create DB, start daemon, wire Claude Code |
| `cortex status` | Show daemon status, DB size, memory count |
| `cortex doctor` | Diagnose and auto-fix common issues |
| `cortex version` | Show version info |
| `cortex dashboard` | Open dashboard in browser |
| **Memories** | |
| `cortex show [project]` | Display memories for current or specified project |
| `cortex search <query>` | Full-text search across all memories |
| `cortex add [text]` | Add a memory |
| `cortex edit <id>` | Edit memory metadata |
| `cortex delete <id>` | Delete a memory |
| `cortex supersede <id>` | Replace a memory with new content |
| `cortex clear [project]` | Delete all memories (with backup) |
| **Memory Ops** | |
| `cortex memory pin <id>` | Pin a memory so it is never garbage-collected |
| `cortex memory unpin <id>` | Unpin a memory |
| `cortex analytics` | Usage stats and insights |
| `cortex export` | Export memories to JSON |
| `cortex import <file>` | Import memories from JSON |
| `cortex summarize` | Manually trigger session summarizer |
| `cortex review` | Interactive review of stale and pending memories |
| `cortex timeline [project]` | Chronological memory history |
| `cortex link <id>` | Link a memory to another project |
| **Projects** | |
| `cortex projects` | List all projects |
| `cortex project list` | List all projects |
| `cortex project switch <name>` | Set the active project |
| `cortex project rename <id> <name>` | Rename a project |
| `cortex project archive <id>` | Archive a project |
| **Config** | |
| `cortex config show` | Display current configuration |
| `cortex config set <key> <value>` | Set a configuration value |
| `cortex config reset` | Reset configuration to defaults |
| **Sync** | |
| `cortex sync status` | Show sync state |
| `cortex sync setup` | Configure Turso sync credentials |
| `cortex sync now` | Force immediate sync |
| `cortex sync pause` | Pause automatic sync |
| `cortex sync resume` | Resume automatic sync |
| **Templates** | |
| `cortex template list` | Browse available templates |
| `cortex template apply <name>` | Apply template to current project |
| **Maintenance** | |
| `cortex upgrade` | Upgrade to latest version |
| `cortex uninstall` | Remove Cortex completely |

All commands support `--json` for machine-readable output where applicable.

## How It Works

Cortex runs a lightweight local daemon that exposes an MCP server. When you start Claude Code, it connects to Cortex automatically and gains the ability to read and write persistent memories. Memories are stored in a local SQLite database and can optionally sync to Turso for multi-machine access.

## Documentation

Full docs at [cortex.sh](https://cortex.sh)

## License

MIT
