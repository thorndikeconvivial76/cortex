import { createHash } from 'node:crypto';

const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2';

interface SubscriberCache {
  hashes: Set<string>;
  fetchedAt: number;
}

let cache: SubscriberCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * SHA-256 hash an email address (lowercased, trimmed).
 */
export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex');
}

/**
 * Fetch all subscriber email hashes from Beehiiv.
 * Paginates through the full list and caches for 1 hour.
 */
async function fetchSubscriberHashes(): Promise<Set<string>> {
  // Return cached if still valid
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.hashes;
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) {
    // Fail closed unless explicitly skipped for development
    if (process.env.CORTEX_SKIP_SUBSCRIBER_CHECK === 'true') {
      console.warn('[beehiiv] BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID not set — skipping check (CORTEX_SKIP_SUBSCRIBER_CHECK=true)');
      return new Set(['__skip__']);
    }
    console.warn('[beehiiv] BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID not set — failing closed');
    return new Set();
  }

  const hashes = new Set<string>();
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const url = `${BEEHIIV_API_BASE}/publications/${pubId}/subscriptions?page=${page}&limit=100&status=active`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        console.error(`[beehiiv] API error ${res.status}: ${res.statusText}`);
        break;
      }

      const body = (await res.json()) as {
        data: Array<{ email: string }>;
        total_results: number;
        page: number;
        total_pages: number;
      };

      for (const sub of body.data) {
        hashes.add(hashEmail(sub.email));
      }

      hasMore = page < body.total_pages;
      page++;
    }

    cache = { hashes, fetchedAt: Date.now() };
    console.log(`[beehiiv] Cached ${hashes.size} subscriber hashes`);
    return hashes;
  } catch (err) {
    console.error('[beehiiv] Failed to fetch subscribers — failing closed:', err);
    // Fail closed — deny access when verification is down
    return new Set();
  }
}

/**
 * Verify whether a SHA-256 email hash belongs to an active subscriber.
 * Fails closed: returns false if Beehiiv is unavailable, unless
 * CORTEX_SKIP_SUBSCRIBER_CHECK=true is set (development only).
 */
export async function verifySubscriber(emailHash: string): Promise<boolean> {
  // Development bypass
  if (process.env.CORTEX_SKIP_SUBSCRIBER_CHECK === 'true') {
    console.warn('[beehiiv] Subscriber check skipped (CORTEX_SKIP_SUBSCRIBER_CHECK=true)');
    return true;
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  // If Beehiiv isn't configured, fail closed
  if (!apiKey || !pubId) {
    console.warn('[beehiiv] Not configured — failing closed');
    return false;
  }

  try {
    const hashes = await fetchSubscriberHashes();

    // If we got an empty set back (API failure), fail closed
    if (hashes.size === 0) {
      console.warn('[beehiiv] Empty subscriber set — failing closed');
      return false;
    }

    return hashes.has(emailHash);
  } catch {
    // Fail closed — deny access when verification is down
    console.warn('[beehiiv] Verification error — failing closed');
    return false;
  }
}

/**
 * Force-clear the subscriber cache (useful for testing).
 */
export function clearCache(): void {
  cache = null;
}
