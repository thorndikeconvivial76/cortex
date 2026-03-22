import type Database from 'better-sqlite3';
import { MCP_RATE_LIMITS } from '@cortex/shared';
import type { QualityRuleResult } from '../gate.js';

/**
 * Rule 7: Rate limit — 50 saves/session, 200/day.
 */
export function checkRateLimit(
  db: Database.Database,
  toolName: string,
  sessionId: string | null,
  projectId: string | null,
): QualityRuleResult {
  const limits = MCP_RATE_LIMITS[toolName as keyof typeof MCP_RATE_LIMITS];
  if (!limits) return { passed: true };

  // Check per-session limit
  if (limits.per_session !== null && sessionId) {
    const sessionCount = (
      db
        .prepare(
          'SELECT COUNT(*) as count FROM rate_limit_log WHERE session_id = ? AND tool_name = ?',
        )
        .get(sessionId, toolName) as { count: number }
    ).count;

    if (sessionCount >= limits.per_session) {
      return {
        passed: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Session limit reached (${sessionCount}/${limits.per_session} ${toolName} calls). Stop saving — the summarizer will catch remaining memories at session end.`,
        details: { current: sessionCount, limit: limits.per_session, scope: 'session' },
      };
    }
  }

  // Check daily limit
  if (limits.per_day !== null) {
    const dailyCount = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM rate_limit_log WHERE tool_name = ? AND called_at > datetime('now', '-1 day')",
        )
        .get(toolName) as { count: number }
    ).count;

    if (dailyCount >= limits.per_day) {
      return {
        passed: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Daily limit reached (${dailyCount}/${limits.per_day} ${toolName} calls). The summarizer will handle remaining memories.`,
        details: { current: dailyCount, limit: limits.per_day, scope: 'daily' },
      };
    }
  }

  return { passed: true };
}

/**
 * Record a tool call in the rate limit log.
 */
export function recordToolCall(
  db: Database.Database,
  id: string,
  toolName: string,
  sessionId: string | null,
  projectId: string | null,
): void {
  db.prepare(
    'INSERT INTO rate_limit_log (id, tool_name, session_id, project_id) VALUES (?, ?, ?, ?)',
  ).run(id, toolName, sessionId, projectId);
}
