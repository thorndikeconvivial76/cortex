# Security Model

> Cortex is designed for developers and engineering teams who ask hard questions about the tools they install. This document explains every security decision, every protection layer, and every known risk — with full transparency.

---

## Table of Contents

- [Trust Principles](#trust-principles)
- [Network Security](#network-security)
- [Data Protection](#data-protection)
- [Credential Security](#credential-security)
- [API Security](#api-security)
- [Memory Content Protection](#memory-content-protection)
- [Sync Security](#sync-security)
- [Installation Security](#installation-security)
- [Platform-Specific Security](#platform-specific-security)
- [Known Acceptable Risks](#known-acceptable-risks)
- [Threat Model](#threat-model)
- [What Cortex Does NOT Do](#what-cortex-does-not-do)
- [Vulnerability Reporting](#vulnerability-reporting)

---

## Trust Principles

Cortex is built on three non-negotiable principles:

1. **Local-first** — All data lives on your machine by default. Nothing leaves unless you explicitly enable sync.
2. **You own your data** — Cortex never hosts, reads, or has access to your memories. Sync uses your own Turso account.
3. **Full transparency** — Open source (MIT). Every line readable before installation. No hidden behavior.

---

## Network Security

### Daemon Binding

The Cortex daemon listens on `localhost:7434` only. It is **never exposed** to your local network or the internet.

```
Binding: 127.0.0.1:7434
Protocol: HTTP (no TLS needed — localhost only)
Accessible from: Same machine only
```

No process on another machine, no device on your Wi-Fi, and no remote server can reach the daemon.

### CORS Policy

The REST API enforces a strict CORS whitelist:

| Origin | Why Allowed |
|---|---|
| `http://localhost:*` | Browser dashboard |
| `http://127.0.0.1:*` | Browser dashboard (IP variant) |
| `null` | WKWebView (Cortex Desktop) |
| `file://` | Electron app |
| `vscode-webview://` | VS Code extension |

**No wildcard origins.** No remote domains. Cross-origin requests from any website are rejected.

### SSE Authentication

The Server-Sent Events endpoint (`/api/events`) includes a defense-in-depth localhost check:

```
Allowed IPs: 127.0.0.1, ::1, ::ffff:127.0.0.1
All other IPs: 403 Forbidden
```

This prevents any non-localhost process from subscribing to real-time memory events.

---

## Data Protection

### Local Storage

All memories are stored in a SQLite database on your machine:

```
Location: ~/.cortex/memory.db
Format: SQLite with WAL mode
Access: Owner-only (Unix file permissions)
```

The database is never transmitted anywhere unless you explicitly enable Turso sync.

### Session Transcripts

When the session summarizer runs, it temporarily captures Claude Code session data:

- **Encrypted** with AES-256-GCM using a machine-derived key
- **Deleted** after the summarizer processes them
- **Never synced** to Turso or any remote service
- **Never stored** in plain text on disk

### What Is Stored

Cortex stores **structured memory records only**:

| Stored | Example |
|---|---|
| Decisions | "Using Fastify adapter for NestJS" |
| Preferences | "Always use TypeScript strict mode" |
| Context | "Deployment blocked on API keys" |
| Threads | "Deepgram latency needs investigation" |
| Errors | "PostgreSQL connection pool exhaustion on cold start" |

### What Is NOT Stored

| Never Stored | Detail |
|---|---|
| Source code | Cortex does not read or store file contents |
| API keys | Quality gate actively blocks credentials |
| Passwords | Detected and rejected by sensitive data scanner |
| File paths | Not stored in memories (only in project detection) |
| Git history | Not accessed or stored |
| Environment variables | Not accessed or stored |

---

## Credential Security

### Turso Sync Credentials

When multi-machine sync is enabled, your Turso database URL and auth token are stored locally:

```
Location: ~/.cortex/config.json
Encryption: AES-256-GCM
Key Derivation: HKDF-SHA256 from machine identity
```

**How it works:**

1. Your Turso auth token is encrypted using AES-256-GCM before writing to disk
2. The encryption key is derived using HKDF-SHA256 from your machine's identity (hostname + home directory path)
3. A random 12-byte IV is generated for each encryption operation
4. The auth tag is stored alongside the ciphertext for integrity verification
5. On read, the token is decrypted in memory — never stored as plaintext

**Legacy migration:** If an older version stored a plaintext token, Cortex automatically encrypts it on first read and updates the config file.

### Subscriber Token

Your newsletter subscriber verification is stored as a SHA-256 hash of your email:

```
Stored: SHA-256 hash (one-way, not reversible)
Verified against: cortex.sh/api/verify
Cache: 30-day local cache
```

Cortex never stores your email address. Only the hash is kept. The hash cannot be reversed to reveal your email.

---

## API Security

### Input Validation

Every API endpoint validates inputs using Zod schemas:

| Endpoint | Validation |
|---|---|
| `POST /api/memories` | Content (50-2000 chars), type (enum), importance (1-10), tags (array) |
| `PATCH /api/memories/:id` | Partial fields, importance range, confidence range |
| `GET /api/memories` | Limit (1-200), offset (min 0), sort (whitelist), order (asc/desc) |
| `POST /api/sync/setup` | URL (valid URL format), token (min 10 chars) |
| `POST /api/memories/search` | Query (string), limit (1-100) |

Invalid inputs return `400 Bad Request` with specific field-level error details.

### SQL Injection Protection

All database queries use parameterized statements. Dynamic values are never interpolated into SQL strings.

For ORDER BY clauses, a strict column whitelist prevents injection:

```
Allowed sort columns: created_at, updated_at, importance, confidence
Any other value: defaults to created_at
Sort direction: only ASC or DESC accepted
```

### Rate Limiting

The REST API enforces rate limits to prevent abuse:

| Scope | Limit |
|---|---|
| Global (all endpoints) | 100 requests/minute per IP |
| `POST /api/memories` (create) | 30 requests/minute per IP |
| `POST /api/memories/search` | 60 requests/minute per IP |
| Subscriber verification | 10 requests/minute per IP |

Exceeding limits returns `429 Too Many Requests` with a `Retry-After` header.

---

## Memory Content Protection

### Quality Gate

Every memory passes through a 6-rule quality gate before being saved:

| Rule | What It Checks |
|---|---|
| **Length** | Content must be 50-2000 characters. Reason must be 10+ characters. |
| **Banned Phrases** | Rejects 50+ patterns of generic narration ("I will now...", "Let me...") |
| **Sensitive Data** | Scans for API keys, tokens, passwords, private keys, connection strings |
| **Quality Score** | Composite score based on technical terms, specificity, and structure |
| **Duplicate Detection** | TF-IDF cosine similarity check against existing memories (threshold: 0.85) |
| **Rate Limit** | Maximum 50 memories per session, 200 per day |

### Sensitive Data Scanner

The scanner uses pattern matching to detect and block:

- AWS access keys (`AKIA...`)
- Generic API keys and tokens
- Passwords and secrets in config format
- Private keys (RSA, SSH, PGP headers)
- Database connection strings with credentials
- Bearer tokens and JWTs
- Environment variable assignments with sensitive values

If sensitive data is detected, the memory is **rejected** with a clear error message. It is never written to the database.

---

## Sync Security

### Architecture

Sync uses a push-pull model with your own Turso database:

```
Your Machine ──── HTTPS ────▶ Your Turso Database
                              (your account, your credentials)

Cortex servers: NOT involved in sync
```

### What Cortex Can See During Sync

| Data | Can Cortex See? |
|---|---|
| Your memories | **No** — stored in your Turso account |
| Your projects | **No** — stored in your Turso account |
| Your Turso credentials | **No** — encrypted on your machine |
| Your subscriber status | **Yes** — SHA-256 hash of email, verified once |

### Conflict Resolution

When the same memory is edited on two machines between syncs:

1. **Last-write-wins** by `updated_at` timestamp
2. The losing version is saved to a `conflicts` table — never deleted
3. An SSE event notifies connected clients
4. Users can review and restore losing versions from the dashboard

### Offline Behavior

When Turso is unreachable:

- All reads continue from local SQLite (no network dependency)
- Writes queue locally (`synced_at = NULL`)
- Queue stored in SQLite — survives daemon restarts
- Queue limit: 5,000 records
- On reconnect: queue processed FIFO in batches of 100

---

## Installation Security

### Installer Script

The curl installer (`install.cortex.sh`) follows security best practices:

- **No silent sudo:** If npm global install fails, the script asks for explicit confirmation before retrying with sudo
- **Idempotent:** Safe to run multiple times — checks for existing installations
- **Fail-loud:** Critical steps (database init, npm install) fail with clear error messages — no silent `|| true`
- **Verifiable:** The script is open source and readable before execution

### Daemon Management

| Platform | Method | Auto-Restart | Security |
|---|---|---|---|
| macOS | launchd plist | On crash only | Standard user context |
| Linux | systemd user service | On failure | PrivateTmp, NoNewPrivileges, ProtectSystem=strict |
| Windows | Manual / Task Scheduler | Configurable | Standard user context |

The Linux systemd service includes security hardening:

```ini
PrivateTmp=yes              # Isolated /tmp
NoNewPrivileges=yes         # Cannot gain new privileges
ProtectSystem=strict        # Read-only filesystem except whitelisted
ReadWritePaths=%h/.cortex   # Only ~/.cortex is writable
```

### Clean Uninstall

`cortex uninstall` removes everything:

- Daemon process (killed)
- launchd/systemd service (unregistered)
- `~/.cortex/` directory (database, config, logs)
- Claude Code MCP registration (from `~/.claude/settings.json`)
- `.cortex/` project markers (from project directories)

**Zero footprint** after uninstall. Nothing is left behind.

---

## Platform-Specific Security

### macOS (Cortex Desktop)

- **DMG distribution:** Hardened runtime, no sandbox (allows daemon management)
- **App Store distribution:** Full sandbox with network + file entitlements
- **Menu bar app:** Runs as `LSUIElement` (no dock icon, minimal footprint)
- **Notarization:** Signed and notarized with Apple Developer certificate

### Electron App

- **Entitlements:** JIT, network client/server, unsigned executable memory (required for Node.js)
- **Auto-update:** Signed updates via Sparkle (macOS) or electron-updater
- **Process isolation:** Daemon spawned as detached process, fully independent

### VS Code Extension

- **Activation:** Only activates after VS Code fully loads (`onStartupFinished`)
- **API access:** Talks to localhost:7434 only — no external network calls
- **Hover provider:** Debounced with 5-second cache to prevent API spam
- **SSE:** Reconnects with backoff (5s → 10s → 30s)

---

## Known Acceptable Risks

These are known behaviors that are standard for developer tools in this category:

| Risk | Why It's Acceptable |
|---|---|
| `~/.cortex/config.json` readable by same-user processes | Turso token is encrypted (AES-256-GCM). Standard for CLI tools — same pattern as `~/.aws/credentials`, `~/.npmrc`, `~/.docker/config.json` |
| No CSRF protection on REST API | Localhost-only API with no browser sessions, no cookies, no state tokens. CSRF requires cross-origin cookie-based auth, which doesn't apply here |
| Subscriber gate bypassable by editing config.json | Requires faking SHA-256 hash + expiry. Sync still needs real Turso credentials. The gate is a distribution mechanism, not DRM |
| No TLS on localhost | Industry standard for localhost services. TLS between processes on the same machine adds complexity without security benefit. Used by: Docker, Redis, PostgreSQL, webpack-dev-server |
| SQLite database not encrypted at rest | Standard for developer tools. Full-disk encryption (FileVault, BitLocker, LUKS) provides at-rest protection at the OS level |

---

## Threat Model

### What We Protect Against

| Threat | Protection |
|---|---|
| Remote attacker accessing memories | Localhost-only binding, CORS whitelist |
| Credential theft from config file | AES-256-GCM encryption with machine-derived key |
| SQL injection via API | Parameterized queries, column whitelist, Zod validation |
| API abuse / DoS | Rate limiting (100/min global, 30/min on writes) |
| Sensitive data in memories | Quality gate scanner blocks API keys, tokens, passwords |
| Memory spam / low quality | 6-rule quality gate with rate limits |
| Sync credential interception | HTTPS to Turso, encrypted local storage |
| Unauthorized SSE access | Localhost IP verification |

### What We Don't Protect Against

| Threat | Why | Mitigation |
|---|---|---|
| Root/admin access on same machine | Any tool with root can read any file | Use full-disk encryption, limit root access |
| Physical access to unlocked machine | Any app can read localhost:7434 | Lock your machine, use screen lock |
| Malicious VS Code extension | Could call Cortex API on localhost | Only install trusted extensions |
| Compromised Turso account | Attacker reads your memories in Turso | Use strong Turso password, enable 2FA |
| Memory content in swap/hibernation | SQLite pages may be written to swap | Use encrypted swap (default on modern macOS/Linux) |

---

## What Cortex Does NOT Do

- **Does not read your source code** — only structured memory records
- **Does not store API keys** — actively blocked by quality gate
- **Does not send telemetry** — zero by default, opt-in only
- **Does not phone home** — no analytics, no usage tracking, no heartbeat
- **Does not run as root** — standard user permissions only
- **Does not modify files** outside `~/.cortex/` and `~/.claude/settings.json`
- **Does not persist after uninstall** — complete clean removal
- **Does not have a backdoor** — open source, every line auditable

---

## Vulnerability Reporting

If you discover a security vulnerability:

1. **Do NOT open a public issue**
2. Email **koundinya@k2n2studio.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
3. We will acknowledge within **48 hours**
4. We will provide a fix timeline within **7 days**
5. We will credit you in the security advisory (unless you prefer anonymity)

See [SECURITY.md](../SECURITY.md) for full responsible disclosure policy.

---

*Cortex Security Model v1.0 — Last updated March 2026*
*A project by K2N2 Studio — The Production Line*
