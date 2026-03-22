/**
 * Typed HTTP client for the algo-trade REST API.
 * Uses native fetch — no external HTTP dependencies.
 */
import { buildHeaders, SdkConfig, SdkError } from './sdk-auth.js';
import type {
  HealthResponse,
  StatusResponse,
  TradeListResponse,
  PnlResponse,
  StrategyActionResponse,
  DexChainsResponse,
  DexQuoteResponse,
  DexSwapResponse,
  KalshiMarketsResponse,
  KalshiBalanceResponse,
  KalshiPositionsResponse,
  KalshiOrderResponse,
  KalshiScanResponse,
  KalshiCrossScanResponse,
  PaperSessionResponse,
  PaperStopResponse,
  PaperStatusResponse,
  PaperTradeResponse,
  OptimizerRunResponse,
  OptimizerResultsResponse,
  ExchangeListResponse,
  ReviewSubmitResponse,
  ReviewListResponse,
  WebhookTestResponse,
  SignalResponse,
  StrategyStatus,
  PortfolioSummary,
  TradeHistory,
  Position,
} from './sdk-types.js';

const DEFAULT_TIMEOUT_MS = 10_000;

export class AlgoTradeClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: SdkConfig) {
    // Strip trailing slash for consistent path joining
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** GET /api/health — public, no auth required */
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/api/health');
  }

  /** GET /api/status — engine status, strategies, trade count */
  async getStatus(): Promise<StatusResponse> {
    return this.request<StatusResponse>('GET', '/api/status');
  }

  /** GET /api/trades — last 100 trades from the trade log */
  async getTrades(): Promise<TradeListResponse> {
    return this.request<TradeListResponse>('GET', '/api/trades');
  }

  /** GET /api/pnl — aggregated P&L summary by strategy */
  async getPnl(): Promise<PnlResponse> {
    return this.request<PnlResponse>('GET', '/api/pnl');
  }

  /** POST /api/strategy/start — start a named strategy */
  async startStrategy(name: string): Promise<StrategyActionResponse> {
    return this.request<StrategyActionResponse>('POST', '/api/strategy/start', { name });
  }

  /** POST /api/strategy/stop — stop a named strategy */
  async stopStrategy(name: string): Promise<StrategyActionResponse> {
    return this.request<StrategyActionResponse>('POST', '/api/strategy/stop', { name });
  }

  // ─── DEX endpoints ───────────────────────────────────────────────────────────

  /** GET /api/dex/chains — list supported chains */
  async getDexChains(): Promise<DexChainsResponse> { return this.get('/api/dex/chains'); }

  /** POST /api/dex/quote — get a swap quote */
  async getDexQuote(amountIn: string, slippageBps?: number): Promise<DexQuoteResponse> { return this.post('/api/dex/quote', { amountIn, slippageBps }); }

  /** POST /api/dex/swap — execute a token swap */
  async dexSwap(params: { chain: string; tokenIn: string; tokenOut: string; amountIn: string; slippageBps?: number }): Promise<DexSwapResponse> { return this.post('/api/dex/swap', params); }

  // ─── Kalshi endpoints ─────────────────────────────────────────────────────────

  /** GET /api/kalshi/markets — list active Kalshi markets */
  async getKalshiMarkets(): Promise<KalshiMarketsResponse> { return this.get('/api/kalshi/markets'); }

  /** GET /api/kalshi/balance — get Kalshi account balance */
  async getKalshiBalance(): Promise<KalshiBalanceResponse> { return this.get('/api/kalshi/balance'); }

  /** GET /api/kalshi/positions — get open Kalshi positions */
  async getKalshiPositions(): Promise<KalshiPositionsResponse> { return this.get('/api/kalshi/positions'); }

  /** POST /api/kalshi/order — place a Kalshi order */
  async placeKalshiOrder(params: { ticker: string; side: string; type?: string; price: number; count: number }): Promise<KalshiOrderResponse> { return this.post('/api/kalshi/order', params); }

  /** GET /api/kalshi/scan — scan for Kalshi arbitrage opportunities */
  async scanKalshi(): Promise<KalshiScanResponse> { return this.get('/api/kalshi/scan'); }

  /** POST /api/kalshi/cross-scan — cross-platform arb scan (Kalshi vs Polymarket) */
  async crossScanKalshi(prices: Array<{ conditionId: string; title: string; midPrice: number }>): Promise<KalshiCrossScanResponse> { return this.post('/api/kalshi/cross-scan', { prices }); }

  // ─── Paper Trading endpoints ─────────────────────────────────────────────────

  /** POST /api/paper/start — start paper trading session */
  async paperStart(initialCapital = 10000): Promise<PaperSessionResponse> { return this.post('/api/paper/start', { initialCapital }); }

  /** POST /api/paper/stop — stop session and get summary */
  async paperStop(): Promise<PaperStopResponse> { return this.post('/api/paper/stop', {}); }

  /** GET /api/paper/status — current session status */
  async paperStatus(): Promise<PaperStatusResponse> { return this.get('/api/paper/status'); }

  /** POST /api/paper/trade — execute a paper trade */
  async paperTrade(params: { symbol: string; side: string; size: string; strategy?: string }): Promise<PaperTradeResponse> { return this.post('/api/paper/trade', params); }

  // ─── Optimizer endpoints ────────────────────────────────────────────────────

  /** POST /api/optimizer/run — start optimization job */
  async optimizerRun(strategyName: string, params?: { initialCapital?: number }): Promise<OptimizerRunResponse> { return this.post('/api/optimizer/run', { strategyName, ...params }); }

  /** GET /api/optimizer/results — get latest results */
  async optimizerResults(): Promise<OptimizerResultsResponse> { return this.get('/api/optimizer/results'); }

  // ─── Exchange endpoints ─────────────────────────────────────────────────────

  /** GET /api/exchanges — list connected exchanges */
  async getExchanges(): Promise<ExchangeListResponse> { return this.get('/api/exchanges'); }

  // ─── Marketplace review endpoints ───────────────────────────────────────────

  /** POST /api/marketplace/strategy/:id/review — submit review */
  async submitReview(strategyId: string, rating: number, comment = ''): Promise<ReviewSubmitResponse> { return this.post(`/api/marketplace/strategy/${strategyId}/review`, { rating, comment }); }

  /** GET /api/marketplace/strategy/:id/reviews — list reviews */
  async getReviews(strategyId: string): Promise<ReviewListResponse> { return this.get(`/api/marketplace/strategy/${strategyId}/reviews`); }

  // ─── Webhook management endpoints ───────────────────────────────────────────

  /** POST /api/webhooks/:id/test — send test payload */
  async testWebhook(webhookId: string): Promise<WebhookTestResponse> { return this.post(`/api/webhooks/${webhookId}/test`, {}); }

  // ─── Signal endpoints ────────────────────────────────────────────────────────

  /** GET /api/signals — latest trading signals from the engine */
  async getSignals(): Promise<SignalResponse> { return this.get('/api/signals'); }

  // ─── Strategy status endpoint ─────────────────────────────────────────────

  /** GET /api/strategies — detailed status of all configured strategies */
  async getStrategies(): Promise<StrategyStatus[]> { return this.get('/api/strategies'); }

  // ─── Portfolio endpoints ─────────────────────────────────────────────────

  /** GET /api/portfolio — full portfolio snapshot with positions */
  async getPortfolio(): Promise<PortfolioSummary> { return this.get('/api/portfolio'); }

  /** GET /api/positions — list of open positions */
  async getPositions(): Promise<Position[]> { return this.get('/api/positions'); }

  // ─── Trade history endpoint ──────────────────────────────────────────────

  /**
   * GET /api/trades/history — paginated trade history.
   * @param limit Maximum number of records to return (default server-side 100).
   */
  async getTradeHistory(limit?: number): Promise<TradeHistory[]> {
    const path = limit !== undefined ? `/api/trades/history?limit=${limit}` : '/api/trades/history';
    return this.get(path);
  }

  // ─── Private fetch wrapper ──────────────────────────────────────────────────

  private get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  private post<T>(path: string, body: unknown): Promise<T> { return this.request<T>('POST', path, body); }

  /**
   * Generic typed fetch wrapper.
   * - Attaches auth headers on every request
   * - Aborts after configured timeout
   * - Throws SdkError for non-2xx responses
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: buildHeaders(this.apiKey),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      // Network error or abort
      const message =
        err instanceof Error ? err.message : 'Network request failed';
      throw new SdkError(message, 0, path);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Attempt to extract server error message from JSON body
      let serverMessage = response.statusText;
      try {
        const errBody = (await response.json()) as { error?: string; message?: string };
        serverMessage = errBody.message ?? errBody.error ?? serverMessage;
      } catch {
        // Ignore JSON parse failure — use statusText
      }
      throw new SdkError(
        `${method} ${path} failed: ${serverMessage}`,
        response.status,
        path,
      );
    }

    return response.json() as Promise<T>;
  }
}
