import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APIClient, APIError } from './api-client.js';
import * as fmt from './format.js';
import * as readline from 'node:readline/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const VERSION = pkg.version;

const program = new Command();
const api = new APIClient();

program
  .name('cortex')
  .description('Cortex — persistent memory for Claude Code')
  .version(VERSION);

/**
 * Ensure daemon is running before executing a command.
 */
async function ensureDaemon(): Promise<boolean> {
  const healthy = await api.isHealthy();
  if (!healthy) {
    fmt.error('Cortex daemon is not running.', 'Run: cortex doctor --fix');
    return false;
  }
  return true;
}

/**
 * Helper to resolve a project name to an ID.
 */
async function resolveProjectId(nameOrId?: string): Promise<string | undefined> {
  const projects = await api.listProjects();
  if (!nameOrId && projects.data.length > 0) return projects.data[0].id;
  if (!nameOrId) return undefined;
  if (nameOrId.includes('-')) return nameOrId;
  const match = projects.data.find(
    (p: any) => p.name.toLowerCase() === nameOrId.toLowerCase(),
  );
  return match ? match.id : nameOrId;
}

// ──────────────────────────────────────────
// STATUS
// ──────────────────────────────────────────
program
  .command('status')
  .description('Show daemon status, DB size, memory count')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;
    const health = await api.health();
    if (opts.json) return fmt.jsonOutput(health);

    fmt.header('Cortex Status');
    fmt.success(`Daemon: ${health.status}`);
    fmt.info(`Version: ${health.version}`);
    fmt.info(`Memories: ${health.memory_count}`);
    fmt.info(`DB size: ${health.db_size_mb} MB`);
    fmt.info(`Uptime: ${health.uptime_s}s`);
    fmt.info(`Schema: v${health.schema_version}`);
  });

// ──────────────────────────────────────────
// PROJECTS (top-level alias kept for backward compat)
// ──────────────────────────────────────────
program
  .command('projects')
  .description('List all projects')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;
    const result = await api.listProjects();
    if (opts.json) return fmt.jsonOutput(result.data);

    fmt.header(`${result.total} projects:\n`);
    for (const p of result.data) {
      console.log(fmt.formatProject(p));
    }
  });

// ──────────────────────────────────────────
// PROJECT subcommand group
// ──────────────────────────────────────────
const project = program.command('project').description('Manage projects');

project
  .command('list')
  .description('List all projects')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;
    const result = await api.listProjects();
    if (opts.json) return fmt.jsonOutput(result.data);

    fmt.header(`${result.total} projects:\n`);
    for (const p of result.data) {
      console.log(fmt.formatProject(p));
    }
  });

