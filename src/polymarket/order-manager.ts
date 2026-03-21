// Order lifecycle manager: track open orders, positions, P&L, cancel stale orders
// Position logic delegated to PositionTracker module
import type { Order, OrderStatus } from '../core/types.js';
import type { ClobClient, OrderArgs } from './clob-client.js';
import { PositionTracker } from './position-tracker.js';
import type { PositionRecord, PnlSummary } from './position-tracker.js';
import { logger } from '../core/logger.js';

export type { PositionRecord, PnlSummary } from './position-tracker.js';

const STALE_ORDER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes default
const POLL_INTERVAL_MS = 10_000;

// ── Order record ─────────────────────────────────────────────────────────────

export interface OrderRecord extends Order {
  filledSize: string;
  lastCheckedAt: number;
}

// ── OrderManager ─────────────────────────────────────────────────────────────

export class OrderManager {
  private orders    = new Map<string, OrderRecord>();
  private tracker   = new PositionTracker();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private staleTimeoutMs: number;

  constructor(
    private client: ClobClient,
    options: { staleTimeoutMs?: number } = {},
  ) {
    this.staleTimeoutMs = options.staleTimeoutMs ?? STALE_ORDER_TIMEOUT_MS;
  }

  // ── Order placement ───────────────────────────────────────────────────────

  /** Place a limit order, begin tracking it */
  async placeOrder(args: OrderArgs): Promise<OrderRecord> {
    const order = await this.client.postOrder(args);
    const record: OrderRecord = { ...order, filledSize: '0', lastCheckedAt: Date.now() };
    this.orders.set(order.id, record);
    logger.info('Order placed', 'OrderManager', {
      orderId: order.id, side: order.side,
      price: order.price, size: order.size, market: order.marketId,
    });
    return record;
  }

  // ── Order cancellation ────────────────────────────────────────────────────

  /** Cancel a single open order */
  async cancelOrder(orderId: string): Promise<boolean> {
    const record = this.orders.get(orderId);
    if (!record) {
      logger.warn('Cancel: order not found', 'OrderManager', { orderId });
      return false;
    }
    if (record.status === 'cancelled' || record.status === 'filled') return false;
    const success = await this.client.cancelOrder(orderId);
    if (success) this.updateStatus(orderId, 'cancelled');
    return success;
  }

  /** Cancel all open orders for a given market */
  async cancelAllForMarket(marketId: string): Promise<number> {
    const open = this.getOpenOrders().filter(o => o.marketId === marketId);
    let cancelled = 0;
    for (const order of open) {
      if (await this.cancelOrder(order.id)) cancelled++;
    }
    return cancelled;
  }

  // ── Status updates ────────────────────────────────────────────────────────

  /** Update order status (e.g. from WebSocket fill events) */
  updateStatus(orderId: string, status: OrderStatus, filledSize?: string): void {
    const record = this.orders.get(orderId);
    if (!record) return;
    record.status = status;
    if (filledSize !== undefined) record.filledSize = filledSize;
    if (status === 'filled') {
      record.filledAt = Date.now();
      const size = parseFloat(filledSize ?? record.size);
      this.tracker.applyFill(record.marketId, record.side, parseFloat(record.price), size);
    }
    record.lastCheckedAt = Date.now();
    logger.debug('Order status updated', 'OrderManager', { orderId, status, filledSize });
  }

  // ── Order queries ─────────────────────────────────────────────────────────

  getAllOrders(): OrderRecord[]  { return Array.from(this.orders.values()); }

  getOpenOrders(): OrderRecord[] {
    return this.getAllOrders().filter(o => o.status === 'open' || o.status === 'pending');
  }

  getOrdersForMarket(marketId: string): OrderRecord[] {
    return this.getAllOrders().filter(o => o.marketId === marketId);
  }

  // ── Position & P&L ───────────────────────────────────────────────────────

  getPosition(marketId: string): PositionRecord | undefined {
    return this.tracker.getPosition(marketId);
  }

  getAllPositions(): PositionRecord[] {
    return this.tracker.getAllPositions();
  }

  /** Unrealized P&L at a given current price */
  computePnl(marketId: string, currentPrice: number): PnlSummary | null {
    return this.tracker.computePnl(marketId, currentPrice);
  }

  /** Close a position (partial or full); returns realized P&L */
  closePosition(marketId: string, closePrice: number, closeSize?: number): number {
    return this.tracker.close(marketId, closePrice, closeSize);
  }

  // ── Stale order management ────────────────────────────────────────────────

  startStalePoll(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.cancelStaleOrders(), POLL_INTERVAL_MS);
    logger.info('Stale order poll started', 'OrderManager');
  }

  stopStalePoll(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  /** Remove closed orders older than retention window */
  pruneClosedOrders(olderThanMs = 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs;
    for (const [id, order] of this.orders) {
      const closed = order.status === 'filled' || order.status === 'cancelled' || order.status === 'rejected';
      if (closed && order.createdAt < cutoff) this.orders.delete(id);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async cancelStaleOrders(): Promise<void> {
    const now = Date.now();
    const stale = this.getOpenOrders().filter(o => now - o.createdAt > this.staleTimeoutMs);
    for (const order of stale) {
      logger.warn('Cancelling stale order', 'OrderManager', {
        orderId: order.id, ageMs: now - order.createdAt,
      });
      await this.cancelOrder(order.id).catch(err =>
        logger.error('Failed to cancel stale order', 'OrderManager', {
          orderId: order.id, err: String(err),
        }),
      );
    }
  }
}
