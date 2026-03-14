/**
 * Exchange interfaces — local definitions replacing @agencyos/trading-core/interfaces.
 */

export interface IOrder {
  id: string;
  symbol: string;
  type?: string;
  side: string;
  amount: number;
  price?: number;
  filled?: number;
  status: string;
  timestamp: number;
  [key: string]: any;
}

export interface IBalance {
  [key: string]: {
    free: number;
    used: number;
    total: number;
  } | string | number;
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

export interface ISignal {
  type: SignalType;
  symbol?: string;
  action?: 'buy' | 'sell' | 'hold';
  strength?: number;
  timestamp: number;
  price?: number;
  metadata?: any;
  [key: string]: any;
}

export interface ICandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  metadata?: any;
  [key: string]: any;
}

export enum SignalType {
  BUY = 'buy',
  SELL = 'sell',
  HOLD = 'hold',
}
