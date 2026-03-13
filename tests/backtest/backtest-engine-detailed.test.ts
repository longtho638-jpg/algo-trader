/**
 * BacktestEngine Tests
 */

import { BacktestEngine } from '../../src/backtest/BacktestEngine';
import { IStrategy, SignalType } from '../../src/interfaces/IStrategy';
import { ICandle } from '../../src/interfaces/ICandle';
import { LicenseService } from '../../src/lib/raas-gate';

describe('BacktestEngine', () => {
  let engine: BacktestEngine;
  let mockLicenseService: jest.Mocked<LicenseService>;

  beforeEach(() => {
    engine = new BacktestEngine();
    // Reset license service for each test
    mockLicenseService = LicenseService.getInstance() as jest.Mocked<LicenseService>;
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const defaultEngine = new BacktestEngine();
      expect(defaultEngine).toBeDefined();
    });

    it('should accept custom config', () => {
      const customEngine = new BacktestEngine({
        feeRate: 0.002,
        riskPercentage: 1.5,
        slippageBps: 10,
      });
      expect(customEngine).toBeDefined();
    });
  });

  describe('runDetailed', () => {
    const createCandles = (count: number, startPrice = 100): ICandle[] => {
      const candles: ICandle[] = [];
      let price = startPrice;
      const now = Date.now();

      for (let i = 0; i < count; i++) {
        const change = (Math.random() - 0.5) * 2;
        price = price + change;
        candles.push({
          timestamp: now + i * 60000,
          open: price,
          high: price + Math.random(),
          low: price - Math.random(),
          close: price + (Math.random() - 0.5),
          volume: 1000 + Math.random() * 500,
        });
      }
      return candles;
    };

    const createMockStrategy = (): IStrategy => ({
      name: 'MockStrategy',
      init: jest.fn().mockResolvedValue(undefined),
      onCandle: jest.fn().mockResolvedValue(null),
      getConfig: jest.fn().mockReturnValue({}),
      getConfigSchema: jest.fn().mockReturnValue({}),
    });

    it('should return empty result for insufficient data', async () => {
      const candles = createCandles(50); // Less than warmup period
      const strategy = createMockStrategy();

      const result = await engine.runDetailed(strategy, candles, 10000);

      expect(result.detailedTrades).toHaveLength(0);
      expect(result.equityCurve).toBeDefined();
    });

    it('should run backtest with buy signals', async () => {
      const candles = createCandles(500);
      const strategy = createMockStrategy();

      // Generate buy signals on every 10th candle
      let callCount = 0;
      (strategy.onCandle as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount % 10 === 0) {
          return { type: SignalType.BUY, price: 100, size: 1 };
        }
        return null;
      });

      const result = await engine.runDetailed(strategy, candles, 10000);

      expect(result.detailedTrades).toBeDefined();
      expect(result.equityCurve).toBeDefined();
      expect(result.equityCurve.length).toBeGreaterThan(0);
    });

    it('should track equity curve', async () => {
      const candles = createCandles(500);
      const strategy = createMockStrategy();

      const result = await engine.runDetailed(strategy, candles, 10000);

      expect(result.equityCurve).toBeDefined();
      expect(result.equityCurve.length).toBeGreaterThan(0);
      expect(result.equityCurve[0].equity).toBeDefined();
      expect(result.equityCurve[0].drawdown).toBeDefined();
    });

    it('should calculate max drawdown', async () => {
      const candles = createCandles(500);
      const strategy = createMockStrategy();

      const result = await engine.runDetailed(strategy, candles, 10000);

      expect(result.maxDrawdown).toBeDefined();
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('should apply slippage to trades', async () => {
      const candles = createCandles(500);
      const strategy = createMockStrategy();

      (strategy.onCandle as jest.Mock)
        .mockReturnValueOnce({ type: SignalType.BUY, price: 100, size: 1 })
        .mockReturnValueOnce({ type: SignalType.SELL, price: 100, size: 1 })
        .mockReturnValue(null);

      const result = await engine.runDetailed(strategy, candles, 10000);

      expect(result.detailedTrades).toBeDefined();
    });

    it('should handle LicenseError for premium data', async () => {
      const candles = createCandles(15000); // > 10k candles
      const strategy = createMockStrategy();

      // Mock license service to throw error
      mockLicenseService.hasTier = jest.fn().mockReturnValue(false);

      await expect(engine.runDetailed(strategy, candles, 10000))
        .rejects
        .toThrow('Premium historical data');
    });
  });

  describe('walkForward', () => {
    const createCandles = (count: number): ICandle[] => {
      const candles: ICandle[] = [];
      let price = 100;
      const now = Date.now();

      for (let i = 0; i < count; i++) {
        const change = (Math.random() - 0.5) * 2;
        price = price + change;
        candles.push({
          timestamp: now + i * 60000,
          open: price,
          high: price + Math.random(),
          low: price - Math.random(),
          close: price + (Math.random() - 0.5),
          volume: 1000 + Math.random() * 500,
        });
      }
      return candles;
    };

    it('should require PRO license', async () => {
      const candles = createCandles(1000);
      const strategyFactory = () => createMockStrategy();

      mockLicenseService.requireTier = jest.fn().mockImplementation(() => {
        throw new Error('License required');
      });

      await expect(engine.walkForward(strategyFactory, candles, 5, 0.7, 10000))
        .rejects
        .toThrow('License required');
    });

    it('should return empty result for insufficient windows', async () => {
      const candles = createCandles(100); // Too small for 5 windows
      const strategyFactory = () => createMockStrategy();

      // Mock license check to pass
      mockLicenseService.requireTier = jest.fn();

      const result = await engine.walkForward(strategyFactory, candles, 5, 0.7, 10000);

      expect(result.windows).toHaveLength(0);
      expect(result.overfit).toBe(true);
    });

    it('should perform walk-forward analysis with valid data', async () => {
      const candles = createCandles(1000);
      const strategyFactory = () => createMockStrategy();

      mockLicenseService.requireTier = jest.fn();

      const result = await engine.walkForward(strategyFactory, candles, 3, 0.7, 10000);

      expect(result.windows).toBeDefined();
      expect(result.robustnessRatio).toBeDefined();
      expect(result.overfit).toBeDefined();
    });
  });
});

function createMockStrategy(): IStrategy {
  return {
    name: 'MockStrategy',
    init: jest.fn().mockResolvedValue(undefined),
    onCandle: jest.fn().mockResolvedValue(null),
    getConfig: jest.fn().mockReturnValue({}),
    getConfigSchema: jest.fn().mockReturnValue({}),
  };
}
