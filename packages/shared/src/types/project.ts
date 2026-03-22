/**
 * Detection methods used to identify a project.
 */
export const DETECTION_METHODS = [
  'cortex_file',
  'git_remote',
  'folder_path',
  'auto_created',
] as const;

export type DetectionMethod = (typeof DETECTION_METHODS)[number];

/**
 * Project record — one per detected codebase.
 */
export interface Project {
  id: string;
  name: string;
  path: string | null;
  git_remote: string | null;
  tech_stack: string[];
  context_budget: number; // Token limit for injection, default 4000, max 12000
  memory_limit: number; // Max memories before auto-archive, default 500
  created_at: string;
  last_session_at: string | null;
}

/**
 * Result from the 4-layer project detection strategy.
 */
export interface ProjectDetectionResult {
  project_id: string;
  project_name: string;
  detection_method: DetectionMethod;
  path: string;
  git_remote: string | null;
  is_new: boolean; // True if project was auto-created this detection
}

/**
 * Project stats computed from memory data.
 */
export interface ProjectStats {
  total_memories: number;
  type_distribution: Record<string, number>;
  avg_importance: number;
  stale_count: number;
  health_score: number; // 0-100
  last_session_at: string | null;
  session_count_30d: number;
}

/**
 * .cortex/project.json file format.
 */
export interface CortexProjectFile {
  id: string;
  version: string;
  created_at: string;
}
