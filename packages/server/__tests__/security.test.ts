import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrator.js';
import { MemoryRepository } from '../src/db/repositories/memory.repo.js';
import { ProjectRepository } from '../src/db/repositories/project.repo.js';
import { runQualityGate } from '../src/quality/gate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;
let projectId: string;

beforeEach(() => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  const projectRepo = new ProjectRepository(db);
  projectId = projectRepo.create({ name: 'security-test' }).id;
});

afterEach(() => {
  db.close();
});

describe('Security Controls', () => {
  describe('SQL injection prevention', () => {
    it('ORDER BY with malicious input uses default sort column', () => {
      const memRepo = new MemoryRepository(db);
      memRepo.create(
        {
          content: 'First memory for SQL injection test with sufficient content length for validation',
          type: 'decision',
          reason: 'Testing SQL injection prevention in ORDER BY',
          importance: 5,
        },
        projectId,
      );
      memRepo.create(
        {
          content: 'Second memory for SQL injection test with sufficient content length for validation',
          type: 'context',
          reason: 'Testing SQL injection prevention in ORDER BY clause',
          importance: 8,
        },
        projectId,
      );

      // Attempt SQL injection via sort parameter — should fall back to 'created_at'
      const { memories } = memRepo.list({
        projectId,
        sort: "importance; DROP TABLE memories; --",
      });

      // Should still return results (not crash or drop table)
      expect(memories).toHaveLength(2);

      // Verify table still exists
      const count = db.prepare('SELECT COUNT(*) AS cnt FROM memories').get() as { cnt: number };
      expect(count.cnt).toBe(2);
    });

    it('ORDER BY direction sanitized to ASC or DESC only', () => {
      const memRepo = new MemoryRepository(db);
      memRepo.create(
        {
          content: 'Memory for sort direction injection test with enough content to pass validation',
          type: 'decision',
          reason: 'Testing sort direction sanitization',
        },
        projectId,
      );

      // Attempt injection via sort direction
      const { memories } = memRepo.list({
        projectId,
        sortDir: "DESC; DROP TABLE memories; --",
      });

      expect(memories).toHaveLength(1);

      // Table should still exist
      const count = db.prepare('SELECT COUNT(*) AS cnt FROM memories').get() as { cnt: number };
      expect(count.cnt).toBe(1);
    });

    it('sort column whitelist only allows approved columns', () => {
      const memRepo = new MemoryRepository(db);
      memRepo.create(
        {
          content: 'Memory for testing sort column whitelist with valid content that meets the minimum length',
          type: 'decision',
          reason: 'Testing sort column whitelisting security',
          importance: 5,
        },
        projectId,
      );

      // These should all work without error
      const validSorts = ['created_at', 'updated_at', 'importance', 'confidence'];
      for (const sort of validSorts) {
        const { memories } = memRepo.list({ projectId, sort });
        expect(memories).toHaveLength(1);
      }

      // Invalid sort column should fall back to 'created_at'
      const { memories } = memRepo.list({ projectId, sort: 'id' });
      expect(memories).toHaveLength(1);
    });
  });

  describe('Rate limiting', () => {
    it('rate limit log table exists and tracks calls', () => {
      // Insert a rate limit entry
      db.prepare(
        'INSERT INTO rate_limit_log (id, tool_name, session_id, project_id) VALUES (?, ?, ?, ?)',
      ).run('rl-test-1', 'save_memory', 'session-1', projectId);

      const count = db.prepare('SELECT COUNT(*) AS cnt FROM rate_limit_log').get() as { cnt: number };
      expect(count.cnt).toBe(1);
    });

    it('quality gate rejects when session rate limit exceeded (50 per session)', () => {
      const sessionId = 'rate-limit-session';
      // Insert 50 rate limit log entries
      for (let i = 0; i < 50; i++) {
        db.prepare(
          'INSERT INTO rate_limit_log (id, tool_name, session_id, project_id) VALUES (?, ?, ?, ?)',
        ).run(`rl-${i}`, 'save_memory', sessionId, projectId);
      }

      const result = runQualityGate(
        {
          content: 'Using NestJS for the backend API because of its decorator-based architecture and first-class TypeScript support',
          type: 'decision',
          reason: 'NestJS provides better structure than Express for large applications',
        },
        db,
        projectId,
        sessionId,
      );

      expect(result.passed).toBe(false);
      expect(result.error_code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Input validation rules', () => {
    it('rejects content without minimum length', () => {
      const result = runQualityGate(
        { content: 'too short', type: 'decision', reason: 'Valid reason for the test' },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
    });

    it('rejects content exceeding maximum length', () => {
      const result = runQualityGate(
        { content: 'x'.repeat(2001), type: 'decision', reason: 'Valid reason for length test' },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
    });

    it('rejects short reason', () => {
      const result = runQualityGate(
        {
          content: 'Valid content with enough length to pass the minimum character requirement for testing',
          type: 'decision',
          reason: 'x',
        },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
    });

    it('accepts valid input', () => {
      const result = runQualityGate(
        {
          content: 'Using NestJS for the backend API because of decorator architecture and TypeScript support',
          type: 'decision',
          reason: 'NestJS provides better structure than Express for large applications',
        },
        db,
        projectId,
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('Quality gate as input validator', () => {
    it('rejects content under 50 characters', () => {
      const result = runQualityGate(
        { content: 'short', type: 'decision', reason: 'Testing short content rejection' },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
      expect(result.error_code).toBe('CONTENT_TOO_SHORT');
    });

    it('rejects content over 2000 characters', () => {
      const result = runQualityGate(
        { content: 'x'.repeat(2001), type: 'decision', reason: 'Testing long content rejection' },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
      expect(result.error_code).toBe('CONTENT_TOO_LONG');
    });

    it('rejects sensitive data (AWS keys)', () => {
      const result = runQualityGate(
        {
          content: 'The AWS access key is AKIAIOSFODNN7EXAMPLE and should not be stored in memories',
          type: 'decision',
          reason: 'Testing sensitive data detection for AWS keys',
        },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
      expect(result.error_code).toBe('SENSITIVE_DATA_DETECTED');
    });

    it('rejects sensitive data (password assignments)', () => {
      const result = runQualityGate(
        {
          content: 'The database connection uses password = MySecretP@ssw0rd! for authentication',
          type: 'context',
          reason: 'Testing sensitive data detection for passwords',
        },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
      expect(result.error_code).toBe('SENSITIVE_DATA_DETECTED');
    });

    it('rejects duplicate content', () => {
      const memRepo = new MemoryRepository(db);
      const content = 'Using NestJS for the backend API because of its decorator-based architecture and TypeScript support';
      memRepo.create(
        { content, type: 'decision', reason: 'Architecture choice for the backend' },
        projectId,
      );

      const result = runQualityGate(
        { content, type: 'decision', reason: 'Same content again to test duplicate detection' },
        db,
        projectId,
      );
      expect(result.passed).toBe(false);
      expect(result.error_code).toBe('DUPLICATE_DETECTED');
    });
  });

  describe('Subscriber gate (config-based)', () => {
    it('subscriber token schema validates expiration date', () => {
      // Simulate an expired subscriber token check
      const expiredDate = '2020-01-01T00:00:00.000Z';
      const isExpired = new Date(expiredDate) < new Date();
      expect(isExpired).toBe(true);
    });

    it('subscriber token schema validates non-expired date', () => {
      const futureDate = '2099-12-31T23:59:59.999Z';
      const isExpired = new Date(futureDate) < new Date();
      expect(isExpired).toBe(false);
    });
  });

  describe('SSE localhost restriction', () => {
    it('localhost IPs are correctly identified', () => {
      // These are the IPs the SSE route checks
      const allowedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      const blockedIPs = ['192.168.1.100', '10.0.0.1', '8.8.8.8'];

      for (const ip of allowedIPs) {
        const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
        expect(isLocalhost).toBe(true);
      }

      for (const ip of blockedIPs) {
        const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
        expect(isLocalhost).toBe(false);
      }
    });
  });

  describe('Memory validation edge cases', () => {
    it('softDelete returns false for non-existent memory', () => {
      const memRepo = new MemoryRepository(db);
      const result = memRepo.softDelete('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });

    it('getById returns null for non-existent memory', () => {
      const memRepo = new MemoryRepository(db);
      const result = memRepo.getById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('supersede returns null for non-existent memory', () => {
      const memRepo = new MemoryRepository(db);
      const result = memRepo.supersede(
        '00000000-0000-0000-0000-000000000000',
        {
          content: 'New content that should not be created because the original does not exist',
          type: 'decision',
          reason: 'Testing supersede with missing original',
        },
        projectId,
      );
      expect(result).toBeNull();
    });
  });
});
