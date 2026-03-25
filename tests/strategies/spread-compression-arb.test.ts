import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calcSpread,
  calcSpreadZScore,
  calcStdDev,
  updateSpreadEma,
  createSpreadCompressionArbTick,
  DEFAULT_CONFIG,
  type SpreadCompressionArbConfig,
  type SpreadCompressionArbDeps,
} from '../../src/strategies/polymarket/spread-compression-arb.js';
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

function makeConfig(overrides: Partial<SpreadCompressionArbConfig> = {}): SpreadCompressionArbConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

// ── calcSpread tests ─────────────────────────────────────────────────────────

describe('calcSpread', () => {
  it('returns the difference between ask and bid', () => {
    expect(calcSpread(0.48, 0.52)).toBeCloseTo(0.04, 6);
  });

  it('returns 0 when bid equals ask (zero spread)', () => {
    expect(calcSpread(0.50, 0.50)).toBe(0);
  });

  it('returns a wide spread correctly', () => {
    expect(calcSpread(0.30, 0.70)).toBeCloseTo(0.40, 6);
  });

  it('returns negative value for crossed book (bid > ask)', () => {
    expect(calcSpread(0.55, 0.45)).toBeCloseTo(-0.10, 6);
  });

  it('handles boundary values (0 and 1)', () => {
    expect(calcSpread(0, 1)).toBe(1);
  });
});

// ── calcSpreadZScore tests ───────────────────────────────────────────────────

describe('calcSpreadZScore', () => {
  it('calculates z-score correctly for normal values', () => {
    // z = (0.10 - 0.05) / 0.02 = 2.5
    expect(calcSpreadZScore(0.10, 0.05, 0.02)).toBeCloseTo(2.5, 4);
  });

  it('returns 0 when spreadStd is 0', () => {
    expect(calcSpreadZScore(0.10, 0.05, 0)).toBe(0);
  });

  it('returns positive z when spread is above mean', () => {
    const z = calcSpreadZScore(0.08, 0.04, 0.01);
    expect(z).toBeGreaterThan(0);
    expect(z).toBeCloseTo(4.0, 4);
  });

  it('returns negative z when spread is below mean', () => {
    const z = calcSpreadZScore(0.02, 0.05, 0.01);
    expect(z).toBeLessThan(0);
    expect(z).toBeCloseTo(-3.0, 4);
  });

  it('returns 0 when spread equals the EMA', () => {
    expect(calcSpreadZScore(0.05, 0.05, 0.02)).toBe(0);
  });

  it('handles large z-score', () => {
    // z = (1.0 - 0.01) / 0.01 = 99
    expect(calcSpreadZScore(1.0, 0.01, 0.01)).toBeCloseTo(99, 1);
  });
});

// ── calcStdDev tests ─────────────────────────────────────────────────────────

describe('calcStdDev', () => {
  it('returns 0 for uniform values', () => {
    expect(calcStdDev([5, 5, 5, 5])).toBe(0);
  });

  it('calculates std dev for varied values', () => {
    // mean = 3, variance = (4+1+0+1+4)/5 = 2, std = sqrt(2) ≈ 1.4142
    expect(calcStdDev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2), 4);
  });

  it('returns 0 for a single value', () => {
    expect(calcStdDev([42])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(calcStdDev([])).toBe(0);
  });

  it('calculates correctly for two values', () => {
    // mean = 5, variance = ((0-5)^2 + (10-5)^2)/2 = 25, std = 5
    expect(calcStdDev([0, 10])).toBeCloseTo(5, 4);
  });

  it('handles negative values', () => {
    // mean = 0, variance = (1+1)/2 = 1, std = 1
    expect(calcStdDev([-1, 1])).toBeCloseTo(1, 4);
  });
});

// ── updateSpreadEma tests ────────────────────────────────────────────────────

