import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import {
  CreateMemorySchema,
  UpdateMemorySchema,
  SupersedeMemorySchema,
  SearchParamsSchema,
  RateMemorySchema,
} from '@cortex/shared';
import { MemoryRepository } from '../../db/repositories/memory.repo.js';
import { runQualityGate } from '../../quality/gate.js';
import { recordToolCall } from '../../quality/rules/rate-limit.js';
import type { SSEEmitter } from '../sse/emitter.js';

/** Zod schema for GET /api/memories query params (coerced from strings). */
const MemoryListQuerySchema = z.object({
  project_id: z.string().min(1),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['created_at', 'updated_at', 'importance']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  min_importance: z.coerce.number().int().min(1).max(10).optional(),
});

/**
 * Register memory CRUD routes.
 */
export function registerMemoryRoutes(
  app: FastifyInstance,
  db: Database.Database,
  sseEmitter: SSEEmitter,
): void {
  const memRepo = new MemoryRepository(db);

  // GET /api/memories — list with filters
  app.get('/api/memories', async (request, reply) => {
    const parsed = MemoryListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.flatten() },
      });
    }

    const { project_id: projectId, type, limit, offset, sort, sort_dir: sortDir, min_importance: minImportance } = parsed.data;

    const result = memRepo.list({
      projectId,
      type,
      minImportance,
      limit,
      offset,
      sort,
      sortDir,
    });

    return {
      data: result.memories,
      total: result.total,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // GET /api/memories/:id — get by ID
  app.get('/api/memories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const memory = memRepo.getById(id);
    if (!memory) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }
    return { data: memory, meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() } };
  });

  // POST /api/memories — create (stricter rate limit: 30/min)
  app.post('/api/memories', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = CreateMemorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const { project_id } = request.body as { project_id: string };
    if (!project_id) {
      return reply.status(400).send({
        error: { code: 'MISSING_PROJECT_ID', message: 'project_id is required in request body' },
      });
    }

    // Quality gate
    const gateResult = runQualityGate(parsed.data, db, project_id);
    if (!gateResult.passed) {
      return reply.status(422).send({
        error: {
          code: gateResult.error_code,
          message: gateResult.error_message,
        },
      });
    }

    const memory = memRepo.create(parsed.data, project_id);

    sseEmitter.broadcast({
      type: 'memory.saved',
      data: {
        memory_id: memory.id,
        project_id: memory.project_id,
        memory_type: memory.type,
        importance: memory.importance,
      },
    });

    return reply.status(201).send({
      data: memory,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    });
  });

  // PATCH /api/memories/:id — update metadata
  app.patch('/api/memories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateMemorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const updated = memRepo.update(id, parsed.data);
    if (!updated) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }

    return { data: updated, meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() } };
  });

  // DELETE /api/memories/:id — soft delete
  app.delete('/api/memories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Fetch before deleting to get project_id for the SSE broadcast
    const memory = memRepo.getById(id);
    if (!memory) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }

    const deleted = memRepo.softDelete(id);
    if (!deleted) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }

    sseEmitter.broadcast({
      type: 'memory.deleted',
      data: { memory_id: id, project_id: memory.project_id },
    });

    return reply.status(204).send();
  });

  // POST /api/memories/:id/supersede — supersede with new content
  app.post('/api/memories/:id/supersede', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = SupersedeMemorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const existing = memRepo.getById(id);
    if (!existing) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }

    const input = {
      ...parsed.data,
      type: existing.type,
    };

    // Quality gate on new content
    const gateResult = runQualityGate(input, db, existing.project_id);
    if (!gateResult.passed) {
      return reply.status(422).send({
        error: { code: gateResult.error_code, message: gateResult.error_message },
      });
    }

    const result = memRepo.supersede(id, input, existing.project_id);
    if (!result) {
      return reply.status(500).send({ error: { code: 'DB_ERROR', message: 'Failed to supersede memory' } });
    }

    sseEmitter.broadcast({
      type: 'memory.superseded',
      data: {
        old_memory_id: result.old.id,
        new_memory_id: result.new.id,
        project_id: existing.project_id,
      },
    });

    return reply.status(201).send({
      data: { old: result.old, new: result.new },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    });
  });

  // POST /api/memories/search — full-text search (stricter rate limit: 60/min)
  app.post('/api/memories/search', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = SearchParamsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const results = memRepo.search(
      parsed.data.query,
      parsed.data.project_id,
      parsed.data.limit,
    );

    return {
      data: results,
      total: results.length,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // GET /api/memories/stale — get stale memories
  app.get('/api/memories/stale', async (request) => {
    const query = request.query as Record<string, string>;
    const stale = memRepo.getStale(query.project_id);

    return {
      data: stale,
      total: stale.length,
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // POST /api/memories/:id/rate — rate memory usefulness
  app.post('/api/memories/:id/rate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = RateMemorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
      });
    }

    const memory = memRepo.getById(id);
    if (!memory) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }

    db.prepare(
      'INSERT INTO memory_ratings (id, memory_id, project_id, rating) VALUES (?, ?, ?, ?)',
    ).run(uuid(), id, memory.project_id, parsed.data.rating);

    return { data: { ok: true }, meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() } };
  });

  // POST /api/memories/:id/pin — pin a memory (set importance to 10)
  app.post('/api/memories/:id/pin', async (request, reply) => {
    const { id } = request.params as { id: string };

    const memory = memRepo.getById(id);
    if (!memory) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }

    db.prepare('UPDATE memories SET importance = 10 WHERE id = ?').run(id);

    return {
      data: { id, pinned: true, importance: 10 },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // POST /api/memories/:id/unpin — unpin a memory (set importance to 5)
  app.post('/api/memories/:id/unpin', async (request, reply) => {
    const { id } = request.params as { id: string };

    const memory = memRepo.getById(id);
    if (!memory) {
      return reply.status(404).send({
        error: { code: 'MEMORY_NOT_FOUND', message: `Memory ${id} not found` },
      });
    }

    db.prepare('UPDATE memories SET importance = 5 WHERE id = ?').run(id);

    return {
      data: { id, pinned: false, importance: 5 },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });
}
