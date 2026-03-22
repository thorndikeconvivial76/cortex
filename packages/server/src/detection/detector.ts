import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuid } from 'uuid';
import type { ProjectDetectionResult, CortexProjectFile } from '@cortex/shared';
import { ProjectRepository } from '../db/repositories/project.repo.js';
import type Database from 'better-sqlite3';

const MAX_TRAVERSAL_DEPTH = 10;
const CORTEX_DIR = '.cortex';
const CORTEX_PROJECT_FILE = 'project.json';

/**
 * 4-layer project detection strategy:
 * 1. .cortex/project.json (traverse up to home dir, max 10 levels)
 * 2. Git remote URL from .git/config
 * 3. Folder path (canonicalized)
 * 4. Auto-create .cortex/project.json with new UUID
 */
export function detectProject(
  cwd: string,
  db: Database.Database,
): ProjectDetectionResult {
  const projectRepo = new ProjectRepository(db);
  const homeDir = os.homedir();

  // Canonicalize the path
  let realCwd: string;
  try {
    realCwd = fs.realpathSync(cwd);
  } catch {
    realCwd = cwd;
  }

  // Strategy 1: .cortex/project.json
  const cortexFile = findCortexFile(realCwd, homeDir);
  if (cortexFile) {
    const projectFile = readCortexProjectFile(cortexFile);
    if (projectFile) {
      let project = projectRepo.getById(projectFile.id);
      if (!project) {
        // Known .cortex file but project not in DB — register it
        const name = extractProjectName(realCwd);
        const gitRemote = findGitRemote(realCwd, homeDir);
        project = projectRepo.create({
          name,
          path: realCwd,
          gitRemote: gitRemote ?? undefined,
        });
        // Update with the existing ID from the file
        db.prepare('UPDATE projects SET id = ? WHERE id = ?').run(projectFile.id, project.id);
        project = projectRepo.getById(projectFile.id)!;
      } else {
        // Update path if it changed (folder moved)
        if (project.path !== realCwd) {
          projectRepo.update(project.id, { path: realCwd });
        }
      }
      projectRepo.touchSession(project.id);
      return {
        project_id: project.id,
        project_name: project.name,
        detection_method: 'cortex_file',
        path: realCwd,
        git_remote: project.git_remote,
        is_new: false,
      };
    }
  }

  // Strategy 2: Git remote URL
  const gitRemote = findGitRemote(realCwd, homeDir);
  if (gitRemote) {
    const project = projectRepo.findByGitRemote(gitRemote);
    if (project) {
      if (project.path !== realCwd) {
        projectRepo.update(project.id, { path: realCwd });
      }
      projectRepo.touchSession(project.id);
      return {
        project_id: project.id,
        project_name: project.name,
        detection_method: 'git_remote',
        path: realCwd,
        git_remote: gitRemote,
        is_new: false,
      };
    }
  }

  // Strategy 3: Folder path
  const existingByPath = projectRepo.findByPath(realCwd);
  if (existingByPath) {
    projectRepo.touchSession(existingByPath.id);
    return {
      project_id: existingByPath.id,
      project_name: existingByPath.name,
      detection_method: 'folder_path',
      path: realCwd,
      git_remote: existingByPath.git_remote,
      is_new: false,
    };
  }

  // Strategy 4: Auto-create
  const projectName = extractProjectName(realCwd);
  const newProject = projectRepo.create({
    name: projectName,
    path: realCwd,
    gitRemote: gitRemote ?? undefined,
  });

  // Create .cortex/project.json
  createCortexProjectFile(realCwd, newProject.id);

  projectRepo.touchSession(newProject.id);

  return {
    project_id: newProject.id,
    project_name: newProject.name,
    detection_method: 'auto_created',
    path: realCwd,
    git_remote: gitRemote,
    is_new: true,
  };
}

/**
 * Walk up directory tree looking for .cortex/project.json.
 * Stops at home directory or after MAX_TRAVERSAL_DEPTH levels.
 */
function findCortexFile(startDir: string, homeDir: string): string | null {
  let dir = startDir;
  let depth = 0;

  while (depth < MAX_TRAVERSAL_DEPTH) {
    const cortexPath = path.join(dir, CORTEX_DIR, CORTEX_PROJECT_FILE);
    if (fs.existsSync(cortexPath)) {
      return cortexPath;
    }

    // Stop at home directory
    if (dir === homeDir || dir === path.parse(dir).root) {
      break;
    }

    dir = path.dirname(dir);
    depth++;
  }

  return null;
}

/**
 * Read and parse a .cortex/project.json file.
 */
function readCortexProjectFile(filePath: string): CortexProjectFile | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed.id && typeof parsed.id === 'string') {
      return parsed as CortexProjectFile;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a .cortex/project.json file in the project directory.
 * Also adds .cortex/ to .gitignore if it exists.
 */
function createCortexProjectFile(projectDir: string, projectId: string): void {
  const cortexDir = path.join(projectDir, CORTEX_DIR);
  const filePath = path.join(cortexDir, CORTEX_PROJECT_FILE);

  try {
    if (!fs.existsSync(cortexDir)) {
      fs.mkdirSync(cortexDir, { recursive: true });
    }

    const projectFile: CortexProjectFile = {
      id: projectId,
      version: '1.0.0',
      created_at: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(projectFile, null, 2));

    // Add .cortex/ to .gitignore
    addToGitignore(projectDir);
  } catch {
    // Non-critical — detection still works via other strategies
  }
}

/**
 * Add .cortex/ to .gitignore if it exists and doesn't already have it.
 */
function addToGitignore(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes('.cortex/')) {
        fs.appendFileSync(gitignorePath, '\n# Cortex project file\n.cortex/\n');
      }
    }
  } catch {
    // Non-critical
  }
}

/**
 * Find git remote URL by reading .git/config.
 */
function findGitRemote(startDir: string, homeDir: string): string | null {
  let dir = startDir;
  let depth = 0;

  while (depth < MAX_TRAVERSAL_DEPTH) {
    const gitConfigPath = path.join(dir, '.git', 'config');
    if (fs.existsSync(gitConfigPath)) {
      try {
        const config = fs.readFileSync(gitConfigPath, 'utf-8');
        const match = config.match(/\[remote "origin"\]\s*\n\s*url\s*=\s*(.+)/);
        if (match) {
          return normalizeGitRemote(match[1].trim());
        }
      } catch {
        // Can't read git config — continue
      }
    }

    if (dir === homeDir || dir === path.parse(dir).root) {
      break;
    }

    dir = path.dirname(dir);
    depth++;
  }

  return null;
}

/**
 * Normalize git remote URL — strip protocol, .git suffix, and user info.
 */
function normalizeGitRemote(url: string): string {
  return url
    .replace(/^(https?:\/\/|git@|ssh:\/\/[^@]+@)/, '')
    .replace(/\.git$/, '')
    .replace(/:/g, '/');
}

/**
 * Extract a human-readable project name from a directory path.
 */
function extractProjectName(dirPath: string): string {
  return path.basename(dirPath);
}
