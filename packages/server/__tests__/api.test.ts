import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrator.js';
import { ProjectRepository } from '../src/db/repositories/project.repo.js';
import { MemoryRepository } from '../src/db/repositories/memory.repo.js';
import { createAPIServer } from '../src/api/server.js';
import { SSEEmitter } from '../src/api/sse/emitter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;
let sseEmitter: SSEEmitter;
let app: Awaited<ReturnType<typeof createAPIServer>>['app'];
let projectId: string;

beforeEach(async () => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  sseEmitter = new SSEEmitter();
  const server = await createAPIServer(db, sseEmitter);
  app = server.app;
  await app.ready();

  const projectRepo = new ProjectRepository(db);
  projectId = projectRepo.create({ name: 'test-project' }).id;
});

afterEach(async () => {
  sseEmitter.destroy();
  await app.close();
  db.close();
});

describe('Health API', () => {
  it('GET /api/health returns status', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.db_ok).toBe(true);
    expect(body.version).toBe('1.0.0');
  });
});

describe('Projects API', () => {
  it('GET /api/projects lists all projects', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('test-project');
  });

  it('GET /api/projects/:id returns project with stats', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.project.name).toBe('test-project');
    expect(body.data.stats).toBeDefined();
  });

  it('GET /api/projects/:id returns 404 for unknown', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/00000000-0000-0000-0000-000000000000',
    });
    expect(response.statusCode).toBe(404);
  });

  it('PATCH /api/projects/:id updates project', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      payload: { name: 'renamed-project', context_budget: 8000 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.name).toBe('renamed-project');
    expect(body.data.context_budget).toBe(8000);
  });
});

describe('Memories API', () => {
  const validMemory = {
    content: 'Using NestJS for the backend API because of its decorator-based architecture and TypeScript support',
    type: 'decision',
    reason: 'NestJS provides better structure than Express for this project',
    project_id: '', // Set in test
  };

  it('POST /api/memories creates a memory', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/memories',
      payload: { ...validMemory, project_id: projectId },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.type).toBe('decision');
    expect(body.data.importance).toBe(5);
  });

  it('POST /api/memories rejects short content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/memories',
      payload: { content: 'short', type: 'decision', reason: 'test reason here', project_id: projectId },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/memories lists memories for project', async () => {
    // Create a memory first
    const memRepo = new MemoryRepository(db);
    memRepo.create(
      {
        content: 'A test memory with sufficient length to pass the quality gate validation rules',
        type: 'context',
        reason: 'Testing the list endpoint for memories',
      },
      projectId,
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/memories?project_id=${projectId}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /api/memories/:id returns a single memory', async () => {
    const memRepo = new MemoryRepository(db);
    const memory = memRepo.create(
      {
        content: 'A specific memory to retrieve by its unique identifier for testing purposes',
        type: 'decision',
        reason: 'Testing get by ID endpoint',
      },
      projectId,
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/memories/${memory.id}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.id).toBe(memory.id);
  });

  it('DELETE /api/memories/:id soft-deletes', async () => {
    const memRepo = new MemoryRepository(db);
    const memory = memRepo.create(
      {
        content: 'This memory will be deleted via the REST API endpoint for testing delete flow',
        type: 'context',
        reason: 'Testing delete endpoint functionality',
      },
      projectId,
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/memories/${memory.id}`,
    });
    expect(response.statusCode).toBe(204);

    // Verify it's gone
    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/memories/${memory.id}`,
    });
    expect(getResponse.statusCode).toBe(404);
  });

  it('POST /api/memories/search returns search results', async () => {
    const memRepo = new MemoryRepository(db);
    memRepo.create(
      {
        content: 'Deepgram transcription latency is higher than expected on long recordings we process',
        type: 'thread',
        reason: 'Performance issue discovered during testing',
      },
      projectId,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/memories/search',
      payload: { query: 'deepgram', project_id: projectId },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
  });

  it('POST /api/memories/:id/rate rates a memory', async () => {
    const memRepo = new MemoryRepository(db);
    const memory = memRepo.create(
      {
        content: 'A memory that will receive a usefulness rating from the user via the API',
        type: 'decision',
        reason: 'Testing the rating endpoint functionality',
      },
      projectId,
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/memories/${memory.id}/rate`,
      payload: { rating: 4 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.ok).toBe(true);
  });
});

describe('Analytics API', () => {
  it('GET /api/analytics returns overview', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/analytics' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.total_memories).toBeDefined();
    expect(body.data.type_distribution).toBeDefined();
  });
});

describe('SSE Emitter', () => {
  it('broadcasts events to registered clients', () => {
    const received: string[] = [];
    sseEmitter.addClient(
      (data) => {
        received.push(data);
        return true;
      },
      () => {},
    );

    sseEmitter.broadcast({
      type: 'memory.saved',
      data: { memory_id: 'test', project_id: 'test', memory_type: 'decision', importance: 5 },
    });

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]).toContain('memory.saved');
  });

  it('tracks connection count', () => {
    expect(sseEmitter.connectionCount).toBe(0);
    sseEmitter.addClient(() => true, () => {});
    expect(sseEmitter.connectionCount).toBe(1);
  });

  it('removes clients', () => {
    const clientId = sseEmitter.addClient(() => true, () => {});
    sseEmitter.removeClient(clientId);
    expect(sseEmitter.connectionCount).toBe(0);
  });
});
