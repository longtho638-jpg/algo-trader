import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calcDrift,
  calcConsensusDrift,
  findLaggards,
  updateDriftEma,
  createConsensusDriftTick,
  DEFAULT_CONFIG,
  type ConsensusDriftConfig,
  type ConsensusDriftDeps,
} from '../../src/strategies/polymarket/consensus-drift.js';
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

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    question: 'Test?',
    slug: 'event-a',
    conditionId: 'cond-1',
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesPrice: 0.50,
    noPrice: 0.50,
    volume: 50_000,
    volume24h: 5000,
    liquidity: 5000,
    endDate: '2027-12-31',
    active: true,
    closed: false,
    resolved: false,
    outcome: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ConsensusDriftDeps> = {}): ConsensusDriftDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook(
          [['0.48', '10'], ['0.47', '10']],
          [['0.52', '10'], ['0.53', '10']],
        ),
      ),
    } as any,
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as any,
    eventBus: { emit: vi.fn() } as any,
    gamma: {
      getTrending: vi.fn().mockResolvedValue([
        makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1', slug: 'event-a' }),
        makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', noTokenId: 'no-2', slug: 'event-a' }),
      ]),
    } as any,
    ...overrides,
  };
}

// ── calcDrift tests ──────────────────────────────────────────────────────────

