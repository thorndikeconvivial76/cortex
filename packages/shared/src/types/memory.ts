/**
 * Memory types — the 6 structured categories of memory Cortex stores.
 */
export const MEMORY_TYPES = [
  'decision',
  'context',
  'preference',
  'thread',
  'error',
  'learning',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

/**
 * Core memory record stored in SQLite.
 */
export interface Memory {
  id: string;
  project_id: string;
  type: MemoryType;
  content: string;
  reason: string;
  tags: string[];
  importance: number; // 1-10
  confidence: number; // 1-5
  superseded_by: string | null;
  expires_at: string | null;
  reviewed_at: string | null;
  session_id: string | null;
  machine_id: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  deleted_at: string | null;
}

/**
 * Input for creating a new memory via MCP or REST API.
 */
export interface CreateMemoryInput {
  content: string;
  type: MemoryType;
  reason: string;
  tags?: string[];
  importance?: number;
  confidence?: number;
  expires_at?: string;
}

/**
 * Input for updating memory metadata (content changes via supersede only).
 */
export interface UpdateMemoryInput {
  type?: MemoryType;
  importance?: number;
  confidence?: number;
  tags?: string[];
  expires_at?: string | null;
}

/**
 * Input for superseding a memory with new content.
 */
export interface SupersedeMemoryInput {
  content: string;
  reason: string;
  tags?: string[];
  importance?: number;
  confidence?: number;
}

/**
 * Memory with computed fields for display.
 */
export interface MemoryWithScore extends Memory {
  score: number; // Computed ranking score
  linked_from_project?: string; // Set when memory is injected via memory_links
}

/**
 * Archived memory — same structure with archive timestamp.
 */
export interface ArchivedMemory extends Memory {
  archived_at: string;
}
