// Kalshi order lifecycle management — position tracking, P&L, auto-cancel stale orders
import type { KalshiClient, KalshiOrder } from './kalshi-client.js';
import type { CrossPlatformOpportunity } from './kalshi-market-scanner.js';
import type { Order, Position } from '../core/types.js';
import { logger } from '../core/logger.js';

const STALE_ORDER_MS = 5 * 60 * 1000; // 5 minutes

// --- Internal position tracking ---

interface TrackedOrder {
  raw: KalshiOrder;
  coreOrder: Order;
  placedAt: number;
}

interface PositionRecord {
  ticker: string;
  side: 'yes' | 'no';
  totalContracts: number;
  totalCostCents: number;   // sum of (price * contracts)
  realizedPnlCents: number;
}

// --- KalshiOrderManager ---

export class KalshiOrderManager {
  /** Active orders keyed by order_id */
  private openOrders = new Map<string, TrackedOrder>();
  /** Positions keyed by ticker */
  private positions = new Map<string, PositionRecord>();

  constructor(private client: KalshiClient) {}

  /**
   * Submit a limit order based on an arb opportunity.
   * size = number of contracts to buy.
   */
  async submitOrder(opportunity: CrossPlatformOpportunity, size: number): Promise<Order> {
    const { kalshiMarket, direction, kalshiPrice } = opportunity;
    const ticker = kalshiMarket.ticker;
    const side: 'yes' | 'no' = direction === 'buy-kalshi' ? 'yes' : 'no';
    const priceCents = Math.round(kalshiPrice * 100);

    logger.info('Submitting Kalshi arb order', 'KalshiOrderManager', { ticker, side, priceCents, size });

    const raw = await this.client.placeOrder(ticker, side, 'limit', priceCents, size);
    const coreOrder = this.toOrder(raw);

    this.openOrders.set(raw.order_id, { raw, coreOrder, placedAt: Date.now() });
    this.updatePosition(raw, size);

    return coreOrder;
  }

  /** List all tracked open orders */
  getOpenOrders(): Order[] {
    return Array.from(this.openOrders.values()).map(t => t.coreOrder);
  }

  /** Get position for a ticker as core Position type */
  getPosition(ticker: string): Position | null {
    const rec = this.positions.get(ticker);
    if (!rec || rec.totalContracts === 0) return null;

    const avgEntryCents = rec.totalCostCents / rec.totalContracts;
    // Unrealized P&L: assume current market value at mid price (caller updates via markToMarket)
    return {
      marketId: ticker,
      side: rec.side === 'yes' ? 'long' : 'short',
      entryPrice: (avgEntryCents / 100).toFixed(4),
      size: rec.totalContracts.toString(),
      unrealizedPnl: '0.00', // updated via markToMarket()
      openedAt: Date.now(),
    };
  }

  /** Update unrealized P&L given current mid price (normalized 0-1) */
  markToMarket(ticker: string, currentMidPrice: number): { unrealizedPnl: number; realizedPnl: number } {
    const rec = this.positions.get(ticker);
    if (!rec || rec.totalContracts === 0) return { unrealizedPnl: 0, realizedPnl: 0 };

    const avgEntryCents = rec.totalCostCents / rec.totalContracts;
    const currentCents = currentMidPrice * 100;
    const unrealizedPnlCents = (currentCents - avgEntryCents) * rec.totalContracts;

    return {
      unrealizedPnl: unrealizedPnlCents / 100,
      realizedPnl: rec.realizedPnlCents / 100,
    };
  }

  /** Cancel all open orders by order IDs */
  async cancelAllOrders(orderIds: string[]): Promise<void> {
    const results = await Promise.allSettled(orderIds.map(id => this.client.cancelOrder(id)));
    const failed = results.filter(r => r.status === 'rejected').length;

    for (const id of orderIds) {
      const tracked = this.openOrders.get(id);
      if (tracked) {
        tracked.coreOrder.status = 'cancelled';
        this.openOrders.delete(id);
      }
    }

    if (failed > 0) {
      logger.warn('Some cancellations failed', 'KalshiOrderManager', { failed, total: orderIds.length });
    } else {
      logger.info('All orders cancelled', 'KalshiOrderManager', { count: orderIds.length });
    }
  }

  /**
   * Auto-cancel orders older than STALE_ORDER_MS that are still resting.
   * Returns count of orders cancelled.
   */
  async cancelStaleOrders(): Promise<number> {
    const now = Date.now();
    const staleIds = Array.from(this.openOrders.entries())
      .filter(([, t]) => now - t.placedAt > STALE_ORDER_MS && t.raw.status === 'resting')
      .map(([id]) => id);

    if (staleIds.length === 0) return 0;

    logger.info('Auto-cancelling stale orders', 'KalshiOrderManager', { count: staleIds.length });
    await this.cancelAllOrders(staleIds);
    return staleIds.length;
  }

  // --- private helpers ---

  private updatePosition(order: KalshiOrder, contracts: number): void {
    const price = order.side === 'yes' ? order.yes_price : order.no_price;
    const existing = this.positions.get(order.ticker);

    if (!existing) {
      this.positions.set(order.ticker, {
        ticker: order.ticker,
        side: order.side,
        totalContracts: contracts,
        totalCostCents: price * contracts,
        realizedPnlCents: 0,
      });
    } else {
      existing.totalContracts += contracts;
      existing.totalCostCents += price * contracts;
    }
  }

  private toOrder(raw: KalshiOrder): Order {
    return {
      id: raw.order_id,
      marketId: raw.ticker,
      side: raw.side === 'yes' ? 'buy' : 'sell',
      price: (raw.yes_price / 100).toFixed(4),
      size: raw.count.toString(),
      status: this.mapStatus(raw.status),
      type: raw.type,
      createdAt: new Date(raw.created_time).getTime(),
    };
  }

  private mapStatus(kalshiStatus: string): Order['status'] {
    switch (kalshiStatus.toLowerCase()) {
      case 'resting': return 'open';
      case 'executed': return 'filled';
      case 'partially_filled': return 'partially_filled';
      case 'cancelled': return 'cancelled';
      case 'pending': return 'pending';
      default: return 'open';
    }
  }
}
