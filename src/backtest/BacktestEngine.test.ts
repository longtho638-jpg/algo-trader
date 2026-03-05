/**
 * Tests for BacktestEngine, SignalFilter, PortfolioRiskManager (Round 3).
 */

import { BacktestEngine } from './BacktestEngine';
import { SignalFilter } from '../core/SignalFilter';
import { PortfolioRiskManager } from '../core/PortfolioRiskManager';
import { ICandle } from '../interfaces/ICandle';
import { IStrategy, ISignal, SignalType } from '../interfaces/IStrategy';
import { ConsensusSignal } from '../core/SignalGenerator';

// ---- Helpers ----

function makeCandle(close: number, timestamp = Date.now(), volume = 500): ICandle {
  return {
    timestamp,
    open: close * 0.999,
    high: close * 1.002,
    low: close * 0.998,
    close,
    volume,
  };
}

function makeCandles(count: number, startPrice = 100, startTime = 1000000): ICandle[] {
  const candles: ICandle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    // Sine wave with noise for realistic price movement
    const wave = Math.sin(i / 20) * 2;
    const noise = (Math.random() - 0.5) * 1;
    price = startPrice + wave + noise;
    candles.push(makeCandle(price, startTime + i * 60000, 100 + Math.random() * 900));
  }
  return candles;
}

/** Simple alternating BUY/SELL strategy for testing */
class TestStrategy implements IStrategy {
  name = 'TestStrategy';
  private count = 0;
  private buyEvery: number;

  constructor(buyEvery = 10) {
    this.buyEvery = buyEvery;
  }

  async init(_history: ICandle[]): Promise<void> {
    this.count = 0;
  }

  async onCandle(candle: ICandle): Promise<ISignal | null> {
    this.count++;
    if (this.count % this.buyEvery === 0) {
      return { type: SignalType.BUY, price: candle.close, timestamp: candle.timestamp };
    }
    if (this.count % this.buyEvery === Math.floor(this.buyEvery / 2)) {
      return { type: SignalType.SELL, price: candle.close, timestamp: candle.timestamp };
    }
    return null;
  }
}

// ---- BacktestEngine Tests ----

describe('BacktestEngine', () => {
  const engine = new BacktestEngine();

  test('runDetailed returns empty result for insufficient data', async () => {
    const strategy = new TestStrategy();
    const result = await engine.runDetailed(strategy, [], 10000);
    expect(result.totalTrades).toBe(0);
    expect(result.finalBalance).toBe(10000);
    expect(result.equityCurve).toHaveLength(0);
  });

  test('runDetailed produces trades and equity curve', async () => {
    const strategy = new TestStrategy(5);
    const candles = makeCandles(500);
    const result = await engine.runDetailed(strategy, candles, 10000);

    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.strategyName).toBe('TestStrategy');
    expect(result.initialBalance).toBe(10000);
    expect(typeof result.calmarRatio).toBe('number');
    expect(typeof result.sortinoRatio).toBe('number');
    expect(typeof result.expectancy).toBe('number');
  });

  test('detailedTrades have MAE/MFE tracking', async () => {
    const strategy = new TestStrategy(5);
    const candles = makeCandles(500);
    const result = await engine.runDetailed(strategy, candles, 10000);

    if (result.detailedTrades.length > 0) {
      const trade = result.detailedTrades[0];
      expect(trade.maxAdverseExcursion).toBeLessThanOrEqual(trade.entryPrice);
      expect(trade.maxFavorableExcursion).toBeGreaterThanOrEqual(trade.entryPrice * 0.99);
      expect(trade.holdingPeriodMs).toBeGreaterThan(0);
      expect(trade.fees).toBeGreaterThanOrEqual(0);
    }
  });

  test('walkForward produces windows and robustness metrics', async () => {
    const candles = makeCandles(2000);
    const result = await engine.walkForward(
      () => new TestStrategy(5),
      candles,
      3,  // 3 windows
      0.7, // 70% train
      10000
    );

    expect(result.windows).toHaveLength(3);
    expect(typeof result.aggregateTestReturn).toBe('number');
    expect(typeof result.aggregateTestSharpe).toBe('number');
    expect(typeof result.robustnessRatio).toBe('number');
    expect(typeof result.overfit).toBe('boolean');

    for (const w of result.windows) {
      expect(w.trainResult.strategyName).toBe('TestStrategy');
      expect(w.testResult.strategyName).toBe('TestStrategy');
    }
  });

  test('walkForward returns empty for too-small data', async () => {
    const candles = makeCandles(100); // Too small for 5 windows
    const result = await engine.walkForward(
      () => new TestStrategy(5),
      candles,
      5
    );
    expect(result.windows).toHaveLength(0);
    expect(result.overfit).toBe(true);
  });

  test('monteCarlo produces distribution statistics', async () => {
    const strategy = new TestStrategy(5);
    const candles = makeCandles(500);
    const detailed = await engine.runDetailed(strategy, candles, 10000);

    const mc = engine.monteCarlo(detailed.detailedTrades, 10000, 200);

    expect(typeof mc.medianReturn).toBe('number');
    expect(mc.p5Return).toBeLessThanOrEqual(mc.medianReturn);
    expect(mc.p95Return).toBeGreaterThanOrEqual(mc.medianReturn);
    expect(mc.ruinProbability).toBeGreaterThanOrEqual(0);
    expect(mc.ruinProbability).toBeLessThanOrEqual(100);
  });

  test('monteCarlo handles empty trades', () => {
    const mc = engine.monteCarlo([], 10000);
    expect(mc.medianReturn).toBe(0);
    expect(mc.ruinProbability).toBe(0);
  });
});

