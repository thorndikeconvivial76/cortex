import { describe, it, expect } from 'vitest';
import { CreateMemorySchema, UpdateMemorySchema, SupersedeMemorySchema } from '../src/schemas/memory.schema.js';
import { ProjectSchema, UpdateProjectSchema } from '../src/schemas/project.schema.js';
import { PaginationSchema, SearchParamsSchema, RateMemorySchema } from '../src/schemas/api.schema.js';

describe('Memory Schemas', () => {
  describe('CreateMemorySchema', () => {
    it('validates a valid memory creation input', () => {
      const input = {
        content: 'Using NestJS for the backend API because of its decorator-based architecture and TypeScript-first approach',
        type: 'decision',
        reason: 'Chose NestJS over Express for better structure',
      };
      const result = CreateMemorySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.importance).toBe(5); // default
        expect(result.data.confidence).toBe(3); // default
        expect(result.data.tags).toEqual([]); // default
      }
    });

    it('rejects content under 50 characters', () => {
      const input = {
        content: 'Too short',
        type: 'decision',
        reason: 'Some reason here for the decision',
      };
      const result = CreateMemorySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects content over 2000 characters', () => {
      const input = {
        content: 'x'.repeat(2001),
        type: 'decision',
        reason: 'Some reason here for the decision',
      };
      const result = CreateMemorySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects reason under 10 characters', () => {
      const input = {
        content: 'Using NestJS for the backend API because of its decorator-based architecture',
        type: 'decision',
        reason: 'short',
      };
      const result = CreateMemorySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid memory type', () => {
      const input = {
        content: 'Using NestJS for the backend API because of its decorator-based architecture',
        type: 'invalid_type',
        reason: 'Some valid reason here',
      };
      const result = CreateMemorySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts all 6 valid memory types', () => {
      const types = ['decision', 'context', 'preference', 'thread', 'error', 'learning'];
      for (const type of types) {
        const input = {
          content: 'Using NestJS for the backend API because of its decorator-based architecture',
          type,
          reason: 'Valid reason for this memory',
        };
        const result = CreateMemorySchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('rejects importance outside 1-10 range', () => {
      const input = {
        content: 'Using NestJS for the backend API because of its decorator-based architecture',
        type: 'decision',
        reason: 'Valid reason for this memory',
        importance: 11,
      };
      const result = CreateMemorySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects confidence outside 1-5 range', () => {
      const input = {
        content: 'Using NestJS for the backend API because of its decorator-based architecture',
        type: 'decision',
        reason: 'Valid reason for this memory',
        confidence: 0,
      };
      const result = CreateMemorySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateMemorySchema', () => {
    it('accepts partial updates', () => {
      const result = UpdateMemorySchema.safeParse({ importance: 8 });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (no changes)', () => {
      const result = UpdateMemorySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts nullable expires_at', () => {
      const result = UpdateMemorySchema.safeParse({ expires_at: null });
      expect(result.success).toBe(true);
    });
  });

  describe('SupersedeMemorySchema', () => {
    it('validates supersede input', () => {
      const input = {
        content: 'Updated decision: switching from Turso to PlanetScale for cloud sync due to better latency',
        reason: 'PlanetScale offers lower latency in our region',
      };
      const result = SupersedeMemorySchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe('Project Schemas', () => {
  it('validates a full project', () => {
    const project = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'karnyx',
      path: '/Users/kd/dev/karnyx',
      git_remote: 'github.com/kd/karnyx',
      tech_stack: ['typescript', 'nestjs', 'tauri'],
      context_budget: 4000,
      memory_limit: 500,
      created_at: '2026-03-01T00:00:00.000Z',
      last_session_at: '2026-03-20T00:00:00.000Z',
    };
    const result = ProjectSchema.safeParse(project);
    expect(result.success).toBe(true);
  });

  it('rejects context_budget over 12000', () => {
    const result = UpdateProjectSchema.safeParse({ context_budget: 15000 });
    expect(result.success).toBe(false);
  });
});

describe('API Schemas', () => {
  it('validates pagination params with defaults', () => {
    const result = PaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit over 200', () => {
    const result = PaginationSchema.safeParse({ limit: 300 });
    expect(result.success).toBe(false);
  });

  it('validates search params', () => {
    const result = SearchParamsSchema.safeParse({ query: 'deepgram latency' });
    expect(result.success).toBe(true);
  });

  it('rejects empty search query', () => {
    const result = SearchParamsSchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('validates memory rating', () => {
    const result = RateMemorySchema.safeParse({ rating: 4 });
    expect(result.success).toBe(true);
  });

  it('rejects rating outside 1-5', () => {
    const result = RateMemorySchema.safeParse({ rating: 6 });
    expect(result.success).toBe(false);
  });
});
