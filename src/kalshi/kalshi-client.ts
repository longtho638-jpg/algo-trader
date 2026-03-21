// Kalshi REST API client — supports paper mode (default) and live mode
// Live mode gated by LIVE_TRADING=true env var
// Auth: HMAC-SHA256 (KALSHI_API_KEY + KALSHI_PRIVATE_KEY env vars)
// Rate limit: 10 req/s enforced via token bucket
import { createHmac } from 'node:crypto';
import { logger } from '../core/logger.js';

const KALSHI_BASE = 'https://trading-api.kalshi.com/trade-api/v2';
const RATE_LIMIT_MS = 100; // 10 req/s = 1 req per 100ms

// --- Kalshi API shapes ---

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  status: 'open' | 'closed' | 'settled' | 'unopened';
  yes_bid: number;   // cents (0-99)
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  open_interest: number;
  close_time: string;
  category?: string;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  status: string;
  markets: KalshiMarket[];
}

export interface KalshiOrderbookLevel {
  price: number;  // cents
  delta: number;
}

export interface KalshiOrderbook {
  ticker: string;
  yes: KalshiOrderbookLevel[];
  no: KalshiOrderbookLevel[];
}

export interface KalshiOrder {
  order_id: string;
  ticker: string;
  side: 'yes' | 'no';
  type: 'limit' | 'market';
  status: string;
  yes_price: number;
  no_price: number;
  count: number;
  filled_count: number;
  created_time: string;
}

export interface KalshiBalance {
  balance: number;        // cents
  payout: number;
  fees_paid: number;
}

export interface KalshiPosition {
  ticker: string;
  position: number;       // positive=yes, negative=no
  market_exposure: number;
  realized_pnl: number;
  resting_orders_count: number;
}

// --- Paper mode simulated responses ---

let _paperOrderSeq = 1;

function paperMarket(ticker: string): KalshiMarket {
  return {
    ticker, title: `Paper Market ${ticker}`, status: 'open',
    yes_bid: 45, yes_ask: 47, no_bid: 53, no_ask: 55,
    volume: 1000, open_interest: 500, close_time: new Date(Date.now() + 86400000).toISOString(),
  };
}

function paperOrder(ticker: string, side: 'yes' | 'no', price: number, count: number): KalshiOrder {
  return {
    order_id: `paper-${_paperOrderSeq++}`,
    ticker, side, type: 'limit', status: 'resting',
    yes_price: side === 'yes' ? price : 100 - price,
    no_price: side === 'no' ? price : 100 - price,
    count, filled_count: 0,
    created_time: new Date().toISOString(),
  };
}

// --- KalshiClient ---

export interface KalshiClientConfig {
  apiKey?: string;
  privateKey?: string;
  /** Paper mode = simulated responses, no real API calls (default: true) */
  paperMode?: boolean;
}

export class KalshiClient {
  private apiKey: string;
  private privateKey: string;
  private isLive: boolean;
  private lastRequestAt = 0;

  constructor(config?: KalshiClientConfig) {
    this.apiKey = config?.apiKey ?? process.env['KALSHI_API_KEY'] ?? '';
    this.privateKey = config?.privateKey ?? process.env['KALSHI_PRIVATE_KEY'] ?? '';
    const liveEnv = process.env['LIVE_TRADING'] === 'true';
    const paperFlag = config?.paperMode ?? true;
    this.isLive = liveEnv && !paperFlag;
    if (this.isLive) {
      logger.info('KalshiClient: LIVE mode enabled', 'KalshiClient');
    } else {
      logger.info('KalshiClient: paper mode (simulated)', 'KalshiClient');
    }
  }

  // HMAC-SHA256 signature: method + path + timestamp (milliseconds)
  private sign(method: string, path: string, timestamp: string): string {
    const msg = `${timestamp}${method}${path}`;
    return createHmac('sha256', this.privateKey).update(msg).digest('base64');
  }

  // Token-bucket rate limiter: enforce 100ms between requests
  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = RATE_LIMIT_MS - (now - this.lastRequestAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.throttle();
    const timestamp = Date.now().toString();
    const signature = this.sign(method, path, timestamp);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'KALSHI-ACCESS-KEY': this.apiKey,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
    };

    const res = await fetch(`${KALSHI_BASE}${path}`, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kalshi API ${res.status} ${method} ${path}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async getMarkets(params?: { limit?: number; cursor?: string; status?: string }): Promise<KalshiMarket[]> {
    if (!this.isLive) return [paperMarket('PAPER-MARKET-1'), paperMarket('PAPER-MARKET-2')];
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', params.limit.toString());
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.status) qs.set('status', params.status);
    const suffix = qs.size > 0 ? `?${qs}` : '';
    const data = await this.request<{ markets: KalshiMarket[] }>('GET', `/markets${suffix}`);
    return data.markets;
  }

  async getEvent(eventTicker: string): Promise<KalshiEvent> {
    if (!this.isLive) {
      return { event_ticker: eventTicker, title: `Paper Event ${eventTicker}`,
        category: 'paper', status: 'open', markets: [paperMarket(`${eventTicker}-1`)] };
    }
    const data = await this.request<{ event: KalshiEvent }>('GET', `/events/${eventTicker}`);
    return data.event;
  }

  async getOrderbook(ticker: string): Promise<KalshiOrderbook> {
    if (!this.isLive) {
      return { ticker, yes: [{ price: 45, delta: 100 }], no: [{ price: 55, delta: 100 }] };
    }
    const data = await this.request<{ orderbook: KalshiOrderbook }>('GET', `/markets/${ticker}/orderbook`);
    return data.orderbook;
  }

  async placeOrder(ticker: string, side: 'yes' | 'no', type: 'limit' | 'market', price: number, count: number): Promise<KalshiOrder> {
    logger.debug('Placing order', 'KalshiClient', { ticker, side, price, count, live: this.isLive });
    if (!this.isLive) return paperOrder(ticker, side, price, count);
    const data = await this.request<{ order: KalshiOrder }>('POST', `/markets/${ticker}/orders`, {
      ticker, side, type,
      yes_price: side === 'yes' ? price : 100 - price,
      no_price: side === 'no' ? price : 100 - price,
      count, time_in_force: 'gtc',
    });
    return data.order;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    logger.info('Cancelling order', 'KalshiClient', { orderId, live: this.isLive });
    if (!this.isLive) return true;
    await this.request<unknown>('DELETE', `/orders/${orderId}`);
    return true;
  }

  async getPositions(): Promise<KalshiPosition[]> {
    if (!this.isLive) return [];
    const data = await this.request<{ market_positions: KalshiPosition[] }>('GET', '/portfolio/positions');
    return data.market_positions;
  }

  async getBalance(): Promise<KalshiBalance> {
    if (!this.isLive) return { balance: 100000, payout: 0, fees_paid: 0 };
    const data = await this.request<{ balance: KalshiBalance }>('GET', '/portfolio/balance');
    return data.balance;
  }
}
