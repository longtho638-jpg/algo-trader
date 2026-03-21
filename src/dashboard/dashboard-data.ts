// Aggregate data from TradingEngine + PortfolioTracker for dashboard API
import type { TradingEngine } from '../engine/engine.js';
import type { PortfolioTracker } from '../portfolio/portfolio-tracker.js';
import type { Position, TradeResult } from '../core/types.js';

/** KPI summary for dashboard header */
export interface DashboardSummary {
  totalEquity: number;
  dailyPnl: number;
  drawdown: number;
  activeStrategies: number;
  tradeCount: number;
  uptime: number;
  winRate: number;
  engineRunning: boolean;
  accountBalance: number;
}

/** Single equity curve data point */
export interface EquityCurvePoint {
  timestamp: number;
  equity: number;
}

/** Per-strategy breakdown for strategy table */
export interface StrategyBreakdownItem {
  name: string;
  equity: number;
  realizedPnl: number;
  tradeCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

/** Enriched trade history row for dashboard table */
export interface TradeHistoryRow {
  timestamp: number;
  marketId: string;
  side: string;
  amount: number;
  fillPrice: number;
  fees: number;
  pnl: number;
  strategy: string;
}

/** Active position row for dashboard list */
export interface ActivePositionRow {
  marketId: string;
  side: string;
  entryPrice: number;
  size: number;
  unrealizedPnl: number;
}

/** Strategy status for on/off panel */
export interface StrategyStatusRow {
  name: string;
  state: string;
  running: boolean;
}

/** Portfolio summary (per-user) */
export interface PortfolioSummaryData {
  totalEquity: number;
  totalRealizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  drawdown: number;
  tradeCount: number;
  accountBalance: number;
}

/**
 * Aggregates data from engine + portfolio tracker for dashboard.
 * Portfolio tracker is optional — engine-only metrics still work.
 */
export class DashboardDataProvider {
  private engine: TradingEngine;
  private portfolio: PortfolioTracker | null;
  private startedAt: number;

  /** In-memory trade log for history (populated via recordTrade) */
  private tradeLog: TradeResult[] = [];

  /** In-memory positions map: marketId → Position */
  private positions: Map<string, Position> = new Map();

  constructor(engine: TradingEngine, portfolio?: PortfolioTracker) {
    this.engine = engine;
    this.portfolio = portfolio ?? null;
    this.startedAt = Date.now();
  }

  /** Record a trade into the in-memory log (call after fills) */
  recordTrade(trade: TradeResult): void {
    this.tradeLog.unshift(trade); // newest first
    if (this.tradeLog.length > 500) this.tradeLog.length = 500;
  }

  /** Upsert a live position */
  upsertPosition(pos: Position): void {
    this.positions.set(pos.marketId, pos);
  }

  /** Remove a closed position */
  removePosition(marketId: string): void {
    this.positions.delete(marketId);
  }

  // ── Public API methods ──────────────────────────────────────────────────────

  /** Portfolio summary keyed by userId (single-user: userId ignored) */
  getPortfolioSummary(_userId?: string): PortfolioSummaryData {
    const status = this.engine.getStatus();
    const uptime = Math.floor((Date.now() - this.startedAt) / 1000);

    if (this.portfolio) {
      const ps = this.portfolio.getPortfolioSummary();
      return {
        totalEquity: ps.totalEquity,
        totalRealizedPnl: ps.totalRealizedPnl,
        unrealizedPnl: ps.totalUnrealizedPnl,
        winRate: ps.winRate,
        drawdown: ps.drawdown,
        tradeCount: ps.totalTradeCount,
        accountBalance: ps.totalEquity + ps.totalUnrealizedPnl,
      };
    }

    return {
      totalEquity: 0,
      totalRealizedPnl: 0,
      unrealizedPnl: 0,
      winRate: 0,
      drawdown: 0,
      tradeCount: status.tradeCount,
      accountBalance: 0,
    };
  }

  /** Recent trade history (newest first), limited by `limit` */
  getTradeHistory(_userId?: string, limit = 50): TradeHistoryRow[] {
    return this.tradeLog.slice(0, limit).map((t) => ({
      timestamp: t.timestamp,
      marketId: t.marketId,
      side: t.side,
      amount: parseFloat(t.fillSize),
      fillPrice: parseFloat(t.fillPrice),
      fees: parseFloat(t.fees),
      pnl: _estimatePnl(t),
      strategy: t.strategy,
    }));
  }

  /** Active open positions */
  getActivePositions(_userId?: string): ActivePositionRow[] {
    return Array.from(this.positions.values()).map((p) => ({
      marketId: p.marketId,
      side: p.side,
      entryPrice: parseFloat(p.entryPrice),
      size: parseFloat(p.size),
      unrealizedPnl: parseFloat(p.unrealizedPnl),
    }));
  }

  /** Strategy running states */
  getStrategyStatus(_userId?: string): StrategyStatusRow[] {
    const status = this.engine.getStatus();
    return status.strategies.map((s: { name: string; state: string }) => ({
      name: s.name,
      state: s.state,
      running: s.state === 'running',
    }));
  }

  /** Top-level KPI summary (legacy — kept for existing API route) */
  getSummary(): DashboardSummary {
    const status = this.engine.getStatus();
    const now = Date.now();
    const activeStrategies = status.strategies.filter(
      (s: { state: string }) => s.state === 'running'
    ).length;

    if (this.portfolio) {
      const ps = this.portfolio.getPortfolioSummary();
      return {
        totalEquity: ps.totalEquity,
        dailyPnl: ps.totalRealizedPnl,
        drawdown: ps.drawdown,
        activeStrategies,
        tradeCount: ps.totalTradeCount,
        uptime: Math.floor((now - this.startedAt) / 1000),
        winRate: ps.winRate,
        engineRunning: status.running,
        accountBalance: ps.totalEquity + ps.totalUnrealizedPnl,
      };
    }

    return {
      totalEquity: 0,
      dailyPnl: 0,
      drawdown: 0,
      activeStrategies,
      tradeCount: status.tradeCount,
      uptime: Math.floor((now - this.startedAt) / 1000),
      winRate: 0,
      engineRunning: status.running,
      accountBalance: 0,
    };
  }

  /** Equity curve for chart rendering */
  getEquityCurve(): EquityCurvePoint[] {
    if (!this.portfolio) return [];
    return this.portfolio.getEquityCurve().map((p) => ({
      timestamp: p.timestamp,
      equity: p.equity,
    }));
  }

  /** Per-strategy performance breakdown */
  getStrategyBreakdown(): StrategyBreakdownItem[] {
    if (!this.portfolio) {
      return this.engine.getStatus().strategies.map((s: { name: string; state: string }) => ({
        name: s.name,
        equity: 0,
        realizedPnl: 0,
        tradeCount: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
      }));
    }

    return this.portfolio.getPortfolioSummary().strategies.map((s) => ({
      name: s.name,
      equity: s.equity,
      realizedPnl: s.realizedPnl,
      tradeCount: s.tradeCount,
      winRate: s.winRate,
      avgWin: s.avgWin,
      avgLoss: s.avgLoss,
    }));
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Rough P&L estimate for trade history display.
 * Sells are revenue, buys are capital deployment.
 */
function _estimatePnl(t: TradeResult): number {
  const fees = parseFloat(t.fees);
  const price = parseFloat(t.fillPrice);
  const size = parseFloat(t.fillSize);
  if (t.side === 'sell') return parseFloat((price * size - fees).toFixed(2));
  return parseFloat((-(price * size + fees)).toFixed(2));
}
