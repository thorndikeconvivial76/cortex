import { z } from 'zod';
import { MEMORY_TYPES } from '../types/memory.js';
import {
  MIN_CONTENT_LENGTH,
  MAX_CONTENT_LENGTH,
  MIN_REASON_LENGTH,
} from '../constants/quality-gate.js';

export const MemoryTypeSchema = z.enum(MEMORY_TYPES);

export const CreateMemorySchema = z.object({
  content: z
    .string()
    .min(MIN_CONTENT_LENGTH, `Content must be at least ${MIN_CONTENT_LENGTH} characters`)
    .max(MAX_CONTENT_LENGTH, `Content must be under ${MAX_CONTENT_LENGTH} characters`),
  type: MemoryTypeSchema,
  reason: z
    .string()
    .min(MIN_REASON_LENGTH, `Reason must be at least ${MIN_REASON_LENGTH} characters`),
  tags: z.array(z.string()).optional().default([]),
  importance: z.number().int().min(1).max(10).optional().default(5),
  confidence: z.number().int().min(1).max(5).optional().default(3),
  expires_at: z.string().datetime().optional(),
});

export const UpdateMemorySchema = z.object({
  type: MemoryTypeSchema.optional(),
  importance: z.number().int().min(1).max(10).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export const SupersedeMemorySchema = z.object({
  content: z
    .string()
    .min(MIN_CONTENT_LENGTH)
    .max(MAX_CONTENT_LENGTH),
  reason: z.string().min(MIN_REASON_LENGTH),
  tags: z.array(z.string()).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
});

export const MemorySchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  type: MemoryTypeSchema,
  content: z.string(),
  reason: z.string(),
  tags: z.array(z.string()),
  importance: z.number().int().min(1).max(10),
  confidence: z.number().int().min(1).max(5),
  superseded_by: z.string().uuid().nullable(),
  expires_at: z.string().datetime().nullable(),
  reviewed_at: z.string().datetime().nullable(),
  session_id: z.string().uuid().nullable(),
  machine_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  synced_at: z.string().datetime().nullable(),
  deleted_at: z.string().datetime().nullable(),
});