// ---- SignalFilter Tests ----

describe('SignalFilter', () => {
  function makeConsensusSignal(type: SignalType = SignalType.BUY): ConsensusSignal {
    return {
      type,
      confidence: 0.75,
      price: 100,
      timestamp: Date.now(),
      votes: [
        { strategy: 'A', vote: type, weight: 1 },
        { strategy: 'B', vote: type, weight: 1 },
      ],
      metadata: { totalWeight: 2, buyWeight: type === SignalType.BUY ? 2 : 0, sellWeight: type === SignalType.SELL ? 2 : 0 },
    };
  }

  test('evaluate passes a strong signal with sufficient data', () => {
    const filter = new SignalFilter({ minScore: 30 });
    const candles = makeCandles(60);
    candles.forEach(c => filter.updateCandle(c));

    const signal = makeConsensusSignal(SignalType.BUY);
    const result = filter.evaluate(signal, candles[candles.length - 1]);

    expect(result.score.total).toBeGreaterThan(0);
    expect(result.regime).toBeDefined();
    expect(['trending', 'ranging', 'volatile']).toContain(result.regime.regime);
  });

  test('evaluate rejects during cooldown', () => {
    const filter = new SignalFilter({ cooldownMs: 60000, minScore: 0 });
    const candles = makeCandles(60);
    candles.forEach(c => filter.updateCandle(c));

    filter.recordTrade(candles[candles.length - 1].timestamp - 30000); // 30s ago

    const signal = makeConsensusSignal();
    const result = filter.evaluate(signal, candles[candles.length - 1]);

    expect(result.pass).toBe(false);
    expect(result.rejectReason).toBe('cooldown_active');
  });

  test('evaluate rejects low volume signals', () => {
    const filter = new SignalFilter({ minVolume: 2.0, minScore: 0 }); // Require 2x avg volume
    const candles = makeCandles(60);
    candles.forEach(c => filter.updateCandle(c));

    const signal = makeConsensusSignal();
    const lowVolCandle = makeCandle(100, Date.now(), 1); // Volume = 1 (way below avg)
    const result = filter.evaluate(signal, lowVolCandle);

    expect(result.pass).toBe(false);
    expect(result.rejectReason).toBe('low_volume');
  });

  test('detectRegime returns valid regime with sufficient data', () => {
    const filter = new SignalFilter();
    const candles = makeCandles(60);
    candles.forEach(c => filter.updateCandle(c));

    const regime = filter.detectRegime();
    expect(['trending', 'ranging', 'volatile']).toContain(regime.regime);
    expect(regime.adx).toBeGreaterThanOrEqual(0);
    expect(regime.volatilityRatio).toBeGreaterThan(0);
  });

  test('detectRegime defaults to ranging with insufficient data', () => {
    const filter = new SignalFilter();
    const regime = filter.detectRegime();
    expect(regime.regime).toBe('ranging');
    expect(regime.adx).toBe(0);
  });

  test('recordTrade updates cooldown state', () => {
    const filter = new SignalFilter({ cooldownMs: 100000, minScore: 0 });
    const candles = makeCandles(60);
    candles.forEach(c => filter.updateCandle(c));

    const now = Date.now();
    filter.recordTrade(now);

    const signal = makeConsensusSignal();
    const result = filter.evaluate(signal, makeCandle(100, now + 1000));
    expect(result.pass).toBe(false);
    expect(result.rejectReason).toBe('cooldown_active');
  });
});

// ---- PortfolioRiskManager Tests ----

