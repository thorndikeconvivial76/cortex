import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * GET /install.sh — serves the Cortex installer script.
 *
 * This is what `curl -fsSL install.cortex.sh | sh` hits.
 * Tries to read from the sibling installer package first,
 * then falls back to a bundled copy.
 */
export function registerInstallRoute(app: FastifyInstance): void {
  app.get('/install.sh', async (_request, reply) => {
    // Try the installer package path (monorepo sibling)
    const installerPaths = [
      join(__dirname, '..', '..', '..', 'installer', 'install.sh'),    // from src/routes/
      join(__dirname, '..', '..', 'installer', 'install.sh'),           // from dist/
      join(__dirname, '..', '..', '..', '..', 'installer', 'install.sh'), // deeper nesting
    ];

    for (const scriptPath of installerPaths) {
      if (existsSync(scriptPath)) {
        const script = readFileSync(scriptPath, 'utf-8');
        return reply
          .type('text/plain')
          .header('Cache-Control', 'public, max-age=300')
          .send(script);
      }
    }

    // Fallback: return a redirect to the GitHub raw URL
    return reply
      .status(302)
      .header('Location', 'https://raw.githubusercontent.com/k2n2-studio/cortex/main/packages/installer/install.sh')
      .send();
  });
}
