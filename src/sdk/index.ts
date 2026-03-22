/**
 * algo-trade JavaScript Client SDK
 * Public surface: client class + WebSocket client + all types + error class.
 */
export { AlgoTradeClient } from './algo-trade-client.js';
export { AlgoTradeWsClient } from './sdk-ws-client.js';
export { SdkError } from './sdk-auth.js';
export type { SdkConfig } from './sdk-auth.js';
export type {
  // Core domain
  OrderSide,
  StrategyName,
  TradeResult,
  // Responses
  HealthResponse,
  StatusResponse,
  TradeListResponse,
  PnlResponse,
  StrategyActionRequest,
  StrategyActionResponse,
  // DEX
  DexChainsResponse,
  DexQuoteResponse,
  DexSwapResponse,
  // Kalshi
  KalshiMarketsResponse,
  KalshiBalanceResponse,
  KalshiPositionsResponse,
  KalshiOrderResponse,
  KalshiScanResponse,
  KalshiCrossScanResponse,
  // Signals
  SignalEvent,
  SignalResponse,
  WebSocketMessage,
  WebSocketMessageType,
  // Strategies
  StrategyStatus,
  // Portfolio & positions
  PortfolioSummary,
  Position,
  // Trade history
  TradeHistory,
  // Future stubs
  MarketplaceListResponse,
  BacktestRequest,
  BacktestResponse,
} from './sdk-types.js';
