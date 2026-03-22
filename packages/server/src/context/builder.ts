import type Database from 'better-sqlite3';
import type { Memory, MemoryWithScore } from '@cortex/shared';
import { formatAge, estimateTokens, truncate, MS_PER_DAY } from '@cortex/shared';
import { MemoryRepository } from '../db/repositories/memory.repo.js';
import { ProjectRepository } from '../db/repositories/project.repo.js';
import { SessionRepository } from '../db/repositories/session.repo.js';

/**
 * Memory ranking algorithm.
 * Score = (importance x 0.5) + (confidence x 0.3) + (recency_decay x 0.2)
 * Stale memories (>90d unreviewed) = score halved.
 */
function scoreMemory(memory: Memory): number {
  const importance = memory.importance / 10; // Normalize to 0-1
  const confidence = memory.confidence / 5; // Normalize to 0-1

  const daysOld = (Date.now() - new Date(memory.created_at).getTime()) / MS_PER_DAY;
  const recencyDecay = Math.max(0, 1 - daysOld * 0.033); // ~30 days to full decay

  let score = importance * 0.5 + confidence * 0.3 + recencyDecay * 0.2;

  // Stale memories (>90d unreviewed) get halved
  if (!memory.reviewed_at) {
    if (daysOld > 90) {
      score *= 0.5;
    }
  }

  return score;
}

/**
 * Build the structured context injection block for a project.
 *
 * Format:
 * === CORTEX MEMORY — {project} ===
 * LAST SESSION: Xd ago · N memories · T tokens
 * WHAT'S NEW: [recent decisions/resolved threads]
 * OPEN: [unresolved threads]
 * DECISIONS: [key decisions]
 * PREFERENCES: [user preferences]
 * === END CORTEX MEMORY ===
 */
export function buildContextBlock(
  db: Database.Database,
  projectId: string,
  tokenBudget?: number,
): { contextBlock: string; memoryCount: number; tokenCount: number } {
  const projectRepo = new ProjectRepository(db);
  const memRepo = new MemoryRepository(db);
  const sessionRepo = new SessionRepository(db);

  const project = projectRepo.getById(projectId);
  if (!project) {
    return { contextBlock: '', memoryCount: 0, tokenCount: 0 };
  }

  const budget = tokenBudget ?? project.context_budget ?? 4000;

  // Get all active, non-superseded memories
  const allMemories = memRepo.getForInjection(projectId, budget);

  // Score and sort
  const scored: MemoryWithScore[] = allMemories.map((m) => ({
    ...m,
    score: scoreMemory(m),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Get linked memories from other projects
  const linkedMemories = memRepo.getLinkedMemories(projectId);

  // Get last session info
  const lastSession = sessionRepo.getLatest(projectId);
  const lastSessionAge = lastSession
    ? formatAge(lastSession.started_at)
    : 'never';

  // Build sections
  const sections: string[] = [];

  // Header
  sections.push(`=== CORTEX MEMORY — ${project.name} ===`);
  sections.push(
    `LAST SESSION: ${lastSessionAge} · ${allMemories.length} memories · ${budget} token budget`,
  );
  sections.push('');

  // What's new — recent memories (last 7 days)
  const recent = scored.filter((m) => {
    const daysOld = (Date.now() - new Date(m.created_at).getTime()) / MS_PER_DAY;
    return daysOld <= 7;
  });
  if (recent.length > 0) {
    sections.push("WHAT'S NEW:");
    for (const m of recent.slice(0, 5)) {
      sections.push(`· [${m.type}] ${truncate(m.content, 120)}`);
    }
    sections.push('');
  }

  // Open threads
  const openThreads = scored.filter(
    (m) => m.type === 'thread' && !m.expires_at,
  );
  if (openThreads.length > 0) {
    sections.push('OPEN THREADS:');
    for (const m of openThreads.slice(0, 5)) {
      sections.push(`· ${truncate(m.content, 120)}`);
    }
    sections.push('');
  }

  // Decisions
  const decisions = scored.filter((m) => m.type === 'decision');
  if (decisions.length > 0) {
    sections.push('DECISIONS:');
    for (const m of decisions.slice(0, 8)) {
      sections.push(`· ${truncate(m.content, 120)}`);
    }
    sections.push('');
  }

  // Preferences
  const preferences = scored.filter((m) => m.type === 'preference');
  if (preferences.length > 0) {
    sections.push('PREFERENCES:');
    for (const m of preferences.slice(0, 5)) {
      sections.push(`· ${truncate(m.content, 120)}`);
    }
    sections.push('');
  }

  // Linked memories from other projects
  if (linkedMemories.length > 0) {
    sections.push('LINKED FROM OTHER PROJECTS:');
    for (const m of linkedMemories.slice(0, 3)) {
      sections.push(
        `· [LINKED FROM: ${m.linked_from_project}] [${m.type}] ${truncate(m.content, 100)}`,
      );
    }
    sections.push('');
  }

  sections.push('=== END CORTEX MEMORY ===');

  let contextBlock = sections.join('\n');

  // Trim to token budget
  let tokens = estimateTokens(contextBlock);
  while (tokens > budget && sections.length > 3) {
    // Remove sections from the bottom (before footer)
    sections.splice(sections.length - 2, 1);
    contextBlock = sections.join('\n');
    tokens = estimateTokens(contextBlock);
  }

  return {
    contextBlock,
    memoryCount: allMemories.length,
    tokenCount: estimateTokens(contextBlock),
  };
}

