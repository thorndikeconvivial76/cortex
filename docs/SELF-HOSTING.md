# Self-Hosting Guide

How to install, configure, and manage Cortex on your own machine.

## Table of Contents

- [System Requirements](#system-requirements)
- [Installation Methods](#installation-methods)
- [Manual Installation](#manual-installation)
- [Daemon Management](#daemon-management)
- [Configuration](#configuration)
- [Database Management](#database-management)
- [Upgrading](#upgrading)
- [Uninstalling](#uninstalling)

---

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Node.js** | 18.0.0 | 22.x LTS |
| **pnpm** | 9.0.0 | Latest |
| **OS** | macOS 12+, Ubuntu 20.04+, Windows 10+ | macOS 14+, Ubuntu 22.04+ |
| **Disk** | 50 MB (app + DB) | 200 MB |
| **RAM** | 64 MB | 128 MB |
| **Claude Code** | Required | Latest |

Cortex is a lightweight process. The SQLite database grows slowly -- a typical developer accumulates ~1 MB per year of active use.

## Installation Methods

### Method 1: npx (Recommended)

The fastest way to get started:

```bash
npx @cortex-memory/cli init
```

This downloads the CLI, creates `~/.cortex/`, initializes the database, and registers the MCP server with Claude Code.

### Method 2: Global Install

For a permanent CLI installation:

```bash
npm install -g @cortex-memory/cli
cortex init
```

### Method 3: From Source

For development or customization:

```bash
git clone https://github.com/ProductionLineHQ/cortex.git
cd cortex
pnpm install
pnpm build

# Link the CLI globally
cd packages/cli
pnpm link --global

# Initialize
cortex init
```

## Manual Installation

If you want full control over the installation process:

### Step 1: Create Data Directory

```bash
mkdir -p ~/.cortex
```

### Step 2: Initialize Database

The database is created automatically on first run. Cortex applies 4 schema migrations:

| Migration | Tables Created |
|-----------|---------------|
| 001 | `projects`, `sessions`, `memories`, `schema_version`, `memories_fts` (FTS5) |
| 002 | `machines`, `conflicts`, `archived_memories` |
| 003 | `pending_summaries`, `archived_pending_summaries` |
| 004 | `rate_limit_log`, `memory_access_log`, `memory_ratings`, `memory_links`, `symbols` |

### Step 3: Register MCP Server

Add Cortex to Claude Code's settings:

```bash
# Manually edit ~/.claude/settings.json
```

Add to the `mcpServers` section:

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

Or if running from source:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/path/to/cortex/packages/server/dist/index.js", "--stdio"]
    }
  }
}
```

### Step 4: Verify

```bash
cortex doctor
```

## Daemon Management

The Cortex daemon is the background process that serves the REST API and handles sync. It runs on `127.0.0.1:7434`.

### macOS: launchd

Create a launchd plist for auto-start on login:

```bash
cat > ~/Library/LaunchAgents/com.cortex.daemon.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cortex.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/lib/node_modules/@cortex-memory/server/dist/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOU/.cortex/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOU/.cortex/daemon.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CORTEX_LOG_LEVEL</key>
        <string>info</string>
    </dict>
</dict>
</plist>
EOF
```

**Replace** `/Users/YOU` with your actual home directory and update the node/server paths as needed.

```bash
# Load (start)
launchctl load ~/Library/LaunchAgents/com.cortex.daemon.plist

# Unload (stop)
launchctl unload ~/Library/LaunchAgents/com.cortex.daemon.plist

# Check status
launchctl list | grep cortex
```

### Linux: systemd

Create a systemd user service:

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/cortex.service << 'EOF'
[Unit]
Description=Cortex Memory Daemon
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /usr/local/lib/node_modules/@cortex-memory/server/dist/index.js
Restart=on-failure
RestartSec=5
Environment=CORTEX_LOG_LEVEL=info

[Install]
WantedBy=default.target
EOF
```

```bash
# Enable auto-start
systemctl --user enable cortex

# Start
systemctl --user start cortex

# Stop
systemctl --user stop cortex

# Check status
systemctl --user status cortex

# View logs
journalctl --user -u cortex -f
```

### Windows

Use a startup script or Task Scheduler:

```powershell
# Create a scheduled task that runs at login
$action = New-ScheduledTaskAction -Execute "node" -Argument "C:\path\to\cortex\server\dist\index.js"
$trigger = New-ScheduledTaskTrigger -AtLogon
Register-ScheduledTask -TaskName "CortexDaemon" -Action $action -Trigger $trigger
```

### Manual Start

For development or testing, run the daemon manually:

```bash
# From installed package
cortex server

# From source
cd packages/server
pnpm dev
```

## Configuration

### Config File

`~/.cortex/config.json`

```json
{
  "sync": {
    "turso_url": "libsql://your-db.turso.io",
    "turso_token_encrypted": "hex:hex:hex",
    "enabled": true
  },
  "subscriber": {
    "email_hash": "sha256-hex",
    "verified_at": "2026-03-22T14:30:00.000Z",
    "expires_at": "2026-04-21T14:30:00.000Z"
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORTEX_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `CORTEX_WEB_URL` | `https://cortex.sh` | Subscriber verification server |
| `NODE_ENV` | | Set to `production` to disable pretty-printing logs |

### Runtime Configuration

Use the CLI to change runtime settings:

```bash
# View current config
cortex config show

# Set a value
cortex config set auto_summarize true
cortex config set quality_threshold 0.7
cortex config set max_memories_per_session 100

# Reset to defaults
cortex config reset
```

### Port

The API server binds to port **7434** by default. This is currently not configurable without modifying the source. The port was chosen to avoid conflicts with common development servers.

## Database Management

### Location

```
~/.cortex/memory.db
```

### Backup

```bash
# Export to JSON (recommended)
cortex export --output backup.json

# Or copy the SQLite file directly
cp ~/.cortex/memory.db ~/.cortex/memory.db.bak
```

### Restore

```bash
# From JSON export
cortex import backup.json

# Or replace the SQLite file (stop daemon first)
cortex sync pause  # if sync is running
cp ~/.cortex/memory.db.bak ~/.cortex/memory.db
```

### Size Management

Check database size:

```bash
cortex status
# DB size: 0.8 MB
```

If the database grows large (> 500 MB, flagged by `cortex doctor`):

```bash
# Clear memories for unused projects
cortex clear old-project

# Or archive old projects
cortex project archive old-project-id
```

### Schema Migrations

Migrations are applied automatically on daemon startup. The current schema version is tracked in the `schema_version` table. You can check the version:

```bash
cortex status --json | jq '.schema_version'
# 4
```

## Upgrading

### From npm

```bash
# Check for updates
cortex upgrade --check-only

# Upgrade
npm install -g @cortex-memory/cli@latest
```

### From Source

```bash
cd /path/to/cortex
git pull
pnpm install
pnpm build
```

### After Upgrading

1. Restart the daemon (launchd/systemd will do this automatically)
2. Run diagnostics: `cortex doctor`
3. Schema migrations are applied automatically on startup

## Uninstalling

### Clean Uninstall

```bash
cortex uninstall
```

This removes:
1. The launchd/systemd service (if configured)
2. The `~/.cortex/` directory (database, config, logs)
3. The Cortex MCP entry from `~/.claude/settings.json`

### Preview Before Removing

```bash
cortex uninstall --dry-run
```

### Keep Your Data

```bash
cortex uninstall --keep-data
```

This removes the service and MCP registration but keeps `~/.cortex/` intact. You can reinstall later and your memories will still be there.

### Manual Uninstall

If the CLI is not available:

```bash
# 1. Stop the daemon
launchctl unload ~/Library/LaunchAgents/com.cortex.daemon.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.cortex.daemon.plist

# or on Linux
systemctl --user stop cortex
systemctl --user disable cortex
rm -f ~/.config/systemd/user/cortex.service

# 2. Remove data
rm -rf ~/.cortex

# 3. Remove MCP registration
# Edit ~/.claude/settings.json and remove the "cortex" entry from mcpServers

# 4. Remove the CLI
npm uninstall -g @cortex-memory/cli
```

### Zero Footprint

After a clean uninstall, Cortex leaves no files, no services, no environment variables, and no registry entries on your system.
