import * as vscode from 'vscode';
import * as http from 'http';

const DAEMON_BASE = () => {
  const port = vscode.workspace.getConfiguration('cortex').get<number>('daemonPort', 7434);
  return `http://127.0.0.1:${port}`;
};

let statusBarItem: vscode.StatusBarItem;
let sseConnection: http.ClientRequest | null = null;
let isDaemonUp = false;
let outputChannel: vscode.OutputChannel | null = null;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Cortex Memory');
  }
  return outputChannel;
}

// Hover result cache: word -> { result, timestamp }
const hoverCache = new Map<string, { result: vscode.Hover | null; timestamp: number }>();
const HOVER_CACHE_TTL = 5000; // 5 seconds
const HOVER_CACHE_MAX_SIZE = 50;

// ── Activation ──

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'cortex.showStatus';
  context.subscriptions.push(statusBarItem);
  updateStatusBar('checking...');

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('cortex.saveMemory', saveMemoryCommand),
    vscode.commands.registerCommand('cortex.searchMemories', searchMemoriesCommand),
    vscode.commands.registerCommand('cortex.showStatus', showStatusCommand),
  );

  // Right-click context menu is handled by contributes.menus in package.json

  // Memory peek — hover provider (with debounce/cache)
  const hoverProvider = vscode.languages.registerHoverProvider('*', {
    async provideHover(document, position) {
      if (!isDaemonUp) return null;

      const range = document.getWordRangeAtPosition(position);
      if (!range) return null;
      const word = document.getText(range);
      if (word.length < 3) return null;

      // Check cache — return cached result if within TTL
      const now = Date.now();
      const cached = hoverCache.get(word);
      if (cached && (now - cached.timestamp) < HOVER_CACHE_TTL) {
        return cached.result;
      }

      try {
        const results = await apiCall<{ data: any[] }>('/api/memories/search', 'POST', {
          query: word,
          limit: 3,
        });

        if (!results.data || results.data.length === 0) {
          hoverCache.set(word, { result: null, timestamp: now });
          evictHoverCache();
          return null;
        }

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.appendMarkdown(`**Cortex Memories** matching "${word}":\n\n`);

        for (const m of results.data) {
          const typeIcon = { decision: '🔷', context: '📋', preference: '⚙️', thread: '🔴', error: '⚠️', learning: '💡' }[m.type] || '·';
          const truncated = m.content.length > 120 ? m.content.slice(0, 117) + '...' : m.content;
          md.appendMarkdown(`${typeIcon} **[${m.type}]** importance:${m.importance}\n\n`);
          md.appendMarkdown(`${truncated}\n\n---\n\n`);
        }

        const hover = new vscode.Hover(md, range);
        hoverCache.set(word, { result: hover, timestamp: now });
        evictHoverCache();
        return hover;
      } catch {
        return null;
      }
    },
  });
  context.subscriptions.push(hoverProvider);

  // Initial health check + SSE
  checkDaemonHealth();
  setInterval(checkDaemonHealth, 30000);
  connectSSE();
}

export function deactivate() {
  if (sseConnection) {
    sseConnection.destroy();
    sseConnection = null;
  }
  outputChannel?.dispose();
  outputChannel = null;
}

// ── Commands ──

