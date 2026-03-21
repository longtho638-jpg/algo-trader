// Polymarket module barrel export
export { ClobClient } from './clob-client.js';
export type {
  RawMarket,
  RawOrderBook,
  OrderBookLevel,
  RawPrice,
  OrderArgs,
  RawOrderResponse,
  ClobClientConfig,
} from './clob-client.js';

export { OrderBookStream } from './orderbook-stream.js';
export type { OrderBookState, OrderBookUpdate } from './orderbook-stream.js';

export { OrderManager } from './order-manager.js';
export type { OrderRecord, PositionRecord, PnlSummary } from './order-manager.js';

export { PositionTracker } from './position-tracker.js';

export { MarketScanner } from './market-scanner.js';
export type { MarketOpportunity, ScanResult, ScanOptions } from './market-scanner.js';

export { TradingPipeline } from './trading-pipeline.js';
export type { PipelineConfig, PipelineStatus } from './trading-pipeline.js';

export { WinTracker, getWinTracker } from './win-tracker.js';
export type { TrackedTrade, WinRateStats, TradeOutcome } from './win-tracker.js';
