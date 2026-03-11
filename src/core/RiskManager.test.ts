import { RiskManager, TrailingStopConfig } from './RiskManager';

describe('RiskManager', () => {
  describe('calculatePositionSize', () => {
    it('should calculate correct position size', () => {
      const size = RiskManager.calculatePositionSize(10000, 1, 100);
      expect(size).toBeCloseTo(1, 5); // 1% of 10000 = 100, 100/100 = 1
    });

    it('should throw if riskPercentage is 0', () => {
      expect(() => RiskManager.calculatePositionSize(10000, 0, 100)).toThrow();
    });

    it('should throw if riskPercentage > 100', () => {
      expect(() => RiskManager.calculatePositionSize(10000, 101, 100)).toThrow();
    });

    it('should throw if currentPrice is 0', () => {
      expect(() => RiskManager.calculatePositionSize(10000, 1, 0)).toThrow('greater than 0');
    });

    it('should throw if currentPrice is negative', () => {
      expect(() => RiskManager.calculatePositionSize(10000, 1, -1)).toThrow('greater than 0');
    });

    it('should throw if balance is negative', () => {
      expect(() => RiskManager.calculatePositionSize(-10000, 1, 100)).toThrow('Balance cannot be negative');
    });
  });

  describe('initTrailingStop', () => {
    it('should initialize stop 2% below entry by default', () => {
      const config: TrailingStopConfig = { trailingStop: true };
      const state = RiskManager.initTrailingStop(100, config, 0.02);
      expect(state.highestPrice).toBe(100);
      expect(state.stopPrice).toBeCloseTo(98, 5);
      expect(state.isPositiveActive).toBe(false);
    });

    it('should use trailingStopPositive as initial fraction', () => {
      const config: TrailingStopConfig = { trailingStop: true, trailingStopPositive: 0.01 };
      const state = RiskManager.initTrailingStop(100, config);
      expect(state.stopPrice).toBeCloseTo(99, 5);
    });
  });

  describe('updateTrailingStop', () => {
    it('should not trigger stop if price above stop', () => {
      const config: TrailingStopConfig = { trailingStop: true };
      const state = RiskManager.initTrailingStop(100, config, 0.02);
      const { stopHit } = RiskManager.updateTrailingStop(105, state, config, 0.02);
      expect(stopHit).toBe(false);
    });

    it('should trigger stop if price falls below stop', () => {
      const config: TrailingStopConfig = { trailingStop: true };
      const state = RiskManager.initTrailingStop(100, config, 0.02);
      const { stopHit } = RiskManager.updateTrailingStop(97, state, config, 0.02);
      expect(stopHit).toBe(true);
    });

    it('should trail stop up as price rises', () => {
      const config: TrailingStopConfig = { trailingStop: true };
      let state = RiskManager.initTrailingStop(100, config, 0.02);

      // Price rises to 110
      const result = RiskManager.updateTrailingStop(110, state, config, 0.02);
      state = result.state;
      expect(result.stopHit).toBe(false);
      expect(state.highestPrice).toBe(110);
      expect(state.stopPrice).toBeCloseTo(107.8, 1); // 110 * 0.98

      // Now price drops to 108 — above stop, not triggered
      const result2 = RiskManager.updateTrailingStop(108, state, config, 0.02);
      expect(result2.stopHit).toBe(false);

      // Price drops to 107 — below stop of 107.8, triggered
      const result3 = RiskManager.updateTrailingStop(107, state, config, 0.02);
      expect(result3.stopHit).toBe(true);
    });

    it('should not update trailing stop when trailingStop is false', () => {
      const config: TrailingStopConfig = { trailingStop: false };
      const state = RiskManager.initTrailingStop(100, config, 0.02);
      const { stopHit } = RiskManager.updateTrailingStop(50, state, config, 0.02);
      expect(stopHit).toBe(false);
    });

    it('should activate trailingStopPositive when price crosses offset threshold', () => {
      const config: TrailingStopConfig = {
        trailingStop: true,
        trailingStopPositive: 0.01,   // tighter 1% trail once active
        trailingStopPositiveOffset: 0.03 // activate after +3% gain
      };
      let state = RiskManager.initTrailingStop(100, config, 0.02);

      // Price rises 4% — crosses the +3% offset → activates positive trailing
      const result = RiskManager.updateTrailingStop(104, state, config, 0.02);
      state = result.state;
      expect(result.stopHit).toBe(false);
      expect(state.isPositiveActive).toBe(true);
      // Stop should now be at 104 * (1 - 0.01) = 102.96
      expect(state.stopPrice).toBeCloseTo(102.96, 1);
    });
  });
});
