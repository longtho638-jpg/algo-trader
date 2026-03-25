import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  priceToBin,
  buildVolumeProfile,
  classifyBins,
  detectBreakout,
  createVolumeProfileAnomalyTick,
  DEFAULT_CONFIG,
  type VolumeProfileAnomalyConfig,
  type VolumeProfileAnomalyDeps,
} from '../../src/strategies/polymarket/volume-profile-anomaly.js';
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

function makeConfig(overrides: Partial<VolumeProfileAnomalyConfig> = {}): VolumeProfileAnomalyConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ── priceToBin tests ────────────────────────────────────────────────────────

describe('priceToBin', () => {
  it('maps mid-range price correctly', () => {
    // 0.5 * 20 = 10
    expect(priceToBin(0.5, 20)).toBe(10);
  });

  it('maps price 0 to bin 0', () => {
    expect(priceToBin(0, 20)).toBe(0);
  });

  it('maps price 1.0 to last bin (clamped)', () => {
    // 1.0 * 20 = 20, clamped to 19
    expect(priceToBin(1.0, 20)).toBe(19);
  });

  it('maps boundary price 0.05 with 20 bins to bin 1', () => {
    // 0.05 * 20 = 1.0 → floor = 1
    expect(priceToBin(0.05, 20)).toBe(1);
  });

  it('works with custom bin count of 10', () => {
    // 0.35 * 10 = 3.5 → floor = 3
    expect(priceToBin(0.35, 10)).toBe(3);
  });

  it('clamps negative price to bin 0', () => {
    expect(priceToBin(-0.1, 20)).toBe(0);
  });

  it('clamps price > 1 to last bin', () => {
    expect(priceToBin(1.5, 20)).toBe(19);
  });

  it('maps 0.99 correctly', () => {
    // 0.99 * 20 = 19.8 → floor = 19
    expect(priceToBin(0.99, 20)).toBe(19);
  });
});

// ── buildVolumeProfile tests ────────────────────────────────────────────────

describe('buildVolumeProfile', () => {
  it('returns array of correct length', () => {
    const profile = buildVolumeProfile([], 20);
    expect(profile).toHaveLength(20);
  });

  it('returns all zeros for empty snapshots', () => {
    const profile = buildVolumeProfile([], 10);
    expect(profile.every(v => v === 0)).toBe(true);
  });

  it('accumulates volume in correct bin for single snapshot', () => {
    const profile = buildVolumeProfile([{ price: 0.5, volume: 100 }], 20);
    expect(profile[10]).toBe(100);
    // Other bins should be 0
    expect(profile[0]).toBe(0);
    expect(profile[19]).toBe(0);
  });

  it('distributes uniform snapshots across bins', () => {
    const snapshots = [];
    for (let i = 0; i < 20; i++) {
      snapshots.push({ price: (i + 0.5) / 20, volume: 50 });
    }
    const profile = buildVolumeProfile(snapshots, 20);
    for (let i = 0; i < 20; i++) {
      expect(profile[i]).toBe(50);
    }
  });

  it('clusters volume in a single bin', () => {
    const snapshots = [
      { price: 0.51, volume: 100 },
      { price: 0.52, volume: 200 },
      { price: 0.53, volume: 300 },
    ];
    const profile = buildVolumeProfile(snapshots, 20);
    // All prices map to bin 10 (0.5x * 20 = 10.x → floor = 10)
    expect(profile[10]).toBe(600);
  });

  it('handles boundary prices (0 and 1)', () => {
    const snapshots = [
      { price: 0, volume: 50 },
      { price: 1, volume: 75 },
    ];
    const profile = buildVolumeProfile(snapshots, 20);
    expect(profile[0]).toBe(50);
    expect(profile[19]).toBe(75);
  });

  it('works with different bin counts', () => {
    const snapshots = [{ price: 0.5, volume: 100 }];
    const profile5 = buildVolumeProfile(snapshots, 5);
    expect(profile5).toHaveLength(5);
    expect(profile5[2]).toBe(100); // 0.5 * 5 = 2.5 → floor = 2
  });
});

