import type Database from 'better-sqlite3';
import type { CreateMemoryInput } from '@cortex/shared';
import { checkLength } from './rules/length.js';
import { checkDuplicate } from './rules/duplicate.js';
import { checkBannedPhrases } from './rules/banned-phrases.js';
import { checkSensitiveData } from './rules/sensitive-data.js';
import { checkQualityScore } from './rules/quality-score.js';
import { checkRateLimit } from './rules/rate-limit.js';

/**
 * Result from a single quality gate rule.
 */
export interface QualityRuleResult {
  passed: boolean;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Result from the full quality gate check.
 */
export interface QualityGateResult {
  passed: boolean;
  failures: QualityRuleResult[];
  /** First failure code, for MCP error response */
  error_code?: string;
  /** Human-readable summary of all failures */
  error_message?: string;
}

/**
 * Run all 7 quality gate rules on a memory creation input.
 *
 * Rules run in order:
 * 1. Length check (content 50-2000, reason >= 10)
 * 2. Banned phrases check
 * 3. Sensitive data scan
 * 4. Quality score >= 3
 * 5. Duplicate detection (TF-IDF cosine < 0.85)
 * 6. Rate limit check
 *
 * Stops at first failure and returns the specific error.
 */
export function runQualityGate(
  input: CreateMemoryInput,
  db: Database.Database,
  projectId: string,
  sessionId: string | null = null,
  extraSensitivePatterns: string[] = [],
): QualityGateResult {
  const failures: QualityRuleResult[] = [];

  // Rule 1: Length + reason
  const lengthResult = checkLength(input.content, input.reason);
  if (!lengthResult.passed) {
    return {
      passed: false,
      failures: [lengthResult],
      error_code: lengthResult.code,
      error_message: lengthResult.message,
    };
  }

  // Rule 2: Banned phrases
  const bannedResult = checkBannedPhrases(input.content);
  if (!bannedResult.passed) {
    return {
      passed: false,
      failures: [bannedResult],
      error_code: bannedResult.code,
      error_message: bannedResult.message,
    };
  }

  // Rule 3: Sensitive data
  const sensitiveResult = checkSensitiveData(input.content, extraSensitivePatterns);
  if (!sensitiveResult.passed) {
    return {
      passed: false,
      failures: [sensitiveResult],
      error_code: sensitiveResult.code,
      error_message: sensitiveResult.message,
    };
  }

  // Rule 4: Quality score
  const qualityResult = checkQualityScore(input.content, input.type, input.reason);
  if (!qualityResult.passed) {
    return {
      passed: false,
      failures: [qualityResult],
      error_code: qualityResult.code,
      error_message: qualityResult.message,
    };
  }

  // Rule 5: Duplicate detection
  const existingContents = db
    .prepare(
      'SELECT content FROM memories WHERE project_id = ? AND deleted_at IS NULL AND superseded_by IS NULL',
    )
    .all(projectId) as { content: string }[];
  const existingTexts = existingContents.map((r) => r.content);

  const duplicateResult = checkDuplicate(input.content, existingTexts);
  if (!duplicateResult.passed) {
    return {
      passed: false,
      failures: [duplicateResult],
      error_code: duplicateResult.code,
      error_message: duplicateResult.message,
    };
  }

  // Rule 6: Rate limit
  const rateLimitResult = checkRateLimit(db, 'save_memory', sessionId, projectId);
  if (!rateLimitResult.passed) {
    return {
      passed: false,
      failures: [rateLimitResult],
      error_code: rateLimitResult.code,
      error_message: rateLimitResult.message,
    };
  }

  return { passed: true, failures: [] };
}
