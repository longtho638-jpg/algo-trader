import { describe, it, expect } from 'vitest';
import {
  generateSyntheticData,
  calcSharpeRatio,
  calcMaxDrawdown,
  calcProfitFactor,
  calcWinRate,
  runStrategyBacktest,
  type BacktestConfig,
  type BacktestCandle,
  type BacktestTrade,
} from '../../src/backtest/strategy-backtester.js';

// ─── generateSyntheticData ──────────────────────────────────────────────────

describe('generateSyntheticData', () => {
  it('should return correct number of candles', () => {
    const data = generateSyntheticData({ ticks: 100, startPrice: 0.5, volatility: 0.02, trend: 0 });
    expect(data).toHaveLength(100);
  });

  it('should return candles with all OHLCV fields', () => {
    const data = generateSyntheticData({ ticks: 5, startPrice: 0.5, volatility: 0.02, trend: 0 });
    for (const c of data) {
      expect(c).toHaveProperty('timestamp');
      expect(c).toHaveProperty('open');
      expect(c).toHaveProperty('high');
      expect(c).toHaveProperty('low');
      expect(c).toHaveProperty('close');
      expect(c).toHaveProperty('volume');
    }
  });

  it('should produce prices > 0', () => {
    const data = generateSyntheticData({ ticks: 500, startPrice: 0.5, volatility: 0.1, trend: -0.01 });
    for (const c of data) {
      expect(c.open).toBeGreaterThan(0);
      expect(c.high).toBeGreaterThan(0);
      expect(c.low).toBeGreaterThan(0);
      expect(c.close).toBeGreaterThan(0);
    }
  });

  it('should respect seed for reproducibility', () => {
    const a = generateSyntheticData({ ticks: 50, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 123 });
    const b = generateSyntheticData({ ticks: 50, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 123 });
    expect(a).toEqual(b);
  });

  it('should produce different data with different seeds', () => {
    const a = generateSyntheticData({ ticks: 50, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 1 });
    const b = generateSyntheticData({ ticks: 50, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 2 });
    expect(a[10].close).not.toEqual(b[10].close);
  });

  it('should reflect positive trend in average price direction', () => {
    const data = generateSyntheticData({ ticks: 1000, startPrice: 0.5, volatility: 0.005, trend: 0.01, seed: 42 });
    // With a strong positive trend over 1000 ticks, final should be above start
    expect(data[data.length - 1].close).toBeGreaterThan(data[0].open);
  });

  it('should reflect negative trend in average price direction', () => {
    const data = generateSyntheticData({ ticks: 1000, startPrice: 0.5, volatility: 0.005, trend: -0.01, seed: 42 });
    expect(data[data.length - 1].close).toBeLessThan(data[0].open);
  });

  it('should have high >= max(open, close) and low <= min(open, close)', () => {
    const data = generateSyntheticData({ ticks: 100, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 99 });
    for (const c of data) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close) - 1e-10);
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close) + 1e-10);
    }
  });
});

// ─── calcSharpeRatio ────────────────────────────────────────────────────────

describe('calcSharpeRatio', () => {
  it('should return positive for consistently positive returns', () => {
    const returns = Array(50).fill(0.01);
    expect(calcSharpeRatio(returns)).toBeGreaterThan(0);
  });

  it('should return negative for consistently negative returns', () => {
    const returns = Array(50).fill(-0.01);
    expect(calcSharpeRatio(returns)).toBeLessThan(0);
  });

  it('should return 0 for flat returns', () => {
    const returns = Array(50).fill(0);
    expect(calcSharpeRatio(returns)).toBe(0);
  });

  it('should return 0 for empty array', () => {
    expect(calcSharpeRatio([])).toBe(0);
  });

  it('should return 0 for single-element array', () => {
    expect(calcSharpeRatio([0.01])).toBe(0);
  });

  it('should account for risk-free rate', () => {
    const returns = Array(50).fill(0.001);
    const withRf = calcSharpeRatio(returns, 0.05);
    const withoutRf = calcSharpeRatio(returns, 0);
    expect(withoutRf).toBeGreaterThan(withRf);
  });
});

// ─── calcMaxDrawdown ────────────────────────────────────────────────────────

