import { ICandle } from './ICandle';

export interface IDataProvider {
  /**
   * Initialize the data provider
   */
  init(): Promise<void>;

  /**
   * Subscribe to new candles
   * @param callback Function to call when a new candle is received
   */
  subscribe(callback: (candle: ICandle) => void): void;

  /**
   * Get historical candles
   * @param limit Number of candles to retrieve
   */
  getHistory(limit: number): Promise<ICandle[]>;

  /**
   * Start the data feed
   */
  start(): Promise<void>;

  /**
   * Stop the data feed
   */
  stop(): Promise<void>;
}
