/**
 * Session record — one per Claude Code session.
 */
export interface Session {
  id: string;
  project_id: string;
  machine_id: string | null;
  started_at: string;
  ended_at: string | null; // NULL = active or crashed
  memory_count: number;
  summarized: boolean;
  transcript_path: string | null;
  transcript_deleted_at: string | null;
}

/**
 * Pending summary — deferred summarizer results awaiting user review.
 */
export interface PendingSummary {
  id: string;
  session_id: string;
  candidates: MemoryCandidate[];
  status: 'pending' | 'reviewed' | 'expired' | 'failed';
  created_at: string;
  reviewed_at: string | null;
  expires_at: string;
}

/**
 * A candidate memory extracted by the session summarizer.
 */
export interface MemoryCandidate {
  content: string;
  type: string;
  reason: string;
  tags: string[];
  importance: number;
  confidence: number;
}

/**
 * JSONL event in the session transcript audit log.
 */
export interface TranscriptEvent {
  event_type: 'session_start' | 'session_end' | 'tool_call' | 'memory_injected';
  tool_name: string | null;
  timestamp: string;
  session_id: string;
  project_id: string;
  params: Record<string, unknown> | null;
  result_summary: string | null;
}

/**
 * Summarizer configuration.
 */
export interface SummarizerConfig {
  enabled: boolean;
  provider: 'anthropic' | 'openai';
  api_key_encrypted: string | null;
  auto_trigger: boolean;
  daily_limit: number; // Default 10, max 50
}
