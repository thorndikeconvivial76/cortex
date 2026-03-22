import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Project, ProjectStats } from '@cortex/shared';

/**
 * Project repository — all CRUD operations on the projects table.
 */
export class ProjectRepository {
  constructor(private db: Database.Database) {}

  /**
   * Create a new project.
   */
  create(params: {
    name: string;
    path?: string;
    gitRemote?: string;
    techStack?: string[];
  }): Project {
    const id = uuid();
    const now = new Date().toISOString();
    const techStack = JSON.stringify(params.techStack || []);

    this.db
      .prepare(
        `INSERT INTO projects (id, name, path, git_remote, tech_stack, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, params.name, params.path ?? null, params.gitRemote ?? null, techStack, now);

    return this.getById(id)!;
  }

  /**
   * Get a project by ID.
   */
  getById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined;
    return row ? this.rowToProject(row) : null;
  }

  /**
   * Find a project by git remote URL.
   */
  findByGitRemote(remote: string): Project | null {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE git_remote = ?')
      .get(remote) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : null;
  }

  /**
   * Find a project by folder path.
   */
  findByPath(folderPath: string): Project | null {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE path = ?')
      .get(folderPath) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : null;
  }

  /**
   * List all projects.
   */
  listAll(): Project[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY last_session_at DESC NULLS LAST, created_at DESC')
      .all() as ProjectRow[];
    return rows.map((r) => this.rowToProject(r));
  }

  /**
   * Update a project.
   */
  update(
    id: string,
    input: Partial<{
      name: string;
      path: string;
      gitRemote: string;
      techStack: string[];
      contextBudget: number;
      memoryLimit: number;
    }>,
  ): Project | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      fields.push('name = ?');
      values.push(input.name);
    }
    if (input.path !== undefined) {
      fields.push('path = ?');
      values.push(input.path);
    }
    if (input.gitRemote !== undefined) {
      fields.push('git_remote = ?');
      values.push(input.gitRemote);
    }
    if (input.techStack !== undefined) {
      fields.push('tech_stack = ?');
      values.push(JSON.stringify(input.techStack));
    }
    if (input.contextBudget !== undefined) {
      fields.push('context_budget = ?');
      values.push(input.contextBudget);
    }
    if (input.memoryLimit !== undefined) {
      fields.push('memory_limit = ?');
      values.push(input.memoryLimit);
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    this.db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getById(id);
  }

  /**
   * Update last_session_at timestamp.
   */
  touchSession(id: string): void {
    this.db
      .prepare(
        "UPDATE projects SET last_session_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      )
      .run(id);
  }

  /**
   * Delete a project and all its memories.
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Get stats for a project.
   */
  getStats(id: string): ProjectStats | null {
    const project = this.getById(id);
    if (!project) return null;

    const totalMemories = (
      this.db
        .prepare(
          'SELECT COUNT(*) as count FROM memories WHERE project_id = ? AND deleted_at IS NULL',
        )
        .get(id) as { count: number }
    ).count;

    const typeRows = this.db
      .prepare(
        'SELECT type, COUNT(*) as count FROM memories WHERE project_id = ? AND deleted_at IS NULL GROUP BY type',
      )
      .all(id) as Array<{ type: string; count: number }>;
    const typeDistribution: Record<string, number> = {};
    for (const row of typeRows) {
      typeDistribution[row.type] = row.count;
    }

    const avgImportance =
      (
        this.db
          .prepare(
            'SELECT AVG(importance) as avg FROM memories WHERE project_id = ? AND deleted_at IS NULL',
          )
          .get(id) as { avg: number | null }
      ).avg ?? 0;

    const staleCount = (
      this.db
        .prepare(
          "SELECT COUNT(*) as count FROM memories WHERE project_id = ? AND reviewed_at IS NULL AND created_at < datetime('now', '-90 days') AND deleted_at IS NULL",
        )
        .get(id) as { count: number }
    ).count;

    const sessionCount30d = (
      this.db
        .prepare(
          "SELECT COUNT(*) as count FROM sessions WHERE project_id = ? AND started_at > datetime('now', '-30 days')",
        )
        .get(id) as { count: number }
    ).count;

    // Health score = (freshness * 40) + (coverage * 30) + (quality * 30)
    const freshness = totalMemories > 0 ? 1 - staleCount / totalMemories : 1;
    const coverage = Math.min(totalMemories / 50, 1);
    const quality = avgImportance / 10;
    const healthScore = Math.round(freshness * 40 + coverage * 30 + quality * 30);

    return {
      total_memories: totalMemories,
      type_distribution: typeDistribution,
      avg_importance: Math.round(avgImportance * 10) / 10,
      stale_count: staleCount,
      health_score: healthScore,
      last_session_at: project.last_session_at,
      session_count_30d: sessionCount30d,
    };
  }

  // ── Private ──

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      git_remote: row.git_remote,
      tech_stack: JSON.parse(row.tech_stack || '[]'),
      context_budget: row.context_budget,
      memory_limit: row.memory_limit,
      created_at: row.created_at,
      last_session_at: row.last_session_at,
    };
  }
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
