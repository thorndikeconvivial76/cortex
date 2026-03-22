import { BANNED_PHRASES } from '@cortex/shared';
import type { QualityRuleResult } from '../gate.js';

/**
 * Rule 4: No banned phrases — content must not contain any of the 50 generic phrases.
 */
export function checkBannedPhrases(content: string): QualityRuleResult {
  const lowerContent = content.toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (lowerContent.includes(phrase)) {
      return {
        passed: false,
        code: 'QUALITY_GATE_FAILED',
        message: `Content contains a generic phrase: "${phrase}". Save the actual decision, preference, or context — not a description of what happened in the session.`,
        details: { matched_phrase: phrase },
      };
    }
  }

  return { passed: true };
}
