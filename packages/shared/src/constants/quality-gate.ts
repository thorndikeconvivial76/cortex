/**
 * Quality Gate constants — all 7 rules that every save_memory call must pass.
 */

// ── Length limits ──
export const MIN_CONTENT_LENGTH = 50;
export const MAX_CONTENT_LENGTH = 2000;
export const MIN_REASON_LENGTH = 10;

// ── Duplicate detection ──
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;

// ── Quality score ──
export const MIN_QUALITY_SCORE = 3;

// ── Retry limits ──
export const MAX_RETRIES: Record<string, number> = {
  QUALITY_GATE_FAILED: 3,
  SENSITIVE_DATA_DETECTED: 2,
  DUPLICATE_DETECTED: 0,
  CONTENT_TOO_SHORT: 3,
  CONTENT_TOO_LONG: 2,
  INVALID_TYPE: 2,
  RATE_LIMIT_EXCEEDED: 0,
};

// ── Banned phrases (50) ──
// These are generic, low-value phrases that Claude tends to save.
// They indicate the memory is about the process, not about a real decision.
export const BANNED_PHRASES: string[] = [
  'user asked me to',
  'the user wants',
  'i will now',
  'let me help you',
  'as requested',
  'per your request',
  'as you mentioned',
  'you asked me to',
  'i can help with that',
  'sure, i can do that',
  'happy to help',
  'i understand you want',
  'i will proceed',
  'going forward',
  'moving forward',
  'in this session',
  'during this conversation',
  'as discussed',
  'as we discussed',
  'i have completed',
  'i have finished',
  'task completed',
  'done with the task',
  'here is what i did',
  'i made the change',
  'i updated the file',
  'i created the file',
  'i deleted the file',
  'i ran the command',
  'i executed',
  'i installed',
  'i configured',
  'the code works',
  'the test passes',
  'the build succeeded',
  'no errors found',
  'everything looks good',
  'all good',
  'looks correct',
  'seems fine',
  'working as expected',
  'this should work',
  'let me know if',
  'feel free to',
  'is there anything else',
  'need any other help',
  'anything else you need',
  'hope this helps',
  'glad i could help',
  'have a great day',
];

// ── Sensitive data patterns (8 + user-extensible) ──
export const SENSITIVE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: 'GitHub Token',
    pattern: /gh[ps]_[A-Za-z0-9]{36}/,
  },
  {
    name: 'OpenAI/Anthropic Key',
    pattern: /sk-[A-Za-z0-9]{48}/,
  },
  {
    name: 'Stripe Key',
    pattern: /[rs]k_(live|test)_[A-Za-z0-9]{24}/,
  },
  {
    name: 'Generic Secret',
    pattern: /(password|secret|token|api_key)\s*[=:]\s*\S{8,}/i,
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/,
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: 'Credit Card',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
  },
];
