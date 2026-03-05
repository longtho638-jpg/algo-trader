import { ISignal, SignalType } from '../interfaces/IStrategy';
import { ICandle } from '../interfaces/ICandle';
import { Indicators } from '../analysis/indicators';
import { BaseStrategy } from './BaseStrategy';

export interface BollingerBandParams {
  bbPeriod?: number;
  bbStdDev?: number;
  rsiPeriod?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
}

export class BollingerBandStrategy extends BaseStrategy {
  name = 'Bollinger Band + RSI Strategy';

  private readonly bbPeriod: number;
  private readonly bbStdDev: number;
  private readonly rsiPeriod: number;
  private readonly rsiOversold: number;
  private readonly rsiOverbought: number;

  constructor(params: BollingerBandParams = {}) {
    super();
    this.bbPeriod = params.bbPeriod ?? 20;
    this.bbStdDev = params.bbStdDev ?? 2;
    this.rsiPeriod = params.rsiPeriod ?? 14;
    this.rsiOversold = params.rsiOversold ?? 30;
    this.rsiOverbought = params.rsiOverbought ?? 70;
    this.maxHistoryBuffer = 200;
  }

  async onCandle(candle: ICandle): Promise<ISignal | null> {
    this.bufferCandle(candle);

    const minRequired = Math.max(this.bbPeriod, this.rsiPeriod + 1);
    if (this.candles.length < minRequired) {
      return null;
    }

    const closes = this.getCloses();

    const bbValues = Indicators.bbands(closes, this.bbPeriod, this.bbStdDev);
    const rsiValues = Indicators.rsi(closes, this.rsiPeriod);

    const bb = Indicators.getLastBBands(bbValues);
    const currentRsi = Indicators.getLast(rsiValues);

    if (!bb) return null;

    const currentPrice = candle.close;

    // BUY: price at or below lower band AND RSI oversold
    if (currentPrice <= bb.lower && currentRsi < this.rsiOversold) {
      return {
        type: SignalType.BUY,
        price: currentPrice,
        timestamp: candle.timestamp,
        tag: 'bb_lower_rsi_oversold',
        metadata: { rsi: currentRsi, bbLower: bb.lower, bbMiddle: bb.middle, bbUpper: bb.upper }
      };
    }

    // SELL: price at or above upper band AND RSI overbought
    if (currentPrice >= bb.upper && currentRsi > this.rsiOverbought) {
      return {
        type: SignalType.SELL,
        price: currentPrice,
        timestamp: candle.timestamp,
        tag: 'bb_upper_rsi_overbought',
        metadata: { rsi: currentRsi, bbLower: bb.lower, bbMiddle: bb.middle, bbUpper: bb.upper }
      };
    }

    return null;
  }
}