describe('calcMaxDrawdown', () => {
  it('should return 0 for monotonically increasing equity', () => {
    const curve = [100, 110, 120, 130, 140, 150];
    expect(calcMaxDrawdown(curve)).toBe(0);
  });

  it('should compute single drawdown correctly', () => {
    // Peak at 200, trough at 150 → 25% drawdown
    const curve = [100, 150, 200, 175, 150, 180];
    expect(calcMaxDrawdown(curve)).toBeCloseTo(0.25, 5);
  });

  it('should compute max of multiple drawdowns', () => {
    // First drawdown: 200 → 160 = 20%, Second drawdown: 220 → 154 = 30%
    const curve = [100, 200, 160, 220, 154];
    expect(calcMaxDrawdown(curve)).toBeCloseTo(0.3, 5);
  });

  it('should return 0 for single element', () => {
    expect(calcMaxDrawdown([100])).toBe(0);
  });

  it('should return 0 for empty array', () => {
    expect(calcMaxDrawdown([])).toBe(0);
  });

  it('should handle total loss', () => {
    const curve = [100, 50, 0];
    expect(calcMaxDrawdown(curve)).toBeCloseTo(1.0, 5);
  });
});

// ─── calcProfitFactor ───────────────────────────────────────────────────────

describe('calcProfitFactor', () => {
  it('should return Infinity for all wins', () => {
    const trades: BacktestTrade[] = [
      makeTrade(10), makeTrade(20), makeTrade(5),
    ];
    expect(calcProfitFactor(trades)).toBe(Infinity);
  });

  it('should return 0 for all losses', () => {
    const trades: BacktestTrade[] = [
      makeTrade(-10), makeTrade(-20), makeTrade(-5),
    ];
    expect(calcProfitFactor(trades)).toBe(0);
  });

  it('should compute mixed wins/losses correctly', () => {
    // Gross profit = 30, gross loss = 15
    const trades: BacktestTrade[] = [
      makeTrade(10), makeTrade(20), makeTrade(-10), makeTrade(-5),
    ];
    expect(calcProfitFactor(trades)).toBeCloseTo(2.0, 5);
  });

  it('should return 0 for empty trades', () => {
    expect(calcProfitFactor([])).toBe(0);
  });
});

// ─── calcWinRate ────────────────────────────────────────────────────────────

describe('calcWinRate', () => {
  it('should return 1 for all wins', () => {
    const trades = [makeTrade(10), makeTrade(5), makeTrade(1)];
    expect(calcWinRate(trades)).toBe(1);
  });

  it('should return 0 for all losses', () => {
    const trades = [makeTrade(-10), makeTrade(-5), makeTrade(-1)];
    expect(calcWinRate(trades)).toBe(0);
  });

  it('should compute mixed correctly', () => {
    const trades = [makeTrade(10), makeTrade(-5), makeTrade(3), makeTrade(-1)];
    expect(calcWinRate(trades)).toBeCloseTo(0.5, 5);
  });

  it('should return 0 for empty trades', () => {
    expect(calcWinRate([])).toBe(0);
  });
});

// ─── runStrategyBacktest ────────────────────────────────────────────────────

