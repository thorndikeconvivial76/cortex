import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Default data directory: ~/.cortex/
 */
export function getDataDir(): string {
  return path.join(os.homedir(), '.cortex');
}

/**
 * Default database path: ~/.cortex/memory.db
 */
export function getDbPath(dataDir?: string): string {
  return path.join(dataDir || getDataDir(), 'memory.db');
}

/**
 * Create and configure a SQLite database connection with WAL mode and all PRAGMAs.
 *
 * @param dbPath - Path to database file. Use ':memory:' for in-memory (testing).
 * @returns Configured better-sqlite3 Database instance
 */
export function createDatabase(dbPath: string): Database.Database {
  // Ensure directory exists for file-based DBs
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Apply all PRAGMAs
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -64000'); // 64MB page cache
  db.pragma('temp_store = MEMORY');

  // Set file permissions to 600 (owner read/write only) for file-based DBs
  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch {
      // May fail on some systems — non-critical
    }
  }

  return db;
}

/**
 * Close a database connection safely.
 */
export function closeDatabase(db: Database.Database): void {
  try {
    db.close();
  } catch {
    // Already closed or invalid — ignore
  }
}
