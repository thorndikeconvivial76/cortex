const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

const DAEMON_PORT = 7434;
const DASHBOARD_URL = `http://localhost:${DAEMON_PORT}`;

let mainWindow = null;
let tray = null;
let daemonPid = null;
let isDaemonRunning = false;
let isStartingDaemon = false;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  createTray();
  await startDaemon();

  // Wait for daemon to be ready
  await waitForDaemon(10000);

  // Don't show window on launch — tray only by default
  // User clicks "Open Dashboard" from tray

  // Auto-updater
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
});

app.on('window-all-closed', (e) => {
  // Don't quit on window close — keep running in tray
  e.preventDefault?.();
});

app.on('before-quit', () => {
  stopDaemon();
});

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
});

// ── Window ──

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0A0A0F',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.loadURL(DASHBOARD_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    // Hide instead of close
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// ── Tray ──

function createTray() {
  // Use a template image for macOS dark/light menu bar
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let icon;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  } else {
    // Fallback: create a simple icon programmatically
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Cortex — Memory for Claude Code');
  updateTrayMenu();

  tray.on('click', () => {
    createWindow();
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isDaemonRunning ? '● Cortex Running' : '○ Cortex Stopped',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => createWindow(),
    },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(DASHBOARD_URL),
    },
    { type: 'separator' },
    {
      label: isDaemonRunning ? 'Stop Daemon' : 'Start Daemon',
      click: async () => {
        if (isDaemonRunning) {
          stopDaemon();
        } else {
          await startDaemon();
          await waitForDaemon(5000);
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Force Sync',
      enabled: isDaemonRunning,
      click: () => {
        apiCall('/api/sync/now', 'POST').catch(() => {});
      },
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdatesAndNotify(),
    },
    {
      label: 'About Cortex',
      click: () => {
        dialog.showMessageBox({
          title: 'Cortex',
          message: 'Cortex — Persistent Memory for Claude Code',
          detail: `Version ${app.getVersion()}\n\u00A9 2026 K2N2 Studio\nA project by The Production Line`,
          buttons: ['OK'],
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Cortex',
      click: () => {
        stopDaemon();
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ── Daemon Management ──

async function startDaemon() {
  if (isDaemonRunning || isStartingDaemon) return;

  isStartingDaemon = true;
  try {
    // Try to find cortex server in common locations
    const serverPaths = [
      path.join(os.homedir(), '.cortex', 'node_modules', '.bin', 'cortex-server'),
      'cortex-server',
      'npx @cortex-memory/server',
    ];

    // Use the daemon start approach — the server package
    const child = spawn('node', [
      '-e',
      `require('@cortex/server').startDaemon()`,
    ], {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, CORTEX_PORT: String(DAEMON_PORT) },
    });

    // Store PID and fully detach — no event listeners on the child
    daemonPid = child.pid;
    child.unref();
  } catch (err) {
    console.error('Failed to start daemon:', err);
  } finally {
    isStartingDaemon = false;
  }
}

function stopDaemon() {
  if (daemonPid) {
    try {
      process.kill(daemonPid, 'SIGTERM');
    } catch {
      // Process already exited
    }
    daemonPid = null;
  }
  isDaemonRunning = false;
  updateTrayMenu();
}

// ── Health Monitoring ──

async function waitForDaemon(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await apiCall('/api/health', 'GET');
      isDaemonRunning = true;
      updateTrayMenu();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  isDaemonRunning = false;
  updateTrayMenu();
  return false;
}

// Start periodic health check
setInterval(async () => {
  try {
    await apiCall('/api/health', 'GET');
    if (!isDaemonRunning) {
      isDaemonRunning = true;
      updateTrayMenu();
    }
  } catch {
    if (isDaemonRunning) {
      isDaemonRunning = false;
      updateTrayMenu();
    }
  }
}, 15000);

// ── API Helper ──

function apiCall(urlPath, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: DAEMON_PORT,
      path: urlPath,
      method,
      timeout: 3000,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
