import { describe, it, expect } from 'vitest';
import { CopyEngine, type FollowerContext } from '../../src/copy-trading/copy-engine.js';
import type { TradeResult } from '../../src/core/types.js';

function makeFollowerManager(followers: Array<{ followerId: string; allocation: number }> = []) {
  return {
    getFollowers: () => followers,
  };
}

function makeLeaderTrade(overrides: Partial<TradeResult> = {}): TradeResult {
  return {
    orderId: 'leader-o-1',
    marketId: 'BTC/USDT',
    side: 'buy',
    fillPrice: '50000',
    fillSize: '1.0',
    fees: '5',
    timestamp: Date.now(),
    strategy: 'grid-dca',
    ...overrides,
  };
}

describe('CopyEngine', () => {
  describe('replicateTrade', () => {
    it('should scale trade proportionally', () => {
      const engine = new CopyEngine(makeFollowerManager() as any);
      const ctx: FollowerContext = { followerId: 'f1', availableCapital: 5000 };
      const result = engine.replicateTrade(ctx, makeLeaderTrade(), 1.0, 10000);
      // scaleFactor = (5000 * 1.0) / 10000 = 0.5
      expect(result.scaleFactor).toBeCloseTo(0.5);
      expect(result.copiedTrade).not.toBeNull();
      expect(parseFloat(result.copiedTrade!.size)).toBeCloseTo(0.5, 4);
    });

    it('should apply allocation fraction', () => {
      const engine = new CopyEngine(makeFollowerManager() as any);
      const ctx: FollowerContext = { followerId: 'f1', availableCapital: 10000 };
      const result = engine.replicateTrade(ctx, makeLeaderTrade(), 0.5, 10000);
      // scaleFactor = (10000 * 0.5) / 10000 = 0.5
      expect(result.scaleFactor).toBeCloseTo(0.5);
    });

    it('should skip when slippage exceeds limit', () => {
      const engine = new CopyEngine(makeFollowerManager() as any);
      const ctx: FollowerContext = { followerId: 'f1', availableCapital: 5000 };
      // Leader filled at 50000, market moved to 51000 (2% drift > 1% limit)
      const result = engine.replicateTrade(ctx, makeLeaderTrade(), 1.0, 10000, 51000);
      expect(result.copiedTrade).toBeNull();
      expect(result.skipReason).toContain('slippage');
    });

    it('should allow trade within slippage limit', () => {
      const engine = new CopyEngine(makeFollowerManager() as any);
      const ctx: FollowerContext = { followerId: 'f1', availableCapital: 5000 };
      // 0.5% drift < 1% limit
      const result = engine.replicateTrade(ctx, makeLeaderTrade(), 1.0, 10000, 50250);
      expect(result.copiedTrade).not.toBeNull();
    });

    it('should skip when computed size is zero', () => {
      const engine = new CopyEngine(makeFollowerManager() as any);
      const ctx: FollowerContext = { followerId: 'f1', availableCapital: 0 };
      const result = engine.replicateTrade(ctx, makeLeaderTrade(), 1.0, 10000);
      expect(result.copiedTrade).toBeNull();
      expect(result.skipReason).toContain('zero');
    });

    it('should handle zero leader capital', () => {
      const engine = new CopyEngine(makeFollowerManager() as any);
      const ctx: FollowerContext = { followerId: 'f1', availableCapital: 5000 };
      const result = engine.replicateTrade(ctx, makeLeaderTrade(), 1.0, 0);
      expect(result.scaleFactor).toBe(0);
      expect(result.copiedTrade).toBeNull();
    });
  });

  describe('onLeaderTrade', () => {
    it('should generate copy trades for all followers', () => {
      const followers = [
        { followerId: 'f1', allocation: 0.5 },
        { followerId: 'f2', allocation: 1.0 },
      ];
      const engine = new CopyEngine(makeFollowerManager(followers) as any);
      const contexts = new Map<string, FollowerContext>([
        ['f1', { followerId: 'f1', availableCapital: 5000 }],
        ['f2', { followerId: 'f2', availableCapital: 10000 }],
      ]);
      const results = engine.onLeaderTrade('leader-1', makeLeaderTrade(), 10000, contexts);
      expect(results.length).toBe(2);
      expect(results[0].copiedTrade).not.toBeNull();
      expect(results[1].copiedTrade).not.toBeNull();
    });

    it('should skip followers without context', () => {
      const followers = [{ followerId: 'f1', allocation: 0.5 }];
      const engine = new CopyEngine(makeFollowerManager(followers) as any);
      const results = engine.onLeaderTrade('leader-1', makeLeaderTrade(), 10000, new Map());
      expect(results[0].copiedTrade).toBeNull();
      expect(results[0].skipReason).toContain('context not found');
    });

    it('should preserve original trade reference', () => {
      const followers = [{ followerId: 'f1', allocation: 1.0 }];
      const engine = new CopyEngine(makeFollowerManager(followers) as any);
      const trade = makeLeaderTrade();
      const contexts = new Map([['f1', { followerId: 'f1', availableCapital: 5000 }]]);
      const results = engine.onLeaderTrade('leader-1', trade, 10000, contexts);
      expect(results[0].originalTrade).toBe(trade);
    });

    it('should set correct symbol and side on copied trade', () => {
      const followers = [{ followerId: 'f1', allocation: 1.0 }];
      const engine = new CopyEngine(makeFollowerManager(followers) as any);
      const trade = makeLeaderTrade({ marketId: 'ETH/USDT', side: 'sell' });
      const contexts = new Map([['f1', { followerId: 'f1', availableCapital: 5000 }]]);
      const results = engine.onLeaderTrade('leader-1', trade, 10000, contexts);
      expect(results[0].copiedTrade!.symbol).toBe('ETH/USDT');
      expect(results[0].copiedTrade!.side).toBe('sell');
    });
  });
});
