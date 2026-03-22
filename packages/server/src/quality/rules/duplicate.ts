import { findMaxSimilarity, DUPLICATE_SIMILARITY_THRESHOLD } from '@cortex/shared';
import type { QualityRuleResult } from '../gate.js';

/**
 * Rule 3: No duplicate — content must be less than 85% similar to existing memories.
 */
export function checkDuplicate(
  content: string,
  existingContents: string[],
): QualityRuleResult {
  if (existingContents.length === 0) {
    return { passed: true };
  }

  const { score, most_similar_index } = findMaxSimilarity(content, existingContents);

  if (score >= DUPLICATE_SIMILARITY_THRESHOLD) {
    return {
      passed: false,
      code: 'DUPLICATE_DETECTED',
      message: `Content is ${Math.round(score * 100)}% similar to an existing memory. Use supersede_memory instead of saving a duplicate.`,
      details: {
        similarity_score: score,
        similar_index: most_similar_index,
      },
    };
  }

  return { passed: true };
}
