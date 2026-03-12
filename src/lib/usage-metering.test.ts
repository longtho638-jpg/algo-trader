/**
 * Usage Metering Service Tests
 *
 * ROIaaS Phase 4 - Usage-based billing tests
 */

import { UsageMeteringService, DAILY_LIMITS, OVERAGE_PRICE_PER_CALL } from './usage-metering';
import { LicenseTier } from './raas-gate';

describe('UsageMeteringService', () => {
  let service: UsageMeteringService;

  beforeEach(() => {
    UsageMeteringService.resetInstance();
    service = UsageMeteringService.getInstance();
  });

  afterEach(() => {
    service.clear();
  });

  describe('Singleton', () => {
    it('should create singleton instance', () => {
      const instance1 = UsageMeteringService.getInstance();
      const instance2 = UsageMeteringService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('License Tier Management', () => {
    it('should set and get license tier', () => {
      service.setLicenseTier('lic_test123', LicenseTier.PRO);
      expect(service.getLicenseTier('lic_test123')).toBe(LicenseTier.PRO);
    });

    it('should default to FREE tier', () => {
      expect(service.getLicenseTier('lic_unknown')).toBe(LicenseTier.FREE);
    });

    it('should have correct daily limits', () => {
      expect(DAILY_LIMITS[LicenseTier.FREE]).toBe(100);
      expect(DAILY_LIMITS[LicenseTier.PRO]).toBe(10000);
      expect(DAILY_LIMITS[LicenseTier.ENTERPRISE]).toBe(100000);
    });
  });

  describe('API Call Tracking', () => {
    it('should track single API call', async () => {
      service.setLicenseTier('lic_test', LicenseTier.PRO);
      const result = await service.trackApiCall('lic_test', '/api/v1/predict');
      expect(result).toBe(true);

      const status = service.getUsageStatus('lic_test');
      expect(status.currentUsage).toBe(1);
    });

    it('should track multiple API calls', async () => {
      service.setLicenseTier('lic_test', LicenseTier.PRO);

      await service.trackApiCall('lic_test', '/api/v1/predict');
      await service.trackApiCall('lic_test', '/api/v1/predict');
      await service.trackApiCall('lic_test', '/api/v1/scan');

      const status = service.getUsageStatus('lic_test');
      expect(status.currentUsage).toBe(3);
    });

    it('should track calls by endpoint', async () => {
      service.setLicenseTier('lic_test', LicenseTier.PRO);

      await service.trackApiCall('lic_test', '/api/v1/predict', 'user1');
      await service.trackApiCall('lic_test', '/api/v1/predict', 'user1');
      await service.trackApiCall('lic_test', '/api/v1/scan', 'user2');

      const breakdown = service.getEndpointBreakdown('lic_test');
      expect(breakdown['/api/v1/predict']).toBe(2);
      expect(breakdown['/api/v1/scan']).toBe(1);
    });

    it('should track unique user IDs', async () => {
      service.setLicenseTier('lic_test', LicenseTier.PRO);

      await service.trackApiCall('lic_test', '/api/v1/test', 'user1');
      await service.trackApiCall('lic_test', '/api/v1/test', 'user2');
      await service.trackApiCall('lic_test', '/api/v1/test', 'user1');

      const usage = service.getDailyUsage('lic_test');
      expect(usage?.userIds.size).toBe(2); // 2 unique users
    });
  });

  describe('Usage Status', () => {
    it('should return correct usage status', () => {
      service.setLicenseTier('lic_test', LicenseTier.PRO);
      const status = service.getUsageStatus('lic_test');

      expect(status.licenseKey).toBe('lic_test');
      expect(status.tier).toBe(LicenseTier.PRO);
      expect(status.dailyLimit).toBe(10000);
      expect(status.currentUsage).toBe(0);
      expect(status.remaining).toBe(10000);
      expect(status.percentUsed).toBe(0);
      expect(status.isExceeded).toBe(false);
    });

    it('should calculate remaining calls correctly', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      // Track 50 calls
      for (let i = 0; i < 50; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const status = service.getUsageStatus('lic_test');
      expect(status.currentUsage).toBe(50);
      expect(status.remaining).toBe(50); // 100 - 50 = 50
      expect(status.percentUsed).toBe(50);
    });

    it('should detect exceeded limit', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      // Track 101 calls (over 100 limit)
      for (let i = 0; i < 101; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const status = service.getUsageStatus('lic_test');
      expect(status.isExceeded).toBe(true);
      expect(status.overageUnits).toBe(1);
    });
  });

  describe('Overage Calculation', () => {
    it('should calculate overage cost at $0.01 per call', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      // Track 110 calls (10 over limit)
      for (let i = 0; i < 110; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const overage = service.calculateOverage('lic_test');
      expect(overage).toBe(0.1); // 10 * $0.01 = $0.10
    });

    it('should return 0 overage when within limit', async () => {
      service.setLicenseTier('lic_test', LicenseTier.PRO);

      for (let i = 0; i < 100; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const overage = service.calculateOverage('lic_test');
      expect(overage).toBe(0);
    });

    it('should calculate large overage correctly', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      // Track 200 calls (100 over limit)
      for (let i = 0; i < 200; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const status = service.getUsageStatus('lic_test');
      expect(status.overageUnits).toBe(100);
      expect(status.overageCost).toBe(1.0); // 100 * $0.01 = $1.00
    });
  });

  describe('Threshold Alerts', () => {
    it('should emit threshold alert at 80%', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      const alertPromise = new Promise((resolve) => {
        service.once('threshold_alert', (alert) => {
          resolve(alert);
        });
      });

      // Track 80 calls (80% of 100)
      for (let i = 0; i < 80; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const alert = await alertPromise as any;
      expect(alert.threshold).toBe(80);
      expect(alert.currentUsage).toBe(80);
      expect(alert.dailyLimit).toBe(100);
      expect(alert.percentUsed).toBe(80);
    });

    it('should emit threshold alert at 100%', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      const alertPromise = new Promise((resolve) => {
        service.on('threshold_alert', (alert) => {
          if (alert.threshold === 100) {
            resolve(alert);
          }
        });
      });

      // Track 100 calls (100% of 100)
      for (let i = 0; i < 100; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const alert = await alertPromise as any;
      expect(alert.threshold).toBe(100);
      expect(alert.currentUsage).toBe(100);
    });

    it('should only emit each threshold once', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      let alertCount = 0;
      service.on('threshold_alert', () => {
        alertCount++;
      });

      // Track 85 calls (should trigger 80% once)
      for (let i = 0; i < 85; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      expect(alertCount).toBe(1);

      // Track 5 more (should trigger 90% once)
      for (let i = 0; i < 5; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      expect(alertCount).toBe(2);
    });
  });

  describe('Overage Licenses', () => {
    it('should return empty array when no overage', async () => {
      service.setLicenseTier('lic_test', LicenseTier.PRO);

      for (let i = 0; i < 50; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      const overageLicenses = service.getOverageLicenses();
      expect(overageLicenses).toHaveLength(0);
    });

    it('should return licenses in overage', async () => {
      service.setLicenseTier('lic_over1', LicenseTier.FREE);
      service.setLicenseTier('lic_over2', LicenseTier.FREE);

      // Put both in overage
      for (let i = 0; i < 150; i++) {
        await service.trackApiCall('lic_over1', '/api/test');
        await service.trackApiCall('lic_over2', '/api/test');
      }

      const overageLicenses = service.getOverageLicenses();
      expect(overageLicenses.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Reset and Clear', () => {
    it('should reset usage for specific license', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      for (let i = 0; i < 50; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      expect(service.getUsageStatus('lic_test').currentUsage).toBe(50);

      service.resetUsage('lic_test');

      expect(service.getUsageStatus('lic_test').currentUsage).toBe(0);
    });

    it('should clear all usage data', async () => {
      service.setLicenseTier('lic_1', LicenseTier.FREE);
      service.setLicenseTier('lic_2', LicenseTier.PRO);

      await service.trackApiCall('lic_1', '/api/test');
      await service.trackApiCall('lic_2', '/api/test');

      service.clear();

      expect(service.getUsageStatus('lic_1').currentUsage).toBe(0);
      expect(service.getUsageStatus('lic_2').currentUsage).toBe(0);
    });
  });

  describe('Is Exceeded Check', () => {
    it('should return false when within limit', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      for (let i = 0; i < 50; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      expect(service.isExceeded('lic_test')).toBe(false);
    });

    it('should return true when exceeded', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      for (let i = 0; i < 101; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      expect(service.isExceeded('lic_test')).toBe(true);
    });
  });

  describe('Monitoring Methods', () => {
    it('should get buffer size', async () => {
      service.setLicenseTier('lic_1', LicenseTier.FREE);
      service.setLicenseTier('lic_2', LicenseTier.PRO);

      await service.trackApiCall('lic_1', '/api/test');
      await service.trackApiCall('lic_2', '/api/test');

      expect(service.getBufferSize()).toBeGreaterThan(0);
    });

    it('should get total stored events', async () => {
      service.setLicenseTier('lic_test', LicenseTier.FREE);

      for (let i = 0; i < 25; i++) {
        await service.trackApiCall('lic_test', '/api/test');
      }

      expect(service.getTotalStoredEvents()).toBe(25);
    });
  });
});
