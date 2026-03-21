// Win/loss outcome tracker for Polymarket trades
// Tracks rolling win rate and trade history from the database
import { getDatabase } from '../data/database.js';
import { logger } from '../core/logger.js';
import type { TradeRow } from '../data/database.js';

export type TradeOutcome = 'win' | 'loss' | 'pending';

export interface TrackedTrade {
  orderId: string;
  strategy: string;
  market: string;
  side: string;
  price: string;
  size: string;
  pnl: string | null;
  outcome: TradeOutcome;
  timestamp: number;
}

export interface WinRateStats {
  totalTrades: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;        // 0–1, excludes pending
  rollingWinRate: number; // last 20 resolved trades
}

/** Rolling window size for win rate calculation */
const ROLLING_WINDOW = 20;

/**
 * WinTracker: derives win/loss outcomes from DB trade records.
 * A trade is a "win" when pnl > 0, "loss" when pnl < 0, "pending" when pnl is null.
 */
export class WinTracker {
  private db: ReturnType<typeof getDatabase>;

  constructor(dbPath?: string) {
    this.db = getDatabase(dbPath);
  }

  /** Record a trade outcome by updating its pnl in-memory cache (DB insert already done by pipeline) */
  recordOutcome(orderId: string, pnl: number): void {
    // pnl is informational; actual persistence happens via insertTrade in pipeline
    logger.debug('Outcome recorded', 'WinTracker', { orderId, pnl });
  }

  /**
   * Get win rate statistics for a strategy (or all strategies if omitted).
   * Reads directly from DB for accuracy.
   */
  getWinRate(strategy?: string): WinRateStats {
    const rows = this.db.getTrades(strategy, 500);
    const tracked = rows.map(r => this.rowToTracked(r));

    const resolved = tracked.filter(t => t.outcome !== 'pending');
    const wins = resolved.filter(t => t.outcome === 'win').length;
    const losses = resolved.filter(t => t.outcome === 'loss').length;
    const pending = tracked.filter(t => t.outcome === 'pending').length;

    const winRate = resolved.length > 0 ? wins / resolved.length : 0;

    // Rolling window: last N resolved trades (most recent first from DB)
    const recent = resolved.slice(0, ROLLING_WINDOW);
    const recentWins = recent.filter(t => t.outcome === 'win').length;
    const rollingWinRate = recent.length > 0 ? recentWins / recent.length : 0;

    logger.debug('Win rate computed', 'WinTracker', {
      strategy: strategy ?? 'all',
      total: tracked.length,
      wins,
      losses,
      winRate: winRate.toFixed(3),
      rollingWinRate: rollingWinRate.toFixed(3),
    });

    return {
      totalTrades: tracked.length,
      wins,
      losses,
      pending,
      winRate,
      rollingWinRate,
    };
  }

  /**
   * Get full trade history with outcome labels.
   * @param strategy - filter by strategy name; omit for all
   * @param limit    - max records (default 100)
   */
  getTradeHistory(strategy?: string, limit = 100): TrackedTrade[] {
    const rows = this.db.getTrades(strategy, limit);
    return rows.map(r => this.rowToTracked(r));
  }

  /** Get only winning trades */
  getWins(strategy?: string, limit = 100): TrackedTrade[] {
    return this.getTradeHistory(strategy, limit).filter(t => t.outcome === 'win');
  }

  /** Get only losing trades */
  getLosses(strategy?: string, limit = 100): TrackedTrade[] {
    return this.getTradeHistory(strategy, limit).filter(t => t.outcome === 'loss');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private rowToTracked(row: TradeRow): TrackedTrade {
    const pnlNum = row.pnl !== null ? parseFloat(row.pnl) : null;
    let outcome: TradeOutcome = 'pending';
    if (pnlNum !== null) {
      outcome = pnlNum >= 0 ? 'win' : 'loss';
    }
    return {
      orderId: String(row.id),
      strategy: row.strategy,
      market: row.market,
      side: row.side,
      price: row.price,
      size: row.size,
      pnl: row.pnl,
      outcome,
      timestamp: row.timestamp,
    };
  }
}

// Singleton for shared access across CLI and API
let _tracker: WinTracker | null = null;

export function getWinTracker(dbPath?: string): WinTracker {
  if (!_tracker) _tracker = new WinTracker(dbPath);
  return _tracker;
}
