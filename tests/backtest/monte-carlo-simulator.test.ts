/**
 * MonteCarloSimulator Tests
 */

import { MonteCarloSimulator, MonteCarloConfig } from '../../src/backtest/MonteCarloSimulator';
import type { BacktestMetrics } from '../../src/types/trading.types';

describe('MonteCarloSimulator', () => {
  const createMockBacktestMetrics = (totalReturn = 0.1): BacktestMetrics => ({
    totalReturn,
    sharpeRatio: 1.5,
    sortinoRatio: 2.0,
    maxDrawdown: 0.15,
    maxDrawdownDuration: 30,
    winRate: 0.55,
    profitFactor: 1.8,
    totalTrades: 100,
    winningTrades: 55,
    losingTrades: 45,
    averageWin: 0.05,
    averageLoss: -0.03,
    averageTradeDuration: 1000,
    calmarRatio: 1.2,
    informationRatio: 0.8,
    tailRatio: 1.1,
    commonSenseRatio: 1.3,
    ulcerIndex: 0.1,
    serenityRatio: 1.4,
  });

  const createHistoricalData = (count: number) => {
    const data: Array<{ close: number; timestamp: number }> = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
      price = price * (1 + (Math.random() - 0.5) * 0.02);
      data.push({
        close: price,
        timestamp: Date.now() + i * 60000,
      });
    }
    return data;
  };

  const mockStrategyFn = jest.fn().mockImplementation((data) => {
    return Promise.resolve(createMockBacktestMetrics(0.1 + Math.random() * 0.1));
  });

  beforeEach(() => {
    mockStrategyFn.mockClear();
  });

  describe('runSimulation', () => {
    const defaultConfig: MonteCarloConfig = {
      simulationCount: 10,
      shuffleMethod: 'bootstrap',
    };

    it('should run simulations with default config', async () => {
      const historicalData = createHistoricalData(100);
      const baselineResult = createMockBacktestMetrics(0.1);

      const result = await MonteCarloSimulator.runSimulation(
        baselineResult,
        historicalData,
        mockStrategyFn,
        defaultConfig
      );

      expect(result.baselinePerformance).toBeDefined();
      expect(result.simulatedResults).toHaveLength(defaultConfig.simulationCount);
      expect(result.confidenceIntervals).toBeDefined();
      expect(result.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
      expect(result.probabilityOfSuccess).toBeLessThanOrEqual(1);
    });

    it('should calculate confidence intervals', async () => {
      const historicalData = createHistoricalData(100);
      const baselineResult = createMockBacktestMetrics(0.1);

      const result = await MonteCarloSimulator.runSimulation(
        baselineResult,
        historicalData,
        mockStrategyFn,
        defaultConfig
      );

      expect(result.confidenceIntervals.lower).toBeDefined();
      expect(result.confidenceIntervals.upper).toBeDefined();
      expect(result.confidenceIntervals.lower).toBeLessThanOrEqual(result.confidenceIntervals.upper);
    });

    it('should identify worst and best case scenarios', async () => {
      const historicalData = createHistoricalData(100);
      const baselineResult = createMockBacktestMetrics(0.1);

      const result = await MonteCarloSimulator.runSimulation(
        baselineResult,
        historicalData,
        mockStrategyFn,
        defaultConfig
      );

      expect(result.worstCaseScenario).toBeDefined();
      expect(result.bestCaseScenario).toBeDefined();
    });

    it('should calculate performance distribution statistics', async () => {
      const historicalData = createHistoricalData(100);
      const baselineResult = createMockBacktestMetrics(0.1);

      const result = await MonteCarloSimulator.runSimulation(
        baselineResult,
        historicalData,
        mockStrategyFn,
        defaultConfig
      );

      expect(result.performanceDistribution).toBeDefined();
      expect(result.performanceDistribution.mean).toBeDefined();
      expect(result.performanceDistribution.median).toBeDefined();
      expect(result.performanceDistribution.stdDev).toBeDefined();
      expect(result.performanceDistribution.skewness).toBeDefined();
      expect(result.performanceDistribution.kurtosis).toBeDefined();
    });

    it('should handle simulation failures gracefully', async () => {
      const historicalData = createHistoricalData(100);
      const baselineResult = createMockBacktestMetrics(0.1);
      // First call succeeds (baseline), subsequent calls fail
      const failingStrategyFn = jest.fn()
        .mockResolvedValueOnce(createMockBacktestMetrics(0.1))
        .mockRejectedValue(new Error('Simulation failed'));

      const result = await MonteCarloSimulator.runSimulation(
        baselineResult,
        historicalData,
        failingStrategyFn,
        defaultConfig
      );

      expect(result.simulatedResults).toHaveLength(defaultConfig.simulationCount);
      expect(result.simulatedResults[1].totalReturn).toBe(0); // Second simulation failed
    });

    it('should work with block shuffle method', async () => {
      const historicalData = createHistoricalData(100);
      const baselineResult = createMockBacktestMetrics(0.1);

      const result = await MonteCarloSimulator.runSimulation(
        baselineResult,
        historicalData,
        mockStrategyFn,
        { ...defaultConfig, shuffleMethod: 'block', blockSize: 10 }
      );

      expect(result.simulatedResults).toHaveLength(defaultConfig.simulationCount);
    });

    it('should work with random walk shuffle method', async () => {
      const historicalData = createHistoricalData(100);
      const baselineResult = createMockBacktestMetrics(0.1);

      const result = await MonteCarloSimulator.runSimulation(
        baselineResult,
        historicalData,
        mockStrategyFn,
        { ...defaultConfig, shuffleMethod: 'random_walk', volatilityAdjustment: 1.2 }
      );

      expect(result.simulatedResults).toHaveLength(defaultConfig.simulationCount);
    });
  });

  describe('evaluateRobustness', () => {
    const createMonteCarloResult = (returns: number[]) => ({
      baselinePerformance: createMockBacktestMetrics(returns[0]),
      simulatedResults: returns.map(r => createMockBacktestMetrics(r)),
      confidenceIntervals: { lower: Math.min(...returns), upper: Math.max(...returns) },
      probabilityOfSuccess: returns.filter(r => r > 0).length / returns.length,
      worstCaseScenario: createMockBacktestMetrics(Math.min(...returns)),
      bestCaseScenario: createMockBacktestMetrics(Math.max(...returns)),
      performanceDistribution: {
        mean: returns.reduce((a, b) => a + b, 0) / returns.length,
        median: returns.sort((a, b) => a - b)[Math.floor(returns.length / 2)],
        stdDev: 0.1,
        skewness: 0,
        kurtosis: 0,
      },
    });

    it('should calculate robustness score for positive returns', () => {
      const returns = [0.1, 0.15, 0.12, 0.18, 0.14];
      const result = createMonteCarloResult(returns);

      const robustness = MonteCarloSimulator.evaluateRobustness(result);

      expect(robustness.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(robustness.robustnessScore).toBeLessThanOrEqual(1);
    });

    it('should calculate risk of spuriousness', () => {
      const returns = [-0.1, -0.05, -0.15, -0.08, -0.12];
      const result = createMonteCarloResult(returns);

      const robustness = MonteCarloSimulator.evaluateRobustness(result);

      expect(robustness.riskOfSpuriousness).toBeDefined();
      expect(robustness.riskOfSpuriousness).toBeGreaterThan(0.5); // Most returns negative
    });

    it('should use custom target return', () => {
      const returns = [0.05, 0.06, 0.07, 0.08, 0.09];
      const result = createMonteCarloResult(returns);

      const robustness = MonteCarloSimulator.evaluateRobustness(result, 0.1);

      expect(robustness.confidenceInPerformance).toBeDefined();
    });
  });

  describe('generateSyntheticData (private method via runSimulation)', () => {
    it('should generate data with same length as original', async () => {
      const originalData = createHistoricalData(200);
      const baselineResult = createMockBacktestMetrics(0.1);

      let capturedDataLength = 0;
      const capturingStrategyFn = jest.fn().mockImplementation((data) => {
        capturedDataLength = data.length;
        return Promise.resolve(createMockBacktestMetrics(0.1));
      });

      await MonteCarloSimulator.runSimulation(
        baselineResult,
        originalData,
        capturingStrategyFn,
        { simulationCount: 5, shuffleMethod: 'bootstrap' }
      );

      expect(capturedDataLength).toBe(originalData.length);
    });
  });
});
