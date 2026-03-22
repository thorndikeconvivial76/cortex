import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { getCurrentVersion } from '../../db/migrator.js';
import { apiResponse, API_VERSION } from '../response.js';

/** Bytes per megabyte for DB size calculation. */
const BYTES_PER_MB = 1_048_576;

/** Days in a week for rate calculation. */
const DAYS_IN_WEEK = 7;

/**
 * Register system/health routes.
 */
export function registerSystemRoutes(app: FastifyInstance, db: Database.Database): void {
  // GET /api/health — health check
  app.get('/api/health', async () => {
    const startTime = process.uptime();
    let dbOk = true;

    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbOk = false;
    }

    const memoryCount = (
      db.prepare('SELECT COUNT(*) as count FROM memories WHERE deleted_at IS NULL').get() as {
        count: number;
      }
    ).count;

    // Get DB file size — not applicable for in-memory
    let dbSizeMb = 0;
    try {
      const pageCount = (db.pragma('page_count') as Array<{ page_count: number }>)[0].page_count;
      const pageSize = (db.pragma('page_size') as Array<{ page_size: number }>)[0].page_size;
      dbSizeMb = Math.round((pageCount * pageSize) / BYTES_PER_MB * 10) / 10;
    } catch {
      // In-memory DB
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      version: API_VERSION,
      db_ok: dbOk,
      sync_ok: true,
      uptime_s: Math.round(startTime),
      memory_count: memoryCount,
      db_size_mb: dbSizeMb,
      schema_version: getCurrentVersion(db),
    };
  });

  // GET /api/config — public config (no secrets)
  app.get('/api/config', async () => {
    return apiResponse({
      version: API_VERSION,
      schema_version: getCurrentVersion(db),
    });
  });

  // POST /api/summarize — trigger session summarizer (stub)
  app.post('/api/summarize', async () => {
    return apiResponse({ triggered: true });
  });

  // GET /api/analytics — analytics overview
  app.get('/api/analytics', async () => {
    const totalMemories = (
      db.prepare('SELECT COUNT(*) as count FROM memories WHERE deleted_at IS NULL').get() as {
        count: number;
      }
    ).count;

    const activeProjects30d = (
      db
        .prepare(
          "SELECT COUNT(DISTINCT project_id) as count FROM sessions WHERE started_at > datetime('now', '-30 days')",
        )
        .get() as { count: number }
    ).count;

    const creationRate7d = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM memories WHERE created_at > datetime('now', '-7 days') AND deleted_at IS NULL",
        )
        .get() as { count: number }
    ).count / DAYS_IN_WEEK;

    const typeRows = db
      .prepare(
        'SELECT type, COUNT(*) as count FROM memories WHERE deleted_at IS NULL GROUP BY type',
      )
      .all() as Array<{ type: string; count: number }>;
    const typeDistribution: Record<string, number> = {};
    for (const row of typeRows) {
      typeDistribution[row.type] = row.count;
    }

    const avgImportance = (
      db
        .prepare('SELECT AVG(importance) as avg FROM memories WHERE deleted_at IS NULL')
        .get() as { avg: number | null }
    ).avg ?? 0;

    const staleCount = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM memories WHERE reviewed_at IS NULL AND created_at < datetime('now', '-90 days') AND deleted_at IS NULL",
        )
        .get() as { count: number }
    ).count;

    return apiResponse({
      total_memories: totalMemories,
      active_projects_30d: activeProjects30d,
      creation_rate_7d: Math.round(creationRate7d * 10) / 10,
      type_distribution: typeDistribution,
      avg_importance: Math.round(avgImportance * 10) / 10,
      stale_count: staleCount,
    });
  });
}