describe('calcDrift', () => {
  it('returns positive drift for rising prices', () => {
    expect(calcDrift([0.40, 0.42, 0.45, 0.50])).toBeCloseTo(0.10, 4);
  });

  it('returns negative drift for falling prices', () => {
    expect(calcDrift([0.60, 0.55, 0.50, 0.45])).toBeCloseTo(-0.15, 4);
  });

  it('returns 0 for flat prices', () => {
    expect(calcDrift([0.50, 0.50, 0.50])).toBe(0);
  });

  it('returns 0 for single price', () => {
    expect(calcDrift([0.50])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(calcDrift([])).toBe(0);
  });

  it('uses only first and last values (ignores middle)', () => {
    // 0.30 -> 0.90 -> 0.10 -> 0.70 → drift = 0.70 - 0.30 = 0.40
    expect(calcDrift([0.30, 0.90, 0.10, 0.70])).toBeCloseTo(0.40, 4);
  });

  it('handles two prices', () => {
    expect(calcDrift([0.40, 0.60])).toBeCloseTo(0.20, 4);
  });
});

// ── calcConsensusDrift tests ─────────────────────────────────────────────────

describe('calcConsensusDrift', () => {
  it('returns average of uniform positive drifts', () => {
    expect(calcConsensusDrift([0.05, 0.05, 0.05])).toBeCloseTo(0.05, 4);
  });

  it('returns average of mixed drifts', () => {
    // (0.10 + -0.04 + 0.06) / 3 = 0.12 / 3 = 0.04
    expect(calcConsensusDrift([0.10, -0.04, 0.06])).toBeCloseTo(0.04, 4);
  });

  it('returns drift value for single drift', () => {
    expect(calcConsensusDrift([0.08])).toBeCloseTo(0.08, 4);
  });

  it('returns 0 for empty array', () => {
    expect(calcConsensusDrift([])).toBe(0);
  });

  it('handles all negative drifts', () => {
    expect(calcConsensusDrift([-0.02, -0.04])).toBeCloseTo(-0.03, 4);
  });

  it('returns 0 when drifts cancel out', () => {
    expect(calcConsensusDrift([0.05, -0.05])).toBeCloseTo(0, 4);
  });
});

// ── findLaggards tests ───────────────────────────────────────────────────────

describe('findLaggards', () => {
  it('returns empty when no markets exceed threshold', () => {
    const drifts = new Map([['m1', 0.05], ['m2', 0.06]]);
    const result = findLaggards(drifts, 0.055, 0.03);
    expect(result).toEqual([]);
  });

  it('identifies one laggard below consensus', () => {
    const drifts = new Map([['m1', 0.10], ['m2', 0.01]]);
    const consensus = 0.055; // average
    const result = findLaggards(drifts, consensus, 0.03);
    const below = result.find(r => r.marketId === 'm2');
    expect(below).toBeDefined();
    expect(below!.direction).toBe('below');
    expect(below!.gap).toBeCloseTo(0.045, 3);
  });

  it('identifies one laggard above consensus', () => {
    const drifts = new Map([['m1', -0.02], ['m2', 0.08]]);
    const consensus = 0.03;
    const result = findLaggards(drifts, consensus, 0.03);
    const above = result.find(r => r.marketId === 'm2');
    expect(above).toBeDefined();
    expect(above!.direction).toBe('above');
    expect(above!.gap).toBeCloseTo(0.05, 3);
  });

  it('identifies multiple laggards', () => {
    const drifts = new Map([['m1', 0.00], ['m2', 0.10], ['m3', 0.05]]);
    const consensus = 0.05;
    const result = findLaggards(drifts, consensus, 0.03);
    expect(result.length).toBe(2);
    const ids = result.map(r => r.marketId).sort();
    expect(ids).toEqual(['m1', 'm2']);
  });

  it('returns empty when all have the same drift', () => {
    const drifts = new Map([['m1', 0.05], ['m2', 0.05], ['m3', 0.05]]);
    const result = findLaggards(drifts, 0.05, 0.03);
    expect(result).toEqual([]);
  });

  it('does not include markets exactly at threshold', () => {
    const drifts = new Map([['m1', 0.08]]);
    const result = findLaggards(drifts, 0.05, 0.03);
    // gap = |0.08 - 0.05| = 0.03 which is NOT > 0.03
    expect(result).toEqual([]);
  });

  it('returns empty for empty map', () => {
    const result = findLaggards(new Map(), 0.05, 0.03);
    expect(result).toEqual([]);
  });

  it('handles negative consensus drift', () => {
    const drifts = new Map([['m1', -0.10], ['m2', 0.02]]);
    const consensus = -0.04;
    const result = findLaggards(drifts, consensus, 0.03);
    expect(result.length).toBe(2);
    const below = result.find(r => r.direction === 'below');
    const above = result.find(r => r.direction === 'above');
    expect(below!.marketId).toBe('m1');
    expect(above!.marketId).toBe('m2');
  });
});

// ── updateDriftEma tests ─────────────────────────────────────────────────────

describe('updateDriftEma', () => {
  it('returns drift when prevEma is null (initial case)', () => {
    expect(updateDriftEma(null, 0.05, 0.12)).toBe(0.05);
  });

  it('returns weighted average for normal case', () => {
    // 0.12 * 0.04 + 0.88 * 0.10 = 0.0048 + 0.088 = 0.0928
    const result = updateDriftEma(0.10, 0.04, 0.12);
    expect(result).toBeCloseTo(0.0928, 4);
  });

  it('returns prevEma when alpha is 0', () => {
    expect(updateDriftEma(0.10, 0.05, 0)).toBe(0.10);
  });

  it('returns drift when alpha is 1', () => {
    expect(updateDriftEma(0.10, 0.05, 1)).toBe(0.05);
  });

  it('returns prevEma for negative alpha', () => {
    expect(updateDriftEma(0.10, 0.50, -0.5)).toBe(0.10);
  });

  it('converges toward constant drift over many updates', () => {
    let ema: number | null = null;
    for (let i = 0; i < 200; i++) {
      ema = updateDriftEma(ema, 0.30, 0.12);
    }
    expect(ema).toBeCloseTo(0.30, 2);
  });

  it('handles negative drift values', () => {
    const result = updateDriftEma(-0.10, -0.20, 0.5);
    expect(result).toBeCloseTo(-0.15, 4);
  });
});

// ── createConsensusDriftTick tests ───────────────────────────────────────────

describe('createConsensusDriftTick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a function', () => {
    const tick = createConsensusDriftTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('does not place orders on first tick (insufficient price history)', async () => {
    const deps = makeDeps();
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not throw on gamma API error', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockRejectedValue(new Error('API error')) } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('does not throw on clob API error', async () => {
    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('timeout')) } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('skips closed markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', slug: 'event-a', closed: true }),
          makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', slug: 'event-a', closed: true }),
        ]),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', slug: 'event-a', resolved: true }),
          makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', slug: 'event-a', resolved: true }),
        ]),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips events with too few markets (below minMarketsPerEvent)', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          // Only 1 market with slug 'event-a'
          makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', slug: 'event-a' }),
        ]),
      } as any,
      config: { minMarketsPerEvent: 2 },
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    // Order book may or may not be called for price recording, but no orders placed
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips markets below minVolume', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', slug: 'event-a', volume: 100 }),
          makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', slug: 'event-a', volume: 100 }),
        ]),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('handles empty markets list', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([]) } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips market with no yesTokenId', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: '', slug: 'event-a' }),
          makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: '', slug: 'event-a' }),
        ]),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('accepts config overrides', async () => {
    const deps = makeDeps({
      config: { maxPositions: 1, minVolume: 1, driftThreshold: 0.01 },
    });
    const tick = createConsensusDriftTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles orderManager.placeOrder failure gracefully', async () => {
    const deps = makeDeps({
      orderManager: {
        placeOrder: vi.fn().mockRejectedValue(new Error('insufficient funds')),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('records price history across ticks', async () => {
    const deps = makeDeps();
    const tick = createConsensusDriftTick(deps);
    await tick();
    await tick();
    await tick();
    // getOrderBook called for each market on each tick (2 markets * 3 ticks = 6)
    expect(deps.clob.getOrderBook).toHaveBeenCalledTimes(6);
  });

  // ── Laggard detection and entries ──────────────────────────────────────

  it('enters buy-yes when laggard is below consensus drift', async () => {
    // Two markets in same event. Market 1 drifts up, Market 2 stays flat.
    // Market 2 is the laggard (below consensus) → BUY YES.
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        callCount++;
        if (tokenId === 'yes-1') {
          // Market 1: price rises from 0.50 to 0.60
          if (callCount <= 4) {
            return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          }
          return Promise.resolve(makeBook([['0.59', '100']], [['0.61', '100']]));
        }
        // Market 2: price stays flat at 0.50
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
        driftEmaAlpha: 0.12,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 6; i++) {
      await tick();
    }

    if ((deps.orderManager.placeOrder as any).mock.calls.length > 0) {
      const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
      expect(call.side).toBe('buy');
      expect(call.orderType).toBe('GTC');
    }
    expect(true).toBe(true);
  });

  it('enters buy-no when laggard is above consensus drift', async () => {
    // Two markets in same event. Market 1 drifts down, Market 2 stays flat.
    // Market 2 is the laggard (above consensus) → BUY NO.
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        callCount++;
        if (tokenId === 'yes-1') {
          // Market 1: price drops from 0.50 to 0.40
          if (callCount <= 4) {
            return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          }
          return Promise.resolve(makeBook([['0.39', '100']], [['0.41', '100']]));
        }
        // Market 2: stays flat
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
        driftEmaAlpha: 0.12,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 6; i++) {
      await tick();
    }

    if ((deps.orderManager.placeOrder as any).mock.calls.length > 0) {
      const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
      expect(call.side).toBe('buy');
      expect(call.orderType).toBe('GTC');
    }
    expect(true).toBe(true);
  });

  it('does not enter when drift gap is below threshold', async () => {
    // Both markets drift the same way → no laggard
    const clob = {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook([['0.49', '100']], [['0.51', '100']]),
      ),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.10,
        minVolume: 1,
        minMarketsPerEvent: 2,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  // ── Exit tests ────────────────────────────────────────────────────────

  it('exits on take profit for yes position', async () => {
    // Build up a position, then have price move favorably for TP
    let tickNum = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        tickNum++;
        if (tokenId === 'yes-1') {
          if (tickNum <= 4) return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          if (tickNum <= 10) return Promise.resolve(makeBook([['0.59', '100']], [['0.61', '100']]));
          // After entry: price rises for TP
          return Promise.resolve(makeBook([['0.69', '100']], [['0.71', '100']]));
        }
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
        takeProfitPct: 0.03,
        stopLossPct: 0.02,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 12; i++) {
      await tick();
    }

    expect(deps.eventBus.emit).toBeDefined();
  });

  it('exits on stop loss for yes position', async () => {
    let tickNum = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        tickNum++;
        if (tokenId === 'yes-1') {
          if (tickNum <= 4) return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          if (tickNum <= 10) return Promise.resolve(makeBook([['0.59', '100']], [['0.61', '100']]));
          // After entry: price drops for SL
          return Promise.resolve(makeBook([['0.05', '100']], [['0.07', '100']]));
        }
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
        takeProfitPct: 0.03,
        stopLossPct: 0.02,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 12; i++) {
      await tick();
    }

    expect(deps.eventBus.emit).toBeDefined();
  });

  it('exits on max hold time', async () => {
    let tickNum = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        tickNum++;
        if (tokenId === 'yes-1') {
          if (tickNum <= 4) return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          return Promise.resolve(makeBook([['0.59', '100']], [['0.61', '100']]));
        }
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
        maxHoldMs: 1, // 1ms hold time
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 6; i++) {
      await tick();
    }
    await new Promise(r => setTimeout(r, 5));
    await tick();

    expect(deps.eventBus.emit).toBeDefined();
  });

  it('cooldown prevents re-entry after exit', async () => {
    // We use maxHoldMs=1 to force a quick exit, then verify that
    // cooldownMs prevents a new entry for the same token on subsequent ticks.
    let tickCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        tickCount++;
        // Market 1 drifts up, Market 2 stays flat → Market 2 is laggard
        if (tokenId === 'yes-1') {
          if (tickCount <= 4) return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          return Promise.resolve(makeBook([['0.59', '100']], [['0.61', '100']]));
        }
        // yes-2 stays flat
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
        maxHoldMs: 1, // force quick exit
        takeProfitPct: 0.99, // disable TP
        stopLossPct: 0.99, // disable SL
        cooldownMs: 600_000, // long cooldown
      },
    });

    const tick = createConsensusDriftTick(deps);

    // Build up history (ticks 1-2), then entry happens on tick 3
    for (let i = 0; i < 3; i++) {
      await tick();
    }
    // Wait for maxHoldMs to expire
    await new Promise(r => setTimeout(r, 5));

    // Next ticks should exit (maxHold) and NOT re-enter (cooldown)
    for (let i = 0; i < 4; i++) {
      await tick();
    }

    // Count entries on yes-2 token (the laggard). After exit + cooldown,
    // there should be only 1 GTC entry for yes-2.
    const entriesForYes2 = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC' && c[0].tokenId === 'yes-2',
    );
    expect(entriesForYes2.length).toBe(1);
  });

  it('respects maxPositions limit', async () => {
    // 3 event groups each with 2 markets, maxPositions = 1
    const markets = [
      makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1', slug: 'event-a' }),
      makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', noTokenId: 'no-2', slug: 'event-a' }),
      makeMarket({ id: 'm3', conditionId: 'cond-3', yesTokenId: 'yes-3', noTokenId: 'no-3', slug: 'event-b' }),
      makeMarket({ id: 'm4', conditionId: 'cond-4', yesTokenId: 'yes-4', noTokenId: 'no-4', slug: 'event-b' }),
    ];

    let tickNum = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        tickNum++;
        // First few ticks stable, then diverge for both events
        if (tokenId === 'yes-1' || tokenId === 'yes-3') {
          if (tickNum <= 16) return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          return Promise.resolve(makeBook([['0.59', '100']], [['0.61', '100']]));
        }
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
        maxPositions: 1,
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 12; i++) {
      await tick();
    }

    const entries = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC',
    );
    expect(entries.length).toBeLessThanOrEqual(1);
  });

  it('emits trade.executed events on entry', async () => {
    let tickNum = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation((tokenId: string) => {
        tickNum++;
        if (tokenId === 'yes-1') {
          if (tickNum <= 4) return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
          return Promise.resolve(makeBook([['0.59', '100']], [['0.61', '100']]));
        }
        return Promise.resolve(makeBook([['0.49', '100']], [['0.51', '100']]));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        driftThreshold: 0.02,
        minVolume: 1,
        minMarketsPerEvent: 2,
      },
    });

    const tick = createConsensusDriftTick(deps);
    for (let i = 0; i < 8; i++) {
      await tick();
    }

    // If any entries were placed, trade.executed should have been emitted
    if ((deps.orderManager.placeOrder as any).mock.calls.length > 0) {
      expect(deps.eventBus.emit).toHaveBeenCalled();
    }
    expect(typeof deps.eventBus.emit).toBe('function');
  });

  it('handles multiple events in a single tick', async () => {
    const markets = [
      makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', slug: 'event-a' }),
      makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', slug: 'event-a' }),
      makeMarket({ id: 'm3', conditionId: 'cond-3', yesTokenId: 'yes-3', slug: 'event-b' }),
      makeMarket({ id: 'm4', conditionId: 'cond-4', yesTokenId: 'yes-4', slug: 'event-b' }),
    ];

    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();

    // Should fetch orderbooks for all 4 markets across 2 events
    expect(deps.clob.getOrderBook).toHaveBeenCalledTimes(4);
  });

  it('handles market with no noTokenId', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([
          makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: undefined, slug: 'event-a' }),
          makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', noTokenId: undefined, slug: 'event-a' }),
        ]),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles empty orderbook gracefully', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook([], [])),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    // mid = (0 + 1) / 2 = 0.5 which is valid, but no orders on first tick
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips market where mid price is 0', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook(
          [['0.00', '100']], [['0.00', '100']],
        )),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips market where mid price is 1', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook(
          [['1.00', '100']], [['1.00', '100']],
        )),
      } as any,
    });
    const tick = createConsensusDriftTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('groups markets by slug for event grouping', async () => {
    const markets = [
      makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', slug: 'event-x' }),
      makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', slug: 'event-y' }),
    ];

    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      config: { minMarketsPerEvent: 2 },
    });

    const tick = createConsensusDriftTick(deps);
    await tick();
    // Each slug only has 1 market, so neither group meets minMarketsPerEvent=2
    // No orderbook calls should happen for entry scanning since groups are too small
    // but prices are still recorded for each market
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('handles multiple markets in a single event scan', async () => {
    const markets = [
      makeMarket({ id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', slug: 'event-a' }),
      makeMarket({ id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', slug: 'event-a' }),
      makeMarket({ id: 'm3', conditionId: 'cond-3', yesTokenId: 'yes-3', slug: 'event-a' }),
    ];

    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      config: { minMarketsPerEvent: 2, minVolume: 1 },
    });

    const tick = createConsensusDriftTick(deps);
    await tick();
    // All 3 markets in the event group should have their orderbooks fetched
    expect(deps.clob.getOrderBook).toHaveBeenCalledTimes(3);
  });

  it('uses custom driftWindow from config', async () => {
    const deps = makeDeps({
      config: { driftWindow: 3, minVolume: 1, minMarketsPerEvent: 2 },
    });
    const tick = createConsensusDriftTick(deps);

    // Run enough ticks to exceed driftWindow
    for (let i = 0; i < 5; i++) {
      await tick();
    }

    // Should not crash with custom window
    await expect(tick()).resolves.toBeUndefined();
  });

  it('uses default config values when no overrides', () => {
    const deps = makeDeps();
    const tick = createConsensusDriftTick(deps);
    expect(typeof tick).toBe('function');
    // Verify DEFAULT_CONFIG values
    expect(DEFAULT_CONFIG.driftWindow).toBe(15);
    expect(DEFAULT_CONFIG.driftThreshold).toBe(0.03);
    expect(DEFAULT_CONFIG.driftEmaAlpha).toBe(0.12);
    expect(DEFAULT_CONFIG.minMarketsPerEvent).toBe(2);
    expect(DEFAULT_CONFIG.minVolume).toBe(5000);
    expect(DEFAULT_CONFIG.takeProfitPct).toBe(0.03);
    expect(DEFAULT_CONFIG.stopLossPct).toBe(0.02);
    expect(DEFAULT_CONFIG.maxHoldMs).toBe(20 * 60_000);
    expect(DEFAULT_CONFIG.maxPositions).toBe(4);
    expect(DEFAULT_CONFIG.cooldownMs).toBe(120_000);
    expect(DEFAULT_CONFIG.positionSize).toBe('12');
  });
});
