import { SENSITIVE_PATTERNS } from '../constants/quality-gate.js';

/**
 * Result from scanning content for sensitive data.
 */
export interface ScanResult {
  is_clean: boolean;
  matches: ScanMatch[];
}

export interface ScanMatch {
  pattern_name: string;
  matched_text: string;
  start_index: number;
  end_index: number;
}

/**
 * Scan content for sensitive data patterns.
 * Uses the 8 built-in patterns + any user-defined patterns from config.
 *
 * @param content - Text to scan
 * @param extraPatterns - Additional regex patterns from user config (strings)
 * @returns Scan result with matches
 */
export function scanForSensitiveData(
  content: string,
  extraPatterns: string[] = [],
): ScanResult {
  const matches: ScanMatch[] = [];

  // Check built-in patterns
  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g'));
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      matches.push({
        pattern_name: name,
        matched_text: match[0],
        start_index: match.index,
        end_index: match.index + match[0].length,
      });
    }
  }

  // Check user-defined patterns
  for (const patternStr of extraPatterns) {
    try {
      const regex = new RegExp(patternStr, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        matches.push({
          pattern_name: `User pattern: ${patternStr}`,
          matched_text: match[0],
          start_index: match.index,
          end_index: match.index + match[0].length,
        });
      }
    } catch {
      // Invalid user regex — skip silently
    }
  }

  return {
    is_clean: matches.length === 0,
    matches,
  };
}

/**
 * Redact sensitive data in content, replacing matched values with [REDACTED].
 * Used for transcript result_summary before writing to JSONL.
 */
export function redactSensitiveData(content: string, extraPatterns: string[] = []): string {
  let redacted = content;

  // Apply built-in patterns
  for (const { pattern } of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')), '[REDACTED]');
  }

  // Apply user-defined patterns
  for (const patternStr of extraPatterns) {
    try {
      redacted = redacted.replace(new RegExp(patternStr, 'g'), '[REDACTED]');
    } catch {
      // Invalid regex — skip
    }
  }

  return redacted;
}
