# Frequently Asked Questions

## Table of Contents

- [General](#general)
- [Privacy & Security](#privacy--security)
- [Usage](#usage)
- [Sync](#sync)
- [Troubleshooting](#troubleshooting)
- [Comparison](#comparison)

---

## General

### What is Cortex?

Cortex is a persistent memory layer for Claude Code. It captures decisions, preferences, open threads, and project context as structured memories, then injects them into every new Claude Code session via MCP (Model Context Protocol). Your AI assistant starts every conversation fully informed about your project.

### How is Cortex different from Claude's built-in CLAUDE.md files?

`CLAUDE.md` files are static text files you write and maintain manually. Cortex is dynamic:

| Feature | CLAUDE.md | Cortex |
|---------|-----------|--------|
| Storage | Flat text file in repo | Structured SQLite database |
| Updates | Manual edits | Claude saves automatically via MCP |
| Search | Text search in file | FTS5 full-text search |
| Quality control | None | 6-rule quality gate |
| Multi-project | One file per repo | Centralized across all projects |
| Multi-machine | Committed to Git | Turso cloud sync |
| Versioning | Git history | Supersede chain with audit trail |
| Expiry | None | Auto-expiry and staleness detection |

Cortex and `CLAUDE.md` are complementary. Use `CLAUDE.md` for static project-level instructions. Use Cortex for dynamic, evolving knowledge that Claude discovers during sessions.

### Is Cortex open source?

Yes. MIT license. The full source code is available on GitHub.

### Who built Cortex?

Cortex is built by Koundinya Lanka at [K2N2 Studio](https://k2n2studio.com).

### What languages/frameworks is Cortex built with?

- **Runtime**: Node.js (>= 18)
- **Language**: TypeScript
- **Database**: SQLite (via better-sqlite3)
- **API**: Fastify
- **MCP**: @modelcontextprotocol/sdk
- **Sync**: Turso (@libsql/client)
- **CLI**: Commander.js
- **Validation**: Zod
- **Build**: Turborepo + pnpm workspaces

---

## Privacy & Security

### Does Cortex read my source code?

**No.** Cortex never reads, indexes, or scans your source code. It only stores structured memories that Claude explicitly saves via MCP tool calls. The only file-system interaction is:

- Detecting the project directory name and Git remote URL
- Reading `~/.claude/settings.json` during init
- Writing to `~/.cortex/` (its own data directory)

### What data does Cortex store?

Cortex stores **structured memories** -- short text entries (50-2000 characters) with metadata. Each memory has:

- Content (the actual knowledge)
- Type (decision, context, preference, thread, error, learning)
- Reason (why it matters)
- Tags, importance, confidence
- Timestamps and session metadata

It does **not** store:

- Source code
- File contents
- API keys or passwords (blocked by quality gate)
- Session transcripts (only references to them)
- Telemetry or usage analytics sent externally

### Does Cortex send data to any external server?

**Not by default.** Cortex is local-first. The only external communication happens when you explicitly enable:

1. **Sync** -- pushes/pulls memories to YOUR Turso database (you control the infrastructure)
2. **Subscriber verification** -- sends an email hash (SHA-256, not the email itself) to `cortex.sh` to verify newsletter subscription for sync access

No telemetry, no analytics, no crash reports are sent anywhere.

### How are Turso credentials stored?

Turso auth tokens are encrypted with AES-256-GCM using a machine-derived key (HKDF-SHA256 from your home directory and hostname). The encrypted token is stored in `~/.cortex/config.json`. The key never leaves your machine.

### Can someone on my network access my memories?

**No.** The REST API binds exclusively to `127.0.0.1` (localhost). It is not accessible from other machines on your network. CORS is restricted to localhost origins, `file://`, and `vscode-webview://`.

### What happens if someone gets my ~/.cortex directory?

They would have your memory database (readable SQLite) and your encrypted Turso token. The token encryption is tied to your machine identity, so it cannot be decrypted on a different machine. However, the memory database itself is not encrypted at rest -- it's a standard SQLite file. If you need encryption at rest, use full-disk encryption (FileVault, LUKS, BitLocker).

---

## Usage

### Can I use Cortex without sync?

**Yes.** Sync is entirely optional. Cortex works perfectly as a local-only tool. All memories are stored in `~/.cortex/memory.db` on your machine. Enable sync only if you work across multiple machines.

### How many memories can I store?

There's no hard limit on total memories. Per-project defaults:

- **Memory limit**: 500 per project (configurable up to 10,000)
- **Per-session rate limit**: 50 saves per session
- **Daily rate limit**: 200 saves per day

A typical developer accumulates 5-15 memories per day of active work.

### Does Cortex slow down Claude Code?

No. Cortex adds negligible latency:

- **Session start** (`get_memories`): ~5-20ms to query SQLite and build context
- **Memory save** (`save_memory`): ~10-30ms including quality gate checks
- **Search** (`search_memories`): ~5-15ms via FTS5

The MCP connection uses stdio (not HTTP), so there's no network overhead.

### What happens if I uninstall Cortex?

Running `cortex uninstall` cleanly removes:

1. The daemon service (launchd/systemd)
2. The `~/.cortex/` directory (database, config, logs)
3. The MCP entry from `~/.claude/settings.json`

**Zero footprint.** No orphaned files, services, or registry entries remain.

Use `cortex uninstall --keep-data` to remove the service and MCP registration while keeping your database. You can reinstall later and pick up where you left off.

### How does project detection work?

When Claude Code starts a session, Cortex detects the project automatically:

1. **Path match**: Does any existing project's `path` match the current working directory?
2. **Git remote match**: Does the Git remote URL match any existing project?
3. **New project**: If no match, create a new project entry from the directory name

This means if you clone the same repo to different paths on the same machine, Cortex recognizes it as the same project (via Git remote).

### Can I share memories between projects?

Yes, via the `cortex link` command:

```bash
cortex link <memory-id> --to <target-project-id>
```

This creates a copy of the memory in the target project.

### What are "stale" memories?

Memories that haven't been reviewed for over 90 days. These may contain outdated information. Use `cortex review` to audit them, or `cortex show --stale` to list them.

### Can I use Cortex with multiple AI tools?

Cortex is designed for Claude Code specifically (via MCP). The REST API is open and could be integrated with other tools, but the MCP server is the primary interface.

---

## Sync

### Do I need to pay for sync?

Cortex itself is free and open source. Sync uses Turso, which has a generous free tier:

- **Turso free tier**: 500 databases, 9 GB storage, 25 billion row reads/month
- A typical Cortex database uses < 10 MB -- well within free limits

You need a newsletter subscription to verify sync access, but the subscription is free.

### What happens if I lose internet while syncing?

Nothing bad. Memories continue to save locally. When connectivity resumes, the sync worker pushes the queue (up to 5000 pending memories) in batches.

### Can two people share a Turso database?

The sync system is designed for single-user, multi-machine use. Sharing a database between different users is not officially supported and may cause unexpected conflicts. Team memory sharing is on the roadmap.

### How do I switch to a different Turso database?

```bash
# 1. Pause sync
cortex sync pause

# 2. Edit ~/.cortex/config.json (remove or update sync section)

# 3. Re-run setup with new credentials
cortex sync setup
```

---

## Troubleshooting

### Cortex daemon is not running

```bash
# Check status
cortex doctor

# Restart manually
cortex server

# Or check the service
# macOS:
launchctl list | grep cortex
# Linux:
systemctl --user status cortex
```

### Claude Code doesn't see Cortex

Check that the MCP server is registered:

```bash
cat ~/.claude/settings.json
```

Look for:

```json
"mcpServers": {
  "cortex": {
    "command": "cortex",
    "args": ["server", "--stdio"]
  }
}
```

If missing, run:

```bash
cortex init
```

### Quality gate keeps rejecting my memories

The quality gate enforces:

1. **Content length**: 50-2000 characters
2. **No banned phrases**: Avoid generic narration ("I helped the user...")
3. **No sensitive data**: No API keys, tokens, passwords
4. **Quality score >= 3**: Include specific details (names, versions, numbers)
5. **No duplicates**: Content must be < 85% similar to existing memories
6. **Rate limits**: Max 50 saves/session, 200/day

**Tips for passing the gate:**

- Be specific: include technology names, version numbers, rationale
- Be concise: one decision/fact per memory
- Avoid session narration: save the decision, not the discussion
- Use `supersede` instead of saving duplicates

### Database is corrupted

```bash
# 1. Check integrity
cortex doctor

# 2. If corrupted, restore from backup
cortex import backup.json

# 3. Or delete and start fresh
rm ~/.cortex/memory.db
cortex init
```

### Port 7434 is already in use

Another process is using the port. Check with:

```bash
lsof -i :7434
```

Kill the conflicting process or change the Cortex port (requires source modification).

---

## Comparison

### Will Anthropic ship native memory for Claude Code?

It's possible. If they do, Cortex offers several differentiators:

1. **Quality gate**: 6-rule engine prevents low-quality memory pollution
2. **Multi-machine sync**: Your database, your control
3. **Structured types**: 6 memory categories vs. flat text
4. **Full-text search**: FTS5-powered search across all memories
5. **Timeline and review**: Audit trail, staleness detection, interactive review
6. **Import/export**: JSON export for portability
7. **Open source**: Full control, no vendor lock-in

### How does Cortex compare to Mem0 or other memory tools?

Cortex is purpose-built for Claude Code (MCP protocol), not a general-purpose memory system:

| Feature | Cortex | General memory tools |
|---------|--------|---------------------|
| **Focus** | Claude Code specifically | Multiple AI platforms |
| **Protocol** | MCP (native to Claude) | Various APIs |
| **Storage** | Local SQLite (your machine) | Often cloud-hosted |
| **Quality** | 6-rule gate | Varies |
| **Cost** | Free (open source) | Often paid |
| **Privacy** | Local-first, no telemetry | Varies |