// ── classifyBins tests ──────────────────────────────────────────────────────

describe('classifyBins', () => {
  it('classifies all same volume as normal', () => {
    const profile = [100, 100, 100, 100, 100];
    const classes = classifyBins(profile, 1.5, 0.5);
    expect(classes.every(c => c === 'normal')).toBe(true);
  });

  it('identifies clear HVN bins', () => {
    // avg = (10+10+10+10+100)/5 = 28
    // HVN threshold = 28 * 1.5 = 42 → bin 4 (100) is HVN
    const profile = [10, 10, 10, 10, 100];
    const classes = classifyBins(profile, 1.5, 0.5);
    expect(classes[4]).toBe('hvn');
  });

  it('identifies clear LVN bins', () => {
    // avg = (100+100+100+100+5)/5 = 81
    // LVN threshold = 81 * 0.5 = 40.5 → bin 4 (5) is LVN
    const profile = [100, 100, 100, 100, 5];
    const classes = classifyBins(profile, 1.5, 0.5);
    expect(classes[4]).toBe('lvn');
  });

  it('handles mixed HVN/LVN/normal bins', () => {
    // avg = (200 + 5 + 50 + 60 + 55) / 5 = 74
    // HVN > 74*1.5=111, LVN < 74*0.5=37
    const profile = [200, 5, 50, 60, 55];
    const classes = classifyBins(profile, 1.5, 0.5);
    expect(classes[0]).toBe('hvn');
    expect(classes[1]).toBe('lvn');
    expect(classes[2]).toBe('normal');
    expect(classes[3]).toBe('normal');
    expect(classes[4]).toBe('normal');
  });

  it('classifies all zero volume as normal', () => {
    const profile = [0, 0, 0, 0, 0];
    const classes = classifyBins(profile, 1.5, 0.5);
    expect(classes.every(c => c === 'normal')).toBe(true);
  });

  it('handles single bin', () => {
    const profile = [100];
    const classes = classifyBins(profile, 1.5, 0.5);
    // avg = 100, vol = 100, 100 > 100*1.5 = false, 100 < 100*0.5 = false → normal
    expect(classes[0]).toBe('normal');
  });

  it('respects custom multipliers', () => {
    // avg = (100+100+100+100+101)/5 = 100.2
    // hvn > 100.2*1.0 = 100.2 → bin 4 (101) is HVN
    const profile = [100, 100, 100, 100, 101];
    const classes = classifyBins(profile, 1.0, 0.99);
    expect(classes[4]).toBe('hvn');
    // 100 < 100.2 * 0.99 = 99.198 → false → normal
    expect(classes[0]).toBe('normal');
  });
});

// ── detectBreakout tests ────────────────────────────────────────────────────

describe('detectBreakout', () => {
  it('returns bullish for hvn→lvn with up direction', () => {
    expect(detectBreakout('hvn', 'lvn', 'up')).toBe('bullish');
  });

  it('returns bearish for hvn→lvn with down direction', () => {
    expect(detectBreakout('hvn', 'lvn', 'down')).toBe('bearish');
  });

  it('returns null for normal→lvn', () => {
    expect(detectBreakout('normal', 'lvn', 'up')).toBeNull();
  });

  it('returns null for hvn→normal', () => {
    expect(detectBreakout('hvn', 'normal', 'up')).toBeNull();
  });

  it('returns null for same class hvn→hvn', () => {
    expect(detectBreakout('hvn', 'hvn', 'up')).toBeNull();
  });

  it('returns null for lvn→hvn', () => {
    expect(detectBreakout('lvn', 'hvn', 'up')).toBeNull();
  });

  it('returns null for lvn→lvn', () => {
    expect(detectBreakout('lvn', 'lvn', 'down')).toBeNull();
  });

  it('returns null for normal→normal', () => {
    expect(detectBreakout('normal', 'normal', 'up')).toBeNull();
  });
});

// ── Tick factory tests ──────────────────────────────────────────────────────

