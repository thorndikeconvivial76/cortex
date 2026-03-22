# @cortex-memory/server

Cortex daemon -- MCP server, REST API, SQLite memory database, and Turso sync.

Cortex gives Claude Code persistent memory across sessions. The server manages the local SQLite database, exposes an MCP interface for Claude Code, serves a REST API for the CLI and dashboard, and optionally syncs to Turso for multi-machine access.

## Install

```bash
npm install -g @cortex-memory/server
```

## Usage

The server is typically started automatically by `cortex init` or `cortex doctor --fix`. To run it manually:

```bash
cortex-server
```

The server listens on `http://127.0.0.1:3100` by default.

## Features

- MCP (Model Context Protocol) server for Claude Code integration
- REST API for CLI and dashboard access
- SQLite-backed persistent memory storage
- Turso cloud sync for multi-machine setups
- Automatic session summarization
- Full-text search across all memories

## Documentation

Full docs at [cortex.sh](https://cortex.sh)

## License

MIT
