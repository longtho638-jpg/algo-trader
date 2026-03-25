import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calcTickSeries,
  countConsecutiveTicks,
  isBurstConfirmed,
  createTickMomentumBurstTick,
  DEFAULT_CONFIG,
  type TickMomentumBurstConfig,
  type TickMomentumBurstDeps,
} from '../../src/strategies/polymarket/tick-momentum-burst.js';
import type { RawOrderBook } from '../../src/polymarket/clob-client.js';

// ── Helper: build a mock orderbook ──────────────────────────────────────────

function makeBook(bids: [string, string][], asks: [string, string][]): RawOrderBook {
  return {
    market: 'test-market',
    asset_id: 'test-token',
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    hash: 'abc',
  };
}

function makeConfig(overrides: Partial<TickMomentumBurstConfig> = {}): TickMomentumBurstConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    conditionId: 'cond-1',
    slug: 'test-market',
    title: 'Test Market',
    yesTokenId: 'yes-token-1',
    noTokenId: 'no-token-1',
    closed: false,
    resolved: false,
    volume: 10000,
    eventSlug: 'event-1',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<TickMomentumBurstDeps> = {}): TickMomentumBurstDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook([['0.50', '100']], [['0.55', '100']]),
      ),
    } as any,
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as any,
    eventBus: {
      emit: vi.fn(),
    } as any,
    gamma: {
      getTrending: vi.fn().mockResolvedValue([makeMarket()]),
    } as any,
    ...overrides,
  };
}

// ── calcTickSeries tests ────────────────────────────────────────────────────

