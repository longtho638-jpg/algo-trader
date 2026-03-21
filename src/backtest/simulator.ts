// Simulated exchange engine for backtesting strategies against historical data
// Fills orders at candle close price with configurable slippage

import type { TradeResult, OrderSide, StrategyName } from '../core/types.js';
import type { TradeRequest } from '../engine/trade-executor.js';
import type { HistoricalCandle } from './data-loader.js';
import { RiskManager } from '../core/risk-manager.js';
import { generateId } from '../core/utils.js';
import { equityToReturns, calculateSharpeRatio, calculateMaxDrawdown } from './backtest-math-helpers.js';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface BacktestConfig {
  initialCapital: number;
  slippage: number;    // decimal, e.g. 0.001 = 0.1%
  feeRate: number;     // decimal per trade
  strategy: StrategyName;
  maxPositionSize?: number;
  maxDrawdown?: number;
}

export interface BacktestStrategy {
  onCandle(candle: HistoricalCandle, state: SimulatorState): TradeRequest | null;
}

export interface SimulatorState {
  balance: number;
  position: number;        // positive = long, negative = short
  positionAvgPrice: number;
  currentCandle: HistoricalCandle;
  equity: number;
}

export interface BacktestResult {
  totalReturn: number;     // decimal e.g. 0.15 = 15%
  winRate: number;
  sharpeRatio: number;     // annualized
  maxDrawdown: number;
  profitFactor: number;
  tradeCount: number;
  initialCapital: number;
  finalEquity: number;
  totalFees: number;
  trades: TradeResult[];
  equityCurve: number[];
}

interface FilledTrade { result: TradeResult; pnl: number; }

// ─── SimulatedExchange ────────────────────────────────────────────────────────

export class SimulatedExchange {
  private balance: number;
  private position = 0;
  private positionAvgPrice = 0;
  private trades: FilledTrade[] = [];
  private equityCurve: number[] = [];
  private currentCandle: HistoricalCandle | null = null;
  private riskMgr: RiskManager;

  constructor(private config: BacktestConfig) {
    this.balance = config.initialCapital;
    this.riskMgr = new RiskManager({
      maxPositionSize: String(config.maxPositionSize ?? config.initialCapital * 0.2),
      maxDrawdown: config.maxDrawdown ?? 0.25,
      maxOpenPositions: 10,
      stopLossPercent: 0.10,
      maxLeverage: 1,
    });
  }

  setCandle(candle: HistoricalCandle): void {
    this.currentCandle = candle;
    this.equityCurve.push(this.getEquity());
  }

  simulateTrade(request: TradeRequest): TradeResult | null {
    if (!this.currentCandle) throw new Error('No active candle — call setCandle() first');

    if (this.position === 0) {
      const { allowed } = this.riskMgr.canOpenPosition(String(this.balance), [], request.size);
      if (!allowed) return null;
    }

    const slipMult = request.side === 'buy' ? 1 + this.config.slippage : 1 - this.config.slippage;
    const fillPrice = this.currentCandle.close * slipMult;
    const size = parseFloat(request.size);
    const cost = fillPrice * size;
    const fee = cost * this.config.feeRate;
    let pnl = 0;

    if (request.side === 'buy') {
      if (this.position >= 0) {
        const totalCost = this.positionAvgPrice * this.position + fillPrice * size;
        this.position += size;
        this.positionAvgPrice = this.position > 0 ? totalCost / this.position : 0;
      } else {
        pnl = (this.positionAvgPrice - fillPrice) * Math.min(size, Math.abs(this.position));
        this.position += size;
        if (this.position > 0) this.positionAvgPrice = fillPrice;
      }
      this.balance -= cost + fee;
    } else {
      if (this.position > 0) {
        pnl = (fillPrice - this.positionAvgPrice) * Math.min(size, this.position);
        this.position -= size;
        if (this.position < 0) this.positionAvgPrice = fillPrice;
      } else {
        const totalCost = Math.abs(this.positionAvgPrice * this.position) + fillPrice * size;
        this.position -= size;
        this.positionAvgPrice = this.position < 0 ? totalCost / Math.abs(this.position) : 0;
      }
      this.balance += cost - fee;
    }

    const result: TradeResult = {
      orderId: generateId('bt'),
      marketId: request.symbol,
      side: request.side as OrderSide,
      fillPrice: fillPrice.toFixed(6),
      fillSize: request.size,
      fees: fee.toFixed(6),
      timestamp: this.currentCandle.timestamp,
      strategy: this.config.strategy,
    };
    this.trades.push({ result, pnl });
    return result;
  }

  getEquity(): number {
    if (!this.currentCandle || this.position === 0) return this.balance;
    return this.balance + (this.currentCandle.close - this.positionAvgPrice) * this.position;
  }

  getState(): SimulatorState {
    if (!this.currentCandle) throw new Error('No active candle');
    return {
      balance: this.balance,
      position: this.position,
      positionAvgPrice: this.positionAvgPrice,
      currentCandle: this.currentCandle,
      equity: this.getEquity(),
    };
  }

  getTradeResults(): TradeResult[]  { return this.trades.map(t => t.result); }
  getTradePnls(): number[]          { return this.trades.map(t => t.pnl); }
  getEquityCurve(): number[]        { return [...this.equityCurve]; }
}

// ─── runBacktest ──────────────────────────────────────────────────────────────

export async function runBacktest(
  strategy: BacktestStrategy,
  candles: HistoricalCandle[],
  config: BacktestConfig,
): Promise<BacktestResult> {
  const exchange = new SimulatedExchange(config);

  for (const candle of candles) {
    exchange.setCandle(candle);
    const request = strategy.onCandle(candle, exchange.getState());
    if (request) exchange.simulateTrade(request);
  }

  const trades      = exchange.getTradeResults();
  const equityCurve = exchange.getEquityCurve();
  const pnls        = exchange.getTradePnls();
  const finalEquity = exchange.getEquity();

  const wins       = pnls.filter(p => p > 0);
  const losses     = pnls.filter(p => p <= 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss   = Math.abs(losses.reduce((s, p) => s + p, 0));
  const totalFees   = trades.reduce((s, t) => s + parseFloat(t.fees), 0);

  return {
    totalReturn:  config.initialCapital > 0 ? (finalEquity - config.initialCapital) / config.initialCapital : 0,
    winRate:      pnls.length > 0 ? wins.length / pnls.length : 0,
    sharpeRatio:  calculateSharpeRatio(equityToReturns(equityCurve)),
    maxDrawdown:  calculateMaxDrawdown(equityCurve),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    tradeCount:   trades.length,
    initialCapital: config.initialCapital,
    finalEquity,
    totalFees,
    trades,
    equityCurve,
  };
}
