import { describe, it, expect } from 'vitest';
import { scanForSensitiveData, redactSensitiveData } from '../src/utils/sensitive-scanner.js';

describe('Sensitive Data Scanner', () => {
  // ── True Positives ──

  it('detects AWS access keys', () => {
    const result = scanForSensitiveData('My key is AKIAIOSFODNN7EXAMPLE');
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('AWS Access Key');
  });

  it('detects GitHub tokens', () => {
    // ghp_ + exactly 36 alphanumeric chars
    const result = scanForSensitiveData('Found ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345abcd in config');
    expect(result.is_clean).toBe(false);
    const hasGitHubMatch = result.matches.some((m) => m.pattern_name === 'GitHub Token');
    expect(hasGitHubMatch).toBe(true);
  });

  it('detects OpenAI/Anthropic keys', () => {
    const result = scanForSensitiveData(
      'sk-aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVw',
    );
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('OpenAI/Anthropic Key');
  });

  it('detects Stripe keys', () => {
    const testKey = ['sk', 'live', 'ABCDEFGHIJKLMNOPQRSTUVwx'].join('_');
    const result = scanForSensitiveData(testKey);
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('Stripe Key');
  });

  it('detects generic secrets with password=', () => {
    const result = scanForSensitiveData('database password = myS3cretP@ss!');
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('Generic Secret');
  });

  it('detects generic secrets with api_key:', () => {
    const result = scanForSensitiveData('api_key: abcdef123456789');
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('Generic Secret');
  });

  it('detects private keys', () => {
    const result = scanForSensitiveData('-----BEGIN RSA PRIVATE KEY-----');
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('Private Key');
  });

  it('detects JWT tokens', () => {
    const result = scanForSensitiveData(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
    );
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('JWT Token');
  });

  it('detects credit card numbers', () => {
    const result = scanForSensitiveData('Card: 4111 1111 1111 1111');
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toBe('Credit Card');
  });

  it('detects credit card numbers with dashes', () => {
    const result = scanForSensitiveData('Card: 4111-1111-1111-1111');
    expect(result.is_clean).toBe(false);
  });

  // ── True Negatives ──

  it('passes clean content', () => {
    const result = scanForSensitiveData(
      'Using NestJS for the backend API with TypeScript strict mode. Decided to use Turso for cloud sync.',
    );
    expect(result.is_clean).toBe(true);
    expect(result.matches).toHaveLength(0);
  });

  it('passes content with short tokens that are not keys', () => {
    const result = scanForSensitiveData('The API returns a token field in the response body');
    expect(result.is_clean).toBe(true);
  });

  it('passes content mentioning key concepts without actual keys', () => {
    const result = scanForSensitiveData(
      'Store API keys in AWS Secrets Manager, never in environment variables',
    );
    expect(result.is_clean).toBe(true);
  });

  // ── Multiple matches ──

  it('finds multiple sensitive items in one text', () => {
    const result = scanForSensitiveData(
      'AWS key AKIAIOSFODNN7EXAMPLE and password = mysecretpass123',
    );
    expect(result.is_clean).toBe(false);
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  // ── Redaction ──

  it('redacts sensitive data in content', () => {
    const content = 'My AWS key is AKIAIOSFODNN7EXAMPLE and it works';
    const redacted = redactSensitiveData(content);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('preserves non-sensitive text during redaction', () => {
    const content = 'Using NestJS for the backend with clean architecture';
    const redacted = redactSensitiveData(content);
    expect(redacted).toBe(content);
  });

  // ── User-defined patterns ──

  it('checks user-defined patterns', () => {
    const result = scanForSensitiveData('internal-secret-xyz123', ['internal-secret-\\w+']);
    expect(result.is_clean).toBe(false);
    expect(result.matches[0].pattern_name).toContain('User pattern');
  });

  it('handles invalid user-defined regex gracefully', () => {
    const result = scanForSensitiveData('test content', ['[invalid regex']);
    expect(result.is_clean).toBe(true);
  });
});
