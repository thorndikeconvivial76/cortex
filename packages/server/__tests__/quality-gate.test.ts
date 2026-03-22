import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrator.js';
import { ProjectRepository } from '../src/db/repositories/project.repo.js';
import { MemoryRepository } from '../src/db/repositories/memory.repo.js';
import { runQualityGate } from '../src/quality/gate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;
let projectId: string;

beforeEach(() => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  const projectRepo = new ProjectRepository(db);
  projectId = projectRepo.create({ name: 'test-project' }).id;
});

afterEach(() => {
  db.close();
});

const validInput = {
  content: 'Using NestJS for the backend API because of its decorator-based architecture and first-class TypeScript support',
  type: 'decision' as const,
  reason: 'NestJS provides better structure than Express for large applications',
};

describe('Quality Gate', () => {
  it('passes valid input', () => {
    const result = runQualityGate(validInput, db, projectId);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  // ── Length rules ──

  it('rejects content under 50 characters', () => {
    const result = runQualityGate(
      { ...validInput, content: 'Too short' },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('CONTENT_TOO_SHORT');
  });

  it('rejects content over 2000 characters', () => {
    const result = runQualityGate(
      { ...validInput, content: 'x'.repeat(2001) },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('CONTENT_TOO_LONG');
  });

  it('rejects short reason', () => {
    const result = runQualityGate(
      { ...validInput, reason: 'short' },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('QUALITY_GATE_FAILED');
  });

  // ── Banned phrases ──

  it('rejects content with banned phrase "user asked me to"', () => {
    const result = runQualityGate(
      {
        ...validInput,
        content: 'The user asked me to implement authentication using JWT tokens for the API',
      },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('QUALITY_GATE_FAILED');
    expect(result.error_message).toContain('generic phrase');
  });

  it('rejects content with banned phrase "happy to help"', () => {
    const result = runQualityGate(
      {
        ...validInput,
        content: 'I am happy to help with the database migration and schema updates needed',
      },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
  });

  // ── Sensitive data ──

  it('rejects content with AWS key', () => {
    const result = runQualityGate(
      {
        ...validInput,
        content: 'The AWS access key is AKIAIOSFODNN7EXAMPLE and it should be stored in secrets manager',
      },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('SENSITIVE_DATA_DETECTED');
  });

  it('rejects content with password assignment', () => {
    const result = runQualityGate(
      {
        ...validInput,
        content: 'The database connection uses password = MySecretP@ssw0rd! for authentication',
      },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('SENSITIVE_DATA_DETECTED');
  });

  it('passes content mentioning security concepts without actual secrets', () => {
    const result = runQualityGate(
      {
        ...validInput,
        content: 'Store all API keys in AWS Secrets Manager, never in environment variables or code',
      },
      db,
      projectId,
    );
    expect(result.passed).toBe(true);
  });

  // ── Duplicate detection ──

  it('rejects duplicate content', () => {
    // First, save a memory directly
    const memRepo = new MemoryRepository(db);
    memRepo.create(validInput, projectId);

    // Try to save the same content again via quality gate
    const result = runQualityGate(validInput, db, projectId);
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('DUPLICATE_DETECTED');
  });

  it('passes non-duplicate content', () => {
    const memRepo = new MemoryRepository(db);
    memRepo.create(validInput, projectId);

    const result = runQualityGate(
      {
        content: 'Deepgram transcription latency is higher than expected on long-form audio recordings we process daily',
        type: 'thread',
        reason: 'Performance issue discovered during load testing that needs investigation',
      },
      db,
      projectId,
    );
    expect(result.passed).toBe(true);
  });

  // ── Rate limiting ──

  it('rejects when session rate limit exceeded', () => {
    const sessionId = 'test-session-id';
    // Insert 50 rate limit log entries
    for (let i = 0; i < 50; i++) {
      db.prepare(
        'INSERT INTO rate_limit_log (id, tool_name, session_id, project_id) VALUES (?, ?, ?, ?)',
      ).run(`rl-${i}`, 'save_memory', sessionId, projectId);
    }

    const result = runQualityGate(validInput, db, projectId, sessionId);
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('RATE_LIMIT_EXCEEDED');
  });

  // ── Multiple rules ──

  it('returns the first failure only (short-circuit)', () => {
    const result = runQualityGate(
      {
        content: 'short',
        type: 'decision',
        reason: 'x',
      },
      db,
      projectId,
    );
    expect(result.passed).toBe(false);
    expect(result.error_code).toBe('CONTENT_TOO_SHORT');
    expect(result.failures).toHaveLength(1);
  });
});
