import type { SummarizerConfig } from './session.js';

/**
 * Cortex daemon configuration stored at ~/.cortex/config.json
 */
export interface CortexConfig {
  /** Machine UUID — generated on first init */
  machine_id: string;

  /** Machine display name */
  machine_name: string;

  /** Daemon port — default 7434 */
  port: number;

  /** Summarizer settings */
  summarizer: SummarizerConfig;

  /** Turso sync settings */
  sync: {
    enabled: boolean;
    turso_url: string | null;
    turso_auth_token_encrypted: string | null;
    interval_seconds: number; // Default 30
  };

  /** Subscriber token for sync access */
  subscriber_token: string | null;
  subscriber_validated_at: string | null; // Cached validation, 30-day TTL

  /** Dashboard PIN (bcrypt hash, cost 12) */
  pin_hash: string | null;

  /** Shared machine mode */
  shared_machine: boolean;

  /** Telemetry opt-in */
  telemetry_enabled: boolean;

  /** User-defined sensitive data patterns (regex strings) */
  sensitive_patterns: string[];

  /** Context budget defaults */
  default_context_budget: number; // Default 4000, max 12000

  /** Last nightly cleanup timestamp */
  last_cleanup_at: string | null;

  /** Last completed nightly cleanup task index */
  last_cleanup_task_completed: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: CortexConfig = {
  machine_id: '',
  machine_name: '',
  port: 7434,
  summarizer: {
    enabled: false,
    provider: 'anthropic',
    api_key_encrypted: null,
    auto_trigger: true,
    daily_limit: 10,
  },
  sync: {
    enabled: false,
    turso_url: null,
    turso_auth_token_encrypted: null,
    interval_seconds: 30,
  },
  subscriber_token: null,
  subscriber_validated_at: null,
  pin_hash: null,
  shared_machine: false,
  telemetry_enabled: false,
  sensitive_patterns: [],
  default_context_budget: 4000,
  last_cleanup_at: null,
  last_cleanup_task_completed: -1,
};
