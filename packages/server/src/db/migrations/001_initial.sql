-- Cortex Schema Migration 001 — Core tables
-- memories, projects, sessions, schema_version

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT,
  git_remote TEXT,
  tech_stack TEXT NOT NULL DEFAULT '[]', -- JSON array
  context_budget INTEGER NOT NULL DEFAULT 4000 CHECK (context_budget >= 1000 AND context_budget <= 12000),
  memory_limit INTEGER NOT NULL DEFAULT 500 CHECK (memory_limit >= 50 AND memory_limit <= 10000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_session_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  machine_id TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT,
  memory_count INTEGER NOT NULL DEFAULT 0,
  summarized INTEGER NOT NULL DEFAULT 0,
  transcript_path TEXT,
  transcript_deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('decision', 'context', 'preference', 'thread', 'error', 'learning')),
  content TEXT NOT NULL CHECK (length(content) >= 50 AND length(content) <= 2000),
  reason TEXT NOT NULL CHECK (length(reason) >= 10),
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  confidence INTEGER NOT NULL DEFAULT 3 CHECK (confidence >= 1 AND confidence <= 5),
  superseded_by TEXT REFERENCES memories(id),
  expires_at TEXT,
  reviewed_at TEXT,
  session_id TEXT REFERENCES sessions(id),
  machine_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  synced_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- FTS5 virtual table for full-text search on memory content
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  tags,
  content=memories,
  content_rowid=rowid
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_mem_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_mem_created ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mem_stale ON memories(reviewed_at) WHERE reviewed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_expires ON memories(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mem_deleted ON memories(deleted_at) WHERE deleted_at IS NOT NULL;

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_deleted_at ON memories(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
