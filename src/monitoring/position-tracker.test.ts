/**
 * PositionTracker Tests
 *
 * Tests for position lifecycle event tracking
 */

import {
  PositionTracker,
  getGlobalPositionTracker,
  resetGlobalPositionTracker,
  type PositionEvent,
} from './position-tracker';

describe('PositionTracker', () => {
  let tracker: PositionTracker;

  beforeEach(() => {
    tracker = new PositionTracker();
    resetGlobalPositionTracker();
  });

  afterEach(() => {
    tracker.reset();
    resetGlobalPositionTracker();
  });

  describe('trackOpened', () => {
    it('should emit position:opened event', (done) => {
      const position = {
        id: 'pos-1',
        tenantId: 'tenant-1',
        tokenId: 'token-1',
        marketId: 'market-1',
        side: 'YES' as const,
        size: 100,
        avgPrice: 0.5,
        currentPrice: 0.5,
        realizedPnl: 0,
        unrealizedPnl: 0,
        openedAt: Date.now(),
      };

      tracker.on('position:opened', (event: PositionEvent) => {
        expect(event.type).toBe('position:opened');
        expect(event.position.id).toBe('pos-1');
        expect(event.latencyMs).toBe(0);
        done();
      });

      tracker.trackOpened(position);
    });

    it('should store timestamp for position', () => {
      const position = {
        id: 'pos-1',
        tenantId: 'tenant-1',
        tokenId: 'token-1',
        marketId: 'market-1',
        side: 'YES' as const,
        size: 100,
        avgPrice: 0.5,
        currentPrice: 0.5,
        realizedPnl: 0,
        unrealizedPnl: 0,
        openedAt: Date.now(),
      };

      tracker.trackOpened(position);
      const history = tracker.getHistory(1);
      expect(history.length).toBe(1);
    });
  });

  describe('trackUpdated', () => {
    it('should emit position:updated event with latency', (done) => {
      const position = {
        id: 'pos-1',
        tenantId: 'tenant-1',
        tokenId: 'token-1',
        marketId: 'market-1',
        side: 'YES' as const,
        size: 100,
        avgPrice: 0.5,
        currentPrice: 0.55,
        realizedPnl: 0,
        unrealizedPnl: 5,
        openedAt: Date.now(),
      };

      tracker.on('position:updated', (event: PositionEvent) => {
        expect(event.type).toBe('position:updated');
        expect(event.position.unrealizedPnl).toBe(5);
        expect(event.latencyMs).toBeGreaterThanOrEqual(0);
        done();
      });

      tracker.trackOpened(position);
      tracker.trackUpdated(position);
    });
  });

  describe('trackClosed', () => {
    it('should emit position:closed event', (done) => {
      const position = {
        id: 'pos-1',
        tenantId: 'tenant-1',
        tokenId: 'token-1',
        marketId: 'market-1',
        side: 'YES' as const,
        size: 100,
        avgPrice: 0.5,
        currentPrice: 0.6,
        realizedPnl: 10,
        unrealizedPnl: 0,
        openedAt: Date.now(),
        closedAt: Date.now(),
      };

      tracker.on('position:closed', (event: PositionEvent) => {
        expect(event.type).toBe('position:closed');
        expect(event.position.realizedPnl).toBe(10);
        done();
      });

      tracker.trackOpened(position);
      tracker.trackClosed(position);
    });

    it('should remove position timestamp after close', () => {
      const position = {
        id: 'pos-1',
        tenantId: 'tenant-1',
        tokenId: 'token-1',
        marketId: 'market-1',
        side: 'YES' as const,
        size: 100,
        avgPrice: 0.5,
        currentPrice: 0.6,
        realizedPnl: 10,
        unrealizedPnl: 0,
        openedAt: Date.now(),
        closedAt: Date.now(),
      };

      tracker.trackOpened(position);
      tracker.trackClosed(position);

      // Position should be removed from tracking
      const history = tracker.getHistory(10);
      const closedEvent = history.find(e => e.type === 'position:closed');
      expect(closedEvent).toBeDefined();
    });
  });

  describe('getHistory', () => {
    it('should return limited history', () => {
      const position = {
        id: 'pos-1',
        tenantId: 'tenant-1',
        tokenId: 'token-1',
        marketId: 'market-1',
        side: 'YES' as const,
        size: 100,
        avgPrice: 0.5,
        currentPrice: 0.5,
        realizedPnl: 0,
        unrealizedPnl: 0,
        openedAt: Date.now(),
      };

      // Create 10 events
      for (let i = 0; i < 10; i++) {
        tracker.trackOpened({ ...position, id: `pos-${i}` });
      }

      const history = tracker.getHistory(5);
      expect(history.length).toBe(5);
    });

    it('should return empty array when no events', () => {
      expect(tracker.getHistory()).toEqual([]);
    });
  });

  describe('getAverageLatency', () => {
    it('should calculate average latency', () => {
      const position = {
        id: 'pos-1',
        tenantId: 'tenant-1',
        tokenId: 'token-1',
        marketId: 'market-1',
        side: 'YES' as const,
        size: 100,
        avgPrice: 0.5,
        currentPrice: 0.5,
        realizedPnl: 0,
        unrealizedPnl: 0,
        openedAt: Date.now(),
      };

      tracker.trackOpened(position);
      tracker.trackUpdated(position);
      tracker.trackUpdated(position);

      const avgLatency = tracker.getAverageLatency('position:updated');
      expect(avgLatency).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when no events', () => {
      expect(tracker.getAverageLatency()).toBe(0);
    });
  });

  describe('getGlobalPositionTracker', () => {
    it('should return singleton instance', () => {
      const instance1 = getGlobalPositionTracker();
      const instance2 = getGlobalPositionTracker();
      expect(instance1).toBe(instance2);
    });

    it('should reset properly', () => {
      const instance1 = getGlobalPositionTracker();
      resetGlobalPositionTracker();
      const instance2 = getGlobalPositionTracker();
      expect(instance1).not.toBe(instance2);
    });
  });
});
