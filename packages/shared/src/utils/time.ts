/**
 * Time utility constants and functions shared across all packages.
 */

// ── Time constants (milliseconds) ──
export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

// ── Token estimation ──
/** Approximate characters per token for rough token budget calculations. */
export const CHARS_PER_TOKEN = 4;

/**
 * Format a date as a human-readable relative age string (e.g., "2d ago", "3h ago").
 *
 * @param date - Date object or ISO string to format. Returns 'never' for null/undefined.
 * @returns Human-readable relative time string
 */
export function formatAge(date: Date | string | null | undefined): string {
  if (!date) return 'never';
  const ms = Date.now() - new Date(date).getTime();
  const days = Math.floor(ms / MS_PER_DAY);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(ms / MS_PER_HOUR);
  if (hours > 0) return `${hours}h ago`;
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * Estimate token count for text using a rough character-based approximation.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated text
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
