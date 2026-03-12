/**
 * Module stubs for @agencyos/trading-core
 * Used for TypeScript compilation when package is not available
 */

declare module '@agencyos/trading-core/exchanges' {
  export interface IExchange {
    name: string;
    fetchTicker(symbol: string): Promise<any>;
    fetchOrderBook(symbol: string): Promise<any>;
    createOrder(symbol: string, type: string, side: string, amount: number, price?: number): Promise<any>;
    createMarketOrder(symbol: string, side: string, amount: number): Promise<any>;
    fetchBalance(): Promise<any>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    [key: string]: any;
  }

  export class ExchangeClientBase {
    name: string;
    constructor(config: any);
    fetchTicker(symbol: string): Promise<any>;
    fetchOrderBook(symbol: string): Promise<any>;
    createOrder(symbol: string, type: string, side: string, amount: number, price?: number): Promise<any>;
    createMarketOrder(symbol: string, side: string, amount: number): Promise<any>;
    fetchBalance(): Promise<any>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
  }

  export class ExchangeFactory {
    static createExchange(name: string, config: any): IExchange;
  }

  export const exchanges: {
    Binance: new (config: any) => IExchange;
    Coinbase: new (config: any) => IExchange;
    Kraken: new (config: any) => IExchange;
  };
}

declare module '@agencyos/trading-core/arbitrage' {
  export interface ArbitrageOpportunity {
    id: string;
    symbol: string;
    buyExchange: string;
    sellExchange: string;
    spread: number;
    profit: number;
    timestamp: number;
  }

  export interface ArbitrageConfig {
    minProfit: number;
    maxInvestment: number;
    exchanges: string[];
  }

  export class ArbitrageScanner {
    constructor(config: ArbitrageConfig);
    scan(): Promise<ArbitrageOpportunity[]>;
  }

  export class ArbitrageExecutor {
    execute(opp: ArbitrageOpportunity): Promise<any>;
  }
}

declare module '@agencyos/trading-core/interfaces' {
  export interface IExchange {
    name: string;
    fetchTicker(symbol: string): Promise<any>;
    fetchOrderBook(symbol: string): Promise<any>;
    createOrder(symbol: string, type: string, side: string, amount: number, price?: number): Promise<any>;
    createMarketOrder(symbol: string, side: string, amount: number): Promise<any>;
    fetchBalance(): Promise<any>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    [key: string]: any; // Allow any additional properties
  }

  export interface IBalance {
    [key: string]: {
      free: number;
      used: number;
      total: number;
    };
  }

  export interface IOrderBookEntry {
    price: number;
    amount: number;
  }

  export interface IOrderBook {
    symbol: string;
    bids: [number, number][];
    asks: [number, number][];
    timestamp: number;
  }

  export interface IOrder {
    id: string;
    symbol: string;
    type: string;
    side: string;
    amount: number;
    price?: number;
    filled: number;
    status: string;
    timestamp: number;
  }

  export interface ISignal {
    type: SignalType;
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    strength: number;
    timestamp: number;
    price?: number; // Optional price property
    [key: string]: any; // Allow any additional properties
  }

  export interface ICandle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    metadata?: any; // Optional metadata property
    [key: string]: any; // Allow any additional properties
  }

  export interface IStrategy {
    name: string;
    execute(): Promise<any>;
    [key: string]: any; // Allow any additional properties
  }

  export enum SignalType {
    BUY = 'buy',
    SELL = 'sell',
    HOLD = 'hold',
  }
}

declare module '@agencyos/vibe-arbitrage-engine/strategies' {
  export interface Strategy {
    name: string;
    execute(): Promise<any>;
  }

  export const strategies: {
    TriangularArbitrage: Strategy;
    CrossExchangeArbitrage: Strategy;
  };
}
