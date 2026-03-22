import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { SSEEmitter } from './sse/emitter.js';
import { API_VERSION } from './response.js';
import { registerMemoryRoutes } from './routes/memories.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerSSERoute } from './routes/events.js';
import { registerSyncRoutes } from './routes/sync.js';

/**
 * Create and configure the Fastify REST API server on localhost:7434.
 */
export async function createAPIServer(
  db: Database.Database,
  sseEmitter: SSEEmitter,
  port = 7434,
): Promise<{ app: ReturnType<typeof Fastify>; port: number }> {
  const app = Fastify({
    logger: {
      level: process.env.CORTEX_LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: { colorize: true },
      } : undefined,
    },
    bodyLimit: 1024 * 1024, // 1MB
  });

  // CORS — localhost only + WKWebView (null origin) + Electron (file://) + VS Code
  await app.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        origin === 'null' ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        origin.startsWith('file://') ||
        origin.startsWith('vscode-webview://')
      ) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Global rate limit: 100 requests per minute per IP
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Add request ID to every response
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', uuid());
    reply.header('X-Cortex-Version', API_VERSION);
  });

  // Register route groups
  registerMemoryRoutes(app, db, sseEmitter);
  registerProjectRoutes(app, db);
  registerSystemRoutes(app, db);
  registerSSERoute(app, sseEmitter);
  registerSyncRoutes(app, db, sseEmitter);

  return { app, port };
}

/**
 * Start the API server.
 */
export async function startAPIServer(
  db: Database.Database,
  sseEmitter: SSEEmitter,
  port = 7434,
): Promise<string> {
  const { app } = await createAPIServer(db, sseEmitter, port);
  const address = await app.listen({ port, host: '127.0.0.1' });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down gracefully...');
    try {
      await app.close();
    } catch {
      // Ignore close errors
    }
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return address;
}