async function saveMemoryCommand() {
  if (!isDaemonUp) {
    vscode.window.showWarningMessage('Cortex daemon is not running. Run: cortex doctor --fix');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  let content = '';

  if (editor && !editor.selection.isEmpty) {
    content = editor.document.getText(editor.selection);
  }

  if (!content) {
    content = await vscode.window.showInputBox({
      prompt: 'Memory content',
      placeHolder: 'What should Cortex remember?',
    }) || '';
  }

  if (!content || content.length < 50) {
    vscode.window.showWarningMessage('Memory content must be at least 50 characters.');
    return;
  }

  // Pick type
  const type = await vscode.window.showQuickPick(
    ['decision', 'context', 'preference', 'thread', 'error', 'learning', 'architecture', 'bug', 'workflow', 'snippet', 'documentation', 'pattern'],
    { placeHolder: 'Memory type' },
  );
  if (!type) return;

  // Get project
  const projects = await apiCall<{ data: any[] }>('/api/projects', 'GET');
  if (!projects.data || projects.data.length === 0) {
    vscode.window.showWarningMessage('No Cortex projects found. Open Claude Code first.');
    return;
  }

  const projectId = projects.data[0].id;

  try {
    await apiCall('/api/memories', 'POST', {
      content,
      type,
      reason: 'Saved from VS Code',
      project_id: projectId,
    });
    vscode.window.showInformationMessage(`✓ Memory saved to Cortex [${type}]`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to save: ${(err as Error).message}`);
  }
}

async function searchMemoriesCommand() {
  if (!isDaemonUp) {
    vscode.window.showWarningMessage('Cortex daemon is not running.');
    return;
  }

  const query = await vscode.window.showInputBox({
    prompt: 'Search Cortex memories',
    placeHolder: 'e.g., deepgram latency',
  });
  if (!query) return;

  try {
    const results = await apiCall<{ data: any[] }>('/api/memories/search', 'POST', { query, limit: 20 });

    if (!results.data || results.data.length === 0) {
      vscode.window.showInformationMessage(`No memories found for "${query}"`);
      return;
    }

    const items = results.data.map((m: any) => ({
      label: `[${m.type}] ${m.content.slice(0, 80)}`,
      description: `importance: ${m.importance}`,
      detail: m.content,
      id: m.id,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${results.data.length} results for "${query}"`,
    });

    if (selected) {
      // Show full memory in output channel
      const channel = getOutputChannel();
      channel.clear();
      channel.appendLine(`Type: ${selected.label.split(']')[0]}]`);
      channel.appendLine(`Content: ${selected.detail}`);
      channel.show();
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Search failed: ${(err as Error).message}`);
  }
}

async function showStatusCommand() {
  if (!isDaemonUp) {
    const action = await vscode.window.showWarningMessage(
      'Cortex daemon is not running.',
      'Start Daemon',
    );
    if (action === 'Start Daemon') {
      const terminal = vscode.window.createTerminal('Cortex');
      terminal.sendText('cortex init');
      terminal.show();
    }
    return;
  }

  const health = await apiCall<any>('/api/health', 'GET');
  vscode.window.showInformationMessage(
    `Cortex: ${health.status} | ${health.memory_count} memories | ${health.db_size_mb}MB | v${health.version}`,
  );
}

// ── Health Check ──

async function checkDaemonHealth() {
  try {
    await apiCall('/api/health', 'GET');
    isDaemonUp = true;
    updateStatusBar(`$(brain) Cortex`);
  } catch {
    isDaemonUp = false;
    updateStatusBar(`$(brain) Cortex offline`);
  }
}

function updateStatusBar(text: string) {
  statusBarItem.text = text;
  statusBarItem.tooltip = isDaemonUp ? 'Cortex — Running' : 'Cortex — Offline';
  statusBarItem.show();
}

// ── SSE ──

function connectSSE() {
  if (sseConnection) {
    sseConnection.destroy();
    sseConnection = null;
  }

  try {
    const url = new URL(`${DAEMON_BASE()}/api/events`);
    sseConnection = http.get(url, (res) => {
      res.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('summary.ready')) {
          vscode.window.showInformationMessage(
            'Cortex: Session summary ready. Review new memories.',
            'Review Now',
          ).then((action) => {
            if (action === 'Review Now') {
              const terminal = vscode.window.createTerminal('Cortex');
              terminal.sendText('cortex review');
              terminal.show();
            }
          });
        }
      });
      res.on('end', () => {
        // Reconnect with backoff
        setTimeout(connectSSE, 5000);
      });
    });
    sseConnection.on('error', () => {
      sseConnection = null;
      setTimeout(connectSSE, 10000);
    });
  } catch {
    setTimeout(connectSSE, 30000);
  }
}

// ── Hover Cache ──

function evictHoverCache() {
  // Remove expired entries first
  const now = Date.now();
  for (const [key, entry] of hoverCache) {
    if (now - entry.timestamp > HOVER_CACHE_TTL) {
      hoverCache.delete(key);
    }
  }
  // If still over limit, remove oldest entries
  if (hoverCache.size > HOVER_CACHE_MAX_SIZE) {
    const entries = [...hoverCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, hoverCache.size - HOVER_CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      hoverCache.delete(key);
    }
  }
}

// ── API Helper ──

function apiCall<T>(path: string, method: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${DAEMON_BASE()}${path}`);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      timeout: 5000,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          try {
            const err = JSON.parse(data);
            reject(new Error(err.error?.message || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({} as T);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}
