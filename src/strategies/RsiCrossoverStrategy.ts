import { ISignal, SignalType } from '../interfaces/IStrategy';
import { ICandle } from '../interfaces/ICandle';
import { Indicators } from '../analysis/indicators';
import { BaseStrategy } from './BaseStrategy';

export class RsiCrossoverStrategy extends BaseStrategy {
  name = 'RSI Crossover Strategy';
  private prevRsi: number | null = null;

  private readonly rsiPeriod = 14;
  private readonly rsiOverbought = 70;
  private readonly rsiOversold = 30;

  constructor() {
    super();
    this.maxHistoryBuffer = 200;
  }

  async init(history: ICandle[]): Promise<void> {
    await super.init(history);
    const closes = this.getCloses();
    const rsiValues = Indicators.rsi(closes, this.rsiPeriod);
    this.prevRsi = Indicators.getLast(rsiValues);
  }

  async onCandle(candle: ICandle): Promise<ISignal | null> {
    this.bufferCandle(candle);

    const closes = this.getCloses();
    const rsiValues = Indicators.rsi(closes, this.rsiPeriod);
    const currentRsi = Indicators.getLast(rsiValues);

    let signal: ISignal | null = null;

    if (this.prevRsi !== null) {
      // Mua khi RSI cắt LÊN trên vùng quá bán (30)
      if (this.prevRsi < this.rsiOversold && currentRsi >= this.rsiOversold) {
        signal = {
          type: SignalType.BUY,
          price: candle.close,
          timestamp: candle.timestamp,
          metadata: {
            rsi: currentRsi,
            prevRsi: this.prevRsi,
            condition: 'oversold_crossover_up'
          }
        };
      }
      // Bán khi RSI cắt XUỐNG dưới vùng quá mua (70)
      else if (this.prevRsi > this.rsiOverbought && currentRsi <= this.rsiOverbought) {
        signal = {
          type: SignalType.SELL,
          price: candle.close,
          timestamp: candle.timestamp,
          metadata: {
            rsi: currentRsi,
            prevRsi: this.prevRsi,
            condition: 'overbought_crossover_down'
          }
        };
      }
    }

    this.prevRsi = currentRsi;
    return signal;
  }
}