describe('calcTickSeries', () => {
  it('returns differences for rising prices', () => {
    expect(calcTickSeries([0.50, 0.51, 0.53])).toEqual([0.010000000000000009, 0.020000000000000018]);
    // Approximately [0.01, 0.02]
    const result = calcTickSeries([0.50, 0.51, 0.53]);
    expect(result[0]).toBeCloseTo(0.01, 4);
    expect(result[1]).toBeCloseTo(0.02, 4);
  });

  it('returns differences for falling prices', () => {
    const result = calcTickSeries([0.60, 0.58, 0.55]);
    expect(result[0]).toBeCloseTo(-0.02, 4);
    expect(result[1]).toBeCloseTo(-0.03, 4);
  });

  it('returns differences for mixed prices', () => {
    const result = calcTickSeries([0.50, 0.52, 0.48]);
    expect(result[0]).toBeCloseTo(0.02, 4);
    expect(result[1]).toBeCloseTo(-0.04, 4);
  });

  it('returns empty array for single price', () => {
    expect(calcTickSeries([0.50])).toEqual([]);
  });

  it('returns empty array for no prices', () => {
    expect(calcTickSeries([])).toEqual([]);
  });

  it('returns single difference for two prices', () => {
    const result = calcTickSeries([0.40, 0.45]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(0.05, 4);
  });
});

// ── countConsecutiveTicks tests ─────────────────────────────────────────────

describe('countConsecutiveTicks', () => {
  it('counts all-up ticks', () => {
    const result = countConsecutiveTicks([0.01, 0.02, 0.015, 0.01]);
    expect(result.count).toBe(4);
    expect(result.direction).toBe('up');
    expect(result.avgSize).toBeCloseTo(0.01375, 4);
  });

  it('counts all-down ticks', () => {
    const result = countConsecutiveTicks([-0.01, -0.02, -0.03]);
    expect(result.count).toBe(3);
    expect(result.direction).toBe('down');
    expect(result.avgSize).toBeCloseTo(0.02, 4);
  });

  it('counts from end when mixed ending up', () => {
    const result = countConsecutiveTicks([-0.01, -0.02, 0.01, 0.02]);
    expect(result.count).toBe(2);
    expect(result.direction).toBe('up');
  });

  it('counts from end when mixed ending down', () => {
    const result = countConsecutiveTicks([0.01, 0.02, -0.01, -0.02]);
    expect(result.count).toBe(2);
    expect(result.direction).toBe('down');
  });

  it('returns flat for single zero tick', () => {
    const result = countConsecutiveTicks([0]);
    expect(result.count).toBe(0);
    expect(result.direction).toBe('flat');
    expect(result.avgSize).toBe(0);
  });

  it('returns flat for empty ticks', () => {
    const result = countConsecutiveTicks([]);
    expect(result.count).toBe(0);
    expect(result.direction).toBe('flat');
    expect(result.avgSize).toBe(0);
  });

  it('counts single non-zero tick', () => {
    const result = countConsecutiveTicks([0.05]);
    expect(result.count).toBe(1);
    expect(result.direction).toBe('up');
    expect(result.avgSize).toBeCloseTo(0.05, 4);
  });

  it('stops at zero tick in sequence', () => {
    const result = countConsecutiveTicks([0.01, 0, 0.02, 0.03]);
    expect(result.count).toBe(2);
    expect(result.direction).toBe('up');
  });

  it('handles alternating ticks', () => {
    const result = countConsecutiveTicks([0.01, -0.01, 0.01, -0.01]);
    expect(result.count).toBe(1);
    expect(result.direction).toBe('down');
  });
});

// ── isBurstConfirmed tests ──────────────────────────────────────────────────

describe('isBurstConfirmed', () => {
  const cfg = { burstThreshold: 5, minTickSize: 0.002, volumeMultiplier: 2.0 };

  it('returns true when all conditions met', () => {
    expect(isBurstConfirmed(5, 0.003, 2.5, cfg)).toBe(true);
  });

  it('returns false when count too low', () => {
    expect(isBurstConfirmed(4, 0.003, 2.5, cfg)).toBe(false);
  });

  it('returns false when tick size too small', () => {
    expect(isBurstConfirmed(5, 0.001, 2.5, cfg)).toBe(false);
  });

  it('returns false when volume too low', () => {
    expect(isBurstConfirmed(5, 0.003, 1.5, cfg)).toBe(false);
  });

  it('returns true at exact thresholds', () => {
    expect(isBurstConfirmed(5, 0.002, 2.0, cfg)).toBe(true);
  });

  it('returns false when all below threshold', () => {
    expect(isBurstConfirmed(3, 0.001, 1.0, cfg)).toBe(false);
  });

  it('returns true with high values', () => {
    expect(isBurstConfirmed(20, 0.05, 10.0, cfg)).toBe(true);
  });
});

// ── createTickMomentumBurstTick tests ───────────────────────────────────────

describe('createTickMomentumBurstTick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  it('returns a function', () => {
    const tick = createTickMomentumBurstTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('handles API error from gamma gracefully', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockRejectedValue(new Error('API down')) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles clob error gracefully', async () => {
    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('Network error')) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips closed markets', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket({ closed: true })]) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket({ resolved: true })]) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets without yesTokenId', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket({ yesTokenId: undefined })]) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets below volume threshold', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket({ volume: 100 })]) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not enter with insufficient price history (needs 3+ snapshots)', async () => {
    const deps = makeDeps();
    const tick = createTickMomentumBurstTick(deps);
    // First two ticks only build price history
    await tick();
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('handles empty markets list', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([]) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles empty orderbook', async () => {
    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockResolvedValue(makeBook([], [])) } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('accepts config overrides', async () => {
    const deps = makeDeps({ config: { burstThreshold: 3, positionSize: '20' } });
    const tick = createTickMomentumBurstTick(deps);
    expect(typeof tick).toBe('function');
  });

  it('enters BUY YES on upward burst', async () => {
    // Create rising prices that form a burst
    let callCount = 0;
    const prices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++, prices.length - 1)];
          return Promise.resolve(
            makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]),
          );
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20 },
    });

    const tick = createTickMomentumBurstTick(deps);

    // Build price history across multiple ticks
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
    expect(call.side).toBe('buy');
    expect(call.tokenId).toBe('yes-token-1');
  });

  it('enters BUY NO on downward burst', async () => {
    let callCount = 0;
    const prices = [0.60, 0.59, 0.58, 0.57, 0.56, 0.55, 0.54, 0.53];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++, prices.length - 1)];
          return Promise.resolve(
            makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]),
          );
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20 },
    });

    const tick = createTickMomentumBurstTick(deps);

    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
    expect(call.side).toBe('buy');
    expect(call.tokenId).toBe('no-token-1');
  });

  it('does not enter when burst count below threshold', async () => {
    let callCount = 0;
    // Only 2 ticks up, then direction change
    const prices = [0.50, 0.51, 0.52, 0.48, 0.50];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++, prices.length - 1)];
          return Promise.resolve(
            makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]),
          );
        }),
      } as any,
      config: { burstThreshold: 5 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('emits trade.executed event on entry', async () => {
    let callCount = 0;
    const prices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++, prices.length - 1)];
          return Promise.resolve(
            makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]),
          );
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    expect(deps.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({
      trade: expect.objectContaining({
        strategy: 'tick-momentum-burst',
        side: 'buy',
      }),
    }));
  });

  it('respects maxPositions limit', async () => {
    let callCount = 0;
    const prices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47, 0.48, 0.49];

    const markets = Array.from({ length: 10 }, (_, i) => makeMarket({
      conditionId: `cond-${i}`,
      yesTokenId: `yes-${i}`,
      noTokenId: `no-${i}`,
    }));

    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++ % prices.length, prices.length - 1)];
          return Promise.resolve(
            makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]),
          );
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20, maxPositions: 2 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 15; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    // Count unique entry orders (placeOrder calls that are GTC entries)
    const placeCalls = (deps.orderManager.placeOrder as any).mock.calls;
    const entryCalls = placeCalls.filter((c: any) => c[0].orderType === 'GTC');
    expect(entryCalls.length).toBeLessThanOrEqual(2);
  });

  it('exits on take-profit', async () => {
    // First build a position, then price rises for TP
    let callCount = 0;
    const entryPrices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47];
    const exitPrice = 0.55; // >2% above entry

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          if (callCount < entryPrices.length) {
            const p = entryPrices[callCount++];
            return Promise.resolve(makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]));
          }
          return Promise.resolve(makeBook([[String(exitPrice - 0.01), '200']], [[String(exitPrice + 0.01), '200']]));
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20, takeProfitPct: 0.02 },
    });

    const tick = createTickMomentumBurstTick(deps);
    // Build position
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    // Now trigger exit with high price
    vi.advanceTimersByTime(1000);
    await tick();

    const placeCalls = (deps.orderManager.placeOrder as any).mock.calls;
    const exitCalls = placeCalls.filter((c: any) => c[0].orderType === 'IOC');
    expect(exitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('exits on stop-loss', async () => {
    let callCount = 0;
    const entryPrices = [0.50, 0.51, 0.52, 0.53, 0.54, 0.55, 0.56, 0.57];
    const exitPrice = 0.45; // well below entry for stop-loss

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          if (callCount < entryPrices.length) {
            const p = entryPrices[callCount++];
            return Promise.resolve(makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]));
          }
          return Promise.resolve(makeBook([[String(exitPrice - 0.01), '200']], [[String(exitPrice + 0.01), '200']]));
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20, stopLossPct: 0.015 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    vi.advanceTimersByTime(1000);
    await tick();

    const placeCalls = (deps.orderManager.placeOrder as any).mock.calls;
    const exitCalls = placeCalls.filter((c: any) => c[0].orderType === 'IOC');
    expect(exitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('exits on max hold time', async () => {
    let callCount = 0;
    const entryPrices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = entryPrices[Math.min(callCount++, entryPrices.length - 1)];
          return Promise.resolve(makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]));
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20, maxHoldMs: 60_000 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    // Advance past max hold time
    vi.advanceTimersByTime(120_000);
    await tick();

    const placeCalls = (deps.orderManager.placeOrder as any).mock.calls;
    const exitCalls = placeCalls.filter((c: any) => c[0].orderType === 'IOC');
    expect(exitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('respects cooldown after exit', async () => {
    let callCount = 0;
    const entryPrices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = entryPrices[Math.min(callCount++, entryPrices.length - 1)];
          return Promise.resolve(makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]));
        }),
      } as any,
      config: {
        burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5,
        priceWindow: 20, maxHoldMs: 5000, cooldownMs: 300_000,
      },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    // Force exit via max hold
    vi.advanceTimersByTime(10_000);
    await tick();

    const beforeCount = (deps.orderManager.placeOrder as any).mock.calls.length;

    // Try to re-enter immediately — should be blocked by cooldown
    callCount = 0;
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    const afterCount = (deps.orderManager.placeOrder as any).mock.calls.length;
    // Only IOC exit should have been placed, no new GTC entries during cooldown
    const newEntryCalls = (deps.orderManager.placeOrder as any).mock.calls
      .slice(beforeCount)
      .filter((c: any) => c[0].orderType === 'GTC');
    expect(newEntryCalls.length).toBe(0);
  });

  it('does not duplicate position for same token', async () => {
    let callCount = 0;
    const prices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47, 0.48, 0.49, 0.50, 0.51];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++, prices.length - 1)];
          return Promise.resolve(makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]));
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20, maxPositions: 10 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    // Should only have 1 entry for same market
    const entryCalls = (deps.orderManager.placeOrder as any).mock.calls
      .filter((c: any) => c[0].orderType === 'GTC');
    expect(entryCalls.length).toBe(1);
  });

  it('scans multiple markets', async () => {
    const markets = [
      makeMarket({ conditionId: 'cond-A', yesTokenId: 'yes-A', noTokenId: 'no-A' }),
      makeMarket({ conditionId: 'cond-B', yesTokenId: 'yes-B', noTokenId: 'no-B' }),
    ];

    let callCount = 0;
    const prices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47];

    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++ % prices.length, prices.length - 1)];
          return Promise.resolve(makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]));
        }),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    // Should have attempted entries on multiple markets
    expect(deps.clob.getOrderBook).toHaveBeenCalled();
  });

  it('uses default config values correctly', () => {
    expect(DEFAULT_CONFIG.burstThreshold).toBe(5);
    expect(DEFAULT_CONFIG.minTickSize).toBe(0.002);
    expect(DEFAULT_CONFIG.volumeMultiplier).toBe(2.0);
    expect(DEFAULT_CONFIG.tickWindow).toBe(50);
    expect(DEFAULT_CONFIG.priceWindow).toBe(20);
    expect(DEFAULT_CONFIG.minVolume).toBe(3000);
    expect(DEFAULT_CONFIG.takeProfitPct).toBe(0.02);
    expect(DEFAULT_CONFIG.stopLossPct).toBe(0.015);
    expect(DEFAULT_CONFIG.maxHoldMs).toBe(600000);
    expect(DEFAULT_CONFIG.maxPositions).toBe(5);
    expect(DEFAULT_CONFIG.cooldownMs).toBe(60000);
    expect(DEFAULT_CONFIG.positionSize).toBe('8');
  });

  it('skips markets with mid price at 0 or 1', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook([['0.00', '100']], [['0.00', '100']])),
      } as any,
    });
    const tick = createTickMomentumBurstTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('handles placeOrder failure gracefully', async () => {
    let callCount = 0;
    const prices = [0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47];

    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockImplementation(() => {
          const p = prices[Math.min(callCount++, prices.length - 1)];
          return Promise.resolve(makeBook([[String(p - 0.01), '200']], [[String(p + 0.01), '200']]));
        }),
      } as any,
      orderManager: {
        placeOrder: vi.fn().mockRejectedValue(new Error('Order rejected')),
      } as any,
      config: { burstThreshold: 3, minTickSize: 0.001, volumeMultiplier: 0.5, priceWindow: 20 },
    });

    const tick = createTickMomentumBurstTick(deps);
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      await tick();
    }

    // Should not crash
    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
  });
});
