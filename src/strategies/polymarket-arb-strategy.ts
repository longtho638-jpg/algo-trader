/**
 * Polymarket arbitrage strategy tick factory.
 * Each tick: scan top opportunities → place limit orders for mispriced markets.
 * Paper mode by default via OrderManager's underlying ClobClient.
 */
import type { MarketScanner } from '../polymarket/market-scanner.js';
import type { OrderManager } from '../polymarket/order-manager.js';
import type { EventBus } from '../events/event-bus.js';
import type { StrategyName } from '../core/types.js';
import type { KellyPositionSizer } from '../polymarket/kelly-position-sizer.js';
import { logger } from '../core/logger.js';

const STRATEGY_NAME: StrategyName = 'polymarket-arb';

const DEFAULT_SCORE_THRESHOLD = 0.05;
const DEFAULT_MAX_POSITION_SIZE = 50; // USDC
const SCAN_LIMIT = 5;

export interface PolymarketArbDeps {
  scanner: MarketScanner;
  orderManager: OrderManager;
  eventBus: EventBus;
  /** Min opportunity score to trade (default: 0.05) */
  scoreThreshold?: number;
  /** Max USDC per order (default: 50) */
  maxPositionSize?: number;
  /** Optional Kelly sizer — overrides maxPositionSize when available */
  kellySizer?: KellyPositionSizer;
}

/**
 * Creates an async tick function for Polymarket arb strategy.
 * All deps are injected — no singletons used inside.
 */
export function createPolymarketArbTick(deps: PolymarketArbDeps): () => Promise<void> {
  const {
    scanner,
    orderManager,
    eventBus,
    scoreThreshold = DEFAULT_SCORE_THRESHOLD,
    maxPositionSize = DEFAULT_MAX_POSITION_SIZE,
    kellySizer,
  } = deps;

  return async function polymarketArbTick(): Promise<void> {
    try {
      const result = await scanner.scan({ limit: SCAN_LIMIT });
      const qualified = result.opportunities.filter(o => o.score >= scoreThreshold);

      if (qualified.length === 0) {
        logger.debug('No qualifying arb opportunities', 'PolymarketArbStrategy', {
          scanned: result.activeMarkets,
        });
        return;
      }

      for (const opp of qualified) {
        try {
          // priceSumDelta < 0 → total is underpriced → buy YES token
          // priceSumDelta > 0 → total is overpriced  → buy NO token
          const isUnderpriced = opp.priceSumDelta < 0;
          const tokenId = isUnderpriced ? opp.yesTokenId : opp.noTokenId;
          const price   = isUnderpriced ? opp.yesMidPrice : opp.noMidPrice;

          // Use Kelly-sized position if sizer available, otherwise fallback
          const posSize = kellySizer
            ? kellySizer.getSize(STRATEGY_NAME).size
            : maxPositionSize;

          const order = await orderManager.placeOrder({
            tokenId,
            side: 'buy',
            price: String(price.toFixed(4)),
            size: String(posSize),
            orderType: 'GTC',
          });

          logger.info('Arb order placed', 'PolymarketArbStrategy', {
            conditionId: opp.conditionId,
            side: isUnderpriced ? 'YES' : 'NO',
            price,
            size: posSize,
            score: opp.score,
            orderId: order.id,
          });

          eventBus.emit('trade.executed', {
            trade: {
              orderId: order.id,
              marketId: opp.conditionId,
              side: 'buy',
              fillPrice: String(price),
              fillSize: String(posSize),
              fees: '0',
              timestamp: Date.now(),
              strategy: STRATEGY_NAME,
            },
          });
        } catch (innerErr) {
          logger.error('Failed to place arb order', 'PolymarketArbStrategy', {
            conditionId: opp.conditionId,
            err: String(innerErr),
          });
        }
      }
    } catch (err) {
      logger.error('Polymarket arb tick failed', 'PolymarketArbStrategy', { err: String(err) });
    }
  };
}
