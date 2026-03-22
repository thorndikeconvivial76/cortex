import type { MemoryType } from './memory.js';

/**
 * All SSE event types emitted by the Cortex daemon.
 * Formal contract — server and all consumers (Dashboard, Electron, VS Code, Desktop)
 * import these types from @cortex/shared.
 */

export interface SSEMemorySaved {
  type: 'memory.saved';
  data: {
    memory_id: string;
    project_id: string;
    memory_type: MemoryType;
    importance: number;
  };
}

export interface SSEMemoryDeleted {
  type: 'memory.deleted';
  data: {
    memory_id: string;
    project_id: string;
  };
}

export interface SSEMemorySuperseded {
  type: 'memory.superseded';
  data: {
    old_memory_id: string;
    new_memory_id: string;
    project_id: string;
  };
}

export interface SSESyncCompleted {
  type: 'sync.completed';
  data: {
    pushed: number;
    pulled: number;
    conflicts: number;
  };
}

export interface SSESyncConflict {
  type: 'sync.conflict';
  data: {
    conflict_id: string;
    memory_id: string;
    project_id: string;
  };
}

export interface SSESummaryReady {
  type: 'summary.ready';
  data: {
    session_id: string;
    candidate_count: number;
    pending_summary_id: string;
  };
}

export interface SSESessionEnded {
  type: 'session.ended';
  data: {
    session_id: string;
    project_id: string;
    project_name: string;
  };
}

export interface SSEDaemonHealth {
  type: 'daemon.health';
  data: {
    status: 'ok' | 'degraded';
    db_size_mb: number;
    memory_count: number;
    uptime_s: number;
  };
}

export interface SSERateLimitWarning {
  type: 'rate_limit.warning';
  data: {
    tool_name: string;
    current: number;
    limit: number;
    project_id: string;
  };
}

export interface SSEReviewReminder {
  type: 'review.reminder';
  data: {
    pending_count: number;
    oldest_age_days: number;
  };
}

export interface SSESyncError {
  type: 'sync.error';
  data: { code: string; message: string };
}

export interface SSEDaemonError {
  type: 'daemon.error';
  data: { code: string; message: string };
}

/**
 * Union of all SSE events.
 */
export type SSEEvent =
  | SSEMemorySaved
  | SSEMemoryDeleted
  | SSEMemorySuperseded
  | SSESyncCompleted
  | SSESyncConflict
  | SSESummaryReady
  | SSESessionEnded
  | SSEDaemonHealth
  | SSERateLimitWarning
  | SSEReviewReminder
  | SSESyncError
  | SSEDaemonError;

/**
 * SSE event type strings.
 */
export const SSE_EVENT_TYPES = [
  'memory.saved',
  'memory.deleted',
  'memory.superseded',
  'sync.completed',
  'sync.conflict',
  'sync.error',
  'summary.ready',
  'session.ended',
  'daemon.health',
  'daemon.error',
  'rate_limit.warning',
  'review.reminder',
] as const;

export type SSEEventType = (typeof SSE_EVENT_TYPES)[number];
