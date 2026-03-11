/**
 * Rate Limit Tracker - Track Tenant Rate Limiting
 *
 * Tracks and monitors rate limit events per tenant:
 * - Request counts per window
 * - Throttling events
 * - Tier-based rate limit status
 *
 * Integrates with RaaS rate limiter for real-time monitoring
 */

export interface RateLimitEvent {
  tenantId: string;
  tier: string;
  timestamp: number;
  requestsInWindow: number;
  limit: number;
  windowMs: number;
}

export interface ThrottlingEvent {
  tenantId: string;
  tier: string;
  timestamp: number;
  requestsInWindow: number;
  limit: number;
  retryAfterMs: number;
}

export interface TenantRateLimitStatus {
  tenantId: string;
  tier: string;
  requestsInWindow: number;
  limit: number;
  windowMs: number;
  isThrottled: boolean;
  remainingRequests: number;
  resetAt: number;
}

export interface RateLimitSummary {
  totalTenants: number;
  throttledTenants: number;
  totalThrottleRate: number;
  byTier: Record<string, { count: number; throttleRate: number }>;
}

export interface RateLimitTracker {
  getRateLimitSummary(): RateLimitSummary;
  getAllTenantStatuses(): TenantRateLimitStatus[];
  getThrottlingEvents(limit?: number): ThrottlingEvent[];
  recordRequest(tenantId: string, tier: string, limit: number, windowMs: number): void;
  recordThrottle(tenantId: string, tier: string, limit: number, windowMs: number, retryAfterMs: number): void;
}

export class RateLimitTrackerImpl implements RateLimitTracker {
  private tenantStatuses: Map<string, TenantRateLimitStatus> = new Map();
  private throttlingEvents: ThrottlingEvent[] = [];
  private readonly MAX_EVENTS = 500;

  /**
   * Record a rate limit request
   */
  recordRequest(
    tenantId: string,
    tier: string,
    limit: number,
    windowMs: number
  ): void {
    const existing = this.tenantStatuses.get(tenantId);
    const now = Date.now();

    if (existing) {
      const elapsed = now - existing.resetAt;
      if (elapsed >= windowMs) {
        // Window reset
        this.tenantStatuses.set(tenantId, {
          tenantId,
          tier,
          requestsInWindow: 1,
          limit,
          windowMs,
          isThrottled: false,
          remainingRequests: limit - 1,
          resetAt: now,
        });
      } else {
        // Increment within window
        existing.requestsInWindow += 1;
        existing.remainingRequests = Math.max(0, limit - existing.requestsInWindow);
        existing.isThrottled = existing.requestsInWindow >= limit;
      }
    } else {
      // New tenant
      this.tenantStatuses.set(tenantId, {
        tenantId,
        tier,
        requestsInWindow: 1,
        limit,
        windowMs,
        isThrottled: false,
        remainingRequests: limit - 1,
        resetAt: now,
      });
    }
  }

  /**
   * Record a throttling event
   */
  recordThrottle(
    tenantId: string,
    tier: string,
    limit: number,
    windowMs: number,
    retryAfterMs: number
  ): void {
    const event: ThrottlingEvent = {
      tenantId,
      tier,
      timestamp: Date.now(),
      requestsInWindow: limit,
      limit,
      retryAfterMs,
    };

    this.throttlingEvents.push(event);

    // Update tenant status
    const status = this.tenantStatuses.get(tenantId);
    if (status) {
      status.isThrottled = true;
    }

    // Trim old events
    if (this.throttlingEvents.length > this.MAX_EVENTS) {
      this.throttlingEvents = this.throttlingEvents.slice(-this.MAX_EVENTS);
    }
  }

  /**
   * Get overall rate limit summary
   */
  getRateLimitSummary(): RateLimitSummary {
    const statuses = Array.from(this.tenantStatuses.values());
    const throttled = statuses.filter(s => s.isThrottled);

    const byTier: Record<string, { count: number; throttleRate: number }> = {};

    statuses.forEach(status => {
      if (!byTier[status.tier]) {
        byTier[status.tier] = { count: 0, throttleRate: 0 };
      }
      byTier[status.tier].count += 1;
    });

    throttled.forEach(status => {
      if (byTier[status.tier]) {
        byTier[status.tier].throttleRate += 1;
      }
    });

    // Calculate throttle rate per tier
    Object.keys(byTier).forEach(tier => {
      const total = byTier[tier].count;
      const throttled = byTier[tier].throttleRate;
      byTier[tier].throttleRate = total > 0 ? throttled / total : 0;
    });

    return {
      totalTenants: statuses.length,
      throttledTenants: throttled.length,
      totalThrottleRate: statuses.length > 0 ? throttled.length / statuses.length : 0,
      byTier,
    };
  }

  /**
   * Get all tenant statuses
   */
  getAllTenantStatuses(): TenantRateLimitStatus[] {
    return Array.from(this.tenantStatuses.values());
  }

  /**
   * Get recent throttling events
   */
  getThrottlingEvents(limit: number = 50): ThrottlingEvent[] {
    return this.throttlingEvents.slice(-limit);
  }
}

// Singleton instance
let globalRateLimitTracker: RateLimitTrackerImpl | null = null;

export function getGlobalRateLimitTracker(): RateLimitTracker {
  if (!globalRateLimitTracker) {
    globalRateLimitTracker = new RateLimitTrackerImpl();
  }
  return globalRateLimitTracker;
}

/**
 * Reset singleton (for testing)
 */
export function resetGlobalRateLimitTracker(): void {
  globalRateLimitTracker = null;
}
