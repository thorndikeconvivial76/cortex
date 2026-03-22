import { z } from 'zod';
import { DETECTION_METHODS } from '../types/project.js';

export const DetectionMethodSchema = z.enum(DETECTION_METHODS);

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  path: z.string().nullable(),
  git_remote: z.string().nullable(),
  tech_stack: z.array(z.string()),
  context_budget: z.number().int().min(1000).max(12000).default(4000),
  memory_limit: z.number().int().min(50).max(10000).default(500),
  created_at: z.string().datetime(),
  last_session_at: z.string().datetime().nullable(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tech_stack: z.array(z.string()).optional(),
  context_budget: z.number().int().min(1000).max(12000).optional(),
  memory_limit: z.number().int().min(50).max(10000).optional(),
});

export const CortexProjectFileSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  created_at: z.string().datetime(),
});
