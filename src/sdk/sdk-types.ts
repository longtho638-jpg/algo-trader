/**
 * SDK public types for algo-trade API consumers.
 * Mirrors server response shapes from src/api/routes.ts.
 */

// ─── Core domain types (re-used in responses) ────────────────────────────────

export type OrderSide = 'buy' | 'sell';
export type StrategyName =
  | 'cross-market-arb'
  | 'market-maker'
  | 'grid-trading'
  | 'dca-bot'
  | 'funding-rate-arb';

/** Single trade result as returned in trade log */
export interface TradeResult {
  orderId: string;
  marketId: string;
  side: OrderSide;
  fillPrice: string;
  fillSize: string;
  fees: string;
  timestamp: number;
  strategy: StrategyName;
}

// ─── Response types ───────────────────────────────────────────────────────────

/** GET /api/health */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: number;
  uptime: number;
}

/** GET /api/status */
export interface StatusResponse {
  running: boolean;
  strategies: string[];
  tradeCount: number;
  config: Record<string, unknown>;
  uptime: number;
}

/** GET /api/trades */
export interface TradeListResponse {
  trades: TradeResult[];
  count: number;
}

/** GET /api/pnl */
export interface PnlResponse {
  totalFees: string;
  tradeCount: number;
  tradesByStrategy: Record<string, number>;
}

// ─── Request / action types ───────────────────────────────────────────────────

/** POST /api/strategy/start | /api/strategy/stop */
export interface StrategyActionRequest {
  name: StrategyName;
}

/** Response from strategy start/stop */
export interface StrategyActionResponse {
  ok: boolean;
  strategy: string;
  action: 'started' | 'stopped';
}

// ─── DEX response types ───────────────────────────────────────────────────────

export interface DexChainsResponse { chains: string[]; count: number; }
export interface DexQuoteResponse { amountIn: string; slippageBps: number; minOutput: string; }
export interface DexSwapResponse { chain: string; txHash: string; amountIn: string; amountOutMin: string; success: boolean; }

// ─── Kalshi response types ────────────────────────────────────────────────────

export interface KalshiMarketsResponse { markets: unknown[]; count: number; }
export interface KalshiBalanceResponse { balance: unknown; }
export interface KalshiPositionsResponse { positions: unknown[]; count: number; }
export interface KalshiOrderResponse { order: unknown; }
export interface KalshiScanResponse { opportunities: unknown[]; count: number; }
export interface KalshiCrossScanResponse { opportunities: unknown[]; count: number; }

// ─── Paper Trading response types ────────────────────────────────────────────

export interface PaperSessionResponse { sessionId: string; initialCapital: number; startedAt: number; }
export interface PaperStopResponse { summary: { trades: number; finalEquity: number; pnl: number }; }
export interface PaperStatusResponse { active: boolean; capital: number; trades: number; pnl: number; }
export interface PaperTradeResponse { trade: { symbol: string; side: string; size: string; price: number; strategy?: string }; }

// ─── Optimizer response types ────────────────────────────────────────────────

export interface OptimizerRunResponse { jobId: string; status: 'accepted' | 'already_running'; }
export interface OptimizerResultsResponse { results: unknown | null; completedAt?: number; }

// ─── Exchange response types ─────────────────────────────────────────────────

export interface ExchangeListResponse { exchanges: Array<{ name: string; mode: 'paper' | 'live'; connected: boolean }>; }

// ─── Marketplace review types ────────────────────────────────────────────────

export interface MarketplaceReview { id: string; strategyId: string; userId: string; rating: number; comment: string; createdAt: number; }
export interface ReviewSubmitResponse { review: MarketplaceReview; }
export interface ReviewListResponse { reviews: MarketplaceReview[]; count: number; }

// ─── Webhook management types ────────────────────────────────────────────────

export interface WebhookTestResponse { ok: boolean; message: string; }

// ─── Marketplace / backtest stubs ────────────────────────────────────────────

export interface MarketplaceListResponse {
  items: Array<{ id: string; name: string; description: string }>;
}

export interface BacktestRequest {
  strategy: StrategyName;
  from: number;
  to: number;
  initialCapital: number;
}

export interface BacktestResponse {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  trades: TradeResult[];
}

// ─── Signal types ─────────────────────────────────────────────────────────────

/** A trading signal emitted by the engine */
export interface SignalEvent {
  id: string;
  strategy: StrategyName;
  symbol: string;
  side: OrderSide;
  confidence: number;
  price: number;
  timestamp: number;
}

/** REST response for GET /api/signals */
export interface SignalResponse {
  signals: SignalEvent[];
  count: number;
}

// ─── Strategy status types ────────────────────────────────────────────────────

/** Detailed status of a single running strategy */
export interface StrategyStatus {
  name: StrategyName;
  running: boolean;
  tradeCount: number;
  pnl: number;
  startedAt: number | null;
}

// ─── Portfolio types ──────────────────────────────────────────────────────────

/** A single open position */
export interface Position {
  symbol: string;
  side: OrderSide;
  size: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
}

/** Summary of portfolio state */
export interface PortfolioSummary {
  totalEquity: number;
  availableBalance: number;
  unrealizedPnl: number;
  positions: Position[];
}

// ─── Trade history types ──────────────────────────────────────────────────────

/** A single historical trade record */
export interface TradeHistory {
  id: string;
  symbol: string;
  side: OrderSide;
  size: string;
  price: string;
  fees: string;
  strategy: StrategyName;
  timestamp: number;
}

// ─── WebSocket message types ──────────────────────────────────────────────────

export type WebSocketMessageType = 'signal' | 'status' | 'error' | 'ping';

/** Generic WebSocket message envelope */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
  timestamp: number;
}
