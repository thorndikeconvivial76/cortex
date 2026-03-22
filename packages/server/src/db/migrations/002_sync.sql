-- Cortex Schema Migration 002 — Sync tables
-- machines, conflicts, archived_memories

CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('darwin', 'linux', 'win32')),
  last_turso_pull_at TEXT,
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id),
  winning_machine_id TEXT NOT NULL REFERENCES machines(id),
  losing_content TEXT NOT NULL,
  losing_updated_at TEXT NOT NULL,
  resolved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS archived_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  reason TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  importance INTEGER NOT NULL DEFAULT 5,
  confidence INTEGER NOT NULL DEFAULT 3,
  superseded_by TEXT,
  expires_at TEXT,
  reviewed_at TEXT,
  session_id TEXT,
  machine_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT,
  deleted_at TEXT,
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sync index — find unsynced memories quickly
CREATE INDEX IF NOT EXISTS idx_mem_unsynced ON memories(synced_at) WHERE synced_at IS NULL;

INSERT OR IGNORE INTO schema_version (version) VALUES (2);
