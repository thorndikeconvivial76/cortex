import type Database from 'better-sqlite3';
import type { Client } from '@libsql/client';
import { v4 as uuid } from 'uuid';
import {
  SYNC_BATCH_SIZE,
  SYNC_INTERVAL_SECONDS,
  SYNC_LARGE_QUEUE_THRESHOLD,
  SYNC_LARGE_QUEUE_DELAY_MS,
  SYNC_MAX_OFFLINE_QUEUE,
  SYNC_INITIAL_BATCH_SIZE,
} from '@cortex/shared';
import type { SSEEmitter } from '../api/sse/emitter.js';
import { checkHealth, getServerTimestamp } from './turso-client.js';

interface MemoryRow {
  id: string;
  project_id: string;
  type: string;
  content: string;
  reason: string;
  tags: string;
  importance: number;
  confidence: number;
  superseded_by: string | null;
  expires_at: string | null;
  reviewed_at: string | null;
  session_id: string | null;
  machine_id: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  deleted_at: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  path: string | null;
  git_remote: string | null;
  tech_stack: string;
  context_budget: number;
  memory_limit: number;
  created_at: string;
  last_session_at: string | null;
}

export interface SyncStatus {
  running: boolean;
  paused: boolean;
  lastSyncAt: string | null;
  lastPushed: number;
  lastPulled: number;
  lastConflicts: number;
  offlineCount: number;
  backoffMs: number;
  queueSize: number;
}

/**
 * Background sync worker — pushes local changes to Turso, pulls remote changes.
 * Runs every 30 seconds. Batch size 100. Last-write-wins conflict resolution.
 */
