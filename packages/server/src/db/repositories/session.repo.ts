import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Session } from '@cortex/shared';

/**
 * Session repository — tracks Claude Code sessions.
 */
export class SessionRepository {
  constructor(private db: Database.Database) {}

  /**
   * Create a new session.
   */
  create(projectId: string, machineId?: string): Session {
    const id = uuid();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, machine_id, started_at) VALUES (?, ?, ?, ?)`,
      )
      .run(id, projectId, machineId ?? null, now);

    return this.getById(id)!;
  }

  /**
   * Get a session by ID.
   */
  getById(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * End a session — set ended_at timestamp.
   */
  end(id: string): void {
    this.db
      .prepare("UPDATE sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .run(id);
  }

  /**
   * Increment memory count for a session.
   */
  incrementMemoryCount(id: string): void {
    this.db
      .prepare('UPDATE sessions SET memory_count = memory_count + 1 WHERE id = ?')
      .run(id);
  }

  /**
   * Mark session as summarized.
   */
  markSummarized(id: string): void {
    this.db.prepare('UPDATE sessions SET summarized = 1 WHERE id = ?').run(id);
  }

  /**
   * Set transcript path for a session.
   */
  setTranscriptPath(id: string, path: string): void {
    this.db.prepare('UPDATE sessions SET transcript_path = ? WHERE id = ?').run(path, id);
  }

  /**
   * Mark transcript as deleted.
   */
  markTranscriptDeleted(id: string): void {
    this.db
      .prepare(
        "UPDATE sessions SET transcript_deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      )
      .run(id);
  }

  /**
   * List sessions for a project.
   */
  listByProject(projectId: string, limit = 20): Session[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT ?',
      )
      .all(projectId, limit) as SessionRow[];
    return rows.map((r) => this.rowToSession(r));
  }

  /**
   * Get the most recent session for a project.
   */
  getLatest(projectId: string): Session | null {
    const row = this.db
      .prepare(
        'SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT 1',
      )
      .get(projectId) as SessionRow | undefined;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * Close orphaned sessions (ended_at IS NULL and older than 24 hours).
   * Used by the nightly cleanup job.
   */
  closeOrphaned(): number {
    const result = this.db
      .prepare(
        "UPDATE sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE ended_at IS NULL AND started_at < datetime('now', '-24 hours')",
      )
      .run();
    return result.changes;
  }

  // ── Private ──

  private rowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      project_id: row.project_id,
      machine_id: row.machine_id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      memory_count: row.memory_count,
      summarized: row.summarized === 1,
      transcript_path: row.transcript_path,
      transcript_deleted_at: row.transcript_deleted_at,
    };
  }
}

interface SessionRow {
  id: string;
  project_id: string;
  machine_id: string | null;
  started_at: string;
  ended_at: string | null;
  memory_count: number;
  summarized: number;
  transcript_path: string | null;
  transcript_deleted_at: string | null;
}
