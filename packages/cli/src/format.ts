import chalk from 'chalk';

/**
 * CLI design language:
 * ✓ green = success
 * ⚡ yellow = warning
 * ✗ red = error with fix always shown
 */

/** Print a green success message with checkmark prefix. */
export const success = (msg: string): void => console.log(chalk.green('✓'), msg);

/** Print a yellow warning message with lightning prefix. */
export const warn = (msg: string): void => console.log(chalk.yellow('⚡'), msg);

/** Print a red error message with X prefix and optional fix instructions. */
export const error = (msg: string, fix?: string): void => {
  console.error(chalk.red('✗'), msg);
  if (fix) console.error(chalk.dim(`  Fix: ${fix}`));
};

/** Print a dimmed informational message with dot prefix. */
export const info = (msg: string): void => console.log(chalk.dim('·'), msg);

/** Print a bold header message. */
export const header = (msg: string): void => console.log(chalk.bold(msg));

/** Print a dimmed message. */
export const dim = (msg: string): void => console.log(chalk.dim(msg));

/** Format a timestamp as relative age */
export function formatAge(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const ms = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/** Type badge with color */
export function typeBadge(type: string): string {
  const colors: Record<string, (s: string) => string> = {
    decision: chalk.magenta,
    context: chalk.cyan,
    preference: chalk.yellow,
    thread: chalk.red,
    error: chalk.redBright,
    learning: chalk.green,
  };
  const colorFn = colors[type] || chalk.white;
  return colorFn(`[${type}]`);
}

/** Format a memory for display */
export function formatMemory(memory: any, verbose = false): string {
  const lines: string[] = [];
  const badge = typeBadge(memory.type);
  const importance = chalk.dim(`importance:${memory.importance}`);
  const age = chalk.dim(formatAge(memory.created_at));

  lines.push(`${badge} ${importance} ${age}`);
  lines.push(`  ${memory.content}`);

  if (memory.tags && memory.tags.length > 0) {
    lines.push(`  ${chalk.dim('tags:')} ${memory.tags.map((t: string) => chalk.dim(`#${t}`)).join(' ')}`);
  }

  if (verbose) {
    lines.push(`  ${chalk.dim('id:')} ${memory.id}`);
    lines.push(`  ${chalk.dim('reason:')} ${memory.reason}`);
    if (memory.superseded_by) {
      lines.push(`  ${chalk.dim('superseded_by:')} ${memory.superseded_by}`);
    }
  }

  return lines.join('\n');
}

/** Format project for display */
export function formatProject(project: any): string {
  const count = project.memory_count ?? 0;
  const age = formatAge(project.last_session_at);
  return `  ${chalk.bold(project.name)} ${chalk.dim(`(${count} memories)`)} — last session: ${chalk.dim(age)}`;
}

/** JSON output mode — pass through for --json flag */
export function jsonOutput(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
