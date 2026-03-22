import { z } from 'zod';
import { MemoryTypeSchema } from './memory.schema.js';

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().optional(),
});

export const MemoryListParamsSchema = PaginationSchema.extend({
  project_id: z.string().uuid().optional(),
  type: MemoryTypeSchema.optional(),
  min_importance: z.number().int().min(1).max(10).optional(),
  sort: z.enum(['created_at', 'importance', 'updated_at']).optional().default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).optional().default('desc'),
  include_archived: z.boolean().optional().default(false),
});

export const SearchParamsSchema = PaginationSchema.extend({
  query: z.string().min(1).max(500),
  project_id: z.string().uuid().optional(),
  type: MemoryTypeSchema.optional(),
  include_archived: z.boolean().optional().default(false),
});

export const RateMemorySchema = z.object({
  rating: z.number().int().min(1).max(5),
});

export const PinAuthSchema = z.object({
  pin: z.string().min(4).max(32),
});

export const ImportSchema = z.object({
  format: z.enum(['json', 'claude_md']).default('json'),
  project_id: z.string().uuid().optional(),
  merge: z.boolean().optional().default(false),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  path: z.string().optional(),
  git_remote: z.string().optional(),
  tech_stack: z.array(z.string()).default([]),
});

export const SyncSetupSchema = z.object({
  url: z.string().url().startsWith('libsql://'),
  token: z.string().min(10),
});

export const UpdateConfigSchema = z.object({
  sync: z.object({
    enabled: z.boolean(),
    turso_url: z.string().optional(),
  }).optional(),
  summarizer: z.object({
    provider: z.enum(['anthropic', 'openai']).optional(),
    daily_limit: z.number().min(0).max(100).optional(),
  }).optional(),
}).partial();
