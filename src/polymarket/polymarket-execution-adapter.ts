// Polymarket execution adapter: enforces risk gate, routes to paper or live, logs to DB
import type { OrderSide, PositionSide, TradeResult } from '../core/types.js';
import type { RiskManager } from '../core/risk-manager.js';
import type { OrderManager } from './order-manager.js';
import type { OrderBookStream } from './orderbook-stream.js';
import type { PaperExchange } from '../paper-trading/paper-exchange.js';
import type { AlgoDatabase } from '../data/database.js';
import { logger } from '../core/logger.js';

export interface AdapterDeps {
  riskManager: RiskManager;
  orderManager: OrderManager;
  orderbookStream: OrderBookStream;
  paperExchange: PaperExchange;
  db: AlgoDatabase;
  capitalUsdc: string;
  paperTrading: boolean;
}

/**
 * Build the Polymarket execution adapter used by TradeExecutor.
 * ALL trades MUST pass risk gate before reaching exchange.
 */
export function buildPolymarketAdapter(deps: AdapterDeps) {
  return {
    async executeOrder(side: OrderSide, tokenId: string, price: string, size: string): Promise<TradeResult> {
      // ── Risk gate (mandatory) ──────────────────────────────────────
      const openRows = deps.db.getOpenPositions();
      const positions = openRows.map(p => ({
        marketId: p.market,
        side: p.side as PositionSide,
        entryPrice: p.entry_price,
        size: p.size,
        unrealizedPnl: p.unrealized_pnl,
        openedAt: p.opened_at,
      }));

      const check = deps.riskManager.canOpenPosition(deps.capitalUsdc, positions, size);
      if (!check.allowed) {
        logger.warn('Trade BLOCKED by risk manager', 'PolymarketAdapter', { reason: check.reason, tokenId, size });
        throw new Error(`Risk check failed: ${check.reason}`);
      }

      // ── Paper mode ────────────────────────────────────────────────
      let result: TradeResult;
      if (deps.paperTrading) {
        // Seed mid-price from live orderbook data for realistic simulation
        const book = deps.orderbookStream.getBook(tokenId);
        if (book?.bids[0] && book.asks[0]) {
          const mid = (parseFloat(book.bids[0].price) + parseFloat(book.asks[0].price)) / 2;
          deps.paperExchange.setPrice(tokenId, mid);
        }
        result = deps.paperExchange.submitOrder({
          marketType: 'polymarket',
          exchange: 'polymarket',
          symbol: tokenId,
          side,
          size,
          price,
          strategy: 'cross-market-arb',
          dryRun: false,
        });
      } else {
        // ── Live mode ──────────────────────────────────────────────
        const record = await deps.orderManager.placeOrder({ tokenId, price, size, side });
        result = {
          orderId: record.id,
          marketId: tokenId,
          side,
          fillPrice: price,
          fillSize: size,
          fees: '0',
          timestamp: Date.now(),
          strategy: 'cross-market-arb',
        };
      }

      // ── Persist to DB ──────────────────────────────────────────────
      deps.db.insertTrade(result);
      logger.info('Trade logged', 'PolymarketAdapter', {
        orderId: result.orderId,
        side,
        tokenId,
        price,
        size,
        paper: deps.paperTrading,
      });

      return result;
    },
  };
}
