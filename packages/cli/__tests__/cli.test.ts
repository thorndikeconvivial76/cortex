import { describe, it, expect } from 'vitest';
import { APIClient, APIError } from '../src/api-client.js';

describe('APIClient', () => {
  it('creates a client with default port', () => {
    const client = new APIClient();
    expect(client).toBeDefined();
  });

  it('creates a client with custom port', () => {
    const client = new APIClient(8080);
    expect(client).toBeDefined();
  });

  it('reports unhealthy when daemon is not running', async () => {
    const client = new APIClient(19999); // Port nothing listens on
    const healthy = await client.isHealthy();
    expect(healthy).toBe(false);
  });
});

describe('APIError', () => {
  it('creates an error with status and code', () => {
    const err = new APIError(422, 'QUALITY_GATE_FAILED', 'Content too short');
    expect(err.status).toBe(422);
    expect(err.code).toBe('QUALITY_GATE_FAILED');
    expect(err.message).toBe('Content too short');
    expect(err.name).toBe('APIError');
  });
});

describe('Format Utils', () => {
  it('formats memory age', async () => {
    const { formatAge } = await import('../src/format.js');
    expect(formatAge(null)).toBe('never');
    expect(formatAge(new Date().toISOString())).toBe('just now');

    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(formatAge(yesterday)).toBe('1d ago');
  });

  it('formats type badges', async () => {
    const { typeBadge } = await import('../src/format.js');
    const badge = typeBadge('decision');
    expect(badge).toContain('decision');
  });
});
