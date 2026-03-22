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
