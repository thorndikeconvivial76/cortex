import { MIN_CONTENT_LENGTH, MAX_CONTENT_LENGTH, MIN_REASON_LENGTH } from '@cortex/shared';
import type { QualityRuleResult } from '../gate.js';

/**
 * Rule 1: Content length must be 50-2000 chars.
 * Rule 2 (bundled): Reason must be non-empty and >= 10 chars.
 */
export function checkLength(content: string, reason: string): QualityRuleResult {
  if (content.length < MIN_CONTENT_LENGTH) {
    return {
      passed: false,
      code: 'CONTENT_TOO_SHORT',
      message: `Content must be at least ${MIN_CONTENT_LENGTH} characters (got ${content.length}). Be more specific.`,
    };
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      passed: false,
      code: 'CONTENT_TOO_LONG',
      message: `Content must be under ${MAX_CONTENT_LENGTH} characters (got ${content.length}). Split into multiple memories.`,
    };
  }

  if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
    return {
      passed: false,
      code: 'QUALITY_GATE_FAILED',
      message: `Reason must be at least ${MIN_REASON_LENGTH} characters. Explain why this memory matters.`,
    };
  }

  return { passed: true };
}
