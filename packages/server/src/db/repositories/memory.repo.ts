import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Memory, CreateMemoryInput, UpdateMemoryInput } from '@cortex/shared';

/** Whitelist of allowed sort columns to prevent SQL injection in ORDER BY. */
const ALLOWED_SORT = ['created_at', 'updated_at', 'importance', 'confidence'] as const;
type AllowedSort = (typeof ALLOWED_SORT)[number];

function sanitizeSort(col: string | undefined): AllowedSort {
  if (col && (ALLOWED_SORT as readonly string[]).includes(col)) {
    return col as AllowedSort;
  }
  return 'created_at';
}

function sanitizeSortDir(dir: string | undefined): 'ASC' | 'DESC' {
  return dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

/**
 * Memory repository — all CRUD operations on the memories table.
 */
export class MemoryRepository {
  constructor(private db: Database.Database) {}

  /**
   * Create a new memory.
   */
  create(input: CreateMemoryInput, projectId: string, sessionId?: string, machineId?: string): Memory {
    const id = uuid();
    const now = new Date().toISOString();
    const tags = JSON.stringify(input.tags || []);

    this.db
      .prepare(
        `INSERT INTO memories (id, project_id, type, content, reason, tags, importance, confidence, expires_at, session_id, machine_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        input.type,
        input.content,
        input.reason,
        tags,
        input.importance ?? 5,
        input.confidence ?? 3,
        input.expires_at ?? null,
        sessionId ?? null,
        machineId ?? null,
        now,
        now,
      );

    return this.getById(id)!;
  }

  /**
   * Get a memory by ID.
   */
  getById(id: string): Memory | null {
    const row = this.db
      .prepare('SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL')
      .get(id) as MemoryRow | undefined;

    return row ? this.rowToMemory(row) : null;
  }

  /**
   * List memories for a project with filtering and sorting.
   */
  list(params: {
    projectId: string;
    type?: string;
    minImportance?: number;
    limit?: number;
    offset?: number;
    sort?: string;
    sortDir?: string;
    includeArchived?: boolean;
  }): { memories: Memory[]; total: number } {
    const conditions: string[] = ['project_id = ?'];
    const values: unknown[] = [params.projectId];

    if (!params.includeArchived) {
      conditions.push('deleted_at IS NULL');
    }
    if (params.type) {
      conditions.push('type = ?');
      values.push(params.type);
    }
    if (params.minImportance) {
      conditions.push('importance >= ?');
      values.push(params.minImportance);
    }

    const where = conditions.join(' AND ');
    const sort = sanitizeSort(params.sort);
    const dir = sanitizeSortDir(params.sortDir);
    const limit = Math.min(params.limit || 50, 200);
    const offset = params.offset || 0;

    const total = (
      this.db.prepare(`SELECT COUNT(*) as count FROM memories WHERE ${where}`).get(...values) as {
        count: number;
      }
    ).count;

    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE ${where} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset) as MemoryRow[];

    return {
      memories: rows.map((r) => this.rowToMemory(r)),
      total,
    };
  }

  /**
   * Full-text search across memories in a project.
   */
  search(query: string, projectId?: string, limit = 10): Memory[] {
    let sql: string;
    let params: unknown[];

    if (projectId) {
      sql = `SELECT m.* FROM memories m
             JOIN memories_fts fts ON m.rowid = fts.rowid
             WHERE memories_fts MATCH ? AND m.project_id = ? AND m.deleted_at IS NULL
             ORDER BY rank LIMIT ?`;
      params = [query, projectId, limit];
    } else {
      sql = `SELECT m.* FROM memories m
             JOIN memories_fts fts ON m.rowid = fts.rowid
             WHERE memories_fts MATCH ? AND m.deleted_at IS NULL
             ORDER BY rank LIMIT ?`;
      params = [query, limit];
    }

    const rows = this.db.prepare(sql).all(...params) as MemoryRow[];
    return rows.map((r) => this.rowToMemory(r));
  }

  /**
   * Update memory metadata (content changes via supersede only).
   */
  update(id: string, input: UpdateMemoryInput): Memory | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.type !== undefined) {
      fields.push('type = ?');
      values.push(input.type);
    }
    if (input.importance !== undefined) {
      fields.push('importance = ?');
      values.push(input.importance);
    }
    if (input.confidence !== undefined) {
      fields.push('confidence = ?');
      values.push(input.confidence);
    }
    if (input.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(input.tags));
    }
    if (input.expires_at !== undefined) {
      fields.push('expires_at = ?');
      values.push(input.expires_at);
    }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    // Mark as needing sync
    fields.push('synced_at = NULL');
    values.push(id);

    this.db
      .prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values);

    return this.getById(id);
  }

  /**
   * Soft-delete a memory.
   */
  softDelete(id: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE memories SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), synced_at = NULL WHERE id = ? AND deleted_at IS NULL",
      )
      .run(id);
    return result.changes > 0;
  }

  /**
   * Supersede a memory — mark old one as superseded, create new one.
   */
  supersede(
    oldId: string,
    input: CreateMemoryInput,
    projectId: string,
    sessionId?: string,
    machineId?: string,
  ): { old: Memory; new: Memory } | null {
    const oldMemory = this.getById(oldId);
    if (!oldMemory) return null;

    const newMemory = this.create(input, projectId, sessionId, machineId);

    this.db
      .prepare(
        "UPDATE memories SET superseded_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), synced_at = NULL WHERE id = ?",
      )
      .run(newMemory.id, oldId);

    return {
      old: this.getById(oldId)!,
      new: newMemory,
    };
  }

  /**
   * Get memories that are stale (not reviewed in 90+ days).
   */
  getStale(projectId?: string, limit = 50): Memory[] {
    let sql =
      "SELECT * FROM memories WHERE reviewed_at IS NULL AND created_at < datetime('now', '-90 days') AND deleted_at IS NULL AND superseded_by IS NULL";
    const params: unknown[] = [];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    sql += ' ORDER BY created_at ASC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as MemoryRow[];
    return rows.map((r) => this.rowToMemory(r));
  }

  /**
   * Mark a memory as reviewed (updates reviewed_at).
   */
  markReviewed(id: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE memories SET reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND deleted_at IS NULL",
      )
      .run(id);
    return result.changes > 0;
  }

  /**
   * Count memories for a project.
   */
  countByProject(projectId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM memories WHERE project_id = ? AND deleted_at IS NULL')
      .get(projectId) as { count: number };
    return row.count;
  }

  /**
   * Get all memories for context injection, ranked by score.
   */
  getForInjection(projectId: string, tokenBudget: number): Memory[] {
    // Get all active, non-superseded memories for the project
    const rows = this.db
      .prepare(
        `SELECT * FROM memories
         WHERE project_id = ? AND deleted_at IS NULL AND superseded_by IS NULL
         ORDER BY importance DESC, created_at DESC`,
      )
      .all(projectId) as MemoryRow[];

    return rows.map((r) => this.rowToMemory(r));
  }

  /**
   * Get linked memories from other projects.
   */
  getLinkedMemories(projectId: string): Array<Memory & { linked_from_project: string }> {
    const rows = this.db
      .prepare(
        `SELECT m.*, p.name as source_project_name
         FROM memory_links ml
         JOIN memories m ON ml.source_memory_id = m.id
         JOIN projects p ON m.project_id = p.id
         WHERE ml.target_project_id = ? AND ml.deleted_at IS NULL AND m.deleted_at IS NULL`,
      )
      .all(projectId) as Array<MemoryRow & { source_project_name: string }>;

    return rows.map((r) => ({
      ...this.rowToMemory(r),
      linked_from_project: r.source_project_name,
    }));
  }

  // ── Private helpers ──

  private rowToMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      project_id: row.project_id,
      type: row.type as Memory['type'],
      content: row.content,
      reason: row.reason,
      tags: JSON.parse(row.tags || '[]'),
      importance: row.importance,
      confidence: row.confidence,
      superseded_by: row.superseded_by,
      expires_at: row.expires_at,
      reviewed_at: row.reviewed_at,
      session_id: row.session_id,
      machine_id: row.machine_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      synced_at: row.synced_at,
      deleted_at: row.deleted_at,
    };
  }
}

/**
 * Raw SQLite row shape before parsing.
 */
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