function makeDeps(overrides: Partial<VolumeProfileAnomalyDeps> = {}): VolumeProfileAnomalyDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue(
        makeBook(
          [['0.48', '10'], ['0.47', '10'], ['0.46', '10']],
          [['0.52', '10'], ['0.53', '10'], ['0.54', '10']],
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

describe('createVolumeProfileAnomalyTick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a function', () => {
    const tick = createVolumeProfileAnomalyTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('does not place orders on first tick (insufficient snapshots)', async () => {
    const deps = makeDeps();
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not place orders on second tick (still insufficient snapshots)', async () => {
    const deps = makeDeps();
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not throw on gamma API error', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockRejectedValue(new Error('API error')) } as any,
    });
    const tick = createVolumeProfileAnomalyTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('does not throw on clob API error', async () => {
    const deps = makeDeps({
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('timeout')) } as any,
    });
    const tick = createVolumeProfileAnomalyTick(deps);
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
    const tick = createVolumeProfileAnomalyTick(deps);
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
    const tick = createVolumeProfileAnomalyTick(deps);
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
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('handles empty markets list', async () => {
    const deps = makeDeps({
      gamma: { getTrending: vi.fn().mockResolvedValue([]) } as any,
    });
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('accepts config overrides', async () => {
    const deps = makeDeps({
      config: { maxPositions: 1, minVolume: 1 },
    });
    const tick = createVolumeProfileAnomalyTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles empty orderbook gracefully', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook([], [])),
      } as any,
    });
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    // mid = (0 + 1) / 2 = 0.5 which is valid, but no entry on first tick
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
    const tick = createVolumeProfileAnomalyTick(deps);
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
    const tick = createVolumeProfileAnomalyTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('handles orderManager.placeOrder failure gracefully', async () => {
    const deps = makeDeps({
      orderManager: {
        placeOrder: vi.fn().mockRejectedValue(new Error('insufficient funds')),
      } as any,
    });
    const tick = createVolumeProfileAnomalyTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  // ── Breakout entry tests ─────────────────────────────────────────────────

  it('enters buy-yes on bullish breakout (hvn→lvn up)', async () => {
    // Build HVN at bin 6 (price ~0.30) with large volume, then jump to bin 16
    // (price ~0.80) with tiny volume so destination bin stays LVN.
    // Profile: 4 snapshots at bin 6 with vol 1000 each = 4000.
    // 1 snapshot at bin 16 with vol 2 (tiny).
    // Total = 4002. avg = 4002/20 = 200.1. HVN > 300.15 (bin 6: 4000 ✓).
    // LVN < 100.05 (bin 16: 2 ✓).
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Ticks 1-4: price at 0.30, large book
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        // Tick 5+: price jumps to 0.80, tiny book so dest bin stays LVN
        return Promise.resolve(makeBook(
          [['0.79', '1']], [['0.81', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        profileWindow: 40,
        maxPositions: 4,
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 6; i++) {
      await tick();
    }

    // Should have placed an entry order for bullish breakout → buy YES
    const calls = (deps.orderManager.placeOrder as any).mock.calls;
    const entryCall = calls.find((c: any) => c[0].orderType === 'GTC');
    expect(entryCall).toBeDefined();
    expect(entryCall[0].side).toBe('buy');
    expect(entryCall[0].tokenId).toBe('yes-1');
  });

  it('enters buy-no on bearish breakout (hvn→lvn down)', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Ticks 1-4: price at 0.80, large book → HVN at bin 16
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.79', '500']], [['0.81', '500']],
          ));
        }
        // Tick 5+: price drops to 0.20, tiny book → LVN at bin 4
        return Promise.resolve(makeBook(
          [['0.19', '1']], [['0.21', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        profileWindow: 40,
        maxPositions: 4,
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 6; i++) {
      await tick();
    }

    const calls = (deps.orderManager.placeOrder as any).mock.calls;
    const entryCall = calls.find((c: any) => c[0].orderType === 'GTC');
    expect(entryCall).toBeDefined();
    expect(entryCall[0].side).toBe('buy');
    expect(entryCall[0].tokenId).toBe('no-1');
  });

  it('does not enter when no breakout occurs (same bin)', async () => {
    // Price stays in same bin
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(
          makeBook([['0.49', '100']], [['0.51', '100']]),
        ),
      } as any,
      config: { minVolume: 1, breakoutConfirmTicks: 1 },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('requires breakoutConfirmTicks before entry', async () => {
    // With confirmTicks=3, a single breakout tick should not trigger entry
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        // One tick at breakout price, then back
        if (callCount === 5) {
          return Promise.resolve(makeBook(
            [['0.79', '1']], [['0.81', '1']],
          ));
        }
        // Back to original
        return Promise.resolve(makeBook(
          [['0.29', '500']], [['0.31', '500']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 3,
        minVolume: 1,
        profileWindow: 40,
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 7; i++) {
      await tick();
    }

    const entries = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC',
    );
    expect(entries.length).toBe(0);
  });

  // ── Exit tests ────────────────────────────────────────────────────────────

  it('exits on take profit for yes position', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Ticks 1-4: build HVN at bin 6 (price 0.30)
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        // Tick 5: breakout to bin 16 (price 0.80), tiny vol → LVN → entry
        if (callCount === 5) {
          return Promise.resolve(makeBook(
            [['0.79', '1']], [['0.81', '1']],
          ));
        }
        // Tick 6+: exit check fetches book for position, then scan fetches again
        // Price moves higher for TP (entry at ask=0.81, 0.90 mid → ~11% gain)
        return Promise.resolve(makeBook(
          [['0.89', '1']], [['0.91', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        takeProfitPct: 0.03,
        stopLossPct: 0.50,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 7; i++) {
      await tick();
    }

    const exitCalls = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'IOC',
    );
    expect(exitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('exits on stop loss for yes position', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Ticks 1-4: build HVN at bin 6
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        // Tick 5: breakout → entry (yes side, entry at ask=0.81)
        if (callCount === 5) {
          return Promise.resolve(makeBook(
            [['0.79', '1']], [['0.81', '1']],
          ));
        }
        // Tick 6+: price drops to 0.10 → stop loss triggered
        return Promise.resolve(makeBook(
          [['0.09', '1']], [['0.11', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        takeProfitPct: 0.50,
        stopLossPct: 0.02,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 7; i++) {
      await tick();
    }

    const exitCalls = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'IOC',
    );
    expect(exitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('exits on max hold time', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Ticks 1-4: build HVN at bin 6
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        // Tick 5: breakout → entry
        if (callCount === 5) {
          return Promise.resolve(makeBook(
            [['0.79', '1']], [['0.81', '1']],
          ));
        }
        // Stable price, no TP/SL trigger — only max hold should fire
        return Promise.resolve(makeBook(
          [['0.79', '1']], [['0.81', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        maxHoldMs: 1, // 1ms → immediate expiry
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 6; i++) {
      await tick();
    }
    // Wait for maxHoldMs to expire
    await new Promise(r => setTimeout(r, 5));
    await tick();

    const exitCalls = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'IOC',
    );
    expect(exitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('cooldown prevents re-entry after exit', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        // Ticks 1-4: build HVN at bin 6
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        // Tick 5: breakout → entry
        if (callCount === 5) {
          return Promise.resolve(makeBook(
            [['0.79', '1']], [['0.81', '1']],
          ));
        }
        // Ticks 6-7: TP exit (exit check + scan each call getOrderBook)
        if (callCount <= 8) {
          return Promise.resolve(makeBook(
            [['0.89', '1']], [['0.91', '1']],
          ));
        }
        // Ticks 8+: back to low then high — would re-trigger if no cooldown
        if (callCount <= 12) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        return Promise.resolve(makeBook(
          [['0.79', '1']], [['0.81', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        takeProfitPct: 0.03,
        stopLossPct: 0.50,
        cooldownMs: 180_000,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 14; i++) {
      await tick();
    }

    const entries = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC',
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
        // First 12 calls: build HVN at bin 6 (3 markets * 4 ticks)
        if (callCount <= 12) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        // Then breakout with tiny volume
        return Promise.resolve(makeBook(
          [['0.79', '1']], [['0.81', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      gamma: { getTrending: vi.fn().mockResolvedValue(markets) } as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        maxPositions: 2,
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 10; i++) {
      await tick();
    }

    const entries = (deps.orderManager.placeOrder as any).mock.calls.filter(
      (c: any) => c[0].orderType === 'GTC',
    );
    expect(entries.length).toBeLessThanOrEqual(2);
  });

  it('emits trade.executed event on entry', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        return Promise.resolve(makeBook(
          [['0.79', '1']], [['0.81', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        takeProfitPct: 0.50,
        stopLossPct: 0.50,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 6; i++) {
      await tick();
    }

    const emitCalls = (deps.eventBus.emit as any).mock.calls;
    const tradeCalls = emitCalls.filter((c: any) => c[0] === 'trade.executed');
    expect(tradeCalls.length).toBeGreaterThanOrEqual(1);
    expect(tradeCalls[0][1].trade.strategy).toBe('volume-profile-anomaly');
  });

  it('emits trade.executed event on exit', async () => {
    let callCount = 0;
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 4) {
          return Promise.resolve(makeBook(
            [['0.29', '500']], [['0.31', '500']],
          ));
        }
        if (callCount === 5) {
          return Promise.resolve(makeBook(
            [['0.79', '1']], [['0.81', '1']],
          ));
        }
        // Take profit
        return Promise.resolve(makeBook(
          [['0.89', '1']], [['0.91', '1']],
        ));
      }),
    };

    const deps = makeDeps({
      clob: clob as any,
      config: {
        numBins: 20,
        hvnMultiplier: 1.5,
        lvnMultiplier: 0.5,
        breakoutConfirmTicks: 1,
        minVolume: 1,
        takeProfitPct: 0.03,
        stopLossPct: 0.50,
        maxHoldMs: 999_999_999,
      },
    });

    const tick = createVolumeProfileAnomalyTick(deps);
    for (let i = 0; i < 7; i++) {
      await tick();
    }

    const emitCalls = (deps.eventBus.emit as any).mock.calls;
    const tradeCalls = emitCalls.filter((c: any) => c[0] === 'trade.executed');
    expect(tradeCalls.length).toBeGreaterThanOrEqual(2);
    expect(tradeCalls[1][1].trade.strategy).toBe('volume-profile-anomaly');
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
    });
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    // Both markets should be scanned
    expect(deps.clob.getOrderBook).toHaveBeenCalledTimes(2);
  });

  it('records snapshot history across ticks', async () => {
    const deps = makeDeps();
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    await tick();
    await tick();
    expect(deps.clob.getOrderBook).toHaveBeenCalledTimes(3);
  });

  it('skips market where mid price is 0', async () => {
    const deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue(makeBook(
          [['0.00', '100']], [['0.00', '100']],
        )),
      } as any,
    });
    const tick = createVolumeProfileAnomalyTick(deps);
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
    const tick = createVolumeProfileAnomalyTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('uses default config values when none provided', () => {
    const cfg = makeConfig();
    expect(cfg.numBins).toBe(20);
    expect(cfg.hvnMultiplier).toBe(1.5);
    expect(cfg.lvnMultiplier).toBe(0.5);
    expect(cfg.profileWindow).toBe(40);
    expect(cfg.breakoutConfirmTicks).toBe(2);
    expect(cfg.positionSize).toBe('10');
    expect(cfg.maxHoldMs).toBe(15 * 60_000);
  });

  it('overrides specific config values', () => {
    const cfg = makeConfig({ numBins: 50, hvnMultiplier: 2.0 });
    expect(cfg.numBins).toBe(50);
    expect(cfg.hvnMultiplier).toBe(2.0);
    // Others remain default
    expect(cfg.lvnMultiplier).toBe(0.5);
  });
});
