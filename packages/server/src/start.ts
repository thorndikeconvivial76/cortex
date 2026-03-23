#!/usr/bin/env node
/**
 * Cortex daemon entry point.
 * Creates database, runs migrations, starts API server + MCP server.
 */

import { createDatabase, runMigrations } from './db/index.js';
import { startAPIServer } from './api/server.js';
import { SSEEmitter } from './api/sse/emitter.js';
import { startMCPServer } from './mcp/server.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const PORT = parseInt(process.env.CORTEX_PORT || '7434', 10);
const DB_PATH = process.env.CORTEX_DB_PATH || path.join(os.homedir(), '.cortex', 'memory.db');
const STDIO_MODE = process.argv.includes('--stdio');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database and run migrations
const db = createDatabase(DB_PATH);
runMigrations(db);

// Create SSE emitter
const sseEmitter = new SSEEmitter();

if (STDIO_MODE) {
  // MCP mode — Claude Code connects via stdio
  startMCPServer(db).catch((err) => {
    console.error('[cortex] MCP server failed:', err);
    process.exit(1);
  });
} else {
  // Daemon mode — REST API server
  startAPIServer(db, sseEmitter, PORT)
    .then((address) => {
      console.log(`[cortex] Daemon running at ${address}`);
    })
    .catch((err) => {
      console.error('[cortex] Failed to start:', err);
      process.exit(1);
    });
}
