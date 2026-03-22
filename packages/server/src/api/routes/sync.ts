import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { createClient } from '@libsql/client';
import { v4 as uuid } from 'uuid';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes, createHash, hkdfSync } from 'node:crypto';
import { z } from 'zod';
import { SyncWorker } from '../../sync/sync-worker.js';
import type { SSEEmitter } from '../sse/emitter.js';

/** Zod schema for POST /api/sync/setup body. */
const SyncSetupSchema = z.object({
  url: z.string().url(),
  token: z.string().min(10),
});

const CONFIG_DIR = join(homedir(), '.cortex');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

// ── Encryption helpers (AES-256-GCM, machine-derived key) ──────────────────

function deriveKey(): Buffer {
  const machineId = `${homedir()}:${hostname()}`;
  return Buffer.from(
    hkdfSync('sha256', machineId, 'cortex-config-v1', '', 32),
  );
}

function encryptToken(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(encoded: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, ciphertextHex] = encoded.split(':');
  if (!ivHex || !tagHex || !ciphertextHex) {
    throw new Error('Invalid encrypted token format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

interface SubscriberToken {
  email_hash: string;
  verified_at: string;
  expires_at: string;
}

interface SyncConfig {
  sync?: {
    turso_url: string;
    turso_token?: string;
    turso_token_encrypted?: string;
    enabled: boolean;
  };
  subscriber?: SubscriberToken;
}

function readConfig(): SyncConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // Corrupted config — treat as unconfigured
  }
  return {};
}

function writeConfig(config: SyncConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/** Read the Turso auth token, decrypting if stored encrypted. Migrates legacy plaintext on read. */
function readTursoToken(config: SyncConfig): string | null {
  if (!config.sync) return null;

  // Prefer encrypted token
  if (config.sync.turso_token_encrypted) {
    try {
      return decryptToken(config.sync.turso_token_encrypted);
    } catch {
      return null;
    }
  }

  // Legacy plaintext fallback — migrate to encrypted on the fly
  if (config.sync.turso_token) {
    const plain = config.sync.turso_token;
    config.sync.turso_token_encrypted = encryptToken(plain);
    delete config.sync.turso_token;
    writeConfig(config);
    return plain;
  }

  return null;
}

/**
 * Register sync-related routes.
 */
export function registerSyncRoutes(
  app: FastifyInstance,
  db: Database.Database,
  sseEmitter: SSEEmitter,
): void {
  let syncWorker: SyncWorker | null = null;

  // GET /api/sync/status — returns sync worker status
  app.get('/api/sync/status', async () => {
    const config = readConfig();

    if (!config.sync?.enabled) {
      return {
        data: { configured: false },
        meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
      };
    }

    // Queue size — unsynced memories
    const queueSize = (
      db
        .prepare('SELECT COUNT(*) as count FROM memories WHERE synced_at IS NULL AND deleted_at IS NULL')
        .get() as { count: number }
    ).count;

    // Last sync timestamp
    const lastSync = (
      db
        .prepare('SELECT MAX(synced_at) as last_sync FROM memories WHERE synced_at IS NOT NULL')
        .get() as { last_sync: string | null }
    )?.last_sync ?? null;

    // Machines list
    let machines: Record<string, unknown>[] = [];
    try {
      machines = db.prepare('SELECT * FROM machines').all() as Record<string, unknown>[];
    } catch {
      // Table may not exist yet
    }

    return {
      data: {
        configured: true,
        running: syncWorker !== null,
        last_sync_at: lastSync,
        queue_size: queueSize,
        machines,
      },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // POST /api/sync/start — start/resume sync worker
  app.post('/api/sync/start', async (_request, reply) => {
    const config = readConfig();

    if (!config.sync?.enabled) {
      return reply.status(400).send({
        error: { code: 'SYNC_NOT_CONFIGURED', message: 'Sync is not configured. Use POST /api/sync/setup first.' },
      });
    }

    // Subscriber verification gate — fail closed
    if (!config.subscriber?.email_hash) {
      return reply.status(403).send({
        error: {
          code: 'SUBSCRIBER_REQUIRED',
          message: 'Subscriber verification required. Run: cortex subscribe <email>',
        },
      });
    }
    if (config.subscriber.expires_at && new Date(config.subscriber.expires_at) < new Date()) {
      return reply.status(403).send({
        error: {
          code: 'SUBSCRIBER_EXPIRED',
          message: 'Subscriber token expired. Run: cortex subscribe <email>',
        },
      });
    }

    if (syncWorker) {
      return {
        data: { status: 'already_running' },
        meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
      };
    }

    const tursoToken = readTursoToken(config);
    if (!tursoToken) {
      return reply.status(400).send({
        error: { code: 'SYNC_TOKEN_ERROR', message: 'Failed to read Turso token. Reconfigure with POST /api/sync/setup.' },
      });
    }
    const turso = createClient({ url: config.sync.turso_url, authToken: tursoToken });

    // Get or create machine ID
    let machine = db.prepare('SELECT id FROM machines LIMIT 1').get() as { id: string } | undefined;
    if (!machine) {
      const machineId = uuid();
      db.prepare(
        "INSERT INTO machines (id, name, last_seen_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
      ).run(machineId, `machine-${machineId.slice(0, 8)}`);
      machine = { id: machineId };
    }

    syncWorker = new SyncWorker(db, turso, machine.id, sseEmitter);
    syncWorker.start();

    sseEmitter.broadcast({
      type: 'sync.completed',
      data: { pushed: 0, pulled: 0, conflicts: 0 },
    });

    return {
      data: { status: 'started', machine_id: machine.id },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // POST /api/sync/stop — pause sync worker
  app.post('/api/sync/stop', async () => {
    if (syncWorker) {
      syncWorker.stop();
      syncWorker = null;
    }

    return {
      data: { status: 'stopped' },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // POST /api/sync/now — force immediate sync cycle
  app.post('/api/sync/now', async (_request, reply) => {
    if (!syncWorker) {
      return reply.status(400).send({
        error: { code: 'SYNC_NOT_RUNNING', message: 'Sync worker is not running. Use POST /api/sync/start first.' },
      });
    }

    const result = await syncWorker.syncNow();

    return {
      data: { status: 'completed', ...result },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    };
  });

  // POST /api/sync/setup — configure Turso credentials and start sync
  app.post('/api/sync/setup', async (request, reply) => {
    const parsed = SyncSetupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }
    const body = parsed.data;

    // 0. Subscriber verification gate
    const config = readConfig();
    if (!config.subscriber?.email_hash) {
      return reply.status(403).send({
        error: {
          code: 'SUBSCRIBER_REQUIRED',
          message: 'Subscriber verification required. Run: cortex subscribe <email>  |  Subscribe at ProductionLineHQ.ai',
        },
      });
    }

    // Check if subscriber token has expired (> 30 days)
    if (config.subscriber.expires_at && new Date(config.subscriber.expires_at) < new Date()) {
      // Attempt re-verification against cortex.sh
      const CORTEX_WEB_URL = process.env.CORTEX_WEB_URL || 'https://cortex.sh';
      try {
        const verifyRes = await fetch(`${CORTEX_WEB_URL}/api/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email_hash: config.subscriber.email_hash }),
          signal: AbortSignal.timeout(10_000),
        });

        if (verifyRes.ok) {
          const verifyData = (await verifyRes.json()) as { valid: boolean; expires_at?: string };
          if (verifyData.valid && verifyData.expires_at) {
            config.subscriber.verified_at = new Date().toISOString();
            config.subscriber.expires_at = verifyData.expires_at;
            writeConfig(config);
          } else {
            return reply.status(403).send({
              error: {
                code: 'SUBSCRIBER_EXPIRED',
                message: 'Subscriber token expired and re-verification failed. Run: cortex subscribe <email>',
              },
            });
          }
        } else {
          // Fail closed — cortex.sh returned non-OK, deny sync
          return reply.status(403).send({
            error: {
              code: 'SUBSCRIBER_VERIFICATION_FAILED',
              message: 'Subscriber re-verification failed (service error). Run: cortex subscribe <email>',
            },
          });
        }
      } catch {
        // Fail closed — network error, deny sync
        return reply.status(403).send({
          error: {
            code: 'SUBSCRIBER_VERIFICATION_FAILED',
            message: 'Could not verify subscriber status (network error). Try again later or run: cortex subscribe <email>',
          },
        });
      }
    }

    // 1. Test the Turso connection
    const turso = createClient({ url: body.url, authToken: body.token });

    try {
      await turso.execute('SELECT 1');
    } catch (err) {
      return reply.status(400).send({
        error: {
          code: 'TURSO_CONNECTION_FAILED',
          message: `Failed to connect to Turso: ${err instanceof Error ? err.message : 'unknown error'}`,
        },
      });
    }

    // 2. Ensure remote schema (memories table at minimum)
    try {
      await turso.execute(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          reason TEXT,
          tags TEXT,
          importance INTEGER DEFAULT 5,
          confidence REAL DEFAULT 1.0,
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

      await turso.execute(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT,
          git_remote TEXT,
          tech_stack TEXT,
          context_budget INTEGER DEFAULT 120000,
          memory_limit INTEGER DEFAULT 500,
          created_at TEXT NOT NULL,
          last_session_at TEXT
        )
      `);

      await turso.execute(`
        CREATE TABLE IF NOT EXISTS machines (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          last_turso_pull_at TEXT
        )
      `);
    } catch (err) {
      return reply.status(500).send({
        error: {
          code: 'SCHEMA_SETUP_FAILED',
          message: `Failed to set up remote schema: ${err instanceof Error ? err.message : 'unknown error'}`,
        },
      });
    }

    // 3. Write config (token stored encrypted, never plaintext)
    const config2 = readConfig();
    config2.sync = {
      turso_url: body.url,
      turso_token_encrypted: encryptToken(body.token),
      enabled: true,
    };
    writeConfig(config2);

    // 4. Register this machine locally and remotely
    const machineId = uuid();
    const machineName = `machine-${machineId.slice(0, 8)}`;

    try {
      db.prepare(
        "INSERT OR REPLACE INTO machines (id, name, last_seen_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
      ).run(machineId, machineName);
    } catch {
      // machines table may not exist locally yet — create it
      db.exec(`
        CREATE TABLE IF NOT EXISTS machines (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          last_turso_pull_at TEXT
        )
      `);
      db.prepare(
        "INSERT INTO machines (id, name, last_seen_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
      ).run(machineId, machineName);
    }

    try {
      await turso.execute({
        sql: 'INSERT OR REPLACE INTO machines (id, name, last_seen_at) VALUES (?, ?, ?)',
        args: [machineId, machineName, new Date().toISOString()],
      });
    } catch {
      // Non-critical — machine will register on first sync
    }

    // 5. Start sync worker
    if (syncWorker) {
      syncWorker.stop();
    }
    syncWorker = new SyncWorker(db, turso, machineId, sseEmitter);
    syncWorker.start();

    return reply.status(201).send({
      data: {
        status: 'configured',
        machine_id: machineId,
        machine_name: machineName,
      },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0', request_id: uuid() },
    });
  });
}
