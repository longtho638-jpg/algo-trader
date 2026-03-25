/**
 * Spread Compression Arbitrage strategy for Polymarket binary markets.
 *
 * Monitors bid-ask spreads across markets and enters when spreads are
 * abnormally wide relative to their historical average. Expects spreads
 * to compress back to normal levels, profiting from the compression.
 *
 * Signal logic:
 *   1. Track bid-ask spread for each market over time
 *   2. Calculate spread EMA and spread standard deviation
 *   3. When current spread > spreadEma + zThreshold * spreadStd → spread is abnormally wide
 *   4. Enter by placing limit orders at mid price (capture the wide spread)
 *   5. BUY YES if best ask is significantly above fair value (expect ask to come down)
 *   6. BUY NO if best bid is significantly below fair value (expect bid to come up)
 *   7. Exit when spread compresses back to normal or on TP/SL/max-hold
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface SpreadCompressionArbConfig {
  /** EMA alpha for spread tracking (0 < alpha < 1) */
  spreadEmaAlpha: number;
  /** Z-score threshold for abnormal spread detection */
  zThreshold: number;
  /** Number of spread snapshots to retain */
  spreadWindow: number;
  /** Minimum absolute spread to consider (avoid tiny spreads) */
  minSpread: number;
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.025 = 2.5%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.015 = 1.5%) */
  stopLossPct: number;
  /** Max hold time in ms before forced exit */
  maxHoldMs: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** Per-market cooldown after exit (ms) */
  cooldownMs: number;
  /** Base trade size in USDC */
  positionSize: string;
}

