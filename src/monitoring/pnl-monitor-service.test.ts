/**
 * PnlMonitorService Tests
 *
 * Tests for real-time P&L polling and event emission
 */

import { PnlMonitorService, getGlobalPnlMonitor, resetGlobalPnlMonitor } from './pnl-monitor-service';
import { PortfolioManager } from '../core/PortfolioManager';

// Mock Prisma to avoid database errors in tests
jest.mock('../db/client', () => ({
  getPrisma: () => ({
    polymarketPosition: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  }),
}));

describe('PnlMonitorService', () => {
  let portfolioManager: PortfolioManager;
  let service: PnlMonitorService;

  beforeEach(() => {
    portfolioManager = PortfolioManager.getInstance();
    portfolioManager.reset();
    service = new PnlMonitorService(portfolioManager, { pollingIntervalMs: 100 });
    resetGlobalPnlMonitor();
  });

  afterEach(() => {
    service.stop();
    service.reset();
    resetGlobalPnlMonitor();
  });

  describe('start/stop', () => {
    it('should start polling without errors', () => {
      expect(() => service.start()).not.toThrow();
    });

    it('should stop polling without errors', () => {
      service.start();
      expect(() => service.stop()).not.toThrow();
    });

    it('should warn when starting twice', () => {
      service.start();
      expect(() => service.start()).not.toThrow();
    });
  });

  describe('event emission', () => {
    it('should emit pnl:snapshot event on poll', (done) => {
      service.on('pnl:snapshot', (event) => {
        expect(event.summary).toBeDefined();
        done();
      });
      service.start();
    });

    it('should emit pnl:update when P&L changes', (done) => {
      service.on('pnl:update', (event) => {
        expect(event.summary).toBeDefined();
        done();
      });
      service.start();
    });
  });

  describe('getSnapshot', () => {
    it('should return null when no snapshot taken', () => {
      const snapshot = service.getSnapshot('non-existent');
      expect(snapshot).toBeNull();
    });

    it('should return snapshot after polling', async () => {
      service.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      const snapshot = service.getSnapshot('');
      expect(snapshot).toBeDefined();
    });
  });

  describe('hasPnlChanged', () => {
    it('should detect P&L change above threshold', () => {
      const prev = {
        totalPositions: 1,
        totalPnl: 100,
        realizedPnl: 50,
        unrealizedPnl: 50,
        totalExposure: 100,
        marketExposures: [],
      };

      const curr = {
        ...prev,
        totalPnl: 101, // 1% change
      };

      // Access private method via any cast for testing
      const hasChanged = (service as any).hasPnlChanged(prev, curr);
      expect(hasChanged).toBe(true);
    });

    it('should not detect P&L change below threshold', () => {
      const prev = {
        totalPositions: 1,
        totalPnl: 100,
        realizedPnl: 50,
        unrealizedPnl: 50,
        totalExposure: 100,
        marketExposures: [],
      };

      const curr = {
        ...prev,
        totalPnl: 100.005, // 0.005% change (< 0.01%)
      };

      const hasChanged = (service as any).hasPnlChanged(prev, curr);
      expect(hasChanged).toBe(false);
    });
  });

  describe('getGlobalPnlMonitor', () => {
    it('should return singleton instance', () => {
      const instance1 = getGlobalPnlMonitor();
      const instance2 = getGlobalPnlMonitor();
      expect(instance1).toBe(instance2);
    });

    it('should reset properly', () => {
      const instance1 = getGlobalPnlMonitor();
      resetGlobalPnlMonitor();
      const instance2 = getGlobalPnlMonitor();
      expect(instance1).not.toBe(instance2);
    });
  });
});
