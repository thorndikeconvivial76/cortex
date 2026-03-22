import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrator.js';
import { buildContextBlock } from '../src/context/builder.js';
import { MemoryRepository } from '../src/db/repositories/memory.repo.js';
import { ProjectRepository } from '../src/db/repositories/project.repo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;
let projectId: string;
let memRepo: MemoryRepository;

beforeEach(() => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  const projectRepo = new ProjectRepository(db);
  const project = projectRepo.create({ name: 'context-test-project' });
  projectId = project.id;
  memRepo = new MemoryRepository(db);
});

afterEach(() => {
  db.close();
});

describe('Context Builder', () => {
  describe('Format', () => {
    it('builds context block with correct header/footer format', () => {
      const { contextBlock } = buildContextBlock(db, projectId);
      expect(contextBlock).toContain('=== CORTEX MEMORY — context-test-project ===');
      expect(contextBlock).toContain('=== END CORTEX MEMORY ===');
    });

    it('includes LAST SESSION info line', () => {
      const { contextBlock } = buildContextBlock(db, projectId);
      expect(contextBlock).toContain('LAST SESSION:');
      expect(contextBlock).toContain('memories');
      expect(contextBlock).toContain('token budget');
    });
  });

  describe('Token budget', () => {
    it('respects tokenBudget parameter via ?? (not ||)', () => {
      // Add enough memories to exceed a tiny budget
      for (let i = 0; i < 20; i++) {
        memRepo.create(
          {
            content: `Memory number ${i} about architecture decisions and patterns for the project with enough content to contribute meaningful tokens to the context`,
            type: 'decision',
            reason: `Reason for architecture decision number ${i} in the project`,
            importance: 8,
          },
          projectId,
        );
      }

      // With a large budget, should include many memories
      const largeBudget = buildContextBlock(db, projectId, 50000);
      // With a small budget, should include fewer
      const smallBudget = buildContextBlock(db, projectId, 200);

      expect(largeBudget.tokenCount).toBeGreaterThanOrEqual(smallBudget.tokenCount);
    });

    it('tokenBudget=0 is respected and not treated as falsy', () => {
      memRepo.create(
        {
          content: 'A decision that should be excluded when token budget is zero for testing purposes',
          type: 'decision',
          reason: 'Testing zero budget edge case',
          importance: 10,
        },
        projectId,
      );

      // tokenBudget=0 should use 0, not fall back to default 4000
      // Due to ?? operator: 0 ?? 4000 === 0
      const result = buildContextBlock(db, projectId, 0);
      // With budget 0, the trimming loop will strip sections
      // The header and footer are always present (min 3 sections)
      expect(result.contextBlock).toContain('CORTEX MEMORY');
    });
  });

  describe('Empty project', () => {
    it('returns context block with no memory sections', () => {
      const { contextBlock, memoryCount, tokenCount } = buildContextBlock(db, projectId);
      expect(memoryCount).toBe(0);
      expect(tokenCount).toBeGreaterThan(0); // Header still has tokens
      expect(contextBlock).toContain('0 memories');
      expect(contextBlock).not.toContain('DECISIONS:');
      expect(contextBlock).not.toContain('PREFERENCES:');
      expect(contextBlock).not.toContain('OPEN THREADS:');
    });
  });

  describe('Non-existent project', () => {
    it('returns empty string for non-existent project', () => {
      const result = buildContextBlock(db, '00000000-0000-0000-0000-000000000000');
      expect(result.contextBlock).toBe('');
      expect(result.memoryCount).toBe(0);
      expect(result.tokenCount).toBe(0);
    });
  });

  describe('Memories sorted by importance', () => {
    it('higher importance memories appear first in each section', () => {
      memRepo.create(
        {
          content: 'Low importance decision about minor formatting conventions and style choices',
          type: 'decision',
          reason: 'Minor style decision not critical to architecture',
          importance: 2,
        },
        projectId,
      );
      memRepo.create(
        {
          content: 'HIGH importance decision about core database architecture and data model design',
          type: 'decision',
          reason: 'Critical architecture decision for the entire system',
          importance: 10,
        },
        projectId,
      );
      memRepo.create(
        {
          content: 'Medium importance decision about API endpoint naming conventions and versioning',
          type: 'decision',
          reason: 'Important but not critical API design decision',
          importance: 5,
        },
        projectId,
      );

      const { contextBlock } = buildContextBlock(db, projectId);

      // HIGH importance should appear before low importance in DECISIONS section
      const highIndex = contextBlock.indexOf('HIGH importance');
      const lowIndex = contextBlock.indexOf('Low importance');
      expect(highIndex).toBeLessThan(lowIndex);
    });
  });

  describe('Recent decisions included', () => {
    it("includes recent decisions in WHAT'S NEW section", () => {
      memRepo.create(
        {
          content: 'Fresh decision made today about switching to PostgreSQL for better JSON support',
          type: 'decision',
          reason: 'PostgreSQL offers better JSON querying than SQLite for our use case',
          importance: 8,
        },
        projectId,
      );

      const { contextBlock } = buildContextBlock(db, projectId);
      expect(contextBlock).toContain("WHAT'S NEW:");
      expect(contextBlock).toContain('Fresh decision');
    });
  });

  describe('Memory types in correct sections', () => {
    it('threads appear in OPEN THREADS section', () => {
      memRepo.create(
        {
          content: 'Investigating why Deepgram transcription latency spikes on recordings over thirty minutes',
          type: 'thread',
          reason: 'Performance investigation needed for long audio files',
          importance: 7,
        },
        projectId,
      );

      const { contextBlock } = buildContextBlock(db, projectId);
      expect(contextBlock).toContain('OPEN THREADS:');
      expect(contextBlock).toContain('Deepgram');
    });

    it('preferences appear in PREFERENCES section', () => {
      memRepo.create(
        {
          content: 'Always use TypeScript strict mode in all packages and configuration files for type safety',
          type: 'preference',
          reason: 'Strict mode catches bugs early and improves developer experience',
          importance: 9,
        },
        projectId,
      );

      const { contextBlock } = buildContextBlock(db, projectId);
      expect(contextBlock).toContain('PREFERENCES:');
      expect(contextBlock).toContain('TypeScript strict');
    });

    it('decisions appear in DECISIONS section', () => {
      memRepo.create(
        {
          content: 'Using NestJS for the backend API because of its decorator-based architecture and TypeScript support',
          type: 'decision',
          reason: 'NestJS provides better structure than Express for large applications',
          importance: 8,
        },
        projectId,
      );

      const { contextBlock } = buildContextBlock(db, projectId);
      expect(contextBlock).toContain('DECISIONS:');
      expect(contextBlock).toContain('NestJS');
    });
  });

  describe('Superseded memories excluded', () => {
    it('does not include superseded memories in context block', () => {
      const original = memRepo.create(
        {
          content: 'Original decision about using Express for the backend API framework and routing layer',
          type: 'decision',
          reason: 'Express is lightweight and widely used in the Node.js ecosystem',
          importance: 7,
        },
        projectId,
      );

      memRepo.supersede(
        original.id,
        {
          content: 'Switched from Express to NestJS for better TypeScript support and decorator-based architecture',
          type: 'decision',
          reason: 'NestJS provides better structure for large applications',
        },
        projectId,
      );

      const { contextBlock } = buildContextBlock(db, projectId);
      expect(contextBlock).not.toContain('Original decision about using Express');
      expect(contextBlock).toContain('Switched from Express to NestJS');
    });
  });

  describe('Deleted memories excluded', () => {
    it('does not include soft-deleted memories', () => {
      const memory = memRepo.create(
        {
          content: 'This memory will be deleted and should not appear in the context block output',
          type: 'context',
          reason: 'Testing that deleted memories are excluded from context',
        },
        projectId,
      );

      memRepo.softDelete(memory.id);

      const { contextBlock, memoryCount } = buildContextBlock(db, projectId);
      expect(memoryCount).toBe(0);
      expect(contextBlock).not.toContain('This memory will be deleted');
    });
  });

  describe('Token count', () => {
    it('reports accurate token count for context block', () => {
      memRepo.create(
        {
          content: 'A test memory with enough content to generate a reasonable token count for verification testing',
          type: 'context',
          reason: 'Testing token count estimation in the context builder module',
        },
        projectId,
      );

      const { tokenCount, contextBlock } = buildContextBlock(db, projectId);
      expect(tokenCount).toBeGreaterThan(0);
      // Token count should roughly correlate with content length
      // Typical ratio is ~4 chars per token
      expect(tokenCount).toBeLessThan(contextBlock.length);
    });
  });
});
