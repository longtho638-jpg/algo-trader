/**
 * Property-Based Tests for Usage Metering Service
 *
 * Uses fast-check to generate thousands of test cases automatically.
 * Tests invariants, boundaries, and edge cases.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import * as fc from 'fast-check';
import { UsageMeteringService, DAILY_LIMITS, OVERAGE_PRICE_PER_CALL } from './usage-metering';
import { LicenseTier } from './raas-gate';

describe('UsageMeteringService - Property-Based Tests', () => {
  let service: UsageMeteringService;

  beforeEach(() => {
    UsageMeteringService.resetInstance();
    service = UsageMeteringService.getInstance();
  });

  /**
   * INVARIANT: Usage is monotonic (never decreases)
   */
  describe('Monotonicity Invariant', () => {
    test('usage should never decrease after API calls', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat({ max: 500 }), { minLength: 10, maxLength: 100 }),
          (callCounts) => {
            service.clear();
            service.setLicenseTier('lic_test', LicenseTier.PRO);

            let previousUsage = 0;

            for (const count of callCounts) {
              // Track 'count' API calls
              for (let i = 0; i < count; i++) {
                service.trackApiCall('lic_test', '/api/test');
              }

              const status = service.getUsageStatus('lic_test');
              if (status.currentUsage < previousUsage) {
                return false; // Violation!
              }
              previousUsage = status.currentUsage;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('endpoint breakdown should sum to total usage', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(
            fc.constantFrom('/api/v1/predict', '/api/v1/scan', '/api/v1/backtest'),
            fc.nat({ max: 100 })
          )),
          (endpointCalls) => {
            service.clear();
            service.setLicenseTier('lic_test', LicenseTier.PRO);

            let expectedTotal = 0;

            for (const [endpoint, count] of endpointCalls) {
              for (let i = 0; i < count; i++) {
                service.trackApiCall('lic_test', endpoint);
              }
              expectedTotal += count;
            }

            const status = service.getUsageStatus('lic_test');
            const breakdown = service.getEndpointBreakdown('lic_test');
            const breakdownSum = Object.values(breakdown).reduce((a, b) => a + b, 0);

            return status.currentUsage === expectedTotal && breakdownSum === expectedTotal;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * INVARIANT: Overage calculation is consistent
   */
  describe('Overage Consistency Invariant', () => {
    test('overage cost should equal overage units * price per unit', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 200 }),
          (usageAmount) => {
            service.clear();
            service.setLicenseTier('lic_test', LicenseTier.FREE);

            for (let i = 0; i < usageAmount; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            const status = service.getUsageStatus('lic_test');
            const expectedOverageCost = Math.max(0, status.currentUsage - status.dailyLimit) * OVERAGE_PRICE_PER_CALL;

            // Allow for floating point rounding
            return Math.abs(status.overageCost - expectedOverageCost) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('overageUnits should equal max(0, usage - limit)', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 200 }),
          (usageAmount) => {
            service.clear();
            service.setLicenseTier('lic_test', LicenseTier.FREE);

            for (let i = 0; i < usageAmount; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            const status = service.getUsageStatus('lic_test');
            const expectedOverageUnits = Math.max(0, status.currentUsage - status.dailyLimit);

            return status.overageUnits === expectedOverageUnits;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * BOUNDARY: Tier limit boundaries
   */
  describe('Boundary Conditions', () => {
    test('should handle usage exactly at limit', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LicenseTier.FREE, LicenseTier.PRO, LicenseTier.ENTERPRISE),
          (tier) => {
            service.clear();
            service.setLicenseTier('lic_test', tier);
            const limit = DAILY_LIMITS[tier];

            // Track exactly 'limit' calls
            for (let i = 0; i < limit; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            const status = service.getUsageStatus('lic_test');
            return (
              status.currentUsage === limit &&
              status.remaining === 0 &&
              !status.isExceeded &&
              status.overageUnits === 0 &&
              status.overageCost === 0
            );
          }
        ),
        { numRuns: 30 } // 3 tiers, many runs each
      );
    });

    test('should detect exceeded limit by 1', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LicenseTier.FREE, LicenseTier.PRO, LicenseTier.ENTERPRISE),
          (tier) => {
            service.clear();
            service.setLicenseTier('lic_test', tier);
            const limit = DAILY_LIMITS[tier];

            // Track limit + 1 calls
            for (let i = 0; i < limit + 1; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            const status = service.getUsageStatus('lic_test');
            return (
              status.currentUsage === limit + 1 &&
              status.remaining === 0 &&
              status.isExceeded &&
              status.overageUnits === 1 &&
              Math.abs(status.overageCost - OVERAGE_PRICE_PER_CALL) < 0.001
            );
          }
        ),
        { numRuns: 30 }
      );
    });

    test('percentUsed should be (usage / limit) * 100', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LicenseTier.FREE, LicenseTier.PRO, LicenseTier.ENTERPRISE),
          fc.nat({ max: 150 }),
          (tier, percentOfLimit) => {
            service.clear();
            service.setLicenseTier('lic_test', tier);
            const limit = DAILY_LIMITS[tier];
            const usage = Math.floor((limit * percentOfLimit) / 100);

            for (let i = 0; i < usage; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            const status = service.getUsageStatus('lic_test');
            const expectedPercent = (usage / limit) * 100;

            // Allow 1% rounding error
            return Math.abs(status.percentUsed - expectedPercent) <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * INVARIANT: Alert thresholds trigger correctly
   */
  describe('Alert Threshold Invariant', () => {
    test('should trigger 80% threshold for all tiers', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LicenseTier.FREE, LicenseTier.PRO, LicenseTier.ENTERPRISE),
          (tier) => {
            service.clear();
            service.setLicenseTier('lic_test', tier);
            const limit = DAILY_LIMITS[tier];
            const thresholdUsage = Math.floor(limit * 0.8);

            let alertTriggered = false;
            service.once('threshold_alert', (alert) => {
              if (alert.threshold === 80) {
                alertTriggered = true;
              }
            });

            for (let i = 0; i < thresholdUsage; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            return alertTriggered;
          }
        ),
        { numRuns: 30 }
      );
    });

    test('should trigger 100% threshold for all tiers', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LicenseTier.FREE, LicenseTier.PRO, LicenseTier.ENTERPRISE),
          (tier) => {
            service.clear();
            service.setLicenseTier('lic_test', tier);
            const limit = DAILY_LIMITS[tier];

            let alertTriggered = false;
            service.on('threshold_alert', (alert) => {
              if (alert.threshold === 100) {
                alertTriggered = true;
              }
            });

            for (let i = 0; i < limit; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            return alertTriggered;
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * INVARIANT: Multiple licenses are independent
   */
  describe('License Independence Invariant', () => {
    test('usage of one license should not affect another', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat({ max: 100 }), { minLength: 5, maxLength: 20 }),
          fc.array(fc.nat({ max: 100 }), { minLength: 5, maxLength: 20 }),
          (usageA, usageB) => {
            service.clear();
            service.setLicenseTier('lic_a', LicenseTier.FREE);
            service.setLicenseTier('lic_b', LicenseTier.FREE);

            // Track calls for both licenses
            for (let i = 0; i < Math.max(usageA.length, usageB.length); i++) {
              if (i < usageA.length) {
                service.trackApiCall('lic_a', '/api/test');
              }
              if (i < usageB.length) {
                service.trackApiCall('lic_b', '/api/test');
              }
            }

            const statusA = service.getUsageStatus('lic_a');
            const statusB = service.getUsageStatus('lic_b');

            return (
              statusA.currentUsage === usageA.length &&
              statusB.currentUsage === usageB.length
            );
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * INVARIANT: User ID tracking is accurate
   */
  describe('User ID Tracking Invariant', () => {
    test('unique user count should match distinct user IDs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 3, maxLength: 10 }), { minLength: 5, maxLength: 50 }),
          (userIds) => {
            service.clear();
            service.setLicenseTier('lic_test', LicenseTier.PRO);

            // Track one call per user
            const uniqueUserIds = new Set(userIds);
            for (const userId of userIds) {
              service.trackApiCall('lic_test', '/api/test', userId);
            }

            const usage = service.getDailyUsage('lic_test');
            return usage?.userIds.size === uniqueUserIds.size;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * INVARIANT: Reset clears usage but preserves tier
   */
  describe('Reset Invariant', () => {
    test('reset should clear usage but preserve tier', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LicenseTier.FREE, LicenseTier.PRO, LicenseTier.ENTERPRISE),
          fc.nat({ max: 100 }),
          (tier, usageAmount) => {
            service.clear();
            service.setLicenseTier('lic_test', tier);

            for (let i = 0; i < usageAmount; i++) {
              service.trackApiCall('lic_test', '/api/test');
            }

            service.resetUsage('lic_test');

            const status = service.getUsageStatus('lic_test');
            return status.currentUsage === 0 && status.tier === tier;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * BOUNDARY: Zero usage edge case
   */
  describe('Zero Usage Boundary', () => {
    test('should handle zero usage correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LicenseTier.FREE, LicenseTier.PRO, LicenseTier.ENTERPRISE),
          (tier) => {
            service.clear();
            service.setLicenseTier('lic_test', tier);

            const status = service.getUsageStatus('lic_test');
            return (
              status.currentUsage === 0 &&
              status.remaining === status.dailyLimit &&
              status.percentUsed === 0 &&
              !status.isExceeded &&
              status.overageUnits === 0 &&
              status.overageCost === 0
            );
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
