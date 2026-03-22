# REST API Reference

Complete reference for the Cortex REST API running at `http://127.0.0.1:7434`.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Response Format](#response-format)
- [Error Codes](#error-codes)
- [Health & System](#health--system)
- [Memories](#memories)
- [Projects](#projects)
- [Sessions](#sessions)
- [Sync](#sync)
- [SSE Events](#sse-events)

---

## Overview

The Cortex REST API is a Fastify server bound to `127.0.0.1:7434`. It provides CRUD operations for memories and projects, sync management, analytics, and real-time SSE events.

**Base URL**: `http://127.0.0.1:7434`

**Content-Type**: `application/json`

**Body Limit**: 1 MB

**Response Headers** (on every response):

| Header | Description |
|--------|-------------|
| `X-Request-Id` | UUID for request tracing |
| `X-Cortex-Version` | Server version (e.g., `1.0.0`) |

## Authentication

**None required.** The API binds exclusively to `127.0.0.1` (localhost) and is not accessible from the network.

### CORS Policy

Allowed origins:

| Origin | Use Case |
|--------|----------|
| `null` | WKWebView (native Mac app) |
| `http://localhost:*` | Dashboard, dev tools |
| `https://localhost:*` | Secure local connections |
| `file://*` | Electron app |
| `vscode-webview://*` | VS Code extension |

All other origins are rejected.

## Response Format

### Success Response

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-03-22T14:30:00.000Z",
    "version": "1.0.0",
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

### List Response

```json
{
  "data": [ ... ],
  "total": 42,
  "meta": {
    "timestamp": "2026-03-22T14:30:00.000Z",
    "version": "1.0.0",
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": { ... }
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body or query params failed Zod validation |
| `MISSING_PROJECT_ID` | 400 | `project_id` not provided in request body |
| `MEMORY_NOT_FOUND` | 404 | Memory with given ID does not exist |
| `PROJECT_NOT_FOUND` | 404 | Project with given ID does not exist |
| `SESSION_NOT_FOUND` | 404 | Session with given ID does not exist |
| `QUALITY_GATE_FAILED` | 422 | Memory content failed quality checks |
| `CONTENT_TOO_SHORT` | 422 | Content is under 50 characters |
| `CONTENT_TOO_LONG` | 422 | Content exceeds 2000 characters |
| `SENSITIVE_DATA_DETECTED` | 422 | Content contains API keys, tokens, etc. |
| `DUPLICATE_DETECTED` | 422 | Content is > 85% similar to existing memory |
| `RATE_LIMIT_EXCEEDED` | 422 | Session or daily save limit reached |
| `SYNC_NOT_CONFIGURED` | 400 | Turso sync not set up |
| `SYNC_NOT_RUNNING` | 400 | Sync worker not started |
| `SYNC_TOKEN_ERROR` | 400 | Turso token decryption failed |
| `TURSO_CONNECTION_FAILED` | 400 | Cannot connect to Turso database |
| `SCHEMA_SETUP_FAILED` | 500 | Failed to create remote schema |
| `SUBSCRIBER_REQUIRED` | 403 | Newsletter subscription required for sync |
| `SUBSCRIBER_EXPIRED` | 403 | Subscriber token has expired |
| `DB_ERROR` | 500 | Internal database error |

---

## Health & System

### `GET /api/health`

Health check endpoint. Returns daemon status and database stats.

**Response:**

```json
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

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` or `"degraded"` |
| `version` | string | Server version |
| `db_ok` | boolean | SQLite accessible |
| `sync_ok` | boolean | Sync health |
| `uptime_s` | number | Process uptime in seconds |
| `memory_count` | number | Total active memories |
| `db_size_mb` | number | Database file size in MB |
| `schema_version` | number | Current schema migration version |

```bash
curl http://localhost:7434/api/health
```

---

### `GET /api/config`

Get public configuration (no secrets).

**Response:**

```json
{
  "data": {
    "version": "1.0.0",
    "schema_version": 4
  }
}
```

```bash
curl http://localhost:7434/api/config
```

---

### `GET /api/analytics`

Get usage analytics overview.

**Response:**

```json
{
  "data": {
    "total_memories": 142,
    "active_projects_30d": 3,
    "creation_rate_7d": 4.3,
    "type_distribution": {
      "decision": 38,
      "context": 42,
      "preference": 21,
      "thread": 15,
      "error": 12,
      "learning": 14
    },
    "avg_importance": 5.8,
    "stale_count": 7
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_memories` | number | Non-deleted memories |
| `active_projects_30d` | number | Projects with sessions in last 30 days |
| `creation_rate_7d` | number | Average memories created per day (last 7 days) |
| `type_distribution` | object | Count by memory type |
| `avg_importance` | number | Mean importance score |
| `stale_count` | number | Memories unreviewed for > 90 days |

```bash
curl http://localhost:7434/api/analytics
```

---

### `POST /api/summarize`

Trigger the session summarizer.

**Response:**

```json
{
  "data": { "triggered": true }
}
```

```bash
curl -X POST http://localhost:7434/api/summarize
```

---

## Memories

### `GET /api/memories`

List memories with filters, sorting, and pagination.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project_id` | string | Yes | | Project UUID |
| `type` | string | No | | Filter by memory type |
| `limit` | number | No | 50 | Max results (1-200) |
| `offset` | number | No | 0 | Pagination offset |
| `sort` | string | No | `created_at` | Sort field: `created_at`, `updated_at`, `importance` |
| `sort_dir` | string | No | `desc` | Sort direction: `asc`, `desc` |
| `min_importance` | number | No | | Minimum importance score (1-10) |

**Response:**

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "project_id": "p1234-...",
      "type": "decision",
      "content": "Using Fastify instead of Express...",
      "reason": "Architectural decision for API layer",
      "tags": ["api", "fastify"],
      "importance": 8,
      "confidence": 4,
      "superseded_by": null,
      "expires_at": null,
      "reviewed_at": null,
      "session_id": "s5678-...",
      "machine_id": "m9012-...",
      "created_at": "2026-03-22T14:30:00.000Z",
      "updated_at": "2026-03-22T14:30:00.000Z",
      "synced_at": "2026-03-22T14:30:30.000Z",
      "deleted_at": null
    }
  ],
  "total": 42
}
```

```bash
curl "http://localhost:7434/api/memories?project_id=p1234&type=decision&limit=10&sort=importance&sort_dir=desc"
```

---

### `GET /api/memories/:id`

Get a single memory by ID.

**Response:** `200` with memory object, or `404 MEMORY_NOT_FOUND`.

```bash
curl http://localhost:7434/api/memories/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

---

### `POST /api/memories`

Create a new memory. Subject to quality gate validation.

**Request Body:**

```json
{
  "project_id": "p1234-...",
  "content": "Using Fastify instead of Express for the API layer. Rationale: 2x throughput in benchmarks.",
  "type": "decision",
  "reason": "Architectural decision that affects all future API work",
  "tags": ["api", "fastify", "architecture"],
  "importance": 8,
  "confidence": 4
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project_id` | string | Yes | | Target project UUID |
| `content` | string | Yes | | Memory content (50-2000 chars) |
| `type` | string | Yes | | One of: decision, context, preference, thread, error, learning |
| `reason` | string | Yes | | Why this memory matters (>= 10 chars) |
| `tags` | string[] | No | `[]` | Topic tags |
| `importance` | number | No | `5` | Importance score (1-10) |
| `confidence` | number | No | `3` | Confidence score (1-5) |

**Response:** `201 Created` with the new memory object.

**Error:** `422` if quality gate fails (see [Error Codes](#error-codes)).

```bash
curl -X POST http://localhost:7434/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "p1234",
    "content": "Using Fastify instead of Express for the API layer. Rationale: 2x throughput in benchmarks, built-in schema validation, first-class TypeScript.",
    "type": "decision",
    "reason": "Architectural decision for the API layer"
  }'
```

---

### `PATCH /api/memories/:id`

Update memory metadata. Content changes require the supersede endpoint.

**Request Body (all fields optional):**

```json
{
  "type": "preference",
  "importance": 9,
  "confidence": 5,
  "tags": ["critical", "architecture"],
  "expires_at": "2026-06-01T00:00:00Z"
}
```

**Response:** `200` with updated memory, or `404 MEMORY_NOT_FOUND`.

```bash
curl -X PATCH http://localhost:7434/api/memories/a1b2c3d4 \
  -H "Content-Type: application/json" \
  -d '{"importance": 9}'
```

---

### `DELETE /api/memories/:id`

Soft-delete a memory (sets `deleted_at` timestamp).

**Response:** `204 No Content`, or `404 MEMORY_NOT_FOUND`.

**SSE Event:** `memory.deleted`

```bash
curl -X DELETE http://localhost:7434/api/memories/a1b2c3d4
```

---

### `POST /api/memories/:id/supersede`

Replace a memory with new content. The old memory gets `superseded_by` set to the new memory's ID.

**Request Body:**

```json
{
  "content": "Using Fastify v5 (upgraded from v4). Better async hooks and 15% faster routing.",
  "reason": "Upgraded Fastify version",
  "tags": ["api", "fastify"],
  "importance": 8,
  "confidence": 5
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | New content (50-2000 chars) |
| `reason` | string | Yes | Why it changed (>= 10 chars) |
| `tags` | string[] | No | New tags |
| `importance` | number | No | New importance |
| `confidence` | number | No | New confidence |

**Response:** `201` with `{ old: {...}, new: {...} }`.

**SSE Event:** `memory.superseded`

```bash
curl -X POST http://localhost:7434/api/memories/a1b2c3d4/supersede \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Using Fastify v5 (upgraded from v4). Better async hooks and 15% faster routing.",
    "reason": "Upgraded Fastify version"
  }'
```

---

### `POST /api/memories/search`

Full-text search across memories using FTS5.

**Request Body:**

```json
{
  "query": "authentication",
  "project_id": "p1234",
  "limit": 10
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | | Search query |
| `project_id` | string | No | | Scope to project |
| `limit` | number | No | 10 | Max results |

**Response:**

```json
{
  "data": [ ... ],
  "total": 3
}
```

```bash
curl -X POST http://localhost:7434/api/memories/search \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication", "limit": 5}'
```

---

### `GET /api/memories/stale`

Get memories that have never been reviewed and are older than 90 days.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | No | Scope to project |

```bash
curl "http://localhost:7434/api/memories/stale?project_id=p1234"
```

---

### `POST /api/memories/:id/rate`

Rate a memory's usefulness (1-5).

**Request Body:**

```json
{
  "rating": 4
}
```

```bash
curl -X POST http://localhost:7434/api/memories/a1b2c3d4/rate \
  -H "Content-Type: application/json" \
  -d '{"rating": 4}'
```

---

### `POST /api/memories/:id/pin`

Pin a memory (sets importance to 10).

**Response:**

```json
{
  "data": { "id": "a1b2c3d4", "pinned": true, "importance": 10 }
}
```

```bash
curl -X POST http://localhost:7434/api/memories/a1b2c3d4/pin
```

---

### `POST /api/memories/:id/unpin`

Unpin a memory (resets importance to 5).

**Response:**

```json
{
  "data": { "id": "a1b2c3d4", "pinned": false, "importance": 5 }
}
```

```bash
curl -X POST http://localhost:7434/api/memories/a1b2c3d4/unpin
```

---

## Projects

### `GET /api/projects`

List all projects with memory counts (single JOIN query, no N+1).

**Response:**

```json
{
  "data": [
    {
      "id": "p1234-...",
      "name": "my-project",
      "path": "/Users/you/code/my-project",
      "git_remote": "git@github.com:you/my-project.git",
      "tech_stack": "[\"typescript\",\"fastify\"]",
      "context_budget": 4000,
      "memory_limit": 500,
      "created_at": "2026-03-15T10:00:00.000Z",
      "last_session_at": "2026-03-22T14:30:00.000Z",
      "memory_count": 42
    }
  ],
  "total": 3
}
```

```bash
curl http://localhost:7434/api/projects
```

---

### `GET /api/projects/:id`

Get project details with stats.

**Response:**

```json
{
  "data": {
    "project": { ... },
    "stats": { ... }
  }
}
```

```bash
curl http://localhost:7434/api/projects/p1234
```

---

### `PATCH /api/projects/:id`

Update project configuration.

**Request Body (all fields optional):**

```json
{
  "name": "new-name",
  "tech_stack": ["typescript", "fastify", "postgres"],
  "context_budget": 8000,
  "memory_limit": 1000
}
```

```bash
curl -X PATCH http://localhost:7434/api/projects/p1234 \
  -H "Content-Type: application/json" \
  -d '{"name": "my-renamed-project"}'
```

---

### `DELETE /api/projects/:id`

Delete a project and all its memories.

**Response:** `204 No Content`.

```bash
curl -X DELETE http://localhost:7434/api/projects/p1234
```

---

## Sessions

### `GET /api/sessions`

List sessions for a project.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project_id` | string | Yes | | Project UUID |
| `limit` | number | No | 20 | Max results |

```bash
curl "http://localhost:7434/api/sessions?project_id=p1234&limit=10"
```

---

### `GET /api/sessions/:id`

Get session details.

```bash
curl http://localhost:7434/api/sessions/s5678
```

---

## Sync

### `GET /api/sync/status`

Get current sync status.

**Response (not configured):**

```json
{
  "data": { "configured": false }
}
```

**Response (configured):**

```json
{
  "data": {
    "configured": true,
    "running": true,
    "last_sync_at": "2026-03-22T14:30:00.000Z",
    "queue_size": 0,
    "machines": [
      {
        "id": "m1234-...",
        "name": "machine-a1b2c3d4",
        "last_seen_at": "2026-03-22T14:30:00.000Z"
      }
    ]
  }
}
```

```bash
curl http://localhost:7434/api/sync/status
```

---

### `POST /api/sync/setup`

Configure Turso sync credentials and start the sync worker.

**Request Body:**

```json
{
  "url": "libsql://your-db-name.turso.io",
  "token": "your-turso-auth-token"
}
```

**Preconditions:**
- Subscriber token must be present and valid in `~/.cortex/config.json`

**What it does:**
1. Validates subscriber token
2. Tests Turso connection
3. Creates remote schema (memories, projects, machines tables)
4. Encrypts and stores credentials
5. Registers this machine
6. Starts the sync worker

**Response:** `201 Created`

```json
{
  "data": {
    "status": "configured",
    "machine_id": "m1234-...",
    "machine_name": "machine-a1b2c3d4"
  }
}
```

**Errors:**
- `403 SUBSCRIBER_REQUIRED` -- no subscriber token
- `403 SUBSCRIBER_EXPIRED` -- subscriber token expired
- `400 TURSO_CONNECTION_FAILED` -- cannot reach Turso
- `500 SCHEMA_SETUP_FAILED` -- remote schema creation failed

```bash
curl -X POST http://localhost:7434/api/sync/setup \
  -H "Content-Type: application/json" \
  -d '{"url": "libsql://my-db.turso.io", "token": "eyJ..."}'
```

---

### `POST /api/sync/start`

Start or resume the sync worker.

**Response:**

```json
{
  "data": { "status": "started", "machine_id": "m1234-..." }
}
```

```bash
curl -X POST http://localhost:7434/api/sync/start
```

---

### `POST /api/sync/stop`

Pause the sync worker.

**Response:**

```json
{
  "data": { "status": "stopped" }
}
```

```bash
curl -X POST http://localhost:7434/api/sync/stop
```

---

### `POST /api/sync/now`

Force an immediate sync cycle.

**Response:**

```json
{
  "data": {
    "status": "completed",
    "pushed": 3,
    "pulled": 1,
    "conflicts": 0
  }
}
```

```bash
curl -X POST http://localhost:7434/api/sync/now
```

---

## SSE Events

### `GET /api/events`

Server-Sent Events endpoint. Opens a persistent connection for real-time updates.

**Headers:**

| Header | Description |
|--------|-------------|
| `Last-Event-ID` | Resume from this event ID (replay missed events within 5-minute window) |

**Event Format:**

```
id: <uuid>
event: <event-type>
data: <json-payload>

```

### Event Types

#### `memory.saved`

Emitted when a new memory is successfully saved.

```
id: abc123
event: memory.saved
data: {"memory_id":"a1b2c3d4","project_id":"p1234","memory_type":"decision","importance":8}
```

#### `memory.deleted`

Emitted when a memory is soft-deleted.

```
id: def456
event: memory.deleted
data: {"memory_id":"a1b2c3d4","project_id":"p1234"}
```

#### `memory.superseded`

Emitted when a memory is replaced.

```
id: ghi789
event: memory.superseded
data: {"old_memory_id":"a1b2c3d4","new_memory_id":"x9y8z7w6","project_id":"p1234"}
```

#### `sync.completed`

Emitted after a successful sync cycle.

```
id: jkl012
event: sync.completed
data: {"pushed":3,"pulled":1,"conflicts":0}
```

#### `sync.conflict`

Emitted when a sync conflict is resolved.

```
id: mno345
event: sync.conflict
data: {"conflict_id":"c1234","memory_id":"a1b2c3d4","project_id":"p1234"}
```

#### `sync.offline`

Emitted when Turso is unreachable.

```
id: pqr678
event: sync.offline
data: {"offlineCount":3,"latency_ms":5000}
```

### Connecting

```bash
curl -N http://localhost:7434/api/events
```

```javascript
const events = new EventSource('http://localhost:7434/api/events');

events.addEventListener('memory.saved', (e) => {
  const data = JSON.parse(e.data);
  console.log('Memory saved:', data.memory_id);
});

events.addEventListener('sync.completed', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Sync: pushed ${data.pushed}, pulled ${data.pulled}`);
});
```

### Reconnection

The SSE endpoint supports `Last-Event-ID` for replay. Events are retained for 5 minutes (max 1000). When a client reconnects with the `Last-Event-ID` header, all missed events within the window are replayed immediately.

### Keepalive

A `: ping` comment is sent every 30 seconds to prevent proxy timeouts and detect disconnected clients.
