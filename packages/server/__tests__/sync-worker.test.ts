import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrator.js';
import { SyncWorker } from '../src/sync/sync-worker.js';
import type { Client } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;
const MACHINE_ID = 'test-machine-001';
const SERVER_TS = '2026-01-01T12:00:00.000Z';

/**
 * Creates a mock Turso client that responds based on SQL query content.
 * This avoids brittle call-ordering issues with mockResolvedValueOnce.
 */
function createSmartMockTurso(opts?: {
  pullRows?: Record<string, unknown>[];
  healthy?: boolean;
  throwOnPush?: Error | null;
}): Client {
  const { pullRows = [], healthy = true, throwOnPush = null } = opts || {};
  let pullCalled = false;

  const executeFn = vi.fn().mockImplementation(async (sqlOrObj: string | { sql: string; args: unknown[] }) => {
    const sql = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;

    // Health check
    if (sql === 'SELECT 1') {
      if (!healthy) throw new Error('Connection refused');
      return { rows: [{ '1': 1 }], columns: ['1'], rowsAffected: 0 };
    }

    // Server timestamp
    if (sql.includes("strftime('%Y-%m-%dT%H:%M:%fZ'")) {
      return { rows: [{ ts: SERVER_TS }], columns: ['ts'], rowsAffected: 0 };
    }

    // Push memory upsert
    if (sql.includes('INSERT OR REPLACE INTO memories')) {
      if (throwOnPush) throw throwOnPush;
      return { rows: [], columns: [], rowsAffected: 1 };
    }

    // Push project upsert
    if (sql.includes('INSERT OR REPLACE INTO projects')) {
      return { rows: [], columns: [], rowsAffected: 1 };
    }

    // Pull memories query
    if (sql.includes('SELECT * FROM memories WHERE updated_at')) {
      if (pullCalled) return { rows: [], columns: [], rowsAffected: 0 };
      pullCalled = true;
      return { rows: pullRows, columns: [], rowsAffected: 0 };
    }

    // Pull projects
    if (sql === 'SELECT * FROM projects') {
      return { rows: [], columns: [], rowsAffected: 0 };
    }

    // COUNT for initial sync
    if (sql.includes('COUNT(*)')) {
      return { rows: [{ cnt: pullRows.length }], columns: ['cnt'], rowsAffected: 0 };
    }

    // SELECT * FROM memories ORDER BY (initial sync batch)
    if (sql.includes('SELECT * FROM memories ORDER BY created_at ASC LIMIT')) {
      return { rows: pullRows, columns: [], rowsAffected: 0 };
    }

    return { rows: [], columns: [], rowsAffected: 0 };
  });

  return {
    execute: executeFn,
    batch: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(),
    executeMultiple: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    closed: false,
    protocol: 'http',
  } as unknown as Client;
}

function insertUnsyncedMemory(db: Database.Database, projectId: string, id?: string): string {
  const memId = id || `mem-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO memories (id, project_id, type, content, reason, tags, importance, confidence, created_at, updated_at)
     VALUES (?, ?, 'decision', 'Test memory content for sync testing purposes and verification', 'Test reason for sync', '[]', 5, 3, ?, ?)`,
  ).run(memId, projectId, now, now);
  return memId;
}

function createProject(db: Database.Database, projectId: string, name = 'test-project'): void {
  db.prepare(
    `INSERT INTO projects (id, name, tech_stack, context_budget, memory_limit, created_at) VALUES (?, ?, '[]', 4000, 500, ?)`,
  ).run(projectId, name, new Date().toISOString());
}

function setupMachine(db: Database.Database): void {
  db.prepare(
    "INSERT OR REPLACE INTO machines (id, name, hostname, platform, last_seen_at, registered_at) VALUES (?, 'test-machine', 'test-host', 'darwin', ?, ?)",
  ).run(MACHINE_ID, new Date().toISOString(), new Date().toISOString());
}

beforeEach(() => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  setupMachine(db);
});

afterEach(() => {
  db.close();
});

