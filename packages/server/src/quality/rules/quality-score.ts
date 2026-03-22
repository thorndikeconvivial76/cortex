import { MIN_QUALITY_SCORE, MEMORY_TYPES } from '@cortex/shared';
import type { QualityRuleResult } from '../gate.js';

/**
 * Rule 6: Composite quality score must be >= 3.
 * Scores based on content specificity, length adequacy, and type appropriateness.
 */
export function checkQualityScore(
  content: string,
  type: string,
  reason: string,
): QualityRuleResult {
  let score = 0;

  // Length score (0-3): longer content tends to be more specific
  const len = content.length;
  if (len >= 200) score += 3;
  else if (len >= 100) score += 2;
  else if (len >= 50) score += 1;

  // Specificity score (0-3): presence of technical terms, numbers, names
  const hasNumbers = /\d/.test(content);
  const hasTechnicalTerms = /(?:api|database|server|client|function|class|module|component|endpoint|schema|query|index|cache|config)/i.test(content);
  const hasProperNouns = /[A-Z][a-z]{2,}/.test(content);
  if (hasNumbers) score += 1;
  if (hasTechnicalTerms) score += 1;
  if (hasProperNouns) score += 1;

  // Type validity score (0-2)
  if ((MEMORY_TYPES as readonly string[]).includes(type)) score += 1;
  // Reason quality
  if (reason.length >= 20) score += 1;

  // Normalize to 1-5 scale
  const normalizedScore = Math.min(5, Math.max(1, Math.round(score / 2)));

  if (normalizedScore < MIN_QUALITY_SCORE) {
    return {
      passed: false,
      code: 'QUALITY_GATE_FAILED',
      message: `Quality score ${normalizedScore}/5 is below minimum ${MIN_QUALITY_SCORE}. Add more specific details — names, versions, rationale.`,
      details: { score: normalizedScore, min_required: MIN_QUALITY_SCORE },
    };
  }

  return { passed: true, details: { score: normalizedScore } };
}
