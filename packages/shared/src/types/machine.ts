/**
 * Supported platforms.
 */
export const PLATFORMS = ['darwin', 'linux', 'win32'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Machine record — one per physical/virtual machine.
 */
export interface Machine {
  id: string;
  name: string;
  hostname: string;
  platform: Platform;
  last_turso_pull_at: string | null;
  registered_at: string;
  last_seen_at: string;
}

/**
 * Sync status for a machine.
 */
export type SyncState = 'synced' | 'pending' | 'conflict' | 'disabled' | 'offline';

/**
 * Sync status response.
 */
export interface SyncStatus {
  state: SyncState;
  last_sync_at: string | null;
  pending_count: number;
  conflict_count: number;
  machines: Machine[];
}

/**
 * Conflict record — audit log entry for sync conflicts.
 */
export interface Conflict {
  id: string;
  memory_id: string;
  winning_machine_id: string;
  losing_content: string;
  losing_updated_at: string;
  resolved_at: string;
}
