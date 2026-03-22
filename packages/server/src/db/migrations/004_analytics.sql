-- Cortex Schema Migration 004 — Analytics, ratings, links, symbols
-- rate_limit_log, memory_access_log, memory_ratings, memory_links, symbols

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  project_id TEXT,
  session_id TEXT,
  called_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_access_log (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  accessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  access_type TEXT NOT NULL CHECK (access_type IN ('injection', 'search', 'api'))
);

CREATE TABLE IF NOT EXISTS memory_ratings (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  memory_id TEXT NOT NULL REFERENCES memories(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  rated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_links (
  id TEXT PRIMARY KEY,
  source_memory_id TEXT NOT NULL REFERENCES memories(id),
  target_project_id TEXT NOT NULL REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  file_path TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rate_limit ON rate_limit_log(project_id, tool_name, called_at);
CREATE INDEX IF NOT EXISTS idx_access_log ON memory_access_log(memory_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_date ON memory_ratings(rated_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_target ON memory_links(target_project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_symbols ON symbols(project_id, symbol_name);

INSERT OR IGNORE INTO schema_version (version) VALUES (4);