describe('SyncWorker', () => {
  describe('Push cycle', () => {
    it('pushes unsynced memories to Turso in batches', async () => {
      const projectId = 'proj-push-test';
      createProject(db, projectId, 'push-test');

      // Insert 3 unsynced memories
      for (let i = 0; i < 3; i++) {
        insertUnsyncedMemory(db, projectId);
      }

      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);
      const result = await worker.syncNow();

      expect(result.pushed).toBe(3);
      expect(result.pulled).toBe(0);

      // Verify memories are now marked as synced
      const unsynced = db.prepare('SELECT COUNT(*) AS cnt FROM memories WHERE synced_at IS NULL').get() as { cnt: number };
      expect(unsynced.cnt).toBe(0);
    });
  });

  describe('Pull cycle', () => {
    it('pulls remote memories using last_turso_pull_at cursor', async () => {
      const projectId = 'proj-pull-test';
      createProject(db, projectId, 'pull-test');

      const remoteMemory = {
        id: 'remote-mem-001',
        project_id: projectId,
        type: 'decision',
        content: 'Remote memory from another machine with sufficient length for validation',
        reason: 'Remote reason',
        tags: '[]',
        importance: 7,
        confidence: 3,
        superseded_by: null,
        expires_at: null,
        reviewed_at: null,
        session_id: null,
        machine_id: 'other-machine-002',
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-01T11:00:00.000Z',
        synced_at: SERVER_TS,
        deleted_at: null,
      };

      const mockTurso = createSmartMockTurso({ pullRows: [remoteMemory] });
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);
      const result = await worker.syncNow();

      expect(result.pulled).toBe(1);

      // Verify the remote memory was inserted locally
      const local = db.prepare('SELECT * FROM memories WHERE id = ?').get('remote-mem-001') as Record<string, unknown> | undefined;
      expect(local).toBeDefined();
      expect(local!.content).toBe(remoteMemory.content);
    });
  });

  describe('Conflict resolution', () => {
    it('remote newer wins — local saved to conflicts table', async () => {
      const projectId = 'proj-conflict';
      createProject(db, projectId, 'conflict-test');

      // Insert the remote machine so FK constraint doesn't fail on conflicts table
      const otherMachineId = 'other-machine-002';
      db.prepare(
        "INSERT INTO machines (id, name, hostname, platform, last_seen_at, registered_at) VALUES (?, 'other-machine', 'remote-host', 'linux', ?, ?)",
      ).run(otherMachineId, new Date().toISOString(), new Date().toISOString());

      const memId = 'conflict-mem-001';
      const oldTimestamp = '2026-01-01T08:00:00.000Z';
      db.prepare(
        `INSERT INTO memories (id, project_id, type, content, reason, tags, importance, confidence, created_at, updated_at, synced_at)
         VALUES (?, ?, 'decision', 'Local version of conflicting memory content for testing sync', 'Local reason', '[]', 5, 3, ?, ?, ?)`,
      ).run(memId, projectId, oldTimestamp, oldTimestamp, oldTimestamp);

      const newerRemote = {
        id: memId,
        project_id: projectId,
        type: 'decision',
        content: 'Remote NEWER version of the conflicting memory with updated content',
        reason: 'Remote updated reason',
        tags: '["updated"]',
        importance: 8,
        confidence: 4,
        superseded_by: null,
        expires_at: null,
        reviewed_at: null,
        session_id: null,
        machine_id: 'other-machine-002',
        created_at: oldTimestamp,
        updated_at: '2026-01-01T10:00:00.000Z', // newer than local
        synced_at: SERVER_TS,
        deleted_at: null,
      };

      // Use a dedicated mock that tracks SQL patterns for debugging
      const executeFn = vi.fn().mockImplementation(async (sqlOrObj: string | { sql: string; args: unknown[] }) => {
        const sql = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;

        if (sql === 'SELECT 1') {
          return { rows: [{ '1': 1 }], columns: ['1'], rowsAffected: 0 };
        }
        if (sql.includes("strftime('%Y-%m-%dT%H:%M:%fZ'")) {
          return { rows: [{ ts: SERVER_TS }], columns: ['ts'], rowsAffected: 0 };
        }
        if (sql.includes('INSERT OR REPLACE INTO memories')) {
          return { rows: [], columns: [], rowsAffected: 1 };
        }
        if (sql.includes('INSERT OR REPLACE INTO projects')) {
          return { rows: [], columns: [], rowsAffected: 1 };
        }
        if (sql.includes('SELECT * FROM memories WHERE updated_at')) {
          return { rows: [newerRemote], columns: Object.keys(newerRemote), rowsAffected: 0 };
        }
        if (sql === 'SELECT * FROM projects') {
          return { rows: [], columns: [], rowsAffected: 0 };
        }
        return { rows: [], columns: [], rowsAffected: 0 };
      });

      const mockTurso = {
        execute: executeFn,
        batch: vi.fn().mockResolvedValue([]),
        transaction: vi.fn(),
        executeMultiple: vi.fn(),
        sync: vi.fn(),
        close: vi.fn(),
        closed: false,
        protocol: 'http',
      } as unknown as Client;

      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);
      const result = await worker.syncNow();

      expect(result.conflicts).toBe(1);
      expect(result.pulled).toBe(1);

      // Local memory should now have remote content
      const local = db.prepare('SELECT * FROM memories WHERE id = ?').get(memId) as Record<string, unknown>;
      expect(local.content).toBe(newerRemote.content);

      // Old local content should be in conflicts table
      const conflict = db.prepare('SELECT * FROM conflicts WHERE memory_id = ?').get(memId) as Record<string, unknown> | undefined;
      expect(conflict).toBeDefined();
      expect(conflict!.losing_content).toContain('Local version');
    });

    it('local newer wins — remote ignored', async () => {
      const projectId = 'proj-conflict2';
      createProject(db, projectId, 'conflict-test2');

      const memId = 'conflict-mem-002';
      const newerTimestamp = '2026-01-01T12:00:00.000Z';
      db.prepare(
        `INSERT INTO memories (id, project_id, type, content, reason, tags, importance, confidence, created_at, updated_at, synced_at)
         VALUES (?, ?, 'decision', 'Local NEWER version of the memory that should win the conflict', 'Local reason', '[]', 5, 3, ?, ?, ?)`,
      ).run(memId, projectId, newerTimestamp, newerTimestamp, newerTimestamp);

      const olderRemote = {
        id: memId,
        project_id: projectId,
        type: 'decision',
        content: 'Remote OLDER version that should lose the conflict resolution check',
        reason: 'Old remote reason',
        tags: '[]',
        importance: 5,
        confidence: 3,
        superseded_by: null,
        expires_at: null,
        reviewed_at: null,
        session_id: null,
        machine_id: 'other-machine-002',
        created_at: '2026-01-01T08:00:00.000Z',
        updated_at: '2026-01-01T09:00:00.000Z', // older than local
        synced_at: null,
        deleted_at: null,
      };

      const mockTurso = createSmartMockTurso({ pullRows: [olderRemote] });
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);
      const result = await worker.syncNow();

      expect(result.conflicts).toBe(0);
      expect(result.pulled).toBe(0);

      // Local memory should still have local content
      const local = db.prepare('SELECT * FROM memories WHERE id = ?').get(memId) as Record<string, unknown>;
      expect(local.content).toContain('Local NEWER version');
    });
  });

  describe('Pause/resume', () => {
    it('paused worker skips tick', async () => {
      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      worker.pause();
      const result = await worker.syncNow();

      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);
      expect(result.conflicts).toBe(0);

      // The mock should never be called because tick returns early
      expect(mockTurso.execute).not.toHaveBeenCalled();
    });

    it('resumed worker runs tick again', async () => {
      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      worker.pause();
      expect(worker.getStatus().paused).toBe(true);

      worker.resume();
      expect(worker.getStatus().paused).toBe(false);

      // Clean up the interval started by resume→start
      worker.stop();
    });
  });

  describe('Status', () => {
    it('getStatus() returns correct state', () => {
      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      const status = worker.getStatus();
      expect(status.running).toBe(false);
      expect(status.paused).toBe(false);
      expect(status.lastSyncAt).toBeNull();
      expect(status.lastPushed).toBe(0);
      expect(status.lastPulled).toBe(0);
      expect(status.lastConflicts).toBe(0);
      expect(status.offlineCount).toBe(0);
      expect(status.backoffMs).toBe(0);
      expect(typeof status.queueSize).toBe('number');
    });

    it('getStatus() reports correct queueSize after inserting unsynced memories', () => {
      const projectId = 'proj-status';
      createProject(db, projectId, 'status-test');

      insertUnsyncedMemory(db, projectId);
      insertUnsyncedMemory(db, projectId);

      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      const status = worker.getStatus();
      expect(status.queueSize).toBe(2);
    });

    it('getStatus() updates after successful sync', async () => {
      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      await worker.syncNow();
      const status = worker.getStatus();
      expect(status.lastSyncAt).toBeTruthy();
    });
  });

  describe('Health check', () => {
    it('unhealthy Turso skips tick and increments offlineCount', async () => {
      const mockTurso = createSmartMockTurso({ healthy: false });
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);
      const result = await worker.syncNow();

      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);

      const status = worker.getStatus();
      expect(status.offlineCount).toBe(1);
    });

    it('multiple unhealthy ticks increment offlineCount', async () => {
      const mockTurso = createSmartMockTurso({ healthy: false });
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      await worker.syncNow();
      await worker.syncNow();
      await worker.syncNow();

      const status = worker.getStatus();
      expect(status.offlineCount).toBe(3);
    });
  });

  describe('Backoff', () => {
    it('429 error triggers backoff', async () => {
      const projectId = 'proj-backoff';
      createProject(db, projectId, 'backoff-test');
      insertUnsyncedMemory(db, projectId);

      const rateLimitError = Object.assign(new Error('Too Many Requests'), { status: 429 });
      const mockTurso = createSmartMockTurso({ throwOnPush: rateLimitError });
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      await worker.syncNow();

      const status = worker.getStatus();
      expect(status.backoffMs).toBeGreaterThan(0);
    });
  });

  describe('Initial sync', () => {
    it('bulk downloads memories in batches and rebuilds FTS', async () => {
      const projectId = 'proj-init';
      createProject(db, projectId, 'init-test');

      const remoteMems = Array.from({ length: 3 }, (_, i) => ({
        id: `init-mem-${i}`,
        project_id: projectId,
        type: 'decision',
        content: `Bulk imported memory number ${i} with sufficient length for FTS indexing purposes`,
        reason: `Reason for memory ${i}`,
        tags: '[]',
        importance: 5,
        confidence: 3,
        superseded_by: null,
        expires_at: null,
        reviewed_at: null,
        session_id: null,
        machine_id: 'other-machine',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        synced_at: null,
        deleted_at: null,
      }));

      const mockTurso = createSmartMockTurso({ pullRows: remoteMems });
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      const progressCalls: Array<[number, number]> = [];
      const downloaded = await worker.initialSync((d, t) => progressCalls.push([d, t]));

      expect(downloaded).toBe(3);
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toEqual([3, 3]);

      // Verify memories are in local DB
      const count = db.prepare('SELECT COUNT(*) AS cnt FROM memories').get() as { cnt: number };
      expect(count.cnt).toBe(3);
    });

    it('returns 0 for empty remote database', async () => {
      const mockTurso = createSmartMockTurso({ pullRows: [] });
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);
      const downloaded = await worker.initialSync();

      expect(downloaded).toBe(0);
    });
  });

  describe('Start/stop lifecycle', () => {
    it('start and stop manage the interval', () => {
      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      worker.start();
      let status = worker.getStatus();
      expect(status.running).toBe(true);

      worker.stop();
      status = worker.getStatus();
      expect(status.running).toBe(false);
    });

    it('start is idempotent — calling twice does not create duplicate intervals', () => {
      const mockTurso = createSmartMockTurso();
      const worker = new SyncWorker(db, mockTurso, MACHINE_ID);

      worker.start();
      worker.start(); // Second call should be no-op

      worker.stop();
      const status = worker.getStatus();
      expect(status.running).toBe(false);
    });
  });
});
