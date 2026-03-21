// Unified CEX client wrapper using CCXT
// Supports Binance, Bybit, OKX with paper/live mode switching

import * as ccxt from 'ccxt';
import type { ExchangeCredentials, MarketInfo } from '../core/types.js';
import { logger } from '../core/logger.js';

export type SupportedExchange = 'binance' | 'bybit' | 'okx';

/** Public config passed by callers — extends credentials with mode flags */
export interface ExchangeConfig extends ExchangeCredentials {
  /** Explicitly force paper mode regardless of LIVE_TRADING env var */
  paperMode?: boolean;
  /** CCXT sandbox/testnet mode */
  sandbox?: boolean;
}

export interface Ticker {
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  volume: string;
  timestamp: number;
}

export interface Orderbook {
  symbol: string;
  bids: [string, string][];  // [price, size]
  asks: [string, string][];
  timestamp: number;
}

export interface Balance {
  currency: string;
  free: string;
  used: string;
  total: string;
}

/** Internal CCXT constructor config */
interface CcxtConfig {
  apiKey?: string;
  secret?: string;
  password?: string;
  enableRateLimit?: boolean;
  [key: string]: unknown;
}

/**
 * Returns true when live trading is explicitly enabled.
 * Defaults to paper mode for safety.
 */
export function isLiveTradingEnabled(): boolean {
  return process.env['LIVE_TRADING'] === 'true';
}

/**
 * Factory: create a configured CCXT exchange instance.
 * Use this when you need the raw CCXT object (e.g. for direct API calls).
 */
export function createExchange(exchangeId: SupportedExchange, config: ExchangeConfig): ccxt.Exchange {
  const ccxtConfig: CcxtConfig = {
    apiKey: config.apiKey,
    secret: config.apiSecret,
    enableRateLimit: true,
    ...(config.passphrase ? { password: config.passphrase } : {}),
  };

  let instance: ccxt.Exchange;
  switch (exchangeId) {
    case 'binance': instance = new ccxt.binance(ccxtConfig); break;
    case 'bybit':   instance = new ccxt.bybit(ccxtConfig);   break;
    case 'okx':     instance = new ccxt.okx(ccxtConfig);     break;
    default:        throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  if (config.sandbox) {
    instance.setSandboxMode(true);
    logger.info('Exchange sandbox mode enabled', 'createExchange', { exchangeId });
  }

  return instance;
}

/** Multi-exchange manager — holds CCXT instances, enforces paper/live mode */
export class ExchangeClient {
  private exchanges: Map<SupportedExchange, ccxt.Exchange> = new Map();
  /** Track which exchanges are in paper mode */
  private paperMode: Map<SupportedExchange, boolean> = new Map();

  /**
   * Register an exchange from config.
   * Paper mode is enabled when:
   *   - config.paperMode === true, OR
   *   - LIVE_TRADING env var is not 'true'
   */
  connect(name: SupportedExchange, config: ExchangeConfig): void {
    const paper = config.paperMode === true || !isLiveTradingEnabled();
    const instance = createExchange(name, config);

    this.exchanges.set(name, instance);
    this.paperMode.set(name, paper);

    logger.info('Exchange connected', 'ExchangeClient', {
      exchange: name,
      mode: paper ? 'paper' : 'live',
    });
  }

  /** Check if exchange is running in paper trading mode */
  isPaperMode(name: SupportedExchange): boolean {
    return this.paperMode.get(name) ?? true;  // default to paper if unknown
  }

  /** Get raw CCXT instance (for advanced usage) */
  getInstance(name: SupportedExchange): ccxt.Exchange {
    const instance = this.exchanges.get(name);
    if (!instance) throw new Error(`Exchange not connected: ${name}`);
    return instance;
  }

  /** List all registered exchange names */
  listConnected(): SupportedExchange[] {
    return Array.from(this.exchanges.keys());
  }

  /** Fetch non-zero balances from an exchange */
  async getBalance(name: SupportedExchange): Promise<Balance[]> {
    const ex = this.getInstance(name);
    const raw = await ex.fetchBalance();
    const balances: Balance[] = [];

    type BalanceDict = Record<string, number | string | undefined>;
    const totals = raw.total as unknown as BalanceDict;
    const free   = raw.free  as unknown as BalanceDict;
    const used   = raw.used  as unknown as BalanceDict;

    for (const [currency, total] of Object.entries(totals)) {
      if (!total || Number(total) === 0) continue;
      balances.push({
        currency,
        free:  String(free[currency]  ?? 0),
        used:  String(used[currency]  ?? 0),
        total: String(total),
      });
    }
    return balances;
  }

  /** Fetch current ticker for a symbol */
  async getTicker(name: SupportedExchange, symbol: string): Promise<Ticker> {
    const ex = this.getInstance(name);
    const raw = await ex.fetchTicker(symbol);
    return {
      symbol: raw.symbol,
      bid:    String(raw.bid        ?? 0),
      ask:    String(raw.ask        ?? 0),
      last:   String(raw.last       ?? 0),
      volume: String(raw.baseVolume ?? 0),
      timestamp: raw.timestamp ?? Date.now(),
    };
  }

  /** Fetch active markets as MarketInfo array */
  async getMarkets(name: SupportedExchange): Promise<MarketInfo[]> {
    const ex = this.getInstance(name);
    const raw = await ex.loadMarkets();
    const markets: MarketInfo[] = [];

    for (const value of Object.values(raw)) {
      const m = value as ccxt.Market | null | undefined;
      if (!m?.active) continue;
      markets.push({
        id:            m.id              ?? '',
        symbol:        m.symbol          ?? '',
        type:          'cex' as const,
        exchange:      name,
        baseCurrency:  m.base            ?? '',
        quoteCurrency: m.quote           ?? '',
        active:        m.active          ?? false,
      });
    }
    return markets;
  }

  /** Disconnect all exchanges gracefully */
  async disconnectAll(): Promise<void> {
    for (const [name, ex] of this.exchanges.entries()) {
      try {
        const closeable = ex as ccxt.Exchange & { close?: () => Promise<void> };
        if (typeof closeable.close === 'function') await closeable.close();
      } catch {
        logger.warn('Failed to close exchange', 'ExchangeClient', { exchange: name });
      }
    }
    this.exchanges.clear();
    this.paperMode.clear();
  }
}