export class SyncWorker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private paused = false;

  // Backoff state for 429 rate limits
  private backoffMs = 0;
  private lastBackoffAttempt = 0;

  // Offline tracking
  private offlineCount = 0;

  // Last sync stats
  private lastSyncAt: string | null = null;
  private lastPushed = 0;
  private lastPulled = 0;
  private lastConflicts = 0;

  constructor(
    private db: Database.Database,
    private turso: Client,
    private machineId: string,
    private sseEmitter?: SSEEmitter,
  ) {}

  /**
   * Start the background sync worker.
   */
  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), SYNC_INTERVAL_SECONDS * 1000);
    // Run initial sync immediately
    this.tick();
  }

  /**
   * Stop the sync worker.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Pause the sync worker. Stops the interval but preserves state.
   */
  pause(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.paused = true;
  }

  /**
   * Resume the sync worker after a pause.
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.start();
  }

  /**
   * Force an immediate sync cycle.
   */
  async syncNow(): Promise<{ pushed: number; pulled: number; conflicts: number }> {
    return this.tick();
  }

  /**
   * Get current sync status.
   */
  getStatus(): SyncStatus {
    const queueRow = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM memories WHERE synced_at IS NULL')
      .get() as { cnt: number };

    return {
      running: this.interval !== null && !this.paused,
      paused: this.paused,
      lastSyncAt: this.lastSyncAt,
      lastPushed: this.lastPushed,
      lastPulled: this.lastPulled,
      lastConflicts: this.lastConflicts,
      offlineCount: this.offlineCount,
      backoffMs: this.backoffMs,
      queueSize: queueRow.cnt,
    };
  }

  /**
   * Initial bulk sync for new machines.
   * Downloads all memories from Turso in batches and rebuilds the FTS index.
   */
  async initialSync(
    onProgress?: (downloaded: number, total: number) => void,
  ): Promise<number> {
    // Get total count from Turso
    const countResult = await this.turso.execute('SELECT COUNT(*) AS cnt FROM memories');
    const total = Number(countResult.rows[0].cnt);

    if (total === 0) {
      onProgress?.(0, 0);
      return 0;
    }

    let downloaded = 0;
    let offset = 0;

    while (offset < total) {
      const batch = await this.turso.execute({
        sql: 'SELECT * FROM memories ORDER BY created_at ASC LIMIT ? OFFSET ?',
        args: [SYNC_INITIAL_BATCH_SIZE, offset],
      });

      if (batch.rows.length === 0) break;

      const insertStmt = this.db.prepare(
        `INSERT OR IGNORE INTO memories (id, project_id, type, content, reason, tags, importance, confidence, superseded_by, expires_at, reviewed_at, session_id, machine_id, created_at, updated_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const serverTs = await getServerTimestamp(this.turso);

      const insertMany = this.db.transaction((rows: MemoryRow[]) => {
        for (const row of rows) {
          insertStmt.run(
            row.id, row.project_id, row.type, row.content, row.reason, row.tags,
            row.importance, row.confidence, row.superseded_by, row.expires_at,
            row.reviewed_at, row.session_id, row.machine_id, row.created_at,
            row.updated_at, serverTs, row.deleted_at,
          );
        }
      });

      insertMany(batch.rows as unknown as MemoryRow[]);
      downloaded += batch.rows.length;
      offset += SYNC_INITIAL_BATCH_SIZE;

      onProgress?.(downloaded, total);
    }

    // Rebuild FTS5 index after bulk import
    this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");

    return downloaded;
  }

  /**
   * Single sync tick — health check, backoff gate, push then pull.
   */
  private async tick(): Promise<{ pushed: number; pulled: number; conflicts: number }> {
    if (this.isRunning || this.paused) return { pushed: 0, pulled: 0, conflicts: 0 };

    // Backoff gate: if we're in backoff, check if enough time has passed
    if (this.backoffMs > 0) {
      const elapsed = Date.now() - this.lastBackoffAttempt;
      if (elapsed < this.backoffMs) {
        return { pushed: 0, pulled: 0, conflicts: 0 };
      }
    }

    this.isRunning = true;

    try {
      // Health check before sync
      const health = await checkHealth(this.turso);
      if (!health.healthy) {
        this.offlineCount++;
        this.sseEmitter?.broadcast({
          type: 'sync.offline',
          data: { offlineCount: this.offlineCount, latency_ms: health.latency_ms },
        });
        return { pushed: 0, pulled: 0, conflicts: 0 };
      }

      // Reset offline counter on successful health check
      this.offlineCount = 0;

      const pushed = await this.pushChanges();
      const { pulled, conflicts } = await this.pullChanges();

      // Successful sync — reset backoff
      this.backoffMs = 0;

      this.lastPushed = pushed;
      this.lastPulled = pulled;
      this.lastConflicts = conflicts;
      this.lastSyncAt = new Date().toISOString();

      if (pushed > 0 || pulled > 0 || conflicts > 0) {
        this.sseEmitter?.broadcast({
          type: 'sync.completed',
          data: { pushed, pulled, conflicts },
        });
      }

      return { pushed, pulled, conflicts };
    } catch (error) {
      // Check for 429 rate limit
      if (this.isRateLimited(error)) {
        this.backoffMs = Math.min((this.backoffMs * 2) || 1000, 300_000);
        this.lastBackoffAttempt = Date.now();
      }
      // Sync failure is non-fatal — will retry next tick
      return { pushed: 0, pulled: 0, conflicts: 0 };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if an error is a 429 rate-limit response.
   */
  private isRateLimited(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      // Check for Response-like object with status
      if ('status' in err && err.status === 429) return true;
      // Check for error message containing 429
      if ('message' in err && typeof err.message === 'string') {
        return err.message.includes('429');
      }
    }
    return false;
  }

  /**
   * Push unsynced local memories to Turso.
   */
  private async pushChanges(): Promise<number> {
    const unsynced = this.db
      .prepare(
        `SELECT * FROM memories WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT ?`,
      )
      .all(SYNC_MAX_OFFLINE_QUEUE) as MemoryRow[];

    if (unsynced.length === 0) return 0;

    let pushed = 0;

    // Get server timestamp for synced_at values
    const serverTs = await getServerTimestamp(this.turso);

    // Process in batches
    for (let i = 0; i < unsynced.length; i += SYNC_BATCH_SIZE) {
      const batch = unsynced.slice(i, i + SYNC_BATCH_SIZE);

      for (const memory of batch) {
        try {
          // Upsert to Turso — last write wins
          await this.turso.execute({
            sql: `INSERT OR REPLACE INTO memories (id, project_id, type, content, reason, tags, importance, confidence, superseded_by, expires_at, reviewed_at, session_id, machine_id, created_at, updated_at, synced_at, deleted_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              memory.id,
              memory.project_id,
              memory.type,
              memory.content,
              memory.reason,
              memory.tags,
              memory.importance,
              memory.confidence,
              memory.superseded_by,
              memory.expires_at,
              memory.reviewed_at,
              memory.session_id,
              memory.machine_id,
              memory.created_at,
              memory.updated_at,
              serverTs,
              memory.deleted_at,
            ],
          });

          // Mark as synced locally using server timestamp
          this.db
            .prepare('UPDATE memories SET synced_at = ? WHERE id = ?')
            .run(serverTs, memory.id);

          pushed++;
        } catch (err) {
          // Check for rate limit on individual pushes
          if (this.isRateLimited(err)) throw err;
          // Individual record failure — continue with next
        }
      }

      // Delay between batches for large queues
      if (unsynced.length > SYNC_LARGE_QUEUE_THRESHOLD && i + SYNC_BATCH_SIZE < unsynced.length) {
        await new Promise((r) => setTimeout(r, SYNC_LARGE_QUEUE_DELAY_MS));
      }
    }

    // Also push projects
    const unsyncedProjects = this.db
      .prepare('SELECT * FROM projects')
      .all() as ProjectRow[];

    for (const project of unsyncedProjects) {
      try {
        await this.turso.execute({
          sql: `INSERT OR REPLACE INTO projects (id, name, path, git_remote, tech_stack, context_budget, memory_limit, created_at, last_session_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            project.id,
            project.name,
            project.path,
            project.git_remote,
            project.tech_stack,
            project.context_budget,
            project.memory_limit,
            project.created_at,
            project.last_session_at,
          ],
        });
      } catch {
        // Non-critical
      }
    }

    return pushed;
  }

  /**
   * Pull changes from Turso that are newer than our last pull.
   */
  private async pullChanges(): Promise<{ pulled: number; conflicts: number }> {
    // Get last pull timestamp for this machine
    const machine = this.db
      .prepare('SELECT last_turso_pull_at FROM machines WHERE id = ?')
      .get(this.machineId) as { last_turso_pull_at: string | null } | undefined;

    const lastPull = machine?.last_turso_pull_at || '1970-01-01T00:00:00Z';

    // Pull memories updated after last pull, not from this machine
    let result;
    try {
      result = await this.turso.execute({
        sql: `SELECT * FROM memories WHERE updated_at > ? AND machine_id != ? ORDER BY updated_at ASC LIMIT 500`,
        args: [lastPull, this.machineId],
      });
    } catch (err) {
      if (this.isRateLimited(err)) throw err;
      return { pulled: 0, conflicts: 0 };
    }

    // Get server timestamp for synced_at values
    const serverTs = await getServerTimestamp(this.turso);

    let pulled = 0;
    let conflicts = 0;

    for (const row of result.rows) {
      const remoteId = row.id as string;

      // Check if we have this memory locally
      const local = this.db
        .prepare('SELECT * FROM memories WHERE id = ?')
        .get(remoteId) as MemoryRow | undefined;

      if (!local) {
        // New memory from remote — insert locally
        this.db
          .prepare(
            `INSERT INTO memories (id, project_id, type, content, reason, tags, importance, confidence, superseded_by, expires_at, reviewed_at, session_id, machine_id, created_at, updated_at, synced_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            row.id, row.project_id, row.type, row.content, row.reason, row.tags,
            row.importance, row.confidence, row.superseded_by, row.expires_at,
            row.reviewed_at, row.session_id, row.machine_id, row.created_at,
            row.updated_at, serverTs, row.deleted_at,
          );
        pulled++;
      } else {
        // Conflict — last write wins by updated_at
        const remoteUpdated = new Date(row.updated_at as string).getTime();
        const localUpdated = new Date(local.updated_at).getTime();

        if (remoteUpdated > localUpdated) {
          // Remote wins — update local
          // Log conflict
          this.db
            .prepare(
              `INSERT INTO conflicts (id, memory_id, winning_machine_id, losing_content, losing_updated_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(uuid(), remoteId, row.machine_id as string, local.content, local.updated_at);

          // Update local with remote version
          this.db
            .prepare(
              `UPDATE memories SET content = ?, reason = ?, tags = ?, importance = ?, confidence = ?,
               superseded_by = ?, type = ?, updated_at = ?, synced_at = ?, deleted_at = ?
               WHERE id = ?`,
            )
            .run(
              row.content, row.reason, row.tags, row.importance, row.confidence,
              row.superseded_by, row.type, row.updated_at,
              serverTs, row.deleted_at, remoteId,
            );

          conflicts++;
          pulled++;

          this.sseEmitter?.broadcast({
            type: 'sync.conflict',
            data: { conflict_id: remoteId, memory_id: remoteId, project_id: row.project_id as string },
          });
        }
        // If local is newer, do nothing — our version wins and will be pushed next tick
      }
    }

    // Update last pull timestamp using server time
    this.db
      .prepare('UPDATE machines SET last_turso_pull_at = ? WHERE id = ?')
      .run(serverTs, this.machineId);

    // Also pull projects
    try {
      const projectResult = await this.turso.execute('SELECT * FROM projects');
      for (const row of projectResult.rows) {
        const exists = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(row.id as string);
        if (!exists) {
          this.db
            .prepare(
              `INSERT INTO projects (id, name, path, git_remote, tech_stack, context_budget, memory_limit, created_at, last_session_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(row.id, row.name, row.path, row.git_remote, row.tech_stack, row.context_budget, row.memory_limit, row.created_at, row.last_session_at);
        }
      }
    } catch {
      // Non-critical
    }

    return { pulled, conflicts };
  }
}
