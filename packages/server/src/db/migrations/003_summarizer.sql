-- Cortex Schema Migration 003 — Summarizer tables
-- pending_summaries, archived_pending_summaries

CREATE TABLE IF NOT EXISTS pending_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  candidates_json TEXT NOT NULL, -- JSON array of MemoryCandidate
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'expired', 'failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS archived_pending_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  candidates_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  expires_at TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (3);
