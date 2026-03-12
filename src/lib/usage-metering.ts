/**
 * Usage Metering Service — Daily Tier Limits + Overage Tracking
 *
 * ROIaaS Phase 4 - Usage-based billing with daily limits and overage charges.
 * Tracks API calls per license key with tier-based daily quotas.
 *
 * Tier Limits (Daily):
 * - FREE: 100 API calls/day
 * - PRO: 10,000 API calls/day
 * - ENTERPRISE: 100,000 API calls/day
 *
 * Overage Pricing:
 * - $0.01 per API call over daily limit
 *
 * Features:
 * - Daily usage tracking per license key
 * - Per-endpoint counter breakdown
 * - Overage calculation and alerts
 * - Event emitter for overage notifications
 *
 * Usage:
 * ```typescript
 * const metering = UsageMeteringService.getInstance();
 *
 * // Track API call
 * await metering.trackApiCall('lic_abc123', '/api/v1/predict');
 *
 * // Check if within limit
 * const status = await metering.getUsageStatus('lic_abc123');
 * if (status.isExceeded) {
 *   console.log('Daily limit exceeded');
 * }
 *
 * // Get overage charges
 * const overage = await metering.calculateOverage('lic_abc123');
 * ```
 */

import { EventEmitter } from 'events';
import { LicenseTier } from './raas-gate';

/**
 * Daily tier limits (API calls per day)
 */
export const DAILY_LIMITS: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 100,
  [LicenseTier.PRO]: 10000,
  [LicenseTier.ENTERPRISE]: 100000,
};

/**
 * Overage pricing per unit (USD)
 */
export const OVERAGE_PRICE_PER_CALL = 0.01; // $0.01 per API call over limit

/**
 * Alert thresholds (percentage of daily limit)
 */
export const ALERT_THRESHOLDS = [80, 90, 100];

/**
 * Usage event structure
 */
export interface UsageEvent {
  licenseKey: string;
  endpoint: string;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Daily usage aggregation
 */
export interface DailyUsage {
  licenseKey: string;
  date: string; // YYYY-MM-DD format
  totalCalls: number;
  byEndpoint: Record<string, number>;
  userIds: Set<string>;
}

/**
 * Usage status for a license
 */
export interface UsageStatus {
  licenseKey: string;
  date: string;
  tier: LicenseTier;
  dailyLimit: number;
  currentUsage: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
  overageUnits: number;
  overageCost: number;
}

/**
 * Overage alert event
 */
export interface OverageAlert {
  licenseKey: string;
  threshold: number;
  currentUsage: number;
  dailyLimit: number;
  percentUsed: number;
  timestamp: string;
}

/**
 * In-memory storage for daily usage
 */
const usageStore = new Map<string, DailyUsage>();

/**
 * License tier mapping (can be synced with LicenseService)
 */
const licenseTierMap = new Map<string, LicenseTier>();

/**
 * Usage Metering Service - Singleton
 *
 * Tracks daily API usage per license key with tier-based limits.
 * Emits alerts when approaching or exceeding daily quotas.
 */
export class UsageMeteringService extends EventEmitter {
  private static instance: UsageMeteringService;

  private constructor() {
    super();
    this.startDailyReset();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): UsageMeteringService {
    if (!UsageMeteringService.instance) {
      UsageMeteringService.instance = new UsageMeteringService();
    }
    return UsageMeteringService.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    if (UsageMeteringService.instance) {
      UsageMeteringService.instance.removeAllListeners();
    }
    UsageMeteringService.instance = new UsageMeteringService();
    usageStore.clear();
    licenseTierMap.clear();
  }

  /**
   * Set tier for a license key
   */
  setLicenseTier(licenseKey: string, tier: LicenseTier): void {
    licenseTierMap.set(licenseKey, tier);
  }

  /**
   * Get tier for a license key
   */
  getLicenseTier(licenseKey: string): LicenseTier {
    return licenseTierMap.get(licenseKey) || LicenseTier.FREE;
  }

