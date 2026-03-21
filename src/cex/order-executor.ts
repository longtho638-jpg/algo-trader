// Order execution via CCXT with paper/live mode, retry logic, and order tracking.
// Pure helpers (types, mapStatus, mapOrder, simulatePaperFill) live in order-executor-helpers.ts.
// Paper mode: simulated fills with realistic slippage (0.05%).
// Live mode: gated by LIVE_TRADING=true env var (set on ExchangeClient.connect).

import type { TradeResult } from '../core/types.js';
import { retry, generateId } from '../core/utils.js';
import { logger } from '../core/logger.js';
import type { ExchangeClient, SupportedExchange } from './exchange-client.js';
import {
  mapStatus,
  mapOrder,
  simulatePaperFill,
  type OrderType,
  type PlaceOrderParams,
  type TrackedOrder,
} from './order-executor-helpers.js';

export type { OrderType, PlaceOrderParams, TrackedOrder } from './order-executor-helpers.js';

export class OrderExecutor {
  /** In-memory order ledger for tracking — keyed by orderId */
  private orders: Map<string, TrackedOrder> = new Map();

  constructor(private client: ExchangeClient) {}

  /**
   * Unified entry point: routes to paper simulation or live CCXT execution
   * based on the exchange's mode (set at connect time).
   */
  async placeOrder(params: PlaceOrderParams): Promise<TrackedOrder> {
    const orderType = params.type ?? (params.price !== undefined ? 'limit' : 'market');

    if (this.client.isPaperMode(params.exchange)) {
      return this.paperFill(params, orderType);
    }

    switch (orderType) {
      case 'limit':     return this.placeLimitOrder(params as PlaceOrderParams & { price: number });
      case 'stop-loss': return this.placeStopLossOrder(params as PlaceOrderParams & { stopPrice: number });
      default:          return this.placeMarketOrder(params);
    }
  }

  /** Paper: simulate fill using reference price + slippage */
  private async paperFill(params: PlaceOrderParams, orderType: OrderType): Promise<TrackedOrder> {
    let referencePrice = params.price ?? params.stopPrice ?? 0;

    if (referencePrice === 0) {
      try {
        const ticker = await this.client.getTicker(params.exchange, params.symbol);
        referencePrice = parseFloat(ticker.last);
      } catch {
        logger.warn('Paper fill: could not fetch ticker, using price=1', 'OrderExecutor', {
          symbol: params.symbol,
        });
        referencePrice = 1;
      }
    }

    const order = simulatePaperFill({ ...params, type: orderType }, referencePrice);
    this.orders.set(order.id, order);

    logger.info('Paper order filled', 'OrderExecutor', {
      id: order.id, symbol: params.symbol, side: params.side,
      type: orderType, price: order.price, slippage: order.slippage,
    });
    return order;
  }

  /** Live: limit order with 3x retry. Public — strategies may call directly. */
  async placeLimitOrder(params: PlaceOrderParams & { price: number }): Promise<TrackedOrder> {
    const { exchange, symbol, side, amount, price, strategy, marketType } = params;
    const ex = this.client.getInstance(exchange);
    const extra: Record<string, unknown> = {};
    if (marketType === 'swap') extra['type'] = 'swap';

    const raw = await retry(() => ex.createLimitOrder(symbol, side, amount, price, extra), 3, 500);
    const order = mapOrder(raw, { side, price, amount, exchange, strategy });
    this.orders.set(order.id, order);

    logger.info('Limit order placed', 'OrderExecutor', {
      exchange, symbol, side, price: order.price, size: order.size, strategy,
    });
    return order;
  }

  /** Live: market order with 3x retry. Public — strategies may call directly. */
  async placeMarketOrder(params: PlaceOrderParams): Promise<TrackedOrder> {
    const { exchange, symbol, side, amount, strategy, marketType } = params;
    const ex = this.client.getInstance(exchange);
    const extra: Record<string, unknown> = {};
    if (marketType === 'swap') extra['type'] = 'swap';

    const raw = await retry(() => ex.createMarketOrder(symbol, side, amount, undefined, extra), 3, 500);
    const fillPrice = raw.average ?? raw.price ?? 0;
    const now = Date.now();

    const order: TrackedOrder = {
      id: raw.id ?? generateId('ord'),
      marketId: raw.symbol,
      side,
      price: String(fillPrice),
      size: String(raw.filled ?? amount),
      status: mapStatus(raw.status ?? 'closed'),
      type: 'market',
      createdAt: raw.timestamp ?? now,
      filledAt: raw.lastTradeTimestamp ?? now,
      exchange,
      strategy,
      paperFill: false,
    };

    this.orders.set(order.id, order);
    logger.info('Market order placed', 'OrderExecutor', {
      exchange, symbol, side, size: order.size, strategy,
    });
    return order;
  }

  /** Live: stop-loss order — uses exchange native stop order type */
  private async placeStopLossOrder(params: PlaceOrderParams & { stopPrice: number }): Promise<TrackedOrder> {
    const { exchange, symbol, side, amount, stopPrice, strategy } = params;
    const ex = this.client.getInstance(exchange);
    const limitPrice = params.price ?? stopPrice;

    const raw = await retry(
      () => ex.createOrder(symbol, 'stop', side, amount, limitPrice, {
        stopPrice,
        triggerPrice: stopPrice,
      }),
      3,
      500,
    );

    const order = mapOrder(raw, { side, price: limitPrice, amount, exchange, strategy });
    this.orders.set(order.id, order);

    logger.info('Stop-loss order placed', 'OrderExecutor', {
      exchange, symbol, side, stopPrice, limitPrice, strategy,
    });
    return order;
  }

  /** Cancel an open order. Paper orders (already filled) are a no-op. */
  async cancelOrder(exchange: SupportedExchange, orderId: string, symbol: string): Promise<boolean> {
    const tracked = this.orders.get(orderId);
    if (tracked?.paperFill) {
      logger.warn('Cancel ignored: paper order already filled', 'OrderExecutor', { orderId });
      return false;
    }

    const ex = this.client.getInstance(exchange);
    try {
      await ex.cancelOrder(orderId, symbol);
      if (tracked) { tracked.status = 'cancelled'; this.orders.set(orderId, tracked); }
      logger.info('Order cancelled', 'OrderExecutor', { exchange, orderId, symbol });
      return true;
    } catch (err) {
      logger.error('Cancel order failed', 'OrderExecutor', { exchange, orderId, error: String(err) });
      return false;
    }
  }

  /** Retrieve a tracked order by ID */
  getOrder(orderId: string): TrackedOrder | undefined {
    return this.orders.get(orderId);
  }

  /** List tracked orders, optionally filtered by exchange */
  listOrders(exchange?: SupportedExchange): TrackedOrder[] {
    const all = Array.from(this.orders.values());
    return exchange ? all.filter(o => o.exchange === exchange) : all;
  }

  /** Convert a filled TrackedOrder to TradeResult for PnL tracking */
  toTradeResult(order: TrackedOrder, fees: string): TradeResult {
    return {
      orderId: order.id,
      marketId: order.marketId,
      side: order.side,
      fillPrice: order.price,
      fillSize: order.size,
      fees,
      timestamp: order.filledAt ?? order.createdAt,
      strategy: order.strategy,
    };
  }
}
