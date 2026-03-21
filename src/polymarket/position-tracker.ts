// Position tracking and P&L calculation for Polymarket orders
// Consumed by OrderManager — not meant to be used directly
import type { OrderSide } from '../core/types.js';
import { logger } from '../core/logger.js';

export interface PositionRecord {
  marketId: string;
  side: OrderSide;
  /** Weighted average entry price (USDC) */
  avgEntryPrice: number;
  totalSize: number;
  /** Realized P&L from closed portions (USDC) */
  realizedPnl: number;
  openedAt: number;
  updatedAt: number;
}

export interface PnlSummary {
  marketId: string;
  side: OrderSide;
  avgEntryPrice: number;
  totalSize: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
}

export class PositionTracker {
  private positions = new Map<string, PositionRecord>();

  getPosition(marketId: string): PositionRecord | undefined {
    return this.positions.get(marketId);
  }

  getAllPositions(): PositionRecord[] {
    return Array.from(this.positions.values()).filter(p => p.totalSize > 0);
  }

  /**
   * Apply a fill to the position for marketId.
   * Adds to existing position (weighted avg) or reduces/flips it.
   */
  applyFill(marketId: string, side: OrderSide, fillPrice: number, fillSize: number): void {
    if (fillSize <= 0) return;
    const existing = this.positions.get(marketId);

    if (!existing) {
      this.positions.set(marketId, {
        marketId, side,
        avgEntryPrice: fillPrice,
        totalSize: fillSize,
        realizedPnl: 0,
        openedAt: Date.now(),
        updatedAt: Date.now(),
      });
      logger.info('Position opened', 'PositionTracker', { marketId, side, fillPrice, fillSize });
      return;
    }

    if (existing.side === side) {
      // Scale in: weighted average entry
      const totalCost = existing.avgEntryPrice * existing.totalSize + fillPrice * fillSize;
      existing.totalSize += fillSize;
      existing.avgEntryPrice = totalCost / existing.totalSize;
    } else {
      // Close or flip
      this.close(marketId, fillPrice, fillSize);
    }
    existing.updatedAt = Date.now();
  }

  /**
   * Compute unrealized P&L at a given current price.
   * For binary YES tokens: profit = (currentPrice - avgEntry) * size * direction
   */
  computePnl(marketId: string, currentPrice: number): PnlSummary | null {
    const pos = this.positions.get(marketId);
    if (!pos || pos.totalSize === 0) return null;

    const direction = pos.side === 'buy' ? 1 : -1;
    const unrealizedPnl = direction * (currentPrice - pos.avgEntryPrice) * pos.totalSize;

    return {
      marketId,
      side: pos.side,
      avgEntryPrice: pos.avgEntryPrice,
      totalSize: pos.totalSize,
      currentPrice,
      unrealizedPnl,
      realizedPnl: pos.realizedPnl,
      totalPnl: unrealizedPnl + pos.realizedPnl,
    };
  }

  /**
   * Close (partially or fully) a position at closePrice.
   * Returns realized P&L for this close.
   */
  close(marketId: string, closePrice: number, closeSize?: number): number {
    const pos = this.positions.get(marketId);
    if (!pos || pos.totalSize === 0) return 0;

    const size = Math.min(closeSize ?? pos.totalSize, pos.totalSize);
    const direction = pos.side === 'buy' ? 1 : -1;
    const realized = direction * (closePrice - pos.avgEntryPrice) * size;

    pos.realizedPnl += realized;
    pos.totalSize -= size;
    pos.updatedAt = Date.now();

    if (pos.totalSize <= 0) {
      this.positions.delete(marketId);
      logger.info('Position fully closed', 'PositionTracker', { marketId, realized });
    } else {
      logger.info('Position partially closed', 'PositionTracker', { marketId, size, realized, remaining: pos.totalSize });
    }
    return realized;
  }
}
