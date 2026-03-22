/**
 * Standard API response wrapper.
 */
export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

/**
 * Standard error response.
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    fix?: string;
  };
  meta: ApiMeta;
}

/**
 * Response metadata included in every API response.
 */
export interface ApiMeta {
  timestamp: string;
  version: string;
  request_id: string;
}

/**
 * Paginated response with cursor-based navigation.
 */
export interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  total: number;
  meta: ApiMeta;
}

/**
 * Pagination query parameters.
 */
export interface PaginationParams {
  limit?: number; // Default 50, max 200
  cursor?: string; // Opaque cursor from previous response
}

/**
 * Memory list query parameters.
 */
export interface MemoryListParams extends PaginationParams {
  project_id?: string;
  type?: string;
  min_importance?: number;
  sort?: 'created_at' | 'importance' | 'updated_at';
  sort_dir?: 'asc' | 'desc';
  include_archived?: boolean;
}

/**
 * Search query parameters.
 */
export interface SearchParams extends PaginationParams {
  query: string;
  project_id?: string;
  type?: string;
  include_archived?: boolean;
}

/**
 * Search result with match highlighting.
 */
export interface SearchResult {
  memory_id: string;
  project_id: string;
  project_name: string;
  content: string;
  type: string;
  importance: number;
  created_at: string;
  snippet: string; // Highlighted match
  rank: number;
}

/**
 * Health check response.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  db_ok: boolean;
  sync_ok: boolean;
  uptime_s: number;
  memory_count: number;
  db_size_mb: number;
}

/**
 * Analytics overview data.
 */
export interface AnalyticsOverview {
  total_memories: number;
  active_projects_30d: number;
  creation_rate_7d: number;
  type_distribution: Record<string, number>;
  avg_importance: number;
  stale_count: number;
  avg_usefulness_rating: number | null;
  sync_success_rate: number | null;
}

/**
 * Timeline event for chronological view.
 */
export interface TimelineEvent {
  id: string;
  type: 'memory_created' | 'memory_superseded' | 'memory_deleted' | 'session_started' | 'session_ended' | 'sync_completed';
  timestamp: string;
  project_id: string;
  project_name: string;
  description: string;
  memory_id?: string;
  session_id?: string;
}

/**
 * Export response.
 */
export interface ExportResult {
  memories: number;
  projects: number;
  sessions: number;
  file_path: string;
}

/**
 * Import result.
 */
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}
