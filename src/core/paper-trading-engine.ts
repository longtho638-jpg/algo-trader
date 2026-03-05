/**
 * PaperTradingEngine — Virtual trading engine for simulated paper trades.
 * Implements IExchange interface for drop-in use with BotEngine.
 * Tracks balances, positions, fees, slippage, and P&L.
 */

import { IExchange, IOrder, IBalance, IOrderBook } from '../interfaces/IExchange';

export interface PaperTrade {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  fee: number;
  timestamp: number;
}

export interface PaperPosition {
  pair: string;
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  unrealizedPnl: number;
}

export interface PaperPnl {
  realized: number;
  unrealized: number;
  total: number;
}

export interface PaperTradingConfig {
  initialBalances: Record<string, number>;
  slippagePct?: number;
  feeRate?: number;
}

export class PaperTradingEngine implements IExchange {
  readonly name = 'paper';

  private balances: Map<string, number>;
  private positions: Map<string, PaperPosition>;
  private tradeHistory: PaperTrade[];
  private tradeCounter = 0;
  private realizedPnl = 0;
  private lastPrices: Map<string, number> = new Map();

  private readonly slippagePct: number;
  private readonly feeRate: number;
  private readonly initialBalances: Record<string, number>;

  constructor(config: PaperTradingConfig) {
    this.slippagePct = config.slippagePct ?? 0.001; // 0.1%
    this.feeRate = config.feeRate ?? 0.001;          // 0.1%
    this.initialBalances = config.initialBalances;
    this.balances = new Map(Object.entries(config.initialBalances));
    this.positions = new Map();
    this.tradeHistory = [];
  }

  async connect(): Promise<void> { /* no-op for paper */ }

  async fetchTicker(symbol: string): Promise<number> {
    return this.lastPrices.get(symbol) ?? 0;
  }

  async fetchOrderBook(symbol: string): Promise<IOrderBook> {
    const price = this.lastPrices.get(symbol) ?? 0;
    return { symbol, bids: [{ price, amount: 1 }], asks: [{ price, amount: 1 }], timestamp: Date.now() };
  }

  async fetchBalance(): Promise<Record<string, IBalance>> {
    const result: Record<string, IBalance> = {};
    for (const [currency, amount] of this.balances) {
      result[currency] = { currency, free: amount, used: 0, total: amount };
    }
    return result;
  }

  /** Simulate a market order fill with slippage + fee. */
  async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number): Promise<IOrder> {
    const rawPrice = this.lastPrices.get(symbol) ?? 0;
    if (rawPrice <= 0) throw new Error(`No price available for ${symbol}`);
    if (amount <= 0) throw new Error('Amount must be positive');

    // Apply slippage: buys pay more, sells receive less
    const slipFactor = side === 'buy' ? 1 + this.slippagePct : 1 - this.slippagePct;
    const fillPrice = rawPrice * slipFactor;

    const [base, quote] = symbol.split('/');
    const quoteCost = fillPrice * amount;
    const fee = quoteCost * this.feeRate;

    if (side === 'buy') {
      const available = this.balances.get(quote) ?? 0;
      if (available < quoteCost + fee) throw new Error(`Insufficient ${quote} balance`);
      this.balances.set(quote, available - quoteCost - fee);
      this.balances.set(base, (this.balances.get(base) ?? 0) + amount);
      this._upsertPosition(symbol, 'long', fillPrice, amount);
    } else {
      const available = this.balances.get(base) ?? 0;
      if (available < amount) throw new Error(`Insufficient ${base} balance`);
      this.balances.set(base, available - amount);
      this.balances.set(quote, (this.balances.get(quote) ?? 0) + quoteCost - fee);
      this._closePosition(symbol, fillPrice, amount);
    }

    const trade: PaperTrade = {
      id: String(++this.tradeCounter),
      pair: symbol,
      side,
      amount,
      price: fillPrice,
      fee,
      timestamp: Date.now(),
    };
    this.tradeHistory.push(trade);

    return { id: trade.id, symbol, side, amount, price: fillPrice, status: 'closed', timestamp: trade.timestamp };
  }

  /** Update last known price for unrealized P&L calculation. */
  updatePrice(symbol: string, price: number): void {
    this.lastPrices.set(symbol, price);
    // Refresh unrealized P&L on any open position for this symbol
    const pos = this.positions.get(symbol);
    if (pos) {
      pos.unrealizedPnl = (price - pos.entryPrice) * pos.amount * (pos.side === 'long' ? 1 : -1);
    }
  }

  getPositions(): PaperPosition[] {
    return Array.from(this.positions.values());
  }

  getPnl(): PaperPnl {
    const unrealized = Array.from(this.positions.values()).reduce((sum, p) => sum + p.unrealizedPnl, 0);
    return { realized: this.realizedPnl, unrealized, total: this.realizedPnl + unrealized };
  }

  getTradeHistory(): PaperTrade[] {
    return [...this.tradeHistory];
  }

  reset(): void {
    this.balances = new Map(Object.entries(this.initialBalances));
    this.positions.clear();
    this.tradeHistory = [];
    this.tradeCounter = 0;
    this.realizedPnl = 0;
    this.lastPrices.clear();
  }

  private _upsertPosition(symbol: string, side: 'long' | 'short', price: number, amount: number): void {
    const existing = this.positions.get(symbol);
    if (existing) {
      // Average up: weighted avg entry price
      const totalAmt = existing.amount + amount;
      existing.entryPrice = (existing.entryPrice * existing.amount + price * amount) / totalAmt;
      existing.amount = totalAmt;
    } else {
      this.positions.set(symbol, { pair: symbol, side, entryPrice: price, amount, unrealizedPnl: 0 });
    }
  }

  private _closePosition(symbol: string, exitPrice: number, amount: number): void {
    const pos = this.positions.get(symbol);
    if (!pos) return;
    const pnl = (exitPrice - pos.entryPrice) * amount * (pos.side === 'long' ? 1 : -1);
    this.realizedPnl += pnl;
    if (pos.amount <= amount) {
      this.positions.delete(symbol);
    } else {
      pos.amount -= amount;
    }
  }
}