export const DEFAULT_CONFIG: SpreadCompressionArbConfig = {
  spreadEmaAlpha: 0.1,
  zThreshold: 2.0,
  spreadWindow: 30,
  minSpread: 0.02,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.015,
  maxHoldMs: 15 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'spread-compression-arb' as StrategyName;

// ── Internal types ───────────────────────────────────────────────────────────

interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Calculate bid-ask spread.
 * spread = ask - bid
 */
export function calcSpread(bid: number, ask: number): number {
  return ask - bid;
}

/**
 * Calculate z-score for the current spread relative to its EMA and standard deviation.
 * z = (currentSpread - spreadEma) / spreadStd
 * Returns 0 if spreadStd is 0 (avoid division by zero).
 */
export function calcSpreadZScore(currentSpread: number, spreadEma: number, spreadStd: number): number {
  if (spreadStd === 0) return 0;
  return (currentSpread - spreadEma) / spreadStd;
}

/**
 * Calculate standard deviation of an array of values.
 * Returns 0 if fewer than 2 values.
 */
export function calcStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Update an exponential moving average for spread tracking.
 * newEma = alpha * spread + (1 - alpha) * prevEma
 * Returns spread when there is no previous EMA (initial case).
 */
export function updateSpreadEma(prevEma: number | null, spread: number, alpha: number): number {
  if (prevEma === null) return spread;
  if (alpha <= 0) return prevEma;
  if (alpha >= 1) return spread;
  return alpha * spread + (1 - alpha) * prevEma;
}

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface SpreadCompressionArbDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<SpreadCompressionArbConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createSpreadCompressionArbTick(deps: SpreadCompressionArbDeps): () => Promise<void> {
  const {
    clob,
    orderManager,
    eventBus,
    gamma,
  } = deps;
  const cfg: SpreadCompressionArbConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Per-market state
  const spreadHistory = new Map<string, number[]>();
  const spreadEmaState = new Map<string, number>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function recordSpread(tokenId: string, spread: number): void {
    let history = spreadHistory.get(tokenId);
    if (!history) {
      history = [];
      spreadHistory.set(tokenId, history);
    }
    history.push(spread);

    // Keep only spreadWindow snapshots
    if (history.length > cfg.spreadWindow) {
      history.splice(0, history.length - cfg.spreadWindow);
    }
  }

  function getSpreadSnapshots(tokenId: string): number[] {
    return spreadHistory.get(tokenId) ?? [];
  }

  function updateSpreadEmaState(tokenId: string, spread: number): number {
    const prev = spreadEmaState.get(tokenId) ?? null;
    const ema = updateSpreadEma(prev, spread, cfg.spreadEmaAlpha);
    spreadEmaState.set(tokenId, ema);
    return ema;
  }

  function isOnCooldown(tokenId: string): boolean {
    const until = cooldowns.get(tokenId) ?? 0;
    return Date.now() < until;
  }

  function hasPosition(tokenId: string): boolean {
    return positions.some(p => p.tokenId === tokenId);
  }

  // ── Exit logic ───────────────────────────────────────────────────────────

  async function checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      let shouldExit = false;
      let reason = '';

      // Get current price
      let currentPrice: number;
      try {
        const book = await clob.getOrderBook(pos.tokenId);
        const ba = bestBidAsk(book);
        currentPrice = ba.mid;
      } catch {
        continue; // skip if can't fetch
      }

      // Take profit / Stop loss
      if (pos.side === 'yes') {
        const gain = (currentPrice - pos.entryPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      } else {
        const gain = (pos.entryPrice - currentPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      }

      // Max hold time
      if (!shouldExit && now - pos.openedAt > cfg.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      if (shouldExit) {
        try {
          const exitSide = pos.side === 'yes' ? 'sell' : 'buy';
          await orderManager.placeOrder({
            tokenId: pos.tokenId,
            side: exitSide,
            price: currentPrice!.toFixed(4),
            size: String(Math.round(pos.sizeUsdc / currentPrice!)),
            orderType: 'IOC',
          });

          const pnl = pos.side === 'yes'
            ? (currentPrice! - pos.entryPrice) * (pos.sizeUsdc / pos.entryPrice)
            : (pos.entryPrice - currentPrice!) * (pos.sizeUsdc / pos.entryPrice);

          logger.info('Exit position', STRATEGY_NAME, {
            conditionId: pos.conditionId,
            side: pos.side,
            pnl: pnl.toFixed(4),
            reason,
          });

          eventBus.emit('trade.executed', {
            trade: {
              orderId: pos.orderId,
              marketId: pos.conditionId,
              side: exitSide,
              fillPrice: String(currentPrice),
              fillSize: String(pos.sizeUsdc),
              fees: '0',
              timestamp: Date.now(),
              strategy: STRATEGY_NAME,
            },
          });

          cooldowns.set(pos.tokenId, now + cfg.cooldownMs);
          toRemove.push(i);
        } catch (err) {
          logger.warn('Exit failed', STRATEGY_NAME, { tokenId: pos.tokenId, err: String(err) });
        }
      }
    }

    // Remove closed positions (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      positions.splice(toRemove[i], 1);
    }
  }

  // ── Entry logic ──────────────────────────────────────────────────────────

  async function scanEntries(markets: GammaMarket[]): Promise<void> {
    if (positions.length >= cfg.maxPositions) return;

    for (const market of markets) {
      if (positions.length >= cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (hasPosition(market.yesTokenId)) continue;
      if (market.noTokenId && hasPosition(market.noTokenId)) continue;
      if (isOnCooldown(market.yesTokenId)) continue;

      // Check minimum volume
      if ((market.volume ?? 0) < cfg.minVolume) continue;

      try {
        // Fetch orderbook for YES token
        const book = await clob.getOrderBook(market.yesTokenId);
        const ba = bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        // Calculate current spread
        const currentSpread = calcSpread(ba.bid, ba.ask);

        // Skip if spread is below minimum
        if (currentSpread < cfg.minSpread) continue;

        // Record spread snapshot
        recordSpread(market.yesTokenId, currentSpread);
        const snapshots = getSpreadSnapshots(market.yesTokenId);

        // Need at least 2 snapshots for meaningful EMA + StdDev
        if (snapshots.length < 2) continue;

        // Update spread EMA
        const spreadEma = updateSpreadEmaState(market.yesTokenId, currentSpread);

        // Calculate standard deviation from history
        const spreadStd = calcStdDev(snapshots);

        // Calculate z-score
        const zScore = calcSpreadZScore(currentSpread, spreadEma, spreadStd);

        // Check z-score threshold
        if (zScore < cfg.zThreshold) continue;

        // Determine signal direction based on where the spread is widening
        // BUY YES if best ask is significantly above mid (expect ask to come down)
        // BUY NO if best bid is significantly below mid (expect bid to come up)
        const askDeviation = ba.ask - ba.mid;
        const bidDeviation = ba.mid - ba.bid;
        const side: 'yes' | 'no' = askDeviation >= bidDeviation ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = ba.mid; // enter at mid to capture spread

        const posSize = parseFloat(cfg.positionSize);

        const order = await orderManager.placeOrder({
          tokenId,
          side: 'buy',
          price: entryPrice.toFixed(4),
          size: String(Math.round(posSize / entryPrice)),
          orderType: 'GTC',
        });

        positions.push({
          tokenId,
          conditionId: market.conditionId,
          side,
          entryPrice,
          sizeUsdc: posSize,
          orderId: order.id,
          openedAt: Date.now(),
        });

        logger.info('Entry position', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          spread: currentSpread.toFixed(4),
          spreadEma: spreadEma.toFixed(4),
          spreadStd: spreadStd.toFixed(4),
          zScore: zScore.toFixed(4),
          size: posSize.toFixed(2),
        });

        eventBus.emit('trade.executed', {
          trade: {
            orderId: order.id,
            marketId: market.conditionId,
            side: 'buy',
            fillPrice: String(entryPrice),
            fillSize: String(posSize),
            fees: '0',
            timestamp: Date.now(),
            strategy: STRATEGY_NAME,
          },
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }

  // ── Main tick ────────────────────────────────────────────────────────────

  return async function spreadCompressionArbTick(): Promise<void> {
    try {
      // 1. Check exits first
      await checkExits();

      // 2. Discover trending markets
      const markets = await gamma.getTrending(15);

      // 3. Scan for entries
      await scanEntries(markets);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
        trackedMarkets: spreadHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
