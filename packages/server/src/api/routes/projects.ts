import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { UpdateProjectSchema } from '@cortex/shared';
import { ProjectRepository } from '../../db/repositories/project.repo.js';
import { MemoryRepository } from '../../db/repositories/memory.repo.js';
import { SessionRepository } from '../../db/repositories/session.repo.js';

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
  memory_count?: number;
}

/**
 * Register project routes.
 */
export function registerProjectRoutes(app: FastifyInstance, db: Database.Database): void {
  const projectRepo = new ProjectRepository(db);
  const memRepo = new MemoryRepository(db);
  const sessionRepo = new SessionRepository(db);

  // GET /api/projects — list all projects (single query with JOIN to avoid N+1)
  app.get('/api/projects', async () => {
    const projects = db.prepare(`
      SELECT p.*, COUNT(m.id) as memory_count
      FROM projects p
      LEFT JOIN memories m ON p.id = m.project_id AND m.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.last_session_at DESC
    `).all() as ProjectRow[];

    return {
      data: projects,
      total: projects.length,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // GET /api/projects/:id — project detail + stats
  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = projectRepo.getById(id);
    if (!project) {
      return reply.status(404).send({
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${id} not found` },
      });
    }

    const stats = projectRepo.getStats(id);
    return {
      data: { project, stats },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // PATCH /api/projects/:id — update project config
  app.patch('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const updated = projectRepo.update(id, {
      name: parsed.data.name,
      techStack: parsed.data.tech_stack,
      contextBudget: parsed.data.context_budget,
      memoryLimit: parsed.data.memory_limit,
    });
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${id} not found` },
      });
    }

    return {
      data: updated,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // DELETE /api/projects/:id — delete project and all memories
  app.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = projectRepo.delete(id);
    if (!deleted) {
      return reply.status(404).send({
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${id} not found` },
      });
    }
    return reply.status(204).send();
  });

  // GET /api/sessions — list sessions
  app.get('/api/sessions', async (request) => {
    const query = request.query as Record<string, string>;
    const projectId = query.project_id;
    const limit = parseInt(query.limit || '20', 10);

    if (!projectId) {
      return {
        data: [],
        total: 0,
        meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
      };
    }

    const sessions = sessionRepo.listByProject(projectId, limit);
    return {
      data: sessions,
      total: sessions.length,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // GET /api/sessions/:id — session detail
  app.get('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionRepo.getById(id);
    if (!session) {
      return reply.status(404).send({
        error: { code: 'SESSION_NOT_FOUND', message: `Session ${id} not found` },
      });
    }
    return {
      data: session,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });
}
