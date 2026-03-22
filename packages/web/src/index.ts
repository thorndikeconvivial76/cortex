import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerVerifyRoute } from './routes/verify.js';
import { registerInstallRoute } from './routes/install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // ── CORS ──
  await app.register(fastifyCors, {
    origin: true,
  });

  // ── Rate limiting ──
  await app.register(fastifyRateLimit, {
    global: false,
  });

  // ── Static files (landing page) ──
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // ── Routes ──

  // GET /install.sh — installer script
  registerInstallRoute(app);

  // POST /api/verify — subscriber verification (rate limited)
  app.register(async (scopedApp) => {
    await scopedApp.register(fastifyRateLimit, {
      max: 10,
      timeWindow: '1 minute',
      keyGenerator: (request) => request.ip,
    });

    registerVerifyRoute(scopedApp);
  });

  // ── Health check ──
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'cortex-web',
    timestamp: new Date().toISOString(),
  }));

  // ── Start ──
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n  cortex.sh web service running at http://${HOST}:${PORT}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
