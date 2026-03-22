import { describe, it, expect, vi } from 'vitest';
import { StealthExecutor, DEFAULT_STEALTH_CONFIG, type StealthConfig } from '../../src/trading-room/stealth-executor.js';

function makeExecutor() {
  return {
    execute: vi.fn().mockResolvedValue({
      orderId: 'o-1', fillPrice: '100', fillSize: '1', fees: '0.1',
      side: 'buy', marketId: 'BTC/USDT', strategy: 'grid-dca', timestamp: Date.now(),
    }),
  };
}

describe('StealthExecutor', () => {
  describe('splitOrder', () => {
    it('should return single chunk for count <= 1', () => {
      const se = new StealthExecutor(makeExecutor() as any);
      expect(se.splitOrder(100, 1)).toEqual([100]);
    });

    it('should split into correct number of chunks', () => {
      const se = new StealthExecutor(makeExecutor() as any);
      const chunks = se.splitOrder(100, 5);
      expect(chunks).toHaveLength(5);
    });

    it('should preserve total size across chunks', () => {
      const se = new StealthExecutor(makeExecutor() as any);
      const chunks = se.splitOrder(1000, 4);
      const sum = chunks.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1000, 6);
    });

    it('should produce non-negative chunks', () => {
      const se = new StealthExecutor(makeExecutor() as any);
      const chunks = se.splitOrder(10, 3);
      expect(chunks.every(c => c >= 0)).toBe(true);
    });
  });

  describe('addTimingJitter', () => {
    it('should return value within 0.7x-1.3x range', () => {
      const se = new StealthExecutor(makeExecutor() as any);
      for (let i = 0; i < 50; i++) {
        const jitter = se.addTimingJitter(1000);
        expect(jitter).toBeGreaterThanOrEqual(700);
        expect(jitter).toBeLessThanOrEqual(1300);
      }
    });
  });

  describe('randomizeSize', () => {
    it('should return value within ±pct range', () => {
      const se = new StealthExecutor(makeExecutor() as any);
      for (let i = 0; i < 50; i++) {
        const size = se.randomizeSize(1000, 0.05);
        expect(size).toBeGreaterThanOrEqual(950);
        expect(size).toBeLessThanOrEqual(1050);
      }
    });
  });

  describe('execute', () => {
    it('should passthrough when stealth disabled', async () => {
      const executor = makeExecutor();
      const config: StealthConfig = { ...DEFAULT_STEALTH_CONFIG, enabled: false };
      const se = new StealthExecutor(executor as any, config);
      const results = await se.execute({ marketType: 'cex', exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', size: '100', strategy: 'grid-dca' } as any);
      expect(results).toHaveLength(1);
      expect(executor.execute).toHaveBeenCalledTimes(1);
    });

    it('should split order into chunks when enabled', async () => {
      const executor = makeExecutor();
      const config: StealthConfig = { enabled: true, sizeSplitCount: 3, timingJitterMs: 1, sizeRandomPct: 0 };
      const se = new StealthExecutor(executor as any, config);
      const results = await se.execute({ marketType: 'cex', exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', size: '100', strategy: 'grid-dca' } as any);
      expect(results).toHaveLength(3);
      expect(executor.execute).toHaveBeenCalledTimes(3);
    });
  });
});