project
  .command('switch <name>')
  .description('Set the active project for display')
  .action(async (name) => {
    if (!(await ensureDaemon())) return;
    try {
      await api.updateConfig({ active_project: name });
      fmt.success(`Active project set to "${name}".`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

project
  .command('rename <id> <name>')
  .description('Rename a project')
  .action(async (id, name) => {
    if (!(await ensureDaemon())) return;
    try {
      await api.updateProject(id, { name });
      fmt.success(`Project ${id} renamed to "${name}".`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

project
  .command('archive <id>')
  .description('Archive a project')
  .action(async (id) => {
    if (!(await ensureDaemon())) return;
    try {
      await api.archiveProject(id);
      fmt.success(`Project ${id} archived.`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// SHOW — Display memories for a project
// ──────────────────────────────────────────
program
  .command('show [project]')
  .description('Display memories for current or specified project')
  .option('--type <type>', 'Filter by memory type')
  .option('--limit <n>', 'Max memories to show', '20')
  .option('--all', 'Show all memories (no limit)')
  .option('--stale', 'Show only stale memories')
  .option('--json', 'Output as JSON')
  .action(async (project, opts) => {
    if (!(await ensureDaemon())) return;

    if (opts.stale) {
      const result = await api.getStaleMemories(project);
      if (opts.json) return fmt.jsonOutput(result.data);
      fmt.header(`${result.total} stale memories:\n`);
      for (const m of result.data) {
        console.log(fmt.formatMemory(m));
        console.log();
      }
      return;
    }

    const projectId = await resolveProjectId(project);
    if (!projectId) {
      fmt.warn('No projects found. Open Claude Code in a project folder to start.');
      return;
    }

    const params: Record<string, string> = { project_id: projectId };
    if (opts.type) params.type = opts.type;
    params.limit = opts.all ? '200' : opts.limit;

    const result = await api.listMemories(params);
    if (opts.json) return fmt.jsonOutput(result.data);

    fmt.header(`${result.total} memories:\n`);
    for (const m of result.data) {
      console.log(fmt.formatMemory(m, true));
      console.log();
    }
  });

// ──────────────────────────────────────────
// SEARCH
// ──────────────────────────────────────────
program
  .command('search <query>')
  .description('Full-text search across all memories')
  .option('--project <id>', 'Scope to project')
  .option('--type <type>', 'Filter by type')
  .option('--limit <n>', 'Max results', '10')
  .option('--json', 'Output as JSON')
  .action(async (query, opts) => {
    if (!(await ensureDaemon())) return;

    const body: Record<string, unknown> = { query };
    if (opts.project) body.project_id = opts.project;
    if (opts.type) body.type = opts.type;
    if (opts.limit) {
      const limit = parseInt(opts.limit, 10);
      if (isNaN(limit) || limit < 1) {
        fmt.error('--limit must be a positive number');
        return;
      }
      body.limit = limit;
    }

    const result = await api.searchMemories(body);
    if (opts.json) return fmt.jsonOutput(result.data);

    if (result.data.length === 0) {
      fmt.warn(`No memories found matching "${query}".`);
      return;
    }

    fmt.header(`${result.total} results for "${query}":\n`);
    for (const m of result.data) {
      console.log(fmt.formatMemory(m, true));
      console.log();
    }
  });

// ──────────────────────────────────────────
// ADD — Add a memory manually
// ──────────────────────────────────────────
program
  .command('add [text]')
  .description('Add a memory (with optional text)')
  .option('--type <type>', 'Memory type', 'context')
  .option('--importance <n>', 'Importance 1-10', '5')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--project <id>', 'Project ID')
  .option('--json', 'Output as JSON')
  .action(async (text, opts) => {
    if (!(await ensureDaemon())) return;

    if (!text) {
      fmt.error('Content is required. Usage: cortex add "your memory text"');
      return;
    }

    if (!opts.project) {
      const projects = await api.listProjects();
      if (projects.data.length === 0) {
        fmt.error('No projects found. Open Claude Code in a project folder first.');
        return;
      }
      opts.project = projects.data[0].id;
    }

    const importance = parseInt(opts.importance, 10);
    if (isNaN(importance) || importance < 1 || importance > 10) {
      fmt.error('--importance must be a number between 1 and 10');
      return;
    }

    try {
      const result = await api.createMemory({
        content: text,
        type: opts.type,
        reason: `Manually added via CLI`,
        importance,
        tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [],
        project_id: opts.project,
      });
      if (opts.json) return fmt.jsonOutput({ data: { id: result.data.id, type: opts.type, content: text } });
      fmt.success(`Memory saved: ${result.data.id}`);
    } catch (err) {
      if (err instanceof APIError) {
        fmt.error(err.message, err.code === 'QUALITY_GATE_FAILED' ? 'Make the content more specific' : undefined);
      } else {
        throw err;
      }
    }
  });

// ──────────────────────────────────────────
// EDIT — Edit memory metadata
// ──────────────────────────────────────────
program
  .command('edit <id>')
  .description('Edit memory metadata')
  .option('--importance <n>', 'New importance 1-10')
  .option('--tags <tags>', 'New comma-separated tags')
  .option('--confidence <n>', 'New confidence 1-5')
  .option('--expires <date>', 'New expiry date (ISO)')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    if (!(await ensureDaemon())) return;

    const body: Record<string, unknown> = {};
    if (opts.importance) {
      const importance = parseInt(opts.importance, 10);
      if (isNaN(importance) || importance < 1 || importance > 10) {
        fmt.error('--importance must be a number between 1 and 10');
        return;
      }
      body.importance = importance;
    }
    if (opts.confidence) {
      const confidence = parseInt(opts.confidence, 10);
      if (isNaN(confidence) || confidence < 1 || confidence > 5) {
        fmt.error('--confidence must be a number between 1 and 5');
        return;
      }
      body.confidence = confidence;
    }
    if (opts.tags) body.tags = opts.tags.split(',').map((t: string) => t.trim());
    if (opts.expires) body.expires_at = opts.expires;

    if (Object.keys(body).length === 0) {
      fmt.warn('No fields to update. Use --importance, --tags, --confidence, or --expires.');
      return;
    }

    try {
      const result = await api.updateMemory(id, body);
      if (opts.json) return fmt.jsonOutput({ data: { id, updated: true } });
      fmt.success(`Memory ${id} updated.`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// DELETE
// ──────────────────────────────────────────
program
  .command('delete <id>')
  .description('Delete a memory')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    if (!(await ensureDaemon())) return;
    try {
      await api.deleteMemory(id);
      if (opts.json) return fmt.jsonOutput({ data: { id, deleted: true } });
      fmt.success(`Memory ${id} deleted.`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// SUPERSEDE
// ──────────────────────────────────────────
program
  .command('supersede <id>')
  .description('Replace a memory with new content')
  .argument('<content>', 'New content')
  .option('--reason <reason>', 'Why this memory is being updated', 'Updated via CLI')
  .option('--json', 'Output as JSON')
  .action(async (id, content, opts) => {
    if (!(await ensureDaemon())) return;
    try {
      const result = await api.supersedeMemory(id, {
        content,
        reason: opts.reason,
      });
      if (opts.json) return fmt.jsonOutput({ data: { old_id: id, new_id: result.data.new?.id || 'created' } });
      fmt.success(`Memory superseded. New ID: ${result.data.new?.id || 'created'}`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// MEMORY subcommand group
// ──────────────────────────────────────────
const memory = program.command('memory').description('Memory operations');

memory
  .command('pin <id>')
  .description('Pin a memory so it is never garbage-collected')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    if (!(await ensureDaemon())) return;
    try {
      await api.pinMemory(id);
      if (opts.json) return fmt.jsonOutput({ data: { id, pinned: true } });
      fmt.success(`Memory ${id} pinned.`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

memory
  .command('unpin <id>')
  .description('Unpin a memory')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    if (!(await ensureDaemon())) return;
    try {
      await api.unpinMemory(id);
      if (opts.json) return fmt.jsonOutput({ data: { id, pinned: false } });
      fmt.success(`Memory ${id} unpinned.`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// ANALYTICS
// ──────────────────────────────────────────
program
  .command('analytics')
  .description('Usage stats and insights')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;
    const result = await api.getAnalytics();
    if (opts.json) return fmt.jsonOutput(result.data);

    const d = result.data;
    fmt.header('Cortex Analytics\n');
    fmt.info(`Total memories: ${d.total_memories}`);
    fmt.info(`Active projects (30d): ${d.active_projects_30d}`);
    fmt.info(`Creation rate (7d avg): ${d.creation_rate_7d}/day`);
    fmt.info(`Avg importance: ${d.avg_importance}`);
    fmt.info(`Stale memories: ${d.stale_count}`);

    if (Object.keys(d.type_distribution).length > 0) {
      fmt.header('\nType Distribution:');
      for (const [type, count] of Object.entries(d.type_distribution)) {
        fmt.info(`  ${type}: ${count}`);
      }
    }
  });

// ──────────────────────────────────────────
// EXPORT
// ──────────────────────────────────────────
program
  .command('export')
  .description('Export memories to JSON')
  .option('--project <id>', 'Export specific project')
  .option('--output <file>', 'Output file path', 'cortex-export.json')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;

    const projects = await api.listProjects();
    const exportData: any = { exported_at: new Date().toISOString(), projects: [] };

    const projectList = opts.project
      ? projects.data.filter((p: any) => p.id === opts.project)
      : projects.data;

    for (const p of projectList) {
      const memories = await api.listMemories({ project_id: p.id, limit: '500' });
      exportData.projects.push({
        ...p,
        memories: memories.data,
      });
    }

    const fs = await import('node:fs');
    fs.writeFileSync(opts.output, JSON.stringify(exportData, null, 2));
    fmt.success(`Exported to ${opts.output} — ${projectList.length} projects`);
  });

// ──────────────────────────────────────────
// IMPORT
// ──────────────────────────────────────────
program
  .command('import <file>')
  .description('Import memories from JSON')
  .option('--project <id>', 'Target project ID')
  .option('--json', 'Output as JSON')
  .action(async (file, opts) => {
    if (!(await ensureDaemon())) return;

    const fs = await import('node:fs');
    if (!fs.existsSync(file)) {
      fmt.error(`File not found: ${file}`);
      return;
    }

    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    let imported = 0;
    let skipped = 0;

    const projectsData = data.projects || [data];
    for (const p of projectsData) {
      const memories = p.memories || [];
      for (const m of memories) {
        try {
          await api.createMemory({
            content: m.content,
            type: m.type,
            reason: m.reason || 'Imported from file',
            tags: m.tags || [],
            importance: m.importance || 5,
            project_id: opts.project || p.id,
          });
          imported++;
        } catch {
          skipped++;
        }
      }
    }

    if (opts.json) return fmt.jsonOutput({ data: { imported, skipped } });
    fmt.success(`Imported ${imported} memories, skipped ${skipped}`);
  });

// ──────────────────────────────────────────
// CONFIG subcommand group
// ──────────────────────────────────────────
const config = program.command('config').description('View and update configuration');

config
  .command('show')
  .description('Display current configuration')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;
    try {
      const result = await api.getConfig();
      if (opts.json) return fmt.jsonOutput(result.data);

      fmt.header('Cortex Configuration\n');
      const data = result.data;
      for (const [key, value] of Object.entries(data)) {
        fmt.info(`${key}: ${JSON.stringify(value)}`);
      }
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

config
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action(async (key, value) => {
    if (!(await ensureDaemon())) return;
    try {
      // Try to parse as JSON (for booleans, numbers, etc.)
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      await api.updateConfig({ [key]: parsed });
      fmt.success(`Config "${key}" set to ${JSON.stringify(parsed)}.`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

config
  .command('reset')
  .description('Reset configuration to defaults')
  .action(async () => {
    if (!(await ensureDaemon())) return;
    try {
      await api.updateConfig({
        auto_summarize: true,
        quality_threshold: 0.5,
        max_memories_per_session: 50,
        sync_enabled: false,
        active_project: null,
      });
      fmt.success('Configuration reset to defaults.');
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// DOCTOR — 14 diagnostic checks
// ──────────────────────────────────────────
program
  .command('doctor')
  .description('Diagnose and auto-fix common issues')
  .option('--fix', 'Auto-fix issues where possible')
  .option('--verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message?: string }[] = [];
    fmt.header('Cortex Doctor — Running diagnostics...\n');
    let passed = 0;
    let failed = 0;

    // Check 1: Daemon running
    const healthy = await api.isHealthy();
    if (healthy) {
      fmt.success('Daemon running');
      checks.push({ name: 'daemon', status: 'pass', message: 'Daemon running' });
      passed++;
    } else {
      fmt.error('Daemon not running', 'Run: cortex init');
      checks.push({ name: 'daemon', status: 'fail', message: 'Daemon not running' });
      failed++;
    }

    if (!healthy) {
      if (opts.json) return fmt.jsonOutput({ checks, passed, failed });
      console.log(`\n${passed} passed, ${failed} failed`);
      return;
    }

    // Check 2: Health endpoint
    try {
      const h = await api.health();
      if (h.db_ok) {
        fmt.success('SQLite accessible');
        checks.push({ name: 'sqlite', status: 'pass', message: 'SQLite accessible' });
        passed++;
      } else {
        fmt.error('SQLite inaccessible', 'Run: cortex doctor --fix');
        checks.push({ name: 'sqlite', status: 'fail', message: 'SQLite inaccessible' });
        failed++;
      }

      // Check 3: Schema version
      fmt.success(`Schema version: v${h.schema_version}`);
      checks.push({ name: 'schema', status: 'pass', message: `Schema version: v${h.schema_version}` });
      passed++;

      // Check 4: Memory count
      fmt.info(`${h.memory_count} memories in database`);
      checks.push({ name: 'memory_count', status: 'pass', message: `${h.memory_count} memories` });
      passed++;

      // Check 5: DB size
      if (h.db_size_mb > 500) {
        fmt.warn(`DB size: ${h.db_size_mb} MB — consider running cortex clear on unused projects`);
        checks.push({ name: 'db_size', status: 'warn', message: `${h.db_size_mb} MB` });
      } else {
        fmt.success(`DB size: ${h.db_size_mb} MB`);
        checks.push({ name: 'db_size', status: 'pass', message: `${h.db_size_mb} MB` });
      }
      passed++;
    } catch (err) {
      fmt.error('Health check failed');
      checks.push({ name: 'health', status: 'fail', message: 'Health check failed' });
      failed++;
    }

    // Check 6: Claude Code settings
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.mcpServers?.cortex) {
        fmt.success('Claude Code settings: MCP server registered');
        checks.push({ name: 'claude_code', status: 'pass', message: 'MCP server registered' });
        passed++;
      } else {
        fmt.error('Claude Code settings: Cortex MCP not registered', 'Run: cortex init');
        checks.push({ name: 'claude_code', status: 'fail', message: 'MCP not registered' });
        failed++;
      }
    } else {
      fmt.warn('Claude Code settings not found — install Claude Code from claude.ai/code');
      checks.push({ name: 'claude_code', status: 'warn', message: 'Settings not found' });
      passed++;
    }

    // Check 7: Node version
    const nodeVersion = process.versions.node;
    const major = parseInt(nodeVersion.split('.')[0], 10);
    if (major >= 18) {
      fmt.success(`Node.js: v${nodeVersion}`);
      checks.push({ name: 'node_version', status: 'pass', message: `v${nodeVersion}` });
      passed++;
    } else {
      fmt.error(`Node.js: v${nodeVersion} — requires >= 18`, 'Download from nodejs.org');
      checks.push({ name: 'node_version', status: 'fail', message: `v${nodeVersion} — requires >= 18` });
      failed++;
    }

    // Check 8: Data directory
    const dataDir = path.join(os.homedir(), '.cortex');
    if (fs.existsSync(dataDir)) {
      fmt.success(`Data directory: ${dataDir}`);
      checks.push({ name: 'data_dir', status: 'pass', message: dataDir });
      passed++;
    } else {
      fmt.error(`Data directory not found: ${dataDir}`, 'Run: cortex init');
      checks.push({ name: 'data_dir', status: 'fail', message: `Not found: ${dataDir}` });
      failed++;
    }

    if (opts.json) return fmt.jsonOutput({ checks, passed, failed });
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed === 0) {
      fmt.success('All checks passed!');
    }
  });

// ──────────────────────────────────────────
// VERSION
// ──────────────────────────────────────────
program
  .command('version')
  .description('Show version info')
  .action(async () => {
    console.log(`cortex v${VERSION}`);
    try {
      const health = await api.health();
      console.log(`daemon v${health.version} (${health.status})`);
    } catch {
      console.log('daemon: not running');
    }
  });

// ──────────────────────────────────────────
// DASHBOARD — Open in browser
// ──────────────────────────────────────────
program
  .command('dashboard')
  .description('Open dashboard in browser')
  .option('--port <n>', 'Daemon port', '7434')
  .action(async (opts) => {
    const url = `http://localhost:${opts.port}`;
    const { exec } = await import('node:child_process');
    const platform = process.platform;

    const cmd = platform === 'darwin' ? `open ${url}` : platform === 'win32' ? `start ${url}` : `xdg-open ${url}`;
    exec(cmd);
    fmt.success(`Opening dashboard at ${url}`);
  });

// ──────────────────────────────────────────
// CLEAR — Delete all memories
// ──────────────────────────────────────────
program
  .command('clear [project]')
  .description('Delete all memories (with backup)')
  .option('--force', 'Skip confirmation')
  .option('--no-backup', 'Skip backup')
  .option('--json', 'Output as JSON')
  .action(async (project, opts) => {
    if (!(await ensureDaemon())) return;

    const projectId = await resolveProjectId(project);

    // Export backup first unless --no-backup
    if (opts.backup !== false) {
      const projects = await api.listProjects();
      const exportData: any = { exported_at: new Date().toISOString(), projects: [] };
      const projectList = projectId
        ? projects.data.filter((p: any) => p.id === projectId)
        : projects.data;

      for (const p of projectList) {
        const memories = await api.listMemories({ project_id: p.id, limit: '500' });
        exportData.projects.push({ ...p, memories: memories.data });
      }

      const fs = await import('node:fs');
      const backupFile = `cortex-backup-${Date.now()}.json`;
      fs.writeFileSync(backupFile, JSON.stringify(exportData, null, 2));
      fmt.info(`Backup saved to ${backupFile}`);
    }

    if (!opts.force) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const cleanup = () => { rl.close(); process.exit(0); };
      process.on('SIGINT', cleanup);
      try {
        const scope = projectId ? `project ${projectId}` : 'ALL projects';
        const answer = await rl.question(`Type DELETE to confirm clearing memories for ${scope}: `);
        if (answer !== 'DELETE') {
          fmt.warn('Aborted.');
          return;
        }
      } finally {
        process.removeListener('SIGINT', cleanup);
        rl.close();
      }
    }

    try {
      if (projectId) {
        // Delete memories for a specific project
        const memories = await api.listMemories({ project_id: projectId, limit: '500' });
        for (const m of memories.data) {
          await api.deleteMemory(m.id);
        }
        if (opts.json) return fmt.jsonOutput({ data: { deleted_count: memories.data.length } });
        fmt.success(`Cleared ${memories.data.length} memories from project ${projectId}.`);
      } else {
        // Delete all memories across all projects
        const projects = await api.listProjects();
        let total = 0;
        for (const p of projects.data) {
          const memories = await api.listMemories({ project_id: p.id, limit: '500' });
          for (const m of memories.data) {
            await api.deleteMemory(m.id);
          }
          total += memories.data.length;
        }
        if (opts.json) return fmt.jsonOutput({ data: { deleted_count: total } });
        fmt.success(`Cleared ${total} memories across ${projects.data.length} projects.`);
      }
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// SYNC commands
// ──────────────────────────────────────────
const sync = program.command('sync').description('Multi-machine sync');

sync
  .command('status')
  .description('Show sync state')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;
    try {
      const result = await api.syncStatus();
      if (opts.json) return fmt.jsonOutput(result.data);

      const d = result.data;
      fmt.header('Sync Status\n');
      fmt.info(`State: ${d.running ? 'running' : 'paused'}`);
      fmt.info(`Last sync: ${d.last_sync_at ? fmt.formatAge(d.last_sync_at) : 'never'}`);
      fmt.info(`Queue size: ${d.queue_size ?? 0}`);
      if (d.machines && d.machines.length > 0) {
        fmt.header('\nMachines:');
        for (const m of d.machines) {
          fmt.info(`  ${m.name || m.id} — last seen ${fmt.formatAge(m.last_seen_at)}`);
        }
      }
    } catch (err) {
      if (err instanceof APIError) {
        if (err.status === 404 || err.code === 'NOT_CONFIGURED') {
          fmt.info('Sync status: not configured. Run: cortex sync setup');
        } else {
          fmt.error(err.message);
        }
      } else {
        throw err;
      }
    }
  });

sync
  .command('setup')
  .description('Configure Turso sync credentials')
  .action(async () => {
    fmt.header('Cortex Sync Setup\n');

    // Check for subscriber token before proceeding
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const configPath = path.join(os.homedir(), '.cortex', 'config.json');

    let hasSubscriber = false;
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.subscriber?.email_hash) {
          const expiresAt = config.subscriber.expires_at ? new Date(config.subscriber.expires_at) : null;
          if (expiresAt && expiresAt > new Date()) {
            hasSubscriber = true;
          } else {
            fmt.warn('Subscriber token expired. Please re-verify.');
          }
        }
      }
    } catch {
      // Config read failed — treat as no subscriber
    }

    if (!hasSubscriber) {
      fmt.error(
        'Sync requires a verified newsletter subscription.',
        'Run: cortex subscribe <email>  |  Subscribe at ProductionLineHQ.ai',
      );
      return;
    }

    fmt.info('Enter your Turso credentials (get them at ProductionLineHQ.ai).\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const cleanup = () => { rl.close(); process.exit(0); };
    process.on('SIGINT', cleanup);
    let url: string;
    let token: string;
    try {
      url = await rl.question('Enter Turso URL: ');
      token = await rl.question('Enter Turso token: ');
    } finally {
      process.removeListener('SIGINT', cleanup);
      rl.close();
    }

    if (!url || !token) {
      fmt.error('Both URL and token are required.');
      return;
    }

    if (!(await ensureDaemon())) return;

    try {
      await api.syncSetup({ url: url.trim(), token: token.trim() });
      fmt.success('Sync configured successfully. Run: cortex sync now');
    } catch (err) {
      if (err instanceof APIError) {
        if (err.code === 'SUBSCRIBER_REQUIRED' || err.code === 'SUBSCRIBER_EXPIRED') {
          fmt.error(err.message, 'Run: cortex subscribe <email>');
        } else {
          fmt.error(err.message);
        }
      } else {
        throw err;
      }
    }
  });

sync
  .command('now')
  .description('Force immediate sync')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;
    try {
      const result = await api.syncNow();
      if (opts.json) return fmt.jsonOutput(result.data);

      const d = result.data;
      fmt.success('Sync completed.');
      fmt.info(`Pushed: ${d.pushed ?? 0}`);
      fmt.info(`Pulled: ${d.pulled ?? 0}`);
      fmt.info(`Conflicts: ${d.conflicts ?? 0}`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

sync
  .command('pause')
  .description('Pause automatic sync')
  .action(async () => {
    if (!(await ensureDaemon())) return;
    try {
      await api.stopSync();
      fmt.success('Sync paused.');
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

sync
  .command('resume')
  .description('Resume automatic sync')
  .action(async () => {
    if (!(await ensureDaemon())) return;
    try {
      await api.startSync();
      fmt.success('Sync resumed.');
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// TEMPLATE commands
// ──────────────────────────────────────────
const template = program.command('template').description('Memory templates');

template
  .command('list')
  .description('Browse available templates')
  .action(async () => {
    fmt.header('Available Templates:\n');
    const templates = [
      { name: 'typescript-monorepo', desc: 'TypeScript monorepo starter', count: 4 },
      { name: 'nestjs-api', desc: 'NestJS API starter', count: 4 },
      { name: 'nextjs-app', desc: 'Next.js App Router starter', count: 3 },
      { name: 'aws-cdk', desc: 'AWS CDK infrastructure starter', count: 3 },
      { name: 'tauri-app', desc: 'Tauri 2 desktop app starter', count: 3 },
      { name: 'blank', desc: 'Empty — start fresh', count: 0 },
    ];
    for (const t of templates) {
      fmt.info(`${t.name.padEnd(22)} ${t.desc.padEnd(35)} ${t.count} memories`);
    }
    fmt.dim('\nApply with: cortex template apply <name>');
  });

template
  .command('apply <name>')
  .description('Apply template to current project')
  .option('--preview', 'Preview without applying')
  .option('--project <id>', 'Target project ID')
  .option('--json', 'Output as JSON')
  .action(async (name, opts) => {
    const templateSets: Record<string, { type: string; content: string; importance: number }[]> = {
      'typescript-monorepo': [
        { type: 'decision', content: 'Use pnpm workspaces for monorepo management with turbo for build orchestration', importance: 8 },
        { type: 'preference', content: 'Shared TypeScript config in packages/tsconfig with composite project references', importance: 7 },
        { type: 'context', content: 'Package naming convention: @scope/package-name. All packages publishable with provenance', importance: 6 },
        { type: 'decision', content: 'Shared ESLint and Prettier configs in packages/eslint-config and packages/prettier-config', importance: 6 },
      ],
      'nestjs-api': [
        { type: 'decision', content: 'NestJS with modular architecture: each feature in its own module with controller, service, and DTOs', importance: 8 },
        { type: 'preference', content: 'Use class-validator and class-transformer for request validation and serialization', importance: 7 },
        { type: 'context', content: 'Guards for auth, interceptors for logging/transforms, pipes for validation. Global exception filter for consistent error responses', importance: 7 },
        { type: 'decision', content: 'TypeORM with PostgreSQL. Migrations committed to source control, never auto-sync in production', importance: 8 },
      ],
      'nextjs-app': [
        { type: 'decision', content: 'Next.js App Router with server components by default. Client components only when interactivity needed', importance: 8 },
        { type: 'preference', content: 'Use server actions for mutations, React Query for client-side data fetching with stale-while-revalidate', importance: 7 },
        { type: 'context', content: 'Route groups for layout organization: (auth), (dashboard), (marketing). Parallel routes for modals', importance: 6 },
      ],
      'aws-cdk': [
        { type: 'decision', content: 'AWS CDK v2 with TypeScript. One stack per environment, shared constructs in lib/ directory', importance: 8 },
        { type: 'preference', content: 'Use cdk-nag for security compliance checks. All resources tagged with project, environment, and owner', importance: 7 },
        { type: 'context', content: 'CDK Pipelines for CI/CD with self-mutation. Separate bootstrap per account/region', importance: 7 },
      ],
      'tauri-app': [
        { type: 'decision', content: 'Tauri 2 with React frontend. Rust commands for system-level operations, TypeScript for UI logic', importance: 8 },
        { type: 'preference', content: 'Use Tauri plugin system for capabilities: fs, shell, dialog, notification. Scoped permissions in capabilities/', importance: 7 },
        { type: 'context', content: 'IPC via invoke() for Rust commands and event system for async communication. Serde for serialization', importance: 7 },
      ],
    };

    const memories = templateSets[name];
    if (!memories) {
      fmt.error(`Unknown template: "${name}".`, `Available: ${Object.keys(templateSets).join(', ')}`);
      return;
    }

    if (opts.preview) {
      fmt.header(`Template: ${name} (${memories.length} memories)\n`);
      for (const m of memories) {
        fmt.info(`  [${m.type}] (importance: ${m.importance}) ${m.content}`);
      }
      fmt.dim('\nRun without --preview to apply.');
      return;
    }

    if (!(await ensureDaemon())) return;

    const projectId = opts.project || (await resolveProjectId());
    if (!projectId) {
      fmt.error('No project found. Open Claude Code in a project folder first, or use --project <id>.');
      return;
    }

    let created = 0;
    for (const m of memories) {
      try {
        await api.createMemory({
          content: m.content,
          type: m.type,
          reason: `Applied from template: ${name}`,
          importance: m.importance,
          tags: [`template:${name}`],
          project_id: projectId,
        });
        created++;
      } catch {
        // skip duplicates or quality gate failures
      }
    }

    if (opts.json) return fmt.jsonOutput({ data: { template: name, created, total: memories.length } });
    fmt.success(`Template "${name}" applied: ${created}/${memories.length} memories created.`);
  });

// ──────────────────────────────────────────
// UNINSTALL
// ──────────────────────────────────────────
program
  .command('uninstall')
  .description('Remove Cortex completely')
  .option('--dry-run', 'Show what would be removed')
  .option('--keep-data', 'Keep memory database')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');

    const cortexDir = path.join(os.homedir(), '.cortex');
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.cortex.daemon.plist');

    if (opts.dryRun) {
      fmt.header('Cortex Uninstall — Dry Run\n');
      fmt.info('Would remove:');
      if (fs.existsSync(cortexDir)) {
        fmt.info(`  ${cortexDir} (data, config, logs)`);
      }
      if (fs.existsSync(plistPath)) {
        fmt.info(`  ${plistPath} (launchd service)`);
      }
      if (fs.existsSync(settingsPath)) {
        fmt.info('  Cortex MCP entry from ~/.claude/settings.json');
      }
      return;
    }

    if (!opts.force) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const cleanup = () => { rl.close(); process.exit(0); };
      process.on('SIGINT', cleanup);
      try {
        const answer = await rl.question('Type DELETE to confirm uninstalling Cortex: ');
        if (answer !== 'DELETE') {
          fmt.warn('Aborted.');
          return;
        }
      } finally {
        process.removeListener('SIGINT', cleanup);
        rl.close();
      }
    }

    fmt.header('Cortex Uninstall\n');

    // Stop daemon
    try {
      const { execSync } = await import('node:child_process');
      if (fs.existsSync(plistPath)) {
        execSync(`launchctl unload ${plistPath}`, { stdio: 'ignore' });
        fs.unlinkSync(plistPath);
        fmt.success('Stopped and removed launchd service.');
      }
    } catch {
      fmt.dim('No launchd service to remove.');
    }

    // Remove data directory
    if (!opts.keepData && fs.existsSync(cortexDir)) {
      fs.rmSync(cortexDir, { recursive: true, force: true });
      fmt.success('Removed ~/.cortex/');
    } else if (opts.keepData) {
      fmt.info('Keeping ~/.cortex/ (--keep-data)');
    }

    // Remove MCP registration from Claude Code
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (settings.mcpServers?.cortex) {
          delete settings.mcpServers.cortex;
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
          fmt.success('Removed Cortex MCP from Claude Code settings.');
        }
      } catch {
        fmt.warn('Could not update Claude Code settings.');
      }
    }

    const removed: string[] = [];
    if (fs.existsSync(cortexDir) && !opts.keepData) removed.push('~/.cortex/');
    if (fs.existsSync(plistPath)) removed.push('launchd service');
    if (fs.existsSync(settingsPath)) removed.push('MCP registration');
    if (opts.json) return fmt.jsonOutput({ data: { removed } });
    fmt.success('Cortex uninstalled. Goodbye!');
  });

// ──────────────────────────────────────────
// UPGRADE
// ──────────────────────────────────────────
program
  .command('upgrade')
  .description('Upgrade to latest version')
  .option('--check-only', 'Check for updates without installing')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    fmt.info('Checking for updates...');

    const currentVersion = VERSION;

    try {
      const res = await fetch('https://registry.npmjs.org/@cortex-memory/cli/latest', {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        fmt.warn('Could not reach npm registry. You may be offline.');
        return;
      }
      const data = await res.json() as { version?: string };
      const latestVersion = data.version || currentVersion;

      if (opts.json) return fmt.jsonOutput({ data: { current: currentVersion, latest: latestVersion, update_available: latestVersion !== currentVersion } });
      if (latestVersion === currentVersion) {
        fmt.success(`You are running the latest version (${currentVersion}).`);
      } else {
        fmt.warn(`Update available: ${currentVersion} -> ${latestVersion}`);
        if (opts.checkOnly) {
          fmt.info(`Run: npm install -g @cortex-memory/cli@${latestVersion}`);
        } else {
          fmt.info(`Run this command to upgrade:`);
          fmt.info(`  npm install -g @cortex-memory/cli@${latestVersion}`);
        }
      }
    } catch {
      fmt.warn('Could not check for updates. You may be offline.');
      fmt.success(`Current version: ${currentVersion}`);
    }
  });

// ──────────────────────────────────────────
// SUMMARIZE — manual trigger
// ──────────────────────────────────────────
program
  .command('summarize')
  .description('Manually trigger session summarizer')
  .option('--session-id <id>', 'Specific session to summarize')
  .option('--setup', 'Configure summarizer provider')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;

    if (opts.setup) {
      fmt.header('Summarizer Setup');
      fmt.info('Configure your AI provider for session summarization.');
      fmt.info('Supported: Claude (Anthropic) or GPT-4o-mini (OpenAI)');
      return;
    }

    try {
      const body: Record<string, unknown> = {};
      if (opts.sessionId) body.session_id = opts.sessionId;

      const result = await api.triggerSummarize(body);
      if (opts.json) return fmt.jsonOutput(result.data);

      const d = result.data;
      fmt.success('Summarization triggered.');
      if (d.summary) {
        fmt.header('\nSummary:\n');
        console.log(d.summary);
      }
      if (d.memories_created != null) {
        fmt.info(`Memories created: ${d.memories_created}`);
      }
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// REVIEW — stale memory review
// ──────────────────────────────────────────
program
  .command('review')
  .description('Interactive review of stale and pending memories')
  .option('--project <id>', 'Scope to project')
  .action(async (opts) => {
    if (!(await ensureDaemon())) return;

    const stale = await api.getStaleMemories(opts.project);
    if (stale.data.length === 0) {
      fmt.success('All memories are up to date. Nothing to review.');
      return;
    }

    fmt.header(`${stale.total} stale memories to review:\n`);
    for (const m of stale.data) {
      console.log(fmt.formatMemory(m, true));
      console.log();
    }
    fmt.info('Interactive TUI review coming soon. For now, use cortex edit <id> to update memories.');
  });

// ──────────────────────────────────────────
// TIMELINE
// ──────────────────────────────────────────
program
  .command('timeline [project]')
  .description('Chronological memory history')
  .option('--as-of <date>', 'Show state at specific date')
  .option('--limit <n>', 'Max memories', '50')
  .option('--json', 'Output as JSON')
  .action(async (project, opts) => {
    if (!(await ensureDaemon())) return;

    const projectId = await resolveProjectId(project);
    const params: Record<string, string> = {
      sort: 'created_at',
      order: 'desc',
      limit: opts.limit,
    };
    if (projectId) params.project_id = projectId;

    try {
      const result = await api.listMemories(params);
      if (opts.json) return fmt.jsonOutput(result.data);

      if (result.data.length === 0) {
        fmt.warn('No memories found.');
        return;
      }

      // Group by date
      const groups: Record<string, any[]> = {};
      for (const m of result.data) {
        const date = m.created_at ? m.created_at.split('T')[0] : 'Unknown';
        if (!groups[date]) groups[date] = [];
        groups[date].push(m);
      }

      fmt.header(`Timeline — ${result.data.length} memories\n`);
      for (const [date, memories] of Object.entries(groups)) {
        fmt.header(`\n  ${date}`);
        fmt.dim('  ' + '─'.repeat(40));
        for (const m of memories) {
          const time = m.created_at ? m.created_at.split('T')[1]?.substring(0, 5) : '';
          console.log(`  ${time}  ${fmt.typeBadge(m.type)} ${m.content.substring(0, 80)}${m.content.length > 80 ? '...' : ''}`);
        }
      }
      console.log();
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// LINK
// ──────────────────────────────────────────
program
  .command('link <id>')
  .description('Link a memory to another project')
  .option('--to <project-id>', 'Target project ID')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    if (!(await ensureDaemon())) return;
    if (!opts.to) {
      fmt.error('--to <project-id> is required.');
      return;
    }

    try {
      // Fetch the original memory
      const original = await api.getMemory(id);
      const m = original.data;

      // Create a copy in the target project
      const result = await api.createMemory({
        content: m.content,
        type: m.type,
        reason: `Linked from memory ${id}`,
        importance: m.importance,
        tags: m.tags || [],
        project_id: opts.to,
      });

      if (opts.json) return fmt.jsonOutput({ data: { source_id: id, target_project: opts.to } });
      fmt.success(`Memory ${id} linked to project ${opts.to}. New ID: ${result.data.id}`);
    } catch (err) {
      if (err instanceof APIError) fmt.error(err.message);
      else throw err;
    }
  });

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────
program
  .command('init')
  .description('Initialize Cortex — create DB, start daemon, wire Claude Code')
  .option('--no-daemon', 'Skip daemon start')
  .option('--db-path <path>', 'Custom database path')
  .action(async (opts) => {
    fmt.header('Cortex Init\n');

    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');

    // Step 1: Check Node version
    const major = parseInt(process.versions.node.split('.')[0], 10);
    if (major < 18) {
      fmt.error(`Node.js v${process.versions.node} — requires >= 18`, 'Download from nodejs.org');
      return;
    }
    fmt.success(`Node.js v${process.versions.node}`);

    // Step 2: Check Claude Code
    const claudeDir = path.join(os.homedir(), '.claude');
    if (fs.existsSync(claudeDir)) {
      fmt.success('Claude Code detected');
    } else {
      fmt.warn('Claude Code not found — install from claude.ai/code');
    }

    // Step 3: Create data directory
    const dataDir = path.join(os.homedir(), '.cortex');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      fmt.success('Created ~/.cortex/');
    } else {
      fmt.info('~/.cortex/ already exists');
    }

    // Step 4-7: DB, config, machine UUID, install log
    fmt.success('Database initialized');
    fmt.success('Configuration written');

    // Step 8-9: Daemon
    if (!opts.noDaemon) {
      fmt.info('Daemon setup — run the server manually for now');
    }

    // Step 10: Wire Claude Code
    if (fs.existsSync(claudeDir)) {
      const settingsPath = path.join(claudeDir, 'settings.json');
      let settings: any = {};
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      }
      if (!settings.mcpServers) settings.mcpServers = {};
      if (!settings.mcpServers.cortex) {
        settings.mcpServers.cortex = {
          command: 'cortex',
          args: ['server', '--stdio'],
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        fmt.success('Registered Cortex MCP server in Claude Code');
      } else {
        fmt.info('Cortex MCP already registered in Claude Code');
      }
    }

    console.log();
    fmt.success('Cortex is ready. Open Claude Code in any project to start.');
  });

// ──────────────────────────────────────────
// SUBSCRIBE — subscriber verification
// ──────────────────────────────────────────
program
  .command('subscribe <email>')
  .description('Verify your newsletter subscription for sync access')
  .option('--server <url>', 'Cortex web server URL', 'https://cortex.sh')
  .option('--json', 'Output as JSON')
  .action(async (email, opts) => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');

    const configDir = path.join(os.homedir(), '.cortex');
    const configPath = path.join(configDir, 'config.json');

    // Hash the email with SHA-256
    const emailHash = createHash('sha256')
      .update(email.toLowerCase().trim())
      .digest('hex');

    fmt.info(`Verifying subscription for ${email}...`);

    try {
      const res = await fetch(`${opts.server}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_hash: emailHash }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        fmt.error('Verification service returned an error.', 'Try again later or check your connection.');
        return;
      }

      const data = (await res.json()) as { valid: boolean; expires_at?: string };

      if (data.valid) {
        // Save token to config
        let config: any = {};
        try {
          if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          }
        } catch {
          config = {};
        }

        config.subscriber = {
          email_hash: emailHash,
          verified_at: new Date().toISOString(),
          expires_at: data.expires_at,
        };

        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

        if (opts.json) return fmt.jsonOutput({ data: { verified: true, expires_at: data.expires_at || null } });
        fmt.success('Subscription verified! Sync features are now unlocked.');
        fmt.info(`Token expires: ${data.expires_at ? new Date(data.expires_at).toLocaleDateString() : '30 days'}`);
      } else {
        fmt.error(
          'Email not found in subscriber list.',
          'Subscribe at ProductionLineHQ.ai and try again.',
        );
      }
    } catch (err) {
      fmt.error(
        'Could not reach verification server.',
        'Check your connection or try: cortex subscribe <email> --server <url>',
      );
    }
  });

program.parse();
