/**
 * Rate limiting constants for MCP tools, REST API, sync, and summarizer.
 */

// ── MCP Tool Rate Limits ──
export const MCP_RATE_LIMITS = {
  save_memory: { per_session: 50, per_day: 200 },
  search_memories: { per_session: 100, per_day: null },
  supersede_memory: { per_session: 20, per_day: null },
  delete_memory: { per_session: 10, per_day: null },
  update_memory: { per_session: 50, per_day: null },
  get_memories: { per_session: null, per_day: null }, // Read — not limited
  list_projects: { per_session: null, per_day: null }, // Read — not limited
} as const;

// ── REST API Rate Limits ──
export const REST_RATE_LIMITS = {
  'POST /api/memories': { limit: 100, window_seconds: 3600 },
  'POST /api/memories/search': { limit: 200, window_seconds: 3600 },
  'POST /api/sessions/:id/summarize': { limit: 10, window_seconds: 3600 },
  'POST /api/auth/pin': { limit: 5, window_seconds: 900 }, // Brute-force protection
  'GET /api/events': { limit: 10, window_seconds: null }, // Concurrent connections, not rate
  default: { limit: 1000, window_seconds: 3600 },
} as const;

// ── Turso Sync Batching ──
export const SYNC_BATCH_SIZE = 100;
export const SYNC_INTERVAL_SECONDS = 30;
export const SYNC_LARGE_QUEUE_THRESHOLD = 1000;
export const SYNC_LARGE_QUEUE_DELAY_MS = 1000;
export const SYNC_MAX_OFFLINE_QUEUE = 5000;
export const SYNC_INITIAL_BATCH_SIZE = 500;

// ── Summarizer ──
export const SUMMARIZER_DAILY_LIMIT_DEFAULT = 10;
export const SUMMARIZER_DAILY_LIMIT_MAX = 50;
export const SUMMARIZER_TRIGGER_TIMEOUT_SECONDS = 60;
export const SUMMARIZER_CHUNK_SIZE_TOKENS = 50000;
export const SUMMARIZER_CHUNK_OVERLAP_EVENTS = 10;

// ── SSE ──
export const SSE_MAX_CONNECTIONS = 10;
export const SSE_KEEPALIVE_INTERVAL_SECONDS = 15;
export const SSE_REPLAY_WINDOW_MINUTES = 5;
