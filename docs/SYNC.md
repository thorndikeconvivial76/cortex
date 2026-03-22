# Sync Deep Dive

How Cortex synchronizes memories across machines using Turso.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Setup Guide](#setup-guide)
- [Push-Pull Cycle](#push-pull-cycle)
- [Conflict Resolution](#conflict-resolution)
- [Offline Behavior](#offline-behavior)
- [Multi-Machine Setup](#multi-machine-setup)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Overview

Cortex sync is an **optional** feature that replicates your memory database to a Turso cloud database. This allows memories to follow you across machines -- your desktop, your laptop, your CI server.

**Key design principles:**

- **Local-first**: Cortex works perfectly without sync. Memories are always saved locally first.
- **Your database**: You create and own the Turso database. Cortex never provisions infrastructure for you.
- **Last-write-wins**: Conflict resolution is deterministic and simple. No manual merge required.
- **Offline-resilient**: Memories queue locally when offline and push when connectivity resumes.

## How It Works

```
Machine A                    Turso Cloud                    Machine B
    │                            │                              │
    │  save_memory()             │                              │
    │  (stored locally)          │                              │
    │                            │                              │
    │  ── push (every 30s) ──>   │                              │
    │  INSERT OR REPLACE         │                              │
    │                            │                              │
    │                            │   <── pull (every 30s) ──    │
    │                            │   SELECT WHERE updated_at >  │
    │                            │   last_pull AND machine != B │
    │                            │                              │
    │                            │   memories appear on B       │
    │                            │                              │
```

Every 30 seconds, each machine:

1. **Pushes** unsynced local memories to Turso (batch of 100)
2. **Pulls** remote memories newer than the last pull from other machines

## Setup Guide

### Prerequisites

1. A [Turso](https://turso.tech) account (free tier works fine)
2. A Cortex newsletter subscription (for sync access verification)

### Step 1: Subscribe

Sync requires a verified newsletter subscription. This is a soft gate -- subscribe at [ProductionLineHQ.ai](https://ProductionLineHQ.ai), then verify:

```bash
cortex subscribe your@email.com
```

You'll see:

```
Verifying subscription for your@email.com...
 ✓ Subscription verified! Sync features are now unlocked.
   Token expires: 4/21/2026
```

### Step 2: Create a Turso Database

Sign up at [turso.tech](https://turso.tech) and create a database:

```bash
# Install Turso CLI
brew install tursodatabase/tap/turso

# Login
turso auth login

# Create a database
turso db create cortex-sync

# Get the URL
turso db show cortex-sync --url
# Output: libsql://cortex-sync-yourname.turso.io

# Create an auth token
turso db tokens create cortex-sync
# Output: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

### Step 3: Configure Cortex

```bash
cortex sync setup
```

This starts an interactive flow:

```
Cortex Sync Setup

Enter your Turso credentials (get them at ProductionLineHQ.ai).

Enter Turso URL: libsql://cortex-sync-yourname.turso.io
Enter Turso token: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...

 ✓ Sync configured successfully. Run: cortex sync now
```

### Step 4: Verify

```bash
cortex sync status
```

```
Sync Status

   State: running
   Last sync: 3s ago
   Queue size: 0

Machines:
  machine-a1b2c3d4 — last seen just now
```

Force an immediate sync:

```bash
cortex sync now
```

```
 ✓ Sync completed.
   Pushed: 42
   Pulled: 0
   Conflicts: 0
```

## Push-Pull Cycle

### Push Phase

1. Query local `memories` table for rows where `synced_at IS NULL`
2. Process in batches of 100
3. For each memory: `INSERT OR REPLACE` into Turso
4. On success: set `synced_at` to server timestamp locally
5. Also sync the `projects` table

**Batch throttling**: When the queue exceeds 1000 items, a 1-second delay is inserted between batches to avoid overwhelming Turso.

**Maximum queue**: Up to 5000 unsynced memories are pushed per cycle.

### Pull Phase

1. Read `last_turso_pull_at` for this machine from the `machines` table
2. Query Turso: `SELECT * FROM memories WHERE updated_at > ? AND machine_id != ?`
3. For each remote memory:
   - If it doesn't exist locally: INSERT
   - If it exists and remote is newer: resolve conflict (see below)
   - If it exists and local is newer: skip (local will push on next cycle)
4. Update `last_turso_pull_at` to server timestamp
5. Also pull new projects

## Conflict Resolution

Cortex uses **last-write-wins (LWW)** based on the `updated_at` timestamp.

### How Conflicts Arise

```
Machine A: save_memory("Using Express")           → updated_at: T1
Machine B: save_memory("Using Fastify") (same ID) → updated_at: T2

If T2 > T1: Machine B's version wins
If T1 > T2: Machine A's version wins
```

### Conflict Logging

Every conflict is recorded in the `conflicts` table:

| Field | Description |
|-------|-------------|
| `memory_id` | The conflicting memory |
| `winning_machine_id` | Which machine's version was kept |
| `losing_content` | The overwritten content (preserved for audit) |
| `losing_updated_at` | The overwritten timestamp |
| `resolved_at` | When the conflict was resolved |

### SSE Notification

When a conflict is resolved, a `sync.conflict` SSE event is broadcast:

```json
{
  "type": "sync.conflict",
  "data": {
    "conflict_id": "c1234",
    "memory_id": "a1b2c3d4",
    "project_id": "p5678"
  }
}
```

### Why Last-Write-Wins?

Cortex memories are structured facts, not collaborative documents. In practice:

- Conflicts are rare (typically < 1% of syncs)
- The "latest" version is almost always the correct one
- Superseded content is preserved in the conflict log for recovery
- The simplicity of LWW means sync is fast and predictable

## Offline Behavior

When Turso is unreachable:

1. **Memories continue to save locally** with `synced_at = NULL`
2. **Health check** runs before each sync attempt. If it fails, the sync cycle is skipped.
3. **Offline counter** increments and a `sync.offline` SSE event is broadcast
4. **Queue grows** up to the 5000-memory limit
5. **When connectivity resumes**: the queue is drained in batches of 100

### Rate Limit Backoff

If Turso returns HTTP 429 (Too Many Requests):

| Attempt | Backoff Duration |
|---------|-----------------|
| 1st | 1 second |
| 2nd | 2 seconds |
| 3rd | 4 seconds |
| 4th | 8 seconds |
| ... | Doubles each time |
| Max | 5 minutes (300 seconds) |

Backoff resets to zero on the first successful sync.

### Data Safety

No data is lost during offline periods. The local SQLite database is the source of truth. Sync is a convenience layer, not a requirement.

## Multi-Machine Setup

### Adding a Second Machine

On your second machine:

```bash
# 1. Install Cortex
npx @cortex-memory/cli init

# 2. Verify subscription
cortex subscribe your@email.com

# 3. Configure sync with the SAME Turso database
cortex sync setup
# Enter the same URL and token

# 4. Force initial sync
cortex sync now
```

Cortex will pull all existing memories from Turso:

```
 ✓ Sync completed.
   Pushed: 0
   Pulled: 142
   Conflicts: 0
```

### Machine Identity

Each machine gets a unique UUID stored in the local `machines` table. This ID is:

- Attached to every memory created on that machine (`machine_id` field)
- Used to filter pull queries (don't pull your own changes)
- Registered in Turso for multi-machine tracking

### Viewing Connected Machines

```bash
cortex sync status
```

```
Machines:
  machine-a1b2c3d4 — last seen 12s ago
  machine-e5f6g7h8 — last seen 2m ago
  machine-i9j0k1l2 — last seen 3d ago
```

### Shared Projects

When two machines work on the same project:
- The project is matched by `git_remote` URL or filesystem `path`
- If the same Git repo is cloned to different paths on different machines, Cortex still matches them by remote URL
- Memories are shared across machines for the same project

## Security

### Credential Storage

Turso auth tokens are encrypted at rest:

- **Algorithm**: AES-256-GCM
- **Key derivation**: HKDF-SHA256 with machine-specific salt (`homedir:hostname`)
- **Storage format**: `iv:authTag:ciphertext` (all hex-encoded)
- **Location**: `~/.cortex/config.json` as `turso_token_encrypted`

Legacy plaintext tokens are automatically migrated to encrypted on first read.

### What Gets Synced

| Synced | Not Synced |
|--------|-----------|
| Memories (content, type, tags, importance) | Rate limit logs |
| Projects (name, path, tech stack) | Session transcripts |
| Machine registrations | Memory access logs |
| | Memory ratings |
| | Pending summaries |

### Data in Transit

All communication with Turso uses HTTPS/WSS (TLS encrypted). The `@libsql/client` library handles this automatically.

### Subscriber Verification

Sync requires a verified newsletter subscription. This is verified by:

1. Hashing the email with SHA-256
2. Sending the hash to `cortex.sh/api/verify`
3. Storing the verification token locally (expires after 30 days)
4. Re-verifying silently when the token expires

**Fail-open policy**: If `cortex.sh` is unreachable during re-verification, the token is extended for 30 days. Sync is never blocked by verification server downtime.

## Troubleshooting

### Sync Not Starting

**Symptom**: `cortex sync status` shows "not configured"

**Fix**:
```bash
# 1. Check subscriber token
cortex subscribe your@email.com

# 2. Re-run setup
cortex sync setup
```

### Connection Failed

**Symptom**: `TURSO_CONNECTION_FAILED` error during setup

**Checklist**:
1. Verify the Turso URL is correct: `libsql://your-db.turso.io`
2. Verify the token is valid: `turso db tokens create your-db`
3. Check network connectivity: `curl -I https://your-db.turso.io`
4. Ensure the database exists: `turso db show your-db`

### Memories Not Syncing

**Symptom**: Queue size keeps growing

```bash
# Check sync status
cortex sync status --json

# Force a sync and check for errors
cortex sync now

# Check daemon logs
cat ~/.cortex/cortex.log
```

**Common causes**:
- Turso rate limit (429) -- check backoff status
- Token expired -- regenerate with `turso db tokens create`
- Database deleted -- recreate and re-setup

### Conflicts

**Symptom**: Memories have unexpected content

Conflicts are resolved automatically via last-write-wins. To inspect:

```bash
# Check recent conflicts via the API
curl http://localhost:7434/api/sync/status | jq
```

The losing content is preserved in the `conflicts` table and can be queried directly from SQLite if needed.

### Reset Sync

To start fresh:

1. Pause sync: `cortex sync pause`
2. Delete `~/.cortex/config.json` sync section
3. Optionally recreate the Turso database
4. Re-run: `cortex sync setup`