describe('PortfolioRiskManager', () => {
  test('calculateKelly returns correct sizing', () => {
    const prm = new PortfolioRiskManager(100000);

    // 60% win rate, 1.5 avg win/loss ratio
    const result = prm.calculateKelly(0.6, 1.5);
    expect(result.kellyPercent).toBeGreaterThan(0);
    expect(result.adjustedPercent).toBeLessThan(result.kellyPercent);
    expect(result.positionSize).toBeGreaterThan(0);
    expect(result.positionSize).toBeLessThanOrEqual(100000);
  });

  test('calculateKelly returns 0 for losing strategy', () => {
    const prm = new PortfolioRiskManager(100000);

    // 30% win rate, 0.5 ratio = losing strategy
    const result = prm.calculateKelly(0.3, 0.5);
    expect(result.kellyPercent).toBe(0);
    expect(result.positionSize).toBe(0);
  });

  test('assessNewPosition rejects when max positions reached', () => {
    const prm = new PortfolioRiskManager(100000, { maxPositions: 2 });

    prm.addPosition({ symbol: 'BTC/USDT', entryPrice: 50000, currentPrice: 50000, size: 0.1, side: 'long', entryTime: Date.now() });
    prm.addPosition({ symbol: 'ETH/USDT', entryPrice: 3000, currentPrice: 3000, size: 1, side: 'long', entryTime: Date.now() });

    const result = prm.assessNewPosition('SOL/USDT', 100, 0.6, 1.5);
    expect(result.canOpenPosition).toBe(false);
    expect(result.reason).toContain('max_positions');
  });

  test('assessNewPosition allows when within limits', () => {
    const prm = new PortfolioRiskManager(100000, { maxPositions: 5 });

    const result = prm.assessNewPosition('BTC/USDT', 50000, 0.6, 1.5);
    expect(result.canOpenPosition).toBe(true);
    expect(result.suggestedSize.positionSize).toBeGreaterThan(0);
  });

  test('closePosition tracks PnL and updates portfolio value', () => {
    const prm = new PortfolioRiskManager(10000);

    prm.addPosition({
      symbol: 'BTC/USDT', entryPrice: 100, currentPrice: 100,
      size: 10, side: 'long', entryTime: Date.now(),
    });

    const pnl = prm.closePosition('BTC/USDT', 110); // +10 per unit * 10 units = +100
    expect(pnl).toBe(100);
    expect(prm.getPortfolioValue()).toBe(10100);
    expect(prm.getPositions()).toHaveLength(0);
  });

  test('closePosition returns 0 for unknown symbol', () => {
    const prm = new PortfolioRiskManager(10000);
    const pnl = prm.closePosition('UNKNOWN', 100);
    expect(pnl).toBe(0);
  });

  test('calculateExposure returns correct percentage', () => {
    const prm = new PortfolioRiskManager(10000);

    prm.addPosition({
      symbol: 'BTC/USDT', entryPrice: 100, currentPrice: 100,
      size: 10, side: 'long', entryTime: Date.now(),
    }); // Value = 1000 / 10000 = 10%

    expect(prm.calculateExposure()).toBeCloseTo(10, 0);
  });

  test('getCurrentDrawdown tracks drawdown from peak', () => {
    const prm = new PortfolioRiskManager(10000);

    prm.addPosition({
      symbol: 'BTC/USDT', entryPrice: 100, currentPrice: 100,
      size: 10, side: 'long', entryTime: Date.now(),
    });

    // Losing trade: -200
    prm.closePosition('BTC/USDT', 80);
    expect(prm.getCurrentDrawdown()).toBeGreaterThan(0);
  });

  test('assessNewPosition rejects on high drawdown', () => {
    const prm = new PortfolioRiskManager(10000, { maxDrawdownPercent: 5 });

    prm.addPosition({
      symbol: 'BTC/USDT', entryPrice: 100, currentPrice: 100,
      size: 100, side: 'long', entryTime: Date.now(),
    });
    prm.closePosition('BTC/USDT', 94); // -600 = 6% drawdown

    const result = prm.assessNewPosition('ETH/USDT', 3000, 0.6, 1.5);
    expect(result.canOpenPosition).toBe(false);
    expect(result.reason).toContain('drawdown');
  });

  test('calculateVaR returns zeros with insufficient history', () => {
    const prm = new PortfolioRiskManager(10000);
    const var95 = prm.calculateVaR();
    expect(var95.var95).toBe(0);
    expect(var95.cvar95).toBe(0);
  });

  test('calculateVaR returns valid values with enough history', () => {
    const prm = new PortfolioRiskManager(10000);

    // Simulate 20 trades to build return history
    for (let i = 0; i < 20; i++) {
      prm.addPosition({
        symbol: `PAIR${i}`, entryPrice: 100, currentPrice: 100,
        size: 1, side: 'long', entryTime: Date.now(),
      });
      const exitPrice = 100 + (Math.random() - 0.45) * 10; // Slight positive bias
      prm.closePosition(`PAIR${i}`, exitPrice);
    }

    const var95 = prm.calculateVaR();
    expect(var95.var95).toBeGreaterThanOrEqual(0);
    expect(var95.varPercent).toBeGreaterThanOrEqual(0);
  });

  test('reset clears all state', () => {
    const prm = new PortfolioRiskManager(10000);
    prm.addPosition({ symbol: 'BTC/USDT', entryPrice: 100, currentPrice: 100, size: 1, side: 'long', entryTime: Date.now() });

    prm.reset(20000);
    expect(prm.getPositions()).toHaveLength(0);
    expect(prm.getPortfolioValue()).toBe(20000);
  });

  test('updatePrices updates position current prices', () => {
    const prm = new PortfolioRiskManager(10000);
    prm.addPosition({ symbol: 'BTC/USDT', entryPrice: 100, currentPrice: 100, size: 1, side: 'long', entryTime: Date.now() });

    prm.updatePrices({ 'BTC/USDT': 150 });
    const positions = prm.getPositions();
    expect(positions[0].currentPrice).toBe(150);
  });
});
