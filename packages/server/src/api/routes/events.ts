import type { FastifyInstance } from 'fastify';
import type { SSEEmitter } from '../sse/emitter.js';

/**
 * Register the SSE events endpoint.
 * GET /api/events — text/event-stream, persistent connection.
 */
export function registerSSERoute(app: FastifyInstance, sseEmitter: SSEEmitter): void {
  app.get('/api/events', async (request, reply) => {
    // Defense-in-depth: only allow connections from localhost
    const remoteAddr = request.ip;
    if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'SSE connections are only allowed from localhost' },
      });
    }

    const lastEventId = request.headers['last-event-id'] as string | undefined;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Initial comment to establish connection
    reply.raw.write(': connected\n\n');

    const clientId = sseEmitter.addClient(
      (data: string) => {
        try {
          return reply.raw.write(data);
        } catch {
          return false;
        }
      },
      () => {
        try {
          reply.raw.end();
        } catch {
          // Already closed
        }
      },
      lastEventId,
    );

    // Remove client on disconnect
    request.raw.on('close', () => {
      sseEmitter.removeClient(clientId);
    });

    // Keep the response open — don't return/resolve
    // Fastify will keep the connection alive
  });
}