describe('runStrategyBacktest', () => {
  const baseConfig: BacktestConfig = {
    strategyName: 'test-strategy',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    initialCapital: 10_000,
    tickIntervalMs: 60_000,
  };

  it('should complete with valid result structure', async () => {
    const data = generateSyntheticData({ ticks: 50, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 1 });
    const result = await runStrategyBacktest(baseConfig, data, () => {
      return async () => { /* no-op strategy */ };
    });

    expect(result.strategyName).toBe('test-strategy');
    expect(result.startEquity).toBe(10_000);
    expect(typeof result.endEquity).toBe('number');
    expect(typeof result.totalPnl).toBe('number');
    expect(typeof result.sharpeRatio).toBe('number');
    expect(typeof result.maxDrawdown).toBe('number');
    expect(typeof result.profitFactor).toBe('number');
    expect(typeof result.winRate).toBe('number');
    expect(typeof result.totalFees).toBe('number');
    expect(Array.isArray(result.equityCurve)).toBe(true);
    expect(Array.isArray(result.trades)).toBe(true);
  });

  it('should have equity curve with at least one entry per tick + initial', async () => {
    const data = generateSyntheticData({ ticks: 30, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 2 });
    const result = await runStrategyBacktest(baseConfig, data, () => {
      return async () => {};
    });

    // initial + one per tick
    expect(result.equityCurve.length).toBe(31);
  });

  it('should record trades when strategy places orders', async () => {
    const data = generateSyntheticData({ ticks: 20, startPrice: 0.5, volatility: 0.01, trend: 0, seed: 3 });
    let callCount = 0;

    const result = await runStrategyBacktest(baseConfig, data, (deps: any) => {
      return async () => {
        callCount++;
        // Buy on tick 5, sell on tick 10
        if (callCount === 5) {
          await deps.clob.postOrder({
            tokenId: 'backtest-token-yes',
            side: 'buy',
            price: '0.50',
            size: '100',
            orderType: 'GTC',
          });
        }
        if (callCount === 10) {
          await deps.clob.postOrder({
            tokenId: 'backtest-token-yes',
            side: 'sell',
            price: '0.52',
            size: '100',
            orderType: 'GTC',
          });
        }
      };
    });

    expect(result.totalTrades).toBeGreaterThanOrEqual(1);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  it('should compute fees correctly', async () => {
    const data = generateSyntheticData({ ticks: 20, startPrice: 0.5, volatility: 0.01, trend: 0, seed: 4 });
    let callCount = 0;

    const result = await runStrategyBacktest(
      { ...baseConfig, feeRate: 0.01 }, // 1% fee for easy math
      data,
      (deps: any) => {
        return async () => {
          callCount++;
          if (callCount === 3) {
            await deps.clob.postOrder({
              tokenId: 'backtest-token-yes',
              side: 'buy',
              price: '0.50',
              size: '100',
              orderType: 'GTC',
            });
          }
          if (callCount === 8) {
            await deps.clob.postOrder({
              tokenId: 'backtest-token-yes',
              side: 'sell',
              price: '0.50',
              size: '100',
              orderType: 'GTC',
            });
          }
        };
      },
    );

    // Fees should be > 0 because we placed trades with 1% fee rate
    expect(result.totalFees).toBeGreaterThan(0);
  });

  it('should return zero PnL for no-op strategy', async () => {
    const data = generateSyntheticData({ ticks: 20, startPrice: 0.5, volatility: 0.02, trend: 0, seed: 5 });
    const result = await runStrategyBacktest(baseConfig, data, () => {
      return async () => {};
    });

    expect(result.totalPnl).toBe(0);
    expect(result.totalFees).toBe(0);
    expect(result.totalTrades).toBe(0);
    expect(result.endEquity).toBe(config().initialCapital);
  });

  it('should pass mock dependencies to createTickFn', async () => {
    const data = generateSyntheticData({ ticks: 5, startPrice: 0.5, volatility: 0.01, trend: 0, seed: 6 });
    let receivedDeps: any = null;

    await runStrategyBacktest(baseConfig, data, (deps: any) => {
      receivedDeps = deps;
      return async () => {};
    });

    expect(receivedDeps).not.toBeNull();
    expect(receivedDeps.clob).toBeDefined();
    expect(receivedDeps.orderManager).toBeDefined();
    expect(receivedDeps.eventBus).toBeDefined();
    expect(receivedDeps.gamma).toBeDefined();
  });

  it('should close open positions at end of backtest', async () => {
    const data = generateSyntheticData({ ticks: 10, startPrice: 0.5, volatility: 0.01, trend: 0, seed: 7 });
    let callCount = 0;

    const result = await runStrategyBacktest(baseConfig, data, (deps: any) => {
      return async () => {
        callCount++;
        // Open a position but never close it
        if (callCount === 2) {
          await deps.clob.postOrder({
            tokenId: 'backtest-token-yes',
            side: 'buy',
            price: '0.50',
            size: '100',
            orderType: 'GTC',
          });
        }
      };
    });

    // Should still have a completed trade from forced close
    expect(result.totalTrades).toBe(1);
  });

  it('should produce equity curve entries with timestamps', async () => {
    const data = generateSyntheticData({ ticks: 10, startPrice: 0.5, volatility: 0.01, trend: 0, seed: 8 });
    const result = await runStrategyBacktest(baseConfig, data, () => {
      return async () => {};
    });

    for (const entry of result.equityCurve) {
      expect(typeof entry.timestamp).toBe('number');
      expect(typeof entry.equity).toBe('number');
    }
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTrade(pnl: number): BacktestTrade {
  return {
    entryTime: Date.now(),
    exitTime: Date.now() + 60_000,
    side: 'buy-yes',
    entryPrice: 0.5,
    exitPrice: 0.5 + pnl / 100,
    size: 100,
    pnl,
    fees: 0,
  };
}

function config(): BacktestConfig {
  return {
    strategyName: 'test',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    initialCapital: 10_000,
    tickIntervalMs: 60_000,
  };
}
