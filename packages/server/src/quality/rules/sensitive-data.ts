import { scanForSensitiveData } from '@cortex/shared';
import type { QualityRuleResult } from '../gate.js';

/**
 * Rule 5: No sensitive data — content must not contain API keys, tokens, passwords, etc.
 */
export function checkSensitiveData(
  content: string,
  extraPatterns: string[] = [],
): QualityRuleResult {
  const result = scanForSensitiveData(content, extraPatterns);

  if (!result.is_clean) {
    const patternNames = [...new Set(result.matches.map((m) => m.pattern_name))];
    return {
      passed: false,
      code: 'SENSITIVE_DATA_DETECTED',
      message: `Content contains sensitive data (${patternNames.join(', ')}). Rephrase without the sensitive value — describe the concept, not the credential.`,
      details: {
        patterns_matched: patternNames,
        match_count: result.matches.length,
      },
    };
  }

  return { passed: true };
}
