/**
 * Error codes used across MCP tools, CLI, and REST API.
 */

// ── MCP Tool Errors ──
export const MCP_ERRORS = {
  QUALITY_GATE_FAILED: {
    code: 'QUALITY_GATE_FAILED',
    message: 'Quality gate rejected this memory.',
    claude_action: 'Rephrase with more specific content and a longer reason. Hard stop after 3 retries.',
    max_retries: 3,
  },
  SENSITIVE_DATA_DETECTED: {
    code: 'SENSITIVE_DATA_DETECTED',
    message: 'Content contains sensitive data (API key, token, password, etc.).',
    claude_action: 'Rephrase without the sensitive value. Hard stop after 2 retries.',
    max_retries: 2,
  },
  DUPLICATE_DETECTED: {
    code: 'DUPLICATE_DETECTED',
    message: 'Content is >85% similar to an existing memory.',
    claude_action: 'Use supersede_memory instead. No retry.',
    max_retries: 0,
  },
  CONTENT_TOO_SHORT: {
    code: 'CONTENT_TOO_SHORT',
    message: 'Content must be at least 50 characters.',
    claude_action: 'Expand with more detail. Max 3 retries.',
    max_retries: 3,
  },
  CONTENT_TOO_LONG: {
    code: 'CONTENT_TOO_LONG',
    message: 'Content must be under 2,000 characters.',
    claude_action: 'Split into multiple memories. Max 2 retries.',
    max_retries: 2,
  },
  INVALID_TYPE: {
    code: 'INVALID_TYPE',
    message: 'Type must be one of: decision, context, preference, thread, error, learning.',
    claude_action: 'Use a correct type. Max 2 retries.',
    max_retries: 2,
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Session or daily save limit reached.',
    claude_action: 'Stop saving. Let the summarizer handle it at session end. No retry.',
    max_retries: 0,
  },
  MEMORY_NOT_FOUND: {
    code: 'MEMORY_NOT_FOUND',
    message: 'The specified memory_id does not exist.',
    claude_action: 'Use list_projects or search to find the correct ID. No retry.',
    max_retries: 0,
  },
  DB_ERROR: {
    code: 'DB_ERROR',
    message: 'Database error occurred.',
    claude_action: 'Do not retry. Run cortex doctor.',
    max_retries: 0,
  },
} as const;

// ── CLI Errors ──
export const CLI_ERRORS = {
  DAEMON_NOT_RUNNING: { code: 'DAEMON_NOT_RUNNING', exit_code: 1, fix: 'Run: cortex doctor --fix' },
  DB_CORRUPT: { code: 'DB_CORRUPT', exit_code: 1, fix: 'Run: cortex doctor --fix' },
  SETTINGS_MISSING: { code: 'SETTINGS_MISSING', exit_code: 1, fix: 'Run: cortex init' },
  SYNC_NOT_CONFIGURED: { code: 'SYNC_NOT_CONFIGURED', exit_code: 0, fix: 'Run: cortex sync setup' },
  INVALID_PROVIDER: { code: 'INVALID_PROVIDER', exit_code: 1, fix: 'Run: cortex summarize --setup' },
  AUTH_REQUIRED: { code: 'AUTH_REQUIRED', exit_code: 1, fix: 'Run: cortex dashboard --unlock' },
  UPGRADE_REQUIRED: { code: 'UPGRADE_REQUIRED', exit_code: 1, fix: 'Run: cortex upgrade' },
  NODE_TOO_OLD: {
    code: 'NODE_TOO_OLD',
    exit_code: 1,
    fix: 'Node >= 18 required. Download: nodejs.org',
  },
  CLAUDE_CODE_NOT_FOUND: {
    code: 'CLAUDE_CODE_NOT_FOUND',
    exit_code: 0,
    fix: 'Install Claude Code from claude.ai/code',
  },
} as const;

// ── HTTP Status Code Mapping ──
export const HTTP_STATUS_MAP: Record<string, number> = {
  QUALITY_GATE_FAILED: 422,
  SENSITIVE_DATA_DETECTED: 422,
  DUPLICATE_DETECTED: 409,
  CONTENT_TOO_SHORT: 400,
  CONTENT_TOO_LONG: 400,
  INVALID_TYPE: 400,
  RATE_LIMIT_EXCEEDED: 429,
  MEMORY_NOT_FOUND: 404,
  DB_ERROR: 500,
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
};
