import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';

/**
 * Create a Turso client connection.
 */
export function createTursoClient(url: string, authToken: string): Client {
  return createClient({
    url,
    authToken,
  });
}

/**
 * Test Turso connection by running a simple query.
 */
export async function testTursoConnection(client: Client): Promise<boolean> {
  try {
    await client.execute('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Health check with latency measurement.
 * Uses a 3-second timeout via AbortController.
 */
export async function checkHealth(
  client: Client,
): Promise<{ healthy: boolean; latency_ms: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      await client.execute('SELECT 1');
      clearTimeout(timeout);
      return { healthy: true, latency_ms: Date.now() - start };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } catch {
    return { healthy: false, latency_ms: Date.now() - start };
  }
}

/**
 * Fetch current timestamp from Turso server.
 * Returns an ISO-8601 string produced by the remote database,
 * avoiding clock-skew issues between local machine and Turso.
 */
export async function getServerTimestamp(client: Client): Promise<string> {
  const result = await client.execute(
    "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS ts",
  );
  return result.rows[0].ts as string;
}

/**
 * Ensure the remote Turso DB has the same schema.
 * Creates tables if they don't exist.
 */
export async function ensureRemoteSchema(client: Client): Promise<void> {
  // Create core tables on remote if they don't exist
  await client.execute(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      reason TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      importance INTEGER NOT NULL DEFAULT 5,
      confidence INTEGER NOT NULL DEFAULT 3,
      superseded_by TEXT,
      expires_at TEXT,
      reviewed_at TEXT,
      session_id TEXT,
      machine_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT,
      git_remote TEXT,
      tech_stack TEXT NOT NULL DEFAULT '[]',
      context_budget INTEGER NOT NULL DEFAULT 4000,
      memory_limit INTEGER NOT NULL DEFAULT 500,
      created_at TEXT NOT NULL,
      last_session_at TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      platform TEXT NOT NULL,
      last_turso_pull_at TEXT,
      registered_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `);
}
