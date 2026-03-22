import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrator.js';
import { detectProject } from '../src/detection/detector.js';
import { buildContextBlock } from '../src/context/builder.js';
import { MemoryRepository } from '../src/db/repositories/memory.repo.js';
import { ProjectRepository } from '../src/db/repositories/project.repo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;

beforeEach(() => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
});

afterEach(() => {
  db.close();
});

describe('Project Detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-creates project for new directory (strategy 4)', () => {
    const result = detectProject(tmpDir, db);
    expect(result.is_new).toBe(true);
    expect(result.detection_method).toBe('auto_created');
    expect(result.project_name).toBe(path.basename(tmpDir));
    expect(result.project_id).toBeTruthy();
  });

  it('creates .cortex/project.json on auto-create', () => {
    detectProject(tmpDir, db);
    const cortexFile = path.join(tmpDir, '.cortex', 'project.json');
    expect(fs.existsSync(cortexFile)).toBe(true);

    const content = JSON.parse(fs.readFileSync(cortexFile, 'utf-8'));
    expect(content.id).toBeTruthy();
    expect(content.version).toBe('1.0.0');
  });

  it('detects existing project via .cortex file (strategy 1)', () => {
    // First visit — auto-creates
    const first = detectProject(tmpDir, db);
    expect(first.is_new).toBe(true);

    // Second visit — finds existing
    const second = detectProject(tmpDir, db);
    expect(second.is_new).toBe(false);
    expect(second.detection_method).toBe('cortex_file');
    expect(second.project_id).toBe(first.project_id);
  });

  it('detects project in subdirectory via parent .cortex file', () => {
    // Create project in parent
    detectProject(tmpDir, db);

    // Detect from subdirectory
    const subDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(subDir, { recursive: true });
    const result = detectProject(subDir, db);
    expect(result.detection_method).toBe('cortex_file');
  });

  it('detects project via git remote (strategy 2)', () => {
    // Create a fake git repo
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(
      path.join(gitDir, 'config'),
      '[remote "origin"]\n\turl = git@github.com:kd/test-project.git\n',
    );

    // First visit with git — registers project
    const projectRepo = new ProjectRepository(db);
    projectRepo.create({ name: 'test-project', gitRemote: 'github.com/kd/test-project' });

    // Detect in new directory with same git remote
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-test2-'));
    const gitDir2 = path.join(tmpDir2, '.git');
    fs.mkdirSync(gitDir2, { recursive: true });
    fs.writeFileSync(
      path.join(gitDir2, 'config'),
      '[remote "origin"]\n\turl = git@github.com:kd/test-project.git\n',
    );

    const result = detectProject(tmpDir2, db);
    expect(result.detection_method).toBe('git_remote');
    expect(result.project_name).toBe('test-project');

    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });
});

describe('Context Builder', () => {
  let projectId: string;
  let memRepo: MemoryRepository;

  beforeEach(() => {
    const projectRepo = new ProjectRepository(db);
    const project = projectRepo.create({ name: 'karnyx' });
    projectId = project.id;
    memRepo = new MemoryRepository(db);
  });

  it('returns empty context for project with no memories', () => {
    const { contextBlock, memoryCount } = buildContextBlock(db, projectId);
    expect(contextBlock).toContain('CORTEX MEMORY');
    expect(contextBlock).toContain('karnyx');
    expect(memoryCount).toBe(0);
  });

  it('includes decisions in context block', () => {
    memRepo.create(
      {
        content: 'Using NestJS for the backend API because of its decorator-based architecture and type safety',
        type: 'decision',
        reason: 'Better structure for large applications than Express',
        importance: 8,
      },
      projectId,
    );

    const { contextBlock, memoryCount } = buildContextBlock(db, projectId);
    expect(contextBlock).toContain('DECISIONS:');
    expect(contextBlock).toContain('NestJS');
    expect(memoryCount).toBe(1);
  });

  it('includes preferences in context block', () => {
    memRepo.create(
      {
        content: 'Always use TypeScript strict mode in all packages and configuration files across the project',
        type: 'preference',
        reason: 'Type safety catches bugs early and improves developer experience',
        importance: 9,
      },
      projectId,
    );

    const { contextBlock } = buildContextBlock(db, projectId);
    expect(contextBlock).toContain('PREFERENCES:');
    expect(contextBlock).toContain('TypeScript strict');
  });

  it('includes open threads', () => {
    memRepo.create(
      {
        content: 'Deepgram transcription latency is too high on long-form audio recordings that exceed 30 minutes',
        type: 'thread',
        reason: 'Performance issue discovered during load testing needs investigation',
        importance: 7,
      },
      projectId,
    );

    const { contextBlock } = buildContextBlock(db, projectId);
    expect(contextBlock).toContain('OPEN THREADS:');
    expect(contextBlock).toContain('Deepgram');
  });

  it('includes header and footer markers', () => {
    const { contextBlock } = buildContextBlock(db, projectId);
    expect(contextBlock).toContain('=== CORTEX MEMORY');
    expect(contextBlock).toContain('=== END CORTEX MEMORY ===');
  });

  it('reports token count', () => {
    memRepo.create(
      {
        content: 'A test memory with enough content to generate a reasonable token count for verification',
        type: 'context',
        reason: 'Testing token count estimation in the context builder',
      },
      projectId,
    );

    const { tokenCount } = buildContextBlock(db, projectId);
    expect(tokenCount).toBeGreaterThan(0);
  });
});
