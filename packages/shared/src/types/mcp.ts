import type { MemoryType } from './memory.js';

/**
 * MCP tool names exposed by the Cortex MCP server.
 */
export const MCP_TOOL_NAMES = [
  'save_memory',
  'get_memories',
  'search_memories',
  'list_projects',
  'delete_memory',
  'supersede_memory',
  'update_memory',
] as const;

export type MCPToolName = (typeof MCP_TOOL_NAMES)[number];

// ── save_memory ──

export interface SaveMemoryParams {
  content: string;
  type: MemoryType;
  reason: string;
  tags?: string[];
  importance?: number; // Default 5
  confidence?: number; // Default 3
  expires_at?: string;
}

export interface SaveMemoryResult {
  memory_id: string;
  project_id: string;
  type: MemoryType;
  importance: number;
  message: string;
}

// ── get_memories ──

export interface GetMemoriesParams {
  project_id?: string; // Auto-populated from detection
  type?: MemoryType;
  limit?: number; // Default 20
  min_importance?: number;
}

export interface GetMemoriesResult {
  project_name: string;
  project_id: string;
  memory_count: number;
  token_count: number;
  context_block: string; // The formatted injection block
}

// ── search_memories ──

export interface SearchMemoriesParams {
  query: string;
  project_id?: string;
  type?: MemoryType;
  limit?: number; // Default 10
}

export interface SearchMemoriesResult {
  results: Array<{
    id: string;
    type: MemoryType;
    content: string;
    importance: number;
    created_at: string;
    project_name: string;
  }>;
  total: number;
}

// ── list_projects ──

export interface ListProjectsResult {
  projects: Array<{
    id: string;
    name: string;
    memory_count: number;
    last_session_at: string | null;
  }>;
}

// ── delete_memory ──

export interface DeleteMemoryParams {
  memory_id: string;
}

export interface DeleteMemoryResult {
  deleted: boolean;
  message: string;
}

// ── supersede_memory ──

export interface SupersedeMemoryParams {
  memory_id: string;
  content: string;
  reason: string;
  tags?: string[];
  importance?: number;
  confidence?: number;
}

export interface SupersedeMemoryResult {
  old_memory_id: string;
  new_memory_id: string;
  message: string;
}

// ── update_memory ──

export interface UpdateMemoryParams {
  memory_id: string;
  type?: MemoryType;
  importance?: number;
  confidence?: number;
  tags?: string[];
  expires_at?: string | null;
}

export interface UpdateMemoryResult {
  memory_id: string;
  updated_fields: string[];
  message: string;
}
