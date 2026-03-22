# Cortex — Memory for Claude Code

Persistent memory layer for Claude Code sessions. Save decisions, preferences, and context that survive across conversations.

## Features

- **Save Memory from Selection** — Highlight code or text, right-click, and save it as a Cortex memory with type, tags, and importance.
- **Search Memories** — Full-text search across all stored memories without leaving VS Code.
- **Hover Peek** — Hover over tagged code to see related memories inline.
- **Status Bar** — Live connection indicator showing daemon status and memory count.
- **Session Summary Notifications** — Get notified when a Claude Code session ends with a summary of new memories created.

## Requirements

- **Cortex daemon** must be running. Install and start with:
  ```bash
  cortex init
  ```
- Node.js 18+
- VS Code 1.85+

## Keybindings

| Command | Mac | Windows/Linux |
|---|---|---|
| Save to Cortex Memory | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| Search Memories | `Cmd+Shift+F9` | `Ctrl+Shift+F9` |

## Screenshots

> Screenshots coming soon. See the [main repository](https://github.com/ProductionLineHQ/cortex) for demos.

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `cortex.daemonPort` | `7434` | Port of the Cortex daemon |
| `cortex.autoStart` | `false` | Auto-start daemon if not running |

## Links

- [Repository](https://github.com/ProductionLineHQ/cortex)
- [Documentation](https://cortex.sh)
- [Issues](https://github.com/ProductionLineHQ/cortex/issues)
