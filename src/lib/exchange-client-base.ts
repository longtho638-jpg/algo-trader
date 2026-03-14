// src/lib/exchange-client-base.ts
// Drop-in replacement for @agencyos/trading-core/exchanges ExchangeClientBase

const ccxt = require('ccxt');

export interface ExchangeClientBaseConfig {
  apiKey?: string;
  secret?: string;
  password?: string;
  sandbox?: boolean;
  useBnbDiscount?: boolean;
}

export class ExchangeClientBase {
  public name: string;
  protected exchange: any; // ccxt exchange instance

  constructor(exchangeId: string, apiKey?: string, secret?: string);
  constructor(config: ExchangeClientBaseConfig & { exchangeId: string });
  constructor(idOrConfig: string | (ExchangeClientBaseConfig & { exchangeId: string }), apiKey?: string, secret?: string) {
    if (typeof idOrConfig === 'string') {
      this.name = idOrConfig;
      const ExchangeClass = (ccxt as any)[idOrConfig];
      if (!ExchangeClass) throw new Error(`Exchange '${idOrConfig}' not supported by CCXT`);
      this.exchange = new ExchangeClass({
        apiKey: apiKey || process.env[`${idOrConfig.toUpperCase()}_API_KEY`] || '',
        secret: secret || process.env[`${idOrConfig.toUpperCase()}_SECRET`] || '',
        enableRateLimit: true,
      });
    } else {
      this.name = idOrConfig.exchangeId;
      const ExchangeClass = (ccxt as any)[idOrConfig.exchangeId];
      if (!ExchangeClass) throw new Error(`Exchange '${idOrConfig.exchangeId}' not supported by CCXT`);
      this.exchange = new ExchangeClass({
        apiKey: idOrConfig.apiKey || '',
        secret: idOrConfig.secret || '',
        password: idOrConfig.password,
        sandbox: idOrConfig.sandbox || false,
        enableRateLimit: true,
      });
    }
  }

  async initialize(): Promise<void> {
    await this.exchange.loadMarkets();
  }

  async connect(): Promise<void> {
    await this.initialize();
  }

  async disconnect(): Promise<void> {
    // CCXT doesn't have explicit disconnect
  }

  async close(): Promise<void> {
    await this.disconnect();
  }

  async fetchTicker(symbol: string): Promise<any> {
    return this.exchange.fetchTicker(symbol);
  }

  async fetchOrderBook(symbol: string, limit?: number): Promise<any> {
    return this.exchange.fetchOrderBook(symbol, limit);
  }

  async createOrder(symbol: string, type: string, side: string, amount: number, price?: number): Promise<any> {
    return this.exchange.createOrder(symbol, type, side, amount, price);
  }

  async createMarketOrder(symbol: string, side: string, amount: number): Promise<any> {
    return this.exchange.createMarketOrder(symbol, side, amount);
  }

  async createLimitOrder(symbol: string, side: string, amount: number, price: number): Promise<any> {
    return this.exchange.createLimitOrder(symbol, side, amount, price);
  }

  async fetchBalance(): Promise<any> {
    return this.exchange.fetchBalance();
  }

  async fetchTradingFee(symbol: string): Promise<{ maker: number; taker: number }> {
    try {
      const fees = await this.exchange.fetchTradingFee(symbol);
      return { maker: fees.maker, taker: fees.taker };
    } catch {
      return { maker: 0.001, taker: 0.001 }; // 0.1% default
    }
  }

  async fetchFundingRate(symbol: string): Promise<any> {
    if (this.exchange.has.fetchFundingRate) {
      return this.exchange.fetchFundingRate(symbol);
    }
    throw new Error(`${this.name} does not support fetchFundingRate`);
  }

  async cancelOrder(orderId: string, symbol: string): Promise<any> {
    return this.exchange.cancelOrder(orderId, symbol);
  }

  async fetchOpenOrders(symbol?: string): Promise<any[]> {
    return this.exchange.fetchOpenOrders(symbol);
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.exchange.fetchTime();
      return true;
    } catch { return false; }
  }

  getExchange(): any { return this.exchange; }
}

// Exchange-specific adapters (match phantom interface)
export class BinanceAdapter extends ExchangeClientBase {
  constructor(config?: ExchangeClientBaseConfig) {
    super({ exchangeId: 'binance', ...config });
    if (config?.useBnbDiscount === false) {
      this.exchange.options = { ...this.exchange.options, defaultType: 'spot' };
    }
  }
}

export class OkxAdapter extends ExchangeClientBase {
  constructor(config?: ExchangeClientBaseConfig) {
    super({ exchangeId: 'okx', ...config });
  }
}

export class BybitAdapter extends ExchangeClientBase {
  constructor(config?: ExchangeClientBaseConfig) {
    super({ exchangeId: 'bybit', ...config });
  }
}

export class ExchangeFactory {
  static createExchange(name: string, config: ExchangeClientBaseConfig): ExchangeClientBase {
    switch (name.toLowerCase()) {
      case 'binance': return new BinanceAdapter(config);
      case 'okx': return new OkxAdapter(config);
      case 'bybit': return new BybitAdapter(config);
      default: return new ExchangeClientBase({ exchangeId: name, ...config });
    }
  }
}
