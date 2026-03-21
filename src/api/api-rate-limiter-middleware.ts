// Sliding window rate limiter middleware for HTTP API
// Per-tier limits: Free=10/min, Pro=100/min, Enterprise=1000/min
// In-memory storage, no Redis required
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Tier } from '../users/subscription-tier.js';

/** Requests per minute per tier */
const TIER_LIMITS: Record<Tier, number> = {
  free: 10,
  pro: 100,
  enterprise: 1000,
};

const WINDOW_MS = 60_000; // 1 minute sliding window

/** Per-key sliding window: list of request timestamps */
const requestLog = new Map<string, number[]>();

/** Prune timestamps older than the window to keep memory bounded */
function pruneWindow(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_MS;
  // Find first index still within window
  let i = 0;
  while (i < timestamps.length && timestamps[i] < cutoff) i++;
  return i === 0 ? timestamps : timestamps.slice(i);
}

/** Compute seconds until the oldest request in window expires */
function retryAfterSeconds(timestamps: number[], limit: number, now: number): number {
  if (timestamps.length < limit) return 0;
  const oldest = timestamps[timestamps.length - limit];
  const expiresAt = oldest + WINDOW_MS;
  return Math.ceil((expiresAt - now) / 1000);
}

/**
 * Check and record a request for the given key + tier.
 * Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
 */
export function checkRateLimit(
  key: string,
  tier: Tier,
): { allowed: true } | { allowed: false; retryAfter: number } {
  const limit = TIER_LIMITS[tier];
  const now = Date.now();

  let timestamps = requestLog.get(key) ?? [];
  timestamps = pruneWindow(timestamps, now);

  if (timestamps.length >= limit) {
    const retryAfter = retryAfterSeconds(timestamps, limit, now);
    return { allowed: false, retryAfter };
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return { allowed: true };
}

/**
 * Express-compatible rate limiting middleware factory.
 * Expects `req` to have `user` attached by auth middleware.
 * Falls back to IP-based limiting for unauthenticated requests using 'free' tier.
 */
export function createRateLimitMiddleware() {
  return function rateLimitMiddleware(
    req: IncomingMessage & { user?: { id: string; tier: Tier } },
    res: ServerResponse,
    next: () => void,
  ): void {
    const userId = req.user?.id;
    const tier: Tier = req.user?.tier ?? 'free';
    // Key: user ID if authenticated, else remote IP
    const ip = (req as IncomingMessage & { socket: { remoteAddress?: string } })
      .socket?.remoteAddress ?? 'unknown';
    const key = userId ?? `ip:${ip}`;

    const result = checkRateLimit(key, tier);

    if (!result.allowed) {
      const retryAfter = result.retryAfter;
      const body = JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${retryAfter}s.`,
        retryAfter,
      });
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(TIER_LIMITS[tier]),
        'X-RateLimit-Remaining': '0',
      });
      res.end(body);
      return;
    }

    next();
  };
}

/** Clear all rate limit state (useful for testing) */
export function clearRateLimitState(): void {
  requestLog.clear();
}

/** Expose tier limits for informational headers */
export function getTierLimit(tier: Tier): number {
  return TIER_LIMITS[tier];
}
