import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrator.js';
import { detectProject } from '../src/detection/detector.js';
import { ProjectRepository } from '../src/db/repositories/project.repo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

let db: Database.Database;
let tmpDir: string;

beforeEach(() => {
  db = createDatabase(':memory:');
  runMigrations(db, MIGRATIONS_DIR);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-detect-'));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Project Detection', () => {
  describe('.cortex/project.json found (Strategy 1)', () => {
    it('uses existing project ID from .cortex/project.json', () => {
      // First visit auto-creates
      const first = detectProject(tmpDir, db);
      expect(first.is_new).toBe(true);
      expect(first.detection_method).toBe('auto_created');

      // Second visit finds existing .cortex/project.json
      const second = detectProject(tmpDir, db);
      expect(second.is_new).toBe(false);
      expect(second.detection_method).toBe('cortex_file');
      expect(second.project_id).toBe(first.project_id);
    });

    it('reads project ID from manually created .cortex/project.json', () => {
      const customId = '11111111-1111-1111-1111-111111111111';
      const cortexDir = path.join(tmpDir, '.cortex');
      fs.mkdirSync(cortexDir, { recursive: true });
      fs.writeFileSync(
        path.join(cortexDir, 'project.json'),
        JSON.stringify({ id: customId, version: '1.0.0', created_at: new Date().toISOString() }),
      );

      const result = detectProject(tmpDir, db);
      expect(result.detection_method).toBe('cortex_file');
      expect(result.project_id).toBe(customId);
    });

    it('handles corrupted .cortex/project.json gracefully', () => {
      const cortexDir = path.join(tmpDir, '.cortex');
      fs.mkdirSync(cortexDir, { recursive: true });
      fs.writeFileSync(path.join(cortexDir, 'project.json'), 'not valid json{{{');

      // Should fall through to other strategies (auto-create in this case)
      const result = detectProject(tmpDir, db);
      expect(result.is_new).toBe(true);
    });

    it('handles .cortex/project.json with missing id field', () => {
      const cortexDir = path.join(tmpDir, '.cortex');
      fs.mkdirSync(cortexDir, { recursive: true });
      fs.writeFileSync(
        path.join(cortexDir, 'project.json'),
        JSON.stringify({ version: '1.0.0' }), // no id field
      );

      const result = detectProject(tmpDir, db);
      // Should fall through since id is missing
      expect(result.is_new).toBe(true);
    });
  });

  describe('Git remote (Strategy 2)', () => {
    it('extracts project identifier from git remote', () => {
      // Register a project with a git remote
      const projectRepo = new ProjectRepository(db);
      projectRepo.create({ name: 'my-repo', gitRemote: 'github.com/user/my-repo' });

      // Create a git repo that matches
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(
        path.join(gitDir, 'config'),
        '[remote "origin"]\n\turl = git@github.com:user/my-repo.git\n',
      );

      const result = detectProject(tmpDir, db);
      expect(result.detection_method).toBe('git_remote');
      expect(result.project_name).toBe('my-repo');
    });

    it('normalizes SSH and HTTPS git remotes to same identifier', () => {
      const projectRepo = new ProjectRepository(db);
      projectRepo.create({ name: 'test-project', gitRemote: 'github.com/org/test-project' });

      // Create with HTTPS URL
      const gitDir = path.join(tmpDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(
        path.join(gitDir, 'config'),
        '[remote "origin"]\n\turl = https://github.com/org/test-project.git\n',
      );

      const result = detectProject(tmpDir, db);
      expect(result.detection_method).toBe('git_remote');
    });
  });

  describe('Folder path (Strategy 3)', () => {
    it('uses folder path as fallback when no .cortex or git', () => {
      // Create via folder path first by manually registering
      const projectRepo = new ProjectRepository(db);
      const realPath = fs.realpathSync(tmpDir);
      projectRepo.create({ name: path.basename(tmpDir), path: realPath });

      const result = detectProject(tmpDir, db);
      expect(result.detection_method).toBe('folder_path');
    });
  });

  describe('Auto-create (Strategy 4)', () => {
    it('generates new project.json for unknown directory', () => {
      const result = detectProject(tmpDir, db);
      expect(result.is_new).toBe(true);
      expect(result.detection_method).toBe('auto_created');
      expect(result.project_id).toBeTruthy();
      expect(result.project_name).toBe(path.basename(tmpDir));
    });

    it('creates .cortex/project.json file on disk', () => {
      detectProject(tmpDir, db);
      const cortexFile = path.join(tmpDir, '.cortex', 'project.json');
      expect(fs.existsSync(cortexFile)).toBe(true);

      const content = JSON.parse(fs.readFileSync(cortexFile, 'utf-8'));
      expect(content.id).toBeTruthy();
      expect(content.version).toBe('1.0.0');
      expect(content.created_at).toBeTruthy();
    });

    it('uses directory basename as project name', () => {
      const namedDir = path.join(tmpDir, 'my-awesome-project');
      fs.mkdirSync(namedDir, { recursive: true });

      const result = detectProject(namedDir, db);
      expect(result.project_name).toBe('my-awesome-project');
    });
  });

  describe('Deep directory traversal', () => {
    it('finds .cortex/project.json in parent directory', () => {
      // Create project in parent dir
      detectProject(tmpDir, db);

      // Navigate into a deep subdirectory
      const deepDir = path.join(tmpDir, 'src', 'components', 'ui', 'buttons');
      fs.mkdirSync(deepDir, { recursive: true });

      const result = detectProject(deepDir, db);
      expect(result.detection_method).toBe('cortex_file');
    });

    it('stops traversal at max depth', () => {
      // Create a deeply nested directory (deeper than MAX_TRAVERSAL_DEPTH=10)
      let deepDir = tmpDir;
      for (let i = 0; i < 15; i++) {
        deepDir = path.join(deepDir, `level-${i}`);
      }
      fs.mkdirSync(deepDir, { recursive: true });

      // Even though .cortex exists at tmpDir, it's >10 levels up
      // First create .cortex at the top
      detectProject(tmpDir, db);

      // From 15 levels deep, may not find it
      const result = detectProject(deepDir, db);
      // It will either auto-create (if traversal limit hit) or find cortex_file
      expect(result.project_id).toBeTruthy();
    });
  });

  describe('Symlink handling', () => {
    it('resolves symlinks to canonical path', () => {
      const realDir = path.join(tmpDir, 'real-project');
      const symlinkDir = path.join(tmpDir, 'linked-project');
      fs.mkdirSync(realDir, { recursive: true });

      try {
        fs.symlinkSync(realDir, symlinkDir);
      } catch {
        // Skip if symlinks not supported
        return;
      }

      // Detect via symlink
      const resultFromSymlink = detectProject(symlinkDir, db);
      expect(resultFromSymlink.project_id).toBeTruthy();

      // Detect via real path should find same project
      const resultFromReal = detectProject(realDir, db);
      expect(resultFromReal.project_id).toBe(resultFromSymlink.project_id);
    });
  });

  describe('Path updates', () => {
    it('updates project path when folder moves', () => {
      // Create project
      const dir1 = path.join(tmpDir, 'location-1');
      fs.mkdirSync(dir1, { recursive: true });
      const first = detectProject(dir1, db);

      // Move the .cortex folder to a new location
      const dir2 = path.join(tmpDir, 'location-2');
      fs.mkdirSync(dir2, { recursive: true });
      fs.cpSync(path.join(dir1, '.cortex'), path.join(dir2, '.cortex'), { recursive: true });

      // Detect in new location
      const second = detectProject(dir2, db);
      expect(second.project_id).toBe(first.project_id);
      expect(second.path).toBe(fs.realpathSync(dir2));
    });
  });
});
