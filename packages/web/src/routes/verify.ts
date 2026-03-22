import type { FastifyInstance } from 'fastify';
import { verifySubscriber } from '../lib/beehiiv.js';

interface VerifyBody {
  email_hash: string;
}

/**
 * POST /api/verify — subscriber token check.
 *
 * Receives a SHA-256 hash of the subscriber's email, checks against
 * the Beehiiv subscriber list, and returns validity + expiry.
 */
export function registerVerifyRoute(app: FastifyInstance): void {
  app.post<{ Body: VerifyBody }>('/api/verify', async (request, reply) => {
    const { email_hash } = request.body || {};

    if (!email_hash || typeof email_hash !== 'string') {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'email_hash is required (SHA-256 hex string)' },
      });
    }

    // Validate it looks like a SHA-256 hex string
    if (!/^[a-f0-9]{64}$/i.test(email_hash)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'email_hash must be a valid SHA-256 hex string (64 characters)' },
      });
    }

    const valid = await verifySubscriber(email_hash);

    if (valid) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      return {
        valid: true,
        expires_at: expiresAt.toISOString(),
      };
    }

    return { valid: false };
  });
}