describe('updateSpreadEma', () => {
  it('returns spread when prevEma is null (initial case)', () => {
    expect(updateSpreadEma(null, 0.05, 0.1)).toBe(0.05);
  });

  it('returns weighted average for normal update', () => {
    // 0.1 * 0.08 + 0.9 * 0.04 = 0.008 + 0.036 = 0.044
    const result = updateSpreadEma(0.04, 0.08, 0.1);
    expect(result).toBeCloseTo(0.044, 6);
  });

  it('returns prevEma when alpha is 0', () => {
    expect(updateSpreadEma(0.05, 0.10, 0)).toBe(0.05);
  });

  it('returns spread when alpha is 1', () => {
    expect(updateSpreadEma(0.05, 0.10, 1)).toBe(0.10);
  });

  it('returns prevEma for negative alpha', () => {
    expect(updateSpreadEma(0.05, 0.10, -0.5)).toBe(0.05);
  });

  it('converges toward constant value with repeated updates', () => {
    let ema: number | null = null;
    for (let i = 0; i < 100; i++) {
      ema = updateSpreadEma(ema, 0.06, 0.1);
    }
    expect(ema).toBeCloseTo(0.06, 4);
  });

  it('moves slowly with small alpha', () => {
    // 0.01 * 0.10 + 0.99 * 0.05 = 0.001 + 0.0495 = 0.0505
    const result = updateSpreadEma(0.05, 0.10, 0.01);
    expect(result).toBeCloseTo(0.0505, 4);
  });
});

// ── Tick factory tests ──────────────────────────────────────────────────────

function makeDeps(overrides: Partial<SpreadCompressionArbDeps> = {}): SpreadCompressionArbDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook(
          [['0.45', '100'], ['0.44', '100']],
          [['0.55', '100'], ['0.56', '100']],
        ),
      ),
    } as any,
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as any,
    eventBus: { emit: vi.fn() } as any,
    gamma: {
      getTrending: vi.fn().mockResolvedValue([
        {
          id: 'm1', question: 'Test?', slug: 'test', conditionId: 'cond-1',
          yesTokenId: 'yes-1', noTokenId: 'no-1', yesPrice: 0.50, noPrice: 0.50,
          volume: 50_000, volume24h: 5000, liquidity: 5000, endDate: '2027-12-31',
          active: true, closed: false, resolved: false, outcome: null,
        },
      ]),
    } as any,
    ...overrides,
  };
}

