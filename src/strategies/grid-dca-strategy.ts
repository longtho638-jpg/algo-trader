/**
 * Grid/DCA strategy tick factory for CEX exchanges.
 * Each tick: fetch current price → calculate grid levels → place buy/sell orders.
 * Grid state tracks which levels already have open orders to avoid duplicates.
 */
import type { OrderExecutor } from '../cex/order-executor.js';
import type { ExchangeClient, SupportedExchange } from '../cex/exchange-client.js';
import type { EventBus } from '../events/event-bus.js';
import type { StrategyName, OrderSide } from '../core/types.js';
import { logger } from '../core/logger.js';

const STRATEGY_NAME: StrategyName = 'grid-dca';

export interface GridParams {
  exchange: SupportedExchange;
  symbol: string;
  /** Fractional spacing between grid levels, e.g. 0.01 = 1% */
  gridSpacing: number;
  /** Number of levels above and below current price */
  numLevels: number;
  /** Order size per grid level */
  orderSize: number;
}

export interface GridDcaDeps {
  executor: OrderExecutor;
  client: ExchangeClient;
  eventBus: EventBus;
  params: GridParams;
}

/** Track placed grid levels to avoid redundant orders within a tick: "side:priceFixed" */
type GridState = Set<string>;

/**
 * Creates an async tick function for Grid/DCA strategy.
 * All deps injected — no global singletons.
 */
export function createGridDcaTick(deps: GridDcaDeps): () => Promise<void> {
  const { executor, client, eventBus, params } = deps;
  const { exchange, symbol, gridSpacing, numLevels, orderSize } = params;
  const gridState: GridState = new Set();

  async function placeGridOrder(side: OrderSide, price: number): Promise<void> {
    const key = `${side}:${price.toFixed(8)}`;
    if (gridState.has(key)) return;
    try {
      const order = await executor.placeOrder({ exchange, symbol, side, amount: orderSize, price, type: 'limit', strategy: STRATEGY_NAME });
      gridState.add(key);
      eventBus.emit('trade.executed', {
        trade: { orderId: order.id, marketId: symbol, side, fillPrice: order.price, fillSize: order.size, fees: '0', timestamp: Date.now(), strategy: STRATEGY_NAME },
      });
      logger.debug('Grid order placed', 'GridDcaStrategy', { symbol, side, price, size: orderSize, orderId: order.id });
    } catch (err) {
      logger.error('Grid order failed', 'GridDcaStrategy', { symbol, side, price, err: String(err) });
    }
  }

  return async function gridDcaTick(): Promise<void> {
    try {
      const ticker = await client.getTicker(exchange, symbol);
      const midPrice = parseFloat(ticker.last);
      if (!midPrice || midPrice <= 0) {
        logger.warn('Grid tick: invalid mid price', 'GridDcaStrategy', { symbol, midPrice });
        return;
      }
      const promises: Promise<void>[] = [];
      for (let i = 1; i <= numLevels; i++) {
        promises.push(placeGridOrder('buy',  midPrice * (1 - gridSpacing * i)));
        promises.push(placeGridOrder('sell', midPrice * (1 + gridSpacing * i)));
      }
      await Promise.allSettled(promises);
    } catch (err) {
      logger.error('Grid DCA tick failed', 'GridDcaStrategy', { symbol, err: String(err) });
    }
  };
}
