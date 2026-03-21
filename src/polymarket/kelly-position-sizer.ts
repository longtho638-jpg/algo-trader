// Kelly Criterion position sizer for Polymarket strategies
// Adjusts trade size based on rolling win rate + average win/loss ratio
import type { WinTracker } from './win-tracker.js';
import { logger } from '../core/logger.js';

export interface KellySizingConfig {
  /** Base position size in USDC (used when insufficient data) */
  baseSize: number;
  /** Maximum position size in USDC (Kelly capped) */
  maxSize: number;
  /** Minimum position size in USDC */
  minSize: number;
  /** Fraction of Kelly to use (0.25 = quarter-Kelly, safer) */
  kellyFraction: number;
  /** Minimum resolved trades before Kelly kicks in */
  minTradesForKelly: number;
}

const DEFAULT_CONFIG: KellySizingConfig = {
  baseSize: 50,
  maxSize: 500,
  minSize: 5,
  kellyFraction: 0.25,
  minTradesForKelly: 10,
};

export interface SizingResult {
  size: number;
  method: 'kelly' | 'base';
  kellyRaw: number;
  kellyAdjusted: number;
  winRate: number;
  avgWinLossRatio: number;
}

/**
 * Kelly Criterion: f* = (bp - q) / b
 * where b = avg_win / avg_loss, p = win probability, q = 1 - p
 * We use fraction-Kelly (default 25%) for safety.
 */
export class KellyPositionSizer {
  private config: KellySizingConfig;
  private winTracker: WinTracker;

  constructor(winTracker: WinTracker, config?: Partial<KellySizingConfig>) {
    this.winTracker = winTracker;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Calculate optimal position size for a strategy */
  getSize(strategy: string): SizingResult {
    const stats = this.winTracker.getWinRate(strategy);
    const resolved = stats.wins + stats.losses;

    // Not enough data — use base size
    if (resolved < this.config.minTradesForKelly) {
      return {
        size: this.config.baseSize,
        method: 'base',
        kellyRaw: 0,
        kellyAdjusted: 0,
        winRate: stats.rollingWinRate,
        avgWinLossRatio: 0,
      };
    }

    // Calculate avg win/loss ratio from trade history
    const trades = this.winTracker.getTradeHistory(strategy, 100);
    const wins = trades.filter(t => t.outcome === 'win' && t.pnl !== null);
    const losses = trades.filter(t => t.outcome === 'loss' && t.pnl !== null);

    const avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + Math.abs(parseFloat(t.pnl!)), 0) / wins.length
      : 1;
    const avgLoss = losses.length > 0
      ? losses.reduce((s, t) => s + Math.abs(parseFloat(t.pnl!)), 0) / losses.length
      : 1;

    const b = avgWin / avgLoss;  // win/loss ratio
    const p = stats.rollingWinRate;
    const q = 1 - p;

    // Kelly formula: f* = (bp - q) / b
    const kellyRaw = (b * p - q) / b;
    const kellyAdjusted = Math.max(0, kellyRaw * this.config.kellyFraction);

    // Size = base * kelly multiplier, clamped to [min, max]
    const rawSize = this.config.baseSize * (1 + kellyAdjusted * 10);
    const size = Math.max(this.config.minSize, Math.min(this.config.maxSize, rawSize));

    logger.debug('Kelly sizing', 'KellyPositionSizer', {
      strategy, p: p.toFixed(3), b: b.toFixed(2),
      kellyRaw: kellyRaw.toFixed(4), kellyAdjusted: kellyAdjusted.toFixed(4),
      size: size.toFixed(2),
    });

    return {
      size: Math.round(size * 100) / 100,
      method: 'kelly',
      kellyRaw: Math.round(kellyRaw * 10000) / 10000,
      kellyAdjusted: Math.round(kellyAdjusted * 10000) / 10000,
      winRate: stats.rollingWinRate,
      avgWinLossRatio: Math.round(b * 100) / 100,
    };
  }
}
