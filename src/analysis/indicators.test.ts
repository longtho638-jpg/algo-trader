import { Indicators } from './indicators';

describe('Indicators', () => {
  describe('zScore', () => {
    it('should calculate correct z-score', () => {
      const value = 110;
      const mean = 100;
      const stdDev = 5;
      expect(Indicators.zScore(value, mean, stdDev)).toBe(2);
    });

    it('should return 0 if stdDev is 0', () => {
      expect(Indicators.zScore(110, 100, 0)).toBe(0);
    });
  });

  describe('standardDeviation', () => {
    it('should calculate correct standard deviation', () => {
      const values = [10, 12, 23, 23, 16, 23, 21, 16];
      // Sum = 144, n = 8, Mean = 18
      // Sum of squares: 64 + 36 + 25 + 25 + 4 + 25 + 9 + 4 = 192
      // Population Variance = 192 / 8 = 24
      // StdDev = sqrt(24) ≈ 4.898979...
      expect(Indicators.standardDeviation(values)).toBeCloseTo(4.89898, 5);
    });

    it('should return 0 for empty array', () => {
      expect(Indicators.standardDeviation([])).toBe(0);
    });
  });

  describe('correlation', () => {
    it('should calculate correct correlation for identical arrays', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [1, 2, 3, 4, 5];
      expect(Indicators.correlation(x, y)).toBe(1);
    });

    it('should calculate correct correlation for inverse arrays', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];
      expect(Indicators.correlation(x, y)).toBe(-1);
    });

    it('should return 0 if arrays have different lengths', () => {
      expect(Indicators.correlation([1, 2], [1, 2, 3])).toBe(0);
    });

    it('should return 0 for zero variance arrays', () => {
      expect(Indicators.correlation([1, 1, 1], [1, 2, 3])).toBe(0);
    });

    it('should return 0 if denX or denY is 0', () => {
      expect(Indicators.correlation([1, 1, 1], [1, 1, 1])).toBe(0);
    });
  });

  describe('sma', () => {
    it('should calculate simple moving average correctly', () => {
      const values = [10, 20, 30, 40, 50];
      const period = 3;
      // expected: [(10+20+30)/3, (20+30+40)/3, (30+40+50)/3] -> [20, 30, 40]
      expect(Indicators.sma(values, period)).toEqual([20, 30, 40]);
    });
  });

  describe('macd', () => {
    it('should calculate macd correctly', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310, 320, 330, 340, 350];
      const result = Indicators.macd(values, 12, 26, 9);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].MACD).toBeDefined();
    });
  });

  describe('bbands', () => {
    it('should calculate bbands correctly', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
      const result = Indicators.bbands(values, 20, 2);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].lower).toBeDefined();
      expect(result[0].middle).toBeDefined();
      expect(result[0].upper).toBeDefined();
    });
  });

  describe('getLastBBands', () => {
    it('should return null for empty array', () => {
      expect(Indicators.getLastBBands([])).toBeNull();
    });

    it('should return null for null input', () => {
      // @ts-expect-error Testing invalid input
      expect(Indicators.getLastBBands(null)).toBeNull();
    });

    it('should return the last bbands result', () => {
      const bbands = [
        { middle: 10, upper: 12, lower: 8, pb: 0.5 },
        { middle: 11, upper: 13, lower: 9, pb: 0.5 }
      ];
      expect(Indicators.getLastBBands(bbands)).toEqual({ middle: 11, upper: 13, lower: 9, pb: 0.5 });
    });
  });

  describe('rsi', () => {
    it('should calculate rsi correctly', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
      const result = Indicators.rsi(values, 14);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getLast', () => {
    it('should return 0 for empty array', () => {
      expect(Indicators.getLast([])).toBe(0);
    });

    it('should return 0 for null input', () => {
      // @ts-expect-error Testing invalid input
      expect(Indicators.getLast(null)).toBe(0);
    });

    it('should return the last value', () => {
      expect(Indicators.getLast([10, 20, 30])).toBe(30);
    });
  });
});