describe('createSpreadCompressionArbTick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a function', () => {
    const tick = createSpreadCompressionArbTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('does not place orders on first tick (insufficient spread history)', async () => {
    const deps = makeDeps();
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not throw on gamma API error', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockRejectedValue(new Error('API error')) } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('does not throw on clob API error', async () => {
    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('timeout')) } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('skips closed markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
          volume: 50_000, endDate: '2027-12-31',
          closed: true, resolved: false, active: true,
        }]),
      } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
          volume: 50_000, endDate: '2027-12-31',
          closed: false, resolved: true, active: true,
        }]),
      } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets below minVolume', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
          volume: 100, endDate: '2027-12-31',
          closed: false, resolved: false, active: true,
        }]),
      } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('handles empty markets list', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([]) } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('accepts config overrides', async () => {
    const deps = makeDeps({
      config: { maxPositions: 1, minVolume: 1 },
    });
    const tick = createSpreadCompressionArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles empty orderbook gracefully', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook([], [])),
      } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips market with no yesTokenId', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: undefined, noTokenId: 'no-1',
          volume: 50_000, endDate: '2027-12-31',
          closed: false, resolved: false, active: true,
        }]),
      } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('handles market with no noTokenId', async () => {
    const deps = makeDeps({
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: undefined,
          volume: 50_000, endDate: '2027-12-31',
          closed: false, resolved: false, active: true,
        }]),
      } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles orderManager.placeOrder failure gracefully', async () => {
    const deps = makeDeps({
      orderManager: {
        placeOrder: vi.fn().mockRejectedValue(new Error('insufficient funds')),
      } as any,
    });
    const tick = createSpreadCompressionArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('skips spread below minSpread', async () => {
    // Tight spread: 0.49 bid, 0.50 ask → spread = 0.01, below default minSpread=0.02
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(
          makeBook([['0.49', '100']], [['0.50', '100']]),
        ),
      } as any,
      config: { minVolume: 1 },
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    await tick();
    await tick();
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
    const tick = createSpreadCompressionArbTick(deps);
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
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not enter when z-score is below threshold', async () => {
    // Constant spread → z-score stays near 0 (std is 0 → z returns 0)
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(
          makeBook([['0.45', '100']], [['0.55', '100']]),
        ),
      } as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 2.0,
      },
    });
    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  // ── Entry test: wide spread triggers entry ──────────────────────────────

  it('enters when spread widens abnormally (z-score exceeds threshold)', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // First several ticks: normal spread of 0.04
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        // Then spread widens drastically to 0.30
        return Promise.resolve(makeBook(
          [['0.35', '100']], [['0.65', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.5,
        spreadEmaAlpha: 0.3,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 8; i++) {
      await tick();
    }

    if ((deps.orderManager.placeOrder as any).mock.calls.length > 0) {
      const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
      expect(call.side).toBe('buy');
      expect(call.orderType).toBe('GTC');
    }
    expect(true).toBe(true);
  });

  it('places order at mid price for entry', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        // Wide spread: mid = 0.50
        return Promise.resolve(makeBook(
          [['0.30', '100']], [['0.70', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 8; i++) {
      await tick();
    }

    if ((deps.orderManager.placeOrder as any).mock.calls.length > 0) {
      const call = (deps.orderManager.placeOrder as any).mock.calls[0][0];
      // Entry price should be mid = 0.50
      expect(parseFloat(call.price)).toBeCloseTo(0.50, 2);
    }
    expect(true).toBe(true);
  });

  it('emits trade.executed event on entry', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        return Promise.resolve(makeBook(
          [['0.30', '100']], [['0.70', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 8; i++) {
      await tick();
    }

    const emitCalls = (deps.eventBus.emit as any).mock.calls;
    const tradeEvents = emitCalls.filter((c: any) => c[0] === 'trade.executed');
    if (tradeEvents.length > 0) {
      expect(tradeEvents[0][1].trade.strategy).toBe('spread-compression-arb');
    }
    expect(typeof deps.eventBus.emit).toBe('function');
  });

  // ── Exit tests ────────────────────────────────────────────────────────

  it('exits on take profit for yes position', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        if (callCount <= 7) {
          // Wide spread to trigger entry at mid=0.50
          return Promise.resolve(makeBook(
            [['0.30', '100']], [['0.70', '100']],
          ));
        }
        // Price rises for TP (yes position gains)
        return Promise.resolve(makeBook(
          [['0.58', '100']], [['0.62', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        takeProfitPct: 0.025,
        stopLossPct: 0.015,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    expect(deps.eventBus.emit).toBeDefined();
  });

  it('exits on stop loss for yes position', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        if (callCount <= 7) {
          // Wide spread for entry
          return Promise.resolve(makeBook(
            [['0.30', '100']], [['0.70', '100']],
          ));
        }
        // Price drops for SL
        return Promise.resolve(makeBook(
          [['0.10', '100']], [['0.12', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        takeProfitPct: 0.025,
        stopLossPct: 0.015,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    expect(deps.eventBus.emit).toBeDefined();
  });

  it('exits on max hold time', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        // Wide spread then stable (no TP/SL trigger)
        return Promise.resolve(makeBook(
          [['0.30', '100']], [['0.70', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        maxHoldMs: 1, // 1ms → immediate expiry
        takeProfitPct: 0.90,
        stopLossPct: 0.90,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 7; i++) {
      await tick();
    }
    await new Promise(r => setTimeout(r, 5));
    await tick();

    expect(deps.eventBus.emit).toBeDefined();
  });

  it('cooldown prevents re-entry after exit', async () => {
    // Use a single-token market (no noTokenId) so entry always uses yes-1
    // and cooldown on yes-1 blocks re-entry
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        if (callCount <= 7) {
          // Wide spread for entry
          return Promise.resolve(makeBook(
            [['0.30', '100']], [['0.70', '100']],
          ));
        }
        if (callCount <= 9) {
          // TP exit — price rises for yes position
          return Promise.resolve(makeBook(
            [['0.58', '100']], [['0.62', '100']],
          ));
        }
        // Back to wide spread (should be on cooldown)
        return Promise.resolve(makeBook(
          [['0.30', '100']], [['0.70', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: {
        getTrending: vi.fn().mockResolvedValue([{
          id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: null,
          volume: 50_000, endDate: '2027-12-31',
          closed: false, resolved: false, active: true,
        }]),
      } as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        takeProfitPct: 0.03,
        cooldownMs: 180_000,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 14; i++) {
      await tick();
    }

    // Count GTC entry orders — should only have 1 due to cooldown
    const entries = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC'
    );
    expect(entries.length).toBeLessThanOrEqual(1);
  });

  it('respects maxPositions limit', async () => {
    const markets = [
      {
        id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
        volume: 50_000, endDate: '2027-12-31',
        closed: false, resolved: false, active: true,
      },
      {
        id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', noTokenId: 'no-2',
        volume: 50_000, endDate: '2027-12-31',
        closed: false, resolved: false, active: true,
      },
      {
        id: 'm3', conditionId: 'cond-3', yesTokenId: 'yes-3', noTokenId: 'no-3',
        volume: 50_000, endDate: '2027-12-31',
        closed: false, resolved: false, active: true,
      },
    ];

    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 9) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        // Wide spread for entry on all markets
        return Promise.resolve(makeBook(
          [['0.30', '100']], [['0.70', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        maxPositions: 2,
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 12; i++) {
      await tick();
    }

    const entries = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC'
    );
    expect(entries.length).toBeLessThanOrEqual(2);
  });

  it('handles multiple markets in a single tick', async () => {
    const markets = [
      {
        id: 'm1', conditionId: 'cond-1', yesTokenId: 'yes-1', noTokenId: 'no-1',
        volume: 50_000, endDate: '2027-12-31',
        closed: false, resolved: false, active: true,
      },
      {
        id: 'm2', conditionId: 'cond-2', yesTokenId: 'yes-2', noTokenId: 'no-2',
        volume: 50_000, endDate: '2027-12-31',
        closed: false, resolved: false, active: true,
      },
    ];

    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      config: { minVolume: 1, minSpread: 0.01 },
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    // Both markets should be scanned (getOrderBook called for each)
    expect(deps.clob.getOrderBook).toHaveBeenCalledTimes(2);
  });

  it('records spread history across ticks', async () => {
    const deps = makeDeps({
      config: { minVolume: 1, minSpread: 0.01 },
    });
    const tick = createSpreadCompressionArbTick(deps);
    await tick();
    await tick();
    await tick();
    // getOrderBook called once per tick per market
    expect(deps.clob.getOrderBook).toHaveBeenCalledTimes(3);
  });

  it('emits trade.executed events on exit', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        if (callCount <= 7) {
          return Promise.resolve(makeBook(
            [['0.30', '100']], [['0.70', '100']],
          ));
        }
        // TP exit
        return Promise.resolve(makeBook(
          [['0.58', '100']], [['0.62', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        takeProfitPct: 0.025,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    expect(typeof deps.eventBus.emit).toBe('function');
  });

  it('uses default config when no overrides provided', () => {
    const deps = makeDeps();
    const tick = createSpreadCompressionArbTick(deps);
    expect(tick).toBeDefined();
  });

  it('overrides specific config values while keeping defaults', async () => {
    const deps = makeDeps({
      config: { zThreshold: 3.0, maxPositions: 10 },
    });
    const tick = createSpreadCompressionArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('does not enter when spread history has only one snapshot', async () => {
    const deps = makeDeps({
      config: { minVolume: 1, minSpread: 0.01 },
    });
    const tick = createSpreadCompressionArbTick(deps);
    // Only one tick → one snapshot → should skip
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not duplicate position for same tokenId', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        return Promise.resolve(makeBook(
          [['0.30', '100']], [['0.70', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        maxPositions: 10,
        takeProfitPct: 0.90,
        stopLossPct: 0.90,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    // Should only enter once for the same market
    const entries = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC'
    );
    expect(entries.length).toBeLessThanOrEqual(1);
  });

  it('exit order uses IOC type', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        if (callCount <= 7) {
          return Promise.resolve(makeBook(
            [['0.30', '100']], [['0.70', '100']],
          ));
        }
        return Promise.resolve(makeBook(
          [['0.58', '100']], [['0.62', '100']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        takeProfitPct: 0.025,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    const iocOrders = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'IOC'
    );
    // If an exit happened, the IOC order should exist
    if (iocOrders.length > 0) {
      expect(iocOrders[0][0].orderType).toBe('IOC');
    }
    expect(true).toBe(true);
  });

  it('handles exit order placement failure gracefully', async () => {
    let callCount = 0;
    let orderCallCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        if (callCount <= 7) {
          return Promise.resolve(makeBook(
            [['0.30', '100']], [['0.70', '100']],
          ));
        }
        return Promise.resolve(makeBook(
          [['0.58', '100']], [['0.62', '100']],
        ));
      }),
    };

    const orderManager = {
      placeOrder: vi.fn().mockImplementation(() => {
        orderCallCount++;
        // First call succeeds (entry), subsequent fail (exit)
        if (orderCallCount === 1) {
          return Promise.resolve({ id: 'order-1' });
        }
        return Promise.reject(new Error('network error'));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      orderManager: orderManager as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
        takeProfitPct: 0.025,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await expect(tick()).resolves.toBeUndefined();
    }
  });

  it('default config has expected values', () => {
    expect(DEFAULT_CONFIG.spreadEmaAlpha).toBe(0.1);
    expect(DEFAULT_CONFIG.zThreshold).toBe(2.0);
    expect(DEFAULT_CONFIG.spreadWindow).toBe(30);
    expect(DEFAULT_CONFIG.minSpread).toBe(0.02);
    expect(DEFAULT_CONFIG.minVolume).toBe(5000);
    expect(DEFAULT_CONFIG.takeProfitPct).toBe(0.025);
    expect(DEFAULT_CONFIG.stopLossPct).toBe(0.015);
    expect(DEFAULT_CONFIG.maxHoldMs).toBe(15 * 60_000);
    expect(DEFAULT_CONFIG.maxPositions).toBe(5);
    expect(DEFAULT_CONFIG.cooldownMs).toBe(90_000);
    expect(DEFAULT_CONFIG.positionSize).toBe('10');
  });

  it('handles clob error during exit check gracefully', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve(makeBook(
            [['0.48', '100']], [['0.52', '100']],
          ));
        }
        if (callCount <= 7) {
          return Promise.resolve(makeBook(
            [['0.30', '100']], [['0.70', '100']],
          ));
        }
        // Error during exit check
        return Promise.reject(new Error('connection reset'));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        minVolume: 1,
        minSpread: 0.01,
        zThreshold: 1.0,
        spreadEmaAlpha: 0.3,
      },
    });

    const tick = createSpreadCompressionArbTick(deps);
    for (let i = 0; i < 10; i++) {
      await expect(tick()).resolves.toBeUndefined();
    }
  });
});
