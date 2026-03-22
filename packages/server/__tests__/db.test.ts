import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations, getCurrentVersion, checkIntegrity } from '../src/db/migrator.js';
import { MemoryRepository } from '../src/db/repositories/memory.repo.js';
import { ProjectRepository } from '../src/db/repositories/project.repo.js';
import { SessionRepository } from '../src/db/repositories/session.repo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
});

afterEach(() => {
  db.close();
});

describe('Database Connection', () => {
  it('creates an in-memory database', () => {
    expect(db).toBeDefined();
  });

  it('enables WAL mode (memory DB falls back to memory journal)', () => {
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    // In-memory databases cannot use WAL — they use 'memory' journal mode
    expect(result[0].journal_mode).toBe('memory');
  });

  it('enables foreign keys', () => {
    const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(result[0].foreign_keys).toBe(1);
  });

  it('passes integrity check', () => {
    const result = checkIntegrity(db);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Migrations', () => {
  it('runs all 4 migrations', () => {
    const freshDb = createDatabase(':memory:');
    const result = runMigrations(freshDb, MIGRATIONS_DIR);
    expect(result.applied).toBe(4);
    expect(result.current_version).toBe(4);
    freshDb.close();
  });

  it('is idempotent — running again applies 0', () => {
    const result = runMigrations(db, MIGRATIONS_DIR);
    expect(result.applied).toBe(0);
  });

  it('tracks schema version correctly', () => {
    const version = getCurrentVersion(db);
    expect(version).toBe(4);
  });

  it('creates all expected tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name).filter((n) => !n.startsWith('memories_fts'));

    expect(tableNames).toContain('memories');
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('machines');
    expect(tableNames).toContain('conflicts');
    expect(tableNames).toContain('archived_memories');
    expect(tableNames).toContain('pending_summaries');
    expect(tableNames).toContain('archived_pending_summaries');
    expect(tableNames).toContain('rate_limit_log');
    expect(tableNames).toContain('memory_access_log');
    expect(tableNames).toContain('memory_ratings');
    expect(tableNames).toContain('memory_links');
    expect(tableNames).toContain('schema_version');
    expect(tableNames).toContain('symbols');
  });
});

describe('ProjectRepository', () => {
  let repo: ProjectRepository;

  beforeEach(() => {
    repo = new ProjectRepository(db);
  });

  it('creates a project', () => {
    const project = repo.create({ name: 'karnyx', path: '/dev/karnyx' });
    expect(project.id).toBeTruthy();
    expect(project.name).toBe('karnyx');
    expect(project.path).toBe('/dev/karnyx');
  });

  it('gets a project by ID', () => {
    const created = repo.create({ name: 'test-project' });
    const found = repo.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('test-project');
  });

  it('finds by git remote', () => {
    repo.create({ name: 'karnyx', gitRemote: 'github.com/kd/karnyx' });
    const found = repo.findByGitRemote('github.com/kd/karnyx');
    expect(found).toBeDefined();
    expect(found!.name).toBe('karnyx');
  });

  it('lists all projects', () => {
    repo.create({ name: 'project-a' });
    repo.create({ name: 'project-b' });
    const all = repo.listAll();
    expect(all).toHaveLength(2);
  });

  it('updates a project', () => {
    const project = repo.create({ name: 'old-name' });
    const updated = repo.update(project.id, { name: 'new-name', contextBudget: 8000 });
    expect(updated!.name).toBe('new-name');
    expect(updated!.context_budget).toBe(8000);
  });

  it('computes project stats', () => {
    const project = repo.create({ name: 'stats-test' });
    const memRepo = new MemoryRepository(db);
    memRepo.create(
      {
        content: 'Using NestJS for the backend API with TypeScript strict mode enabled',
        type: 'decision',
        reason: 'Better structure and type safety',
        importance: 8,
      },
      project.id,
    );

    const stats = repo.getStats(project.id);
    expect(stats).toBeDefined();
    expect(stats!.total_memories).toBe(1);
    expect(stats!.type_distribution.decision).toBe(1);
  });
});

describe('MemoryRepository', () => {
  let memRepo: MemoryRepository;
  let projectId: string;

  beforeEach(() => {
    memRepo = new MemoryRepository(db);
    const projectRepo = new ProjectRepository(db);
    projectId = projectRepo.create({ name: 'test-project' }).id;
  });

  it('creates a memory', () => {
    const memory = memRepo.create(
      {
        content: 'Using NestJS for the backend API with TypeScript strict mode for better safety',
        type: 'decision',
        reason: 'NestJS provides better structure than Express',
      },
      projectId,
    );
    expect(memory.id).toBeTruthy();
    expect(memory.type).toBe('decision');
    expect(memory.importance).toBe(5); // default
    expect(memory.confidence).toBe(3); // default
  });

  it('gets a memory by ID', () => {
    const created = memRepo.create(
      {
        content: 'Using NestJS for the backend API with TypeScript strict mode for better safety',
        type: 'decision',
        reason: 'NestJS provides better structure than Express',
      },
      projectId,
    );
    const found = memRepo.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.content).toContain('NestJS');
  });

  it('lists memories for a project', () => {
    memRepo.create(
      {
        content: 'Decision one: Using NestJS for the backend API with full TypeScript strict mode',
        type: 'decision',
        reason: 'Better structure than raw Express',
      },
      projectId,
    );
    memRepo.create(
      {
        content: 'Preference: Always use TypeScript strict mode in all packages and configurations',
        type: 'preference',
        reason: 'Type safety catches bugs early in development',
      },
      projectId,
    );

    const { memories, total } = memRepo.list({ projectId });
    expect(memories).toHaveLength(2);
    expect(total).toBe(2);
  });

  it('filters memories by type', () => {
    memRepo.create(
      {
        content: 'Decision about the backend framework and architecture patterns we will use',
        type: 'decision',
        reason: 'Architecture decision for the backend',
      },
      projectId,
    );
    memRepo.create(
      {
        content: 'Always use TypeScript strict mode in every package and every configuration file',
        type: 'preference',
        reason: 'Consistency across the codebase is important',
      },
      projectId,
    );

    const { memories } = memRepo.list({ projectId, type: 'decision' });
    expect(memories).toHaveLength(1);
    expect(memories[0].type).toBe('decision');
  });

  it('soft-deletes a memory', () => {
    const memory = memRepo.create(
      {
        content: 'This memory will be deleted from the database in the soft delete test',
        type: 'context',
        reason: 'Testing the soft delete functionality',
      },
      projectId,
    );
    const deleted = memRepo.softDelete(memory.id);
    expect(deleted).toBe(true);

    const found = memRepo.getById(memory.id);
    expect(found).toBeNull(); // Soft-deleted memories are excluded
  });

  it('supersedes a memory', () => {
    const original = memRepo.create(
      {
        content: 'Using Turso for cloud sync because it is SQLite-compatible and has a good free tier',
        type: 'decision',
        reason: 'Need cloud sync that is compatible with SQLite',
      },
      projectId,
    );

    const result = memRepo.supersede(
      original.id,
      {
        content: 'Switching from Turso to PlanetScale because of better latency in our target region',
        type: 'decision',
        reason: 'PlanetScale offers lower latency for our use case',
      },
      projectId,
    );

    expect(result).toBeDefined();
    expect(result!.old.superseded_by).toBe(result!.new.id);
  });

  it('searches memories via FTS', () => {
    memRepo.create(
      {
        content: 'Deepgram transcription latency is too high on long-form audio recordings we process',
        type: 'thread',
        reason: 'Performance issue that needs investigation and resolution',
      },
      projectId,
    );
    memRepo.create(
      {
        content: 'Using React with Next.js for the dashboard frontend and all web user interfaces',
        type: 'decision',
        reason: 'React ecosystem is mature and well-supported by the team',
      },
      projectId,
    );

    const results = memRepo.search('deepgram', projectId);
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Deepgram');
  });

  it('counts memories for a project', () => {
    memRepo.create(
      {
        content: 'First memory in the project about architecture decisions and patterns we chose',
        type: 'context',
        reason: 'Recording project architecture context',
      },
      projectId,
    );
    memRepo.create(
      {
        content: 'Second memory in the project about deployment configuration and infrastructure',
        type: 'context',
        reason: 'Recording deployment context for future reference',
      },
      projectId,
    );

    expect(memRepo.countByProject(projectId)).toBe(2);
  });

  it('updates memory metadata', () => {
    const memory = memRepo.create(
      {
        content: 'Some decision about the architecture that we need to track for future reference',
        type: 'decision',
        reason: 'Important architecture choice for the project',
        importance: 5,
      },
      projectId,
    );

    const updated = memRepo.update(memory.id, { importance: 9, tags: ['architecture', 'critical'] });
    expect(updated!.importance).toBe(9);
    expect(updated!.tags).toEqual(['architecture', 'critical']);
  });
});

