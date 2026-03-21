// Per-user, per-tier API rate limiting middleware
// Free=10 req/min, Pro=60 req/min, Enterprise=300 req/min
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Tier } from '../users/subscription-tier.js';

interface AuthedRequest extends IncomingMessage {
  user?: { id: string; email: string; tier: Tier };
}

/** Requests per minute by tier */
const TIER_LIMITS: Record<Tier, number> = {
  free: 10,
  pro: 60,
  enterprise: 300,
};

interface BucketEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000; // 1 minute
const _buckets = new Map<string, BucketEntry>();

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _buckets) {
    if (now - entry.windowStart > WINDOW_MS * 2) _buckets.delete(key);
  }
}, 5 * 60_000).unref();

/**
 * Check if the request is within the user's tier rate limit.
 * Returns true if allowed, false if rate-limited (429 sent).
 * Unauthenticated requests use a global IP-based bucket with free-tier limits.
 */
export function checkApiRateLimit(req: AuthedRequest, res: ServerResponse): boolean {
  const user = (req as AuthedRequest).user;
  const tier = user?.tier ?? 'free';
  const bucketKey = user?.id ?? (req.socket.remoteAddress ?? 'unknown');
  const limit = TIER_LIMITS[tier];

  const now = Date.now();
  let entry = _buckets.get(bucketKey);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    _buckets.set(bucketKey, entry);
  }

  entry.count++;

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    const body = JSON.stringify({
      error: 'Rate limit exceeded',
      message: `Your "${tier}" plan allows ${limit} requests/minute. Upgrade for higher limits.`,
      limit,
      retryAfterSeconds: retryAfter,
      upgradeUrl: 'https://cashclaw.cc/pricing',
    });
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Retry-After': String(retryAfter),
    });
    res.end(body);
    return false;
  }

  // Set rate limit headers
  const remaining = Math.max(0, limit - entry.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + WINDOW_MS) / 1000)));

  return true;
}