  /**
   * Track a single API call
   *
   * @param licenseKey - License identifier
   * @param endpoint - API endpoint path (e.g., '/api/v1/predict')
   * @param userId - Optional user identifier
   * @returns True if within limit, false if exceeded
   */
  async trackApiCall(
    licenseKey: string,
    endpoint: string,
    userId?: string
  ): Promise<boolean> {
    const today = this.getTodayKey();
    const key = `${licenseKey}:${today}`;

    // Get or create daily usage record
    let usage = usageStore.get(key);
    if (!usage) {
      usage = {
        licenseKey,
        date: today,
        totalCalls: 0,
        byEndpoint: {},
        userIds: new Set(),
      };
      usageStore.set(key, usage);
    }

    // Increment counters
    usage.totalCalls += 1;
    usage.byEndpoint[endpoint] = (usage.byEndpoint[endpoint] || 0) + 1;
    if (userId) {
      usage.userIds.add(userId);
    }

    // Check thresholds and emit alerts
    const tier = this.getLicenseTier(licenseKey);
    const limit = DAILY_LIMITS[tier];
    const percentUsed = (usage.totalCalls / limit) * 100;

    // Check if any threshold just triggered
    for (const threshold of ALERT_THRESHOLDS) {
      const thresholdKey = `${key}:${threshold}`;
      const alreadyTriggered = usageStore.get(thresholdKey);

      if (percentUsed >= threshold && !alreadyTriggered) {
        // Mark threshold as triggered
        usageStore.set(thresholdKey, usage);

        // Emit alert
        const alert: OverageAlert = {
          licenseKey,
          threshold,
          currentUsage: usage.totalCalls,
          dailyLimit: limit,
          percentUsed: Math.round(percentUsed * 100) / 100,
          timestamp: new Date().toISOString(),
        };

        this.emit('threshold_alert', alert);

        // Log overage alert when limit exceeded
        if (threshold === 100) {
          console.log('[UsageMetering] Overage alert: Daily limit exceeded', {
            licenseKey: licenseKey.substring(0, 8) + '...',
            currentUsage: usage.totalCalls,
            dailyLimit: limit,
            tier,
          });
        }
      }
    }

    return usage.totalCalls <= limit;
  }

  /**
   * Get current usage status for a license
   */
  getUsageStatus(licenseKey: string): UsageStatus {
    const today = this.getTodayKey();
    const key = `${licenseKey}:${today}`;
    const tier = this.getLicenseTier(licenseKey);
    const limit = DAILY_LIMITS[tier];

    const usage = usageStore.get(key);
    const currentUsage = usage?.totalCalls || 0;
    const remaining = Math.max(0, limit - currentUsage);
    const percentUsed = (currentUsage / limit) * 100;
    const isExceeded = currentUsage > limit;
    const overageUnits = Math.max(0, currentUsage - limit);
    const overageCost = Math.round(overageUnits * OVERAGE_PRICE_PER_CALL * 100) / 100;

    return {
      licenseKey,
      date: today,
      tier,
      dailyLimit: limit,
      currentUsage,
      remaining,
      percentUsed: Math.round(percentUsed * 100) / 100,
      isExceeded,
      overageUnits,
      overageCost,
    };
  }

  /**
   * Check if license has exceeded daily limit
   */
  isExceeded(licenseKey: string): boolean {
    const status = this.getUsageStatus(licenseKey);
    return status.isExceeded;
  }

  /**
   * Get usage by endpoint breakdown
   */
  getEndpointBreakdown(licenseKey: string): Record<string, number> {
    const today = this.getTodayKey();
    const key = `${licenseKey}:${today}`;
    const usage = usageStore.get(key);
    return usage?.byEndpoint || {};
  }

  /**
   * Get daily usage record
   */
  getDailyUsage(licenseKey: string): DailyUsage | undefined {
    const today = this.getTodayKey();
    const key = `${licenseKey}:${today}`;
    return usageStore.get(key);
  }

  /**
   * Calculate overage charges for current day
   */
  calculateOverage(licenseKey: string): number {
    const status = this.getUsageStatus(licenseKey);
    return status.overageCost;
  }

  /**
   * Get all licenses currently in overage
   */
  getOverageLicenses(): UsageStatus[] {
    const overageLicenses: UsageStatus[] = [];

    for (const licenseKey of licenseTierMap.keys()) {
      const status = this.getUsageStatus(licenseKey);
      if (status.isExceeded) {
        overageLicenses.push(status);
      }
    }

    return overageLicenses;
  }

  /**
   * Reset usage for a specific license (for testing or manual reset)
   */
  resetUsage(licenseKey: string): void {
    const today = this.getTodayKey();
    const key = `${licenseKey}:${today}`;
    usageStore.delete(key);

    // Also delete threshold markers
    for (const threshold of ALERT_THRESHOLDS) {
      usageStore.delete(`${key}:${threshold}`);
    }
  }

  /**
   * Clear all usage data (testing only)
   */
  clear(): void {
    usageStore.clear();
    licenseTierMap.clear();
  }

  /**
   * Start daily reset at midnight UTC
   */
  private startDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.resetDailyUsage();
      // Schedule next reset
      this.startDailyReset();
    }, msUntilMidnight);
  }

  /**
   * Reset all daily usage counters
   */
  private resetDailyUsage(): void {
    const today = this.getTodayKey();

    // Keep only today's threshold markers (for audit trail)
    for (const key of usageStore.keys()) {
      if (!key.includes(today)) {
        usageStore.delete(key);
      }
    }

    console.log('[UsageMetering] Daily usage reset complete');
  }

  /**
   * Get today's date key (YYYY-MM-DD)
   */
  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get total stored events count (for monitoring)
   */
  getTotalStoredEvents(): number {
    let count = 0;
    for (const usage of usageStore.values()) {
      count += usage.totalCalls;
    }
    return count;
  }

  /**
   * Get buffer size (number of license keys tracked)
   */
  getBufferSize(): number {
    return usageStore.size;
  }
}

/**
 * Export singleton instance
 */
export const usageMeteringService = UsageMeteringService.getInstance();
