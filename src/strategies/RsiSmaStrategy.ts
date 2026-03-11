import { ISignal, SignalType } from '../interfaces/IStrategy';
import { ICandle } from '../interfaces/ICandle';
import { Indicators } from '../analysis/indicators';
import { BaseStrategy } from './BaseStrategy';

export class RsiSmaStrategy extends BaseStrategy {
  name = 'RSI + SMA Strategy';

  private readonly rsiPeriod = 14;
  private readonly smaFastPeriod = 20;
  private readonly smaSlowPeriod = 50;
  private readonly rsiOverbought = 70;
  private readonly rsiOversold = 30;

  constructor() {
    super();
    this.maxHistoryBuffer = 200;
  }

  async onCandle(candle: ICandle): Promise<ISignal | null> {
    this.bufferCandle(candle);

    // Need enough data
    if (this.candles.length < this.smaSlowPeriod) {
      return null;
    }

    const closes = this.getCloses();
    const rsiValues = Indicators.rsi(closes, this.rsiPeriod);
    const smaFastValues = Indicators.sma(closes, this.smaFastPeriod);
    const smaSlowValues = Indicators.sma(closes, this.smaSlowPeriod);

    const currentRsi = Indicators.getLast(rsiValues);
    const currentSmaFast = Indicators.getLast(smaFastValues);
    const currentSmaSlow = Indicators.getLast(smaSlowValues);

    // Logic:
    // BUY if SMA20 > SMA50 AND RSI < 30 (Oversold in uptrend context - dip buy)
    // SELL if RSI > 70 (Overbought)

    // Note: The logic in the plan said "Buy if SMA20 > SMA50 AND RSI < 30".
    // This is a "buy the dip in an uptrend" strategy.

    if (currentSmaFast > currentSmaSlow && currentRsi < this.rsiOversold) {
      return {
        type: SignalType.BUY,
        price: candle.close,
        timestamp: candle.timestamp,
        metadata: {
          rsi: currentRsi,
          smaFast: currentSmaFast,
          smaSlow: currentSmaSlow
        }
      };
    }

    if (currentRsi > this.rsiOverbought) {
      return {
        type: SignalType.SELL,
        price: candle.close,
        timestamp: candle.timestamp,
        metadata: {
          rsi: currentRsi
        }
      };
    }

    return null;
  }
}
