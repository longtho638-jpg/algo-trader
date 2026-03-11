import { ISignal, SignalType } from '../interfaces/IStrategy';
import { ICandle } from '../interfaces/ICandle';
import { Indicators, MacdResult } from '../analysis/indicators';
import { BaseStrategy } from './BaseStrategy';

export interface MacdCrossoverParams {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
}

export class MacdCrossoverStrategy extends BaseStrategy {
  name = 'MACD Crossover Strategy';

  private readonly fastPeriod: number;
  private readonly slowPeriod: number;
  private readonly signalPeriod: number;
  private prevMacd: MacdResult | null = null;

  constructor(params: MacdCrossoverParams = {}) {
    super();
    this.fastPeriod = params.fastPeriod ?? 12;
    this.slowPeriod = params.slowPeriod ?? 26;
    this.signalPeriod = params.signalPeriod ?? 9;
    this.maxHistoryBuffer = 300;
  }

  async init(history: ICandle[]): Promise<void> {
    await super.init(history);
    // Warm up prevMacd from history
    if (this.candles.length > this.slowPeriod + this.signalPeriod) {
      const closes = this.getCloses();
      const results = Indicators.macd(closes, this.fastPeriod, this.slowPeriod, this.signalPeriod);
      if (results.length >= 2) {
        this.prevMacd = results[results.length - 2];
      }
    }
  }

  async onCandle(candle: ICandle): Promise<ISignal | null> {
    this.bufferCandle(candle);

    const minRequired = this.slowPeriod + this.signalPeriod + 1;
    if (this.candles.length < minRequired) {
      return null;
    }

    const closes = this.getCloses();
    const macdResults = Indicators.macd(closes, this.fastPeriod, this.slowPeriod, this.signalPeriod);

    if (macdResults.length < 2) return null;

    const current = macdResults[macdResults.length - 1];
    const prev = this.prevMacd ?? macdResults[macdResults.length - 2];

    this.prevMacd = current;

    if (prev.MACD !== undefined && prev.signal !== undefined && current.MACD !== undefined && current.signal !== undefined) {
      // BUY: MACD line crosses above signal line (bullish crossover)
      if (prev.MACD <= prev.signal && current.MACD > current.signal) {
        return {
          type: SignalType.BUY,
          price: candle.close,
          timestamp: candle.timestamp,
          tag: 'macd_bullish_crossover',
          metadata: { macd: current.MACD, signal: current.signal, histogram: current.histogram }
        };
      }

      // SELL: MACD line crosses below signal line (bearish crossover)
      if (prev.MACD >= prev.signal && current.MACD < current.signal) {
        return {
          type: SignalType.SELL,
          price: candle.close,
          timestamp: candle.timestamp,
          tag: 'macd_bearish_crossover',
          metadata: { macd: current.MACD, signal: current.signal, histogram: current.histogram }
        };
      }
    }

    return null;
  }
}
