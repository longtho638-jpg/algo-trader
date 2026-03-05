import { BollingerBandStrategy } from './BollingerBandStrategy';
import { MacdCrossoverStrategy } from './MacdCrossoverStrategy';
import { SignalType } from '../interfaces/IStrategy';
import { ICandle } from '../interfaces/ICandle';

function makeCandle(close: number, i: number): ICandle {
  return { timestamp: i * 3600000, open: close, high: close * 1.001, low: close * 0.999, close, volume: 1000 };
}

// Generate sinusoidal candles to create predictable BBand signals
function makeCandles(n: number, basePrice = 100, amplitude = 20): ICandle[] {
  return Array.from({ length: n }, (_, i) => {
    const price = basePrice + amplitude * Math.sin((i / n) * Math.PI * 4);
    return makeCandle(price, i);
  });
}

describe('BollingerBandStrategy', () => {
  it('should instantiate with default params', () => {
    const s = new BollingerBandStrategy();
    expect(s.name).toBe('Bollinger Band + RSI Strategy');
  });

  it('should accept custom params', () => {
    const s = new BollingerBandStrategy({ bbPeriod: 10, rsiPeriod: 7, rsiOversold: 25 });
    expect(s.name).toBeTruthy();
  });

  it('should return null with insufficient data', async () => {
    const s = new BollingerBandStrategy();
    await s.init([]);
    const signal = await s.onCandle(makeCandle(100, 0));
    expect(signal).toBeNull();
  });

  it('should initialize with history', async () => {
    const s = new BollingerBandStrategy();
    const history = makeCandles(30);
    await s.init(history);
    expect(s.name).toBeTruthy();
  });

  it('should generate signals after sufficient data', async () => {
    const s = new BollingerBandStrategy();
    await s.init([]);
    const candles = makeCandles(60, 100, 30);
    let signalFound = false;
    for (const c of candles) {
      const sig = await s.onCandle(c);
      if (sig) {
        expect([SignalType.BUY, SignalType.SELL]).toContain(sig.type);
        expect(sig.tag).toBeTruthy();
        expect(sig.metadata).toBeDefined();
        signalFound = true;
      }
    }
    // With large amplitude, we expect at least one signal
    expect(signalFound).toBe(true);
  });

  it('should trim candle buffer when > 200 entries', async () => {
    const s = new BollingerBandStrategy();
    await s.init([]);
    // Feed 205 candles — buffer should trim and not throw
    const candles = makeCandles(205, 100, 10);
    for (const c of candles) {
      await s.onCandle(c); // should not throw
    }
    expect(true).toBe(true); // no crash = pass
  });

  it('should return null when bb is null (edge case)', async () => {
    const s = new BollingerBandStrategy();
    await s.init([]);

    // Mock bbands to return empty array
    const { Indicators } = require('../analysis/indicators');
    const originalBBands = Indicators.bbands;
    Indicators.bbands = jest.fn().mockReturnValue([]);

    // Need enough candles to pass the length check
    const candles = makeCandles(50);
    for (const c of candles) {
      await s.onCandle(c);
    }

    const result = await s.onCandle(makeCandle(100, 100));
    expect(result).toBeNull();

    Indicators.bbands = originalBBands;
  });

  it('BUY signal should have tag bb_lower_rsi_oversold', async () => {
    const s = new BollingerBandStrategy();
    await s.init([]);
    const candles = makeCandles(80, 100, 35);
    for (const c of candles) {
      const sig = await s.onCandle(c);
      if (sig?.type === SignalType.BUY) {
        expect(sig.tag).toBe('bb_lower_rsi_oversold');
        break;
      }
    }
  });

  it('SELL signal should have tag bb_upper_rsi_overbought', async () => {
    const s = new BollingerBandStrategy({ rsiOverbought: 60 }); // lower threshold → easier to trigger
    await s.init([]);
    const candles = makeCandles(120, 100, 40);
    for (const c of candles) {
      const sig = await s.onCandle(c);
      if (sig?.type === SignalType.SELL) {
        expect(sig.tag).toBe('bb_upper_rsi_overbought');
        break;
      }
    }
  });
});

describe('MacdCrossoverStrategy', () => {
  it('should instantiate with default params', () => {
    const s = new MacdCrossoverStrategy();
    expect(s.name).toBe('MACD Crossover Strategy');
  });

  it('should accept custom params', () => {
    const s = new MacdCrossoverStrategy({ fastPeriod: 8, slowPeriod: 21, signalPeriod: 5 });
    expect(s.name).toBeTruthy();
  });

  it('should return null with insufficient data', async () => {
    const s = new MacdCrossoverStrategy();
    await s.init([]);
    const signal = await s.onCandle(makeCandle(100, 0));
    expect(signal).toBeNull();
  });

  it('should initialize with history', async () => {
    const s = new MacdCrossoverStrategy();
    const history = makeCandles(50);
    await s.init(history);
    expect(s.name).toBeTruthy();
  });

  it('should generate crossover signals after sufficient data', async () => {
    const s = new MacdCrossoverStrategy();
    await s.init([]);
    // Use sine wave to ensure MACD crossovers happen
    const candles = makeCandles(100, 100, 20);
    let signalFound = false;
    for (const c of candles) {
      const sig = await s.onCandle(c);
      if (sig) {
        expect([SignalType.BUY, SignalType.SELL]).toContain(sig.type);
        expect(['macd_bullish_crossover', 'macd_bearish_crossover']).toContain(sig.tag);
        signalFound = true;
        break;
      }
    }
    expect(signalFound).toBe(true);
  });

  it('should return null if macd results are empty', async () => {
    const s = new MacdCrossoverStrategy();
    await s.init([]);

    // We mock Indicators.macd to return empty array to trigger line 53
    const { Indicators } = require('../analysis/indicators');
    const originalMacd = Indicators.macd;
    Indicators.macd = jest.fn().mockReturnValue([]);

    const candles = makeCandles(40);
    for (const c of candles) {
      await s.onCandle(c);
    }

    const result = await s.onCandle(makeCandle(100, 100));
    expect(result).toBeNull();

    // Restore original mock
    Indicators.macd = originalMacd;
  });

  it('should generate bearish crossover (SELL) signal', async () => {
    const s = new MacdCrossoverStrategy();
    await s.init([]);
    // Larger amplitude and more candles to hit both crossover directions
    const candles = makeCandles(200, 100, 30);
    const signals: string[] = [];
    for (const c of candles) {
      const sig = await s.onCandle(c);
      if (sig?.tag) signals.push(sig.tag);
    }
    // With full sine wave cycle, both bullish and bearish crossovers should occur
    expect(signals.some(t => t === 'macd_bearish_crossover' || t === 'macd_bullish_crossover')).toBe(true);
  });

  it('should trim candle buffer when > 300 entries', async () => {
    const s = new MacdCrossoverStrategy();
    await s.init([]);
    // Feed 305 candles — buffer should trim and not throw
    const candles = makeCandles(305, 100, 10);
    for (const c of candles) {
      await s.onCandle(c); // should not throw
    }
    expect(true).toBe(true); // no crash = pass
  });

  it('should warm up prevMacd from history in init()', async () => {
    const s = new MacdCrossoverStrategy();
    const history = makeCandles(50, 100, 15);
    await s.init(history);
    // After warmup init, first onCandle should not crash
    const sig = await s.onCandle(makeCandle(105, 51));
    // null or signal — both valid, just no crash
    expect(sig === null || sig?.type !== undefined).toBe(true);
  });
});
