# How Cortex Compares

A feature-by-feature comparison with other approaches to AI memory and context management.

---

| Feature | Cortex | CLAUDE.md | claude-memory | Mem0 | MemGPT |
|---------|--------|-----------|---------------|------|--------|
| **Automatic capture** | Yes | No (manual) | No (manual) | Yes | Yes |
| **Quality gate** | Yes (7 rules) | No | No | No | No |
| **Local-first** | Yes | Yes | Yes | No (cloud) | No |
| **Multi-machine sync** | Yes (Turso) | No | No | Yes (cloud) | No |
| **Session summarizer** | Yes (AI) | No | No | No | Yes |
| **Dashboard** | Yes (Web + Desktop) | No | No | Yes (Web) | No |
| **VS Code extension** | Yes | No | No | No | No |
| **CLI** | Yes (30+ commands) | No | Yes (basic) | Yes | Yes |
| **Open source** | Yes (MIT) | N/A (built-in) | Yes | Partial | Yes |
| **You own your data** | Yes | Yes | Yes | No | Yes |
| **Works offline** | Yes | Yes | Yes | No | Yes |
| **One command install** | Yes | N/A | No | No | No |
| **Claude Code native** | Yes (MCP) | Yes | No | No | No |
| **Project isolation** | Yes | Per-file | No | No | No |
| **Memory search** | Yes (FTS + semantic) | No | Basic | Yes | Yes |

---

## When to Use What

**Use Cortex if you:**
- Work with Claude Code daily
- Want automatic memory capture without manual effort
- Need memories to sync across machines
- Care about privacy and local-first storage
- Want a dashboard to browse and manage memories

**Use CLAUDE.md if you:**
- Only need a few static instructions per project
- Don't need cross-session memory
- Want zero dependencies

**Use Mem0 if you:**
- Are building a cloud-hosted AI product
- Don't mind sending data to a third-party service
- Need multi-model support today

---

## Key Differentiators

### 1. Quality Gate
Cortex doesn't just dump everything into memory. Seven built-in rules filter out noise, duplicates, and low-value content. Only meaningful decisions, preferences, and project context get saved.

### 2. Claude Code Native
Built as an MCP server, Cortex integrates directly into Claude Code's architecture. No wrappers, no proxies, no hacks.

### 3. Local-First with Optional Sync
Your memories live in a local SQLite database. If you want multi-machine sync, Turso provides edge replication without sending data through a centralized cloud.

### 4. Full Toolkit
CLI with 30+ commands, web dashboard, desktop app, and VS Code extension. Cortex meets you where you work.

---

*This comparison was last updated March 2026. If you spot an inaccuracy, [open an issue](https://github.com/ProductionLineHQ/cortex/issues/new).*