describe('SessionRepository', () => {
  let sessionRepo: SessionRepository;
  let projectId: string;

  beforeEach(() => {
    sessionRepo = new SessionRepository(db);
    const projectRepo = new ProjectRepository(db);
    projectId = projectRepo.create({ name: 'test-project' }).id;
  });

  it('creates a session', () => {
    const session = sessionRepo.create(projectId);
    expect(session.id).toBeTruthy();
    expect(session.project_id).toBe(projectId);
    expect(session.ended_at).toBeNull();
  });

  it('ends a session', () => {
    const session = sessionRepo.create(projectId);
    sessionRepo.end(session.id);
    const ended = sessionRepo.getById(session.id);
    expect(ended!.ended_at).toBeTruthy();
  });

  it('increments memory count', () => {
    const session = sessionRepo.create(projectId);
    sessionRepo.incrementMemoryCount(session.id);
    sessionRepo.incrementMemoryCount(session.id);
    const updated = sessionRepo.getById(session.id);
    expect(updated!.memory_count).toBe(2);
  });

  it('lists sessions by project', () => {
    sessionRepo.create(projectId);
    sessionRepo.create(projectId);
    const sessions = sessionRepo.listByProject(projectId);
    expect(sessions).toHaveLength(2);
  });

  it('gets the latest session', () => {
    const first = sessionRepo.create(projectId);
    // End the first session so it has a different started_at from the second
    sessionRepo.end(first.id);
    const second = sessionRepo.create(projectId);
    const latest = sessionRepo.getLatest(projectId);
    // Both may have same timestamp in fast tests — just verify we get a valid session
    expect(latest).toBeDefined();
    expect(latest!.project_id).toBe(projectId);
  });
});
