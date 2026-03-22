import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Get the current schema version from the database.
 * Returns 0 if schema_version table doesn't exist yet.
 */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
      version: number | null;
    };
    return row?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Get all available migration files sorted by version number.
 */
export function getMigrationFiles(migrationsDir?: string): Array<{ version: number; path: string; filename: string }> {
  const dir = migrationsDir || MIGRATIONS_DIR;

  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((filename) => {
      const match = filename.match(/^(\d+)_/);
      if (!match) return null;
      return {
        version: parseInt(match[1], 10),
        path: path.join(dir, filename),
        filename,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => a.version - b.version);
}

/**
 * Run all pending migrations in a transaction.
 * Each migration is idempotent — safe to run multiple times.
 *
 * @param db - Database connection
 * @param migrationsDir - Optional custom migrations directory
 * @param backupDir - Optional directory for pre-migration backups
 * @returns Number of migrations applied
 */
export function runMigrations(
  db: Database.Database,
  migrationsDir?: string,
  backupDir?: string,
): { applied: number; current_version: number } {
  const currentVersion = getCurrentVersion(db);
  const migrations = getMigrationFiles(migrationsDir);
  const pending = migrations.filter((m) => m.version > currentVersion);

  if (pending.length === 0) {
    return { applied: 0, current_version: currentVersion };
  }

  // Create pre-migration backup for file-based databases
  if (backupDir) {
    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `pre-migration-${timestamp}.db`);
      db.backup(backupPath);
    } catch {
      // Backup failure is non-fatal — continue with migration
    }
  }

  let applied = 0;
  let latestVersion = currentVersion;

  for (const migration of pending) {
    const sql = fs.readFileSync(migration.path, 'utf-8');

    try {
      // Run each migration in its own transaction for idempotency
      db.exec('BEGIN');
      db.exec(sql);
      db.exec('COMMIT');
      applied++;
      latestVersion = migration.version;
    } catch (error) {
      // Rollback this migration — previous ones are already committed
      try {
        db.exec('ROLLBACK');
      } catch {
        // Rollback may fail if transaction already rolled back
      }
      throw new Error(
        `Migration ${migration.filename} failed: ${error instanceof Error ? error.message : String(error)}. Database is at version ${latestVersion}. Backup available if configured.`,
      );
    }
  }

  return { applied, current_version: latestVersion };
}

/**
 * Rebuild FTS5 index — used after bulk imports.
 */
export function rebuildFtsIndex(db: Database.Database): void {
  db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
}

/**
 * Run PRAGMA integrity_check — used on startup after unclean shutdown.
 */
export function checkIntegrity(db: Database.Database): { ok: boolean; errors: string[] } {
  const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  const errors = rows
    .map((r) => r.integrity_check)
    .filter((msg) => msg !== 'ok');

  return {
    ok: errors.length === 0,
    errors,
  };
}
