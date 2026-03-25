/**
 * Tick Momentum Burst strategy for Polymarket binary markets.
 *
 * Detects rapid succession of same-direction price ticks (tick clustering)
 * as a short-term momentum signal. When consecutive ticks in the same
 * direction exceed a threshold AND volume confirms, enters a momentum
 * position expecting continuation.
 *
 * Signal logic:
 *   1. Track individual price changes (ticks) per market
 *   2. Count consecutive same-direction ticks
 *   3. When consecutive count >= burstThreshold AND average tick size > minTickSize
 *      -> momentum burst detected
 *   4. Confirm with volume: current volume > volumeMultiplier * average volume
 *   5. BUY YES if burst direction is UP, BUY NO if burst direction is DOWN
 *   6. Exit: tight take-profit (fast scalp), stop-loss, short max-hold
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface TickMomentumBurstConfig {
  /** Number of consecutive same-direction ticks needed to trigger */
  burstThreshold: number;
  /** Minimum average tick size to qualify as a burst */
  minTickSize: number;
  /** Volume confirmation multiplier (current / average) */
  volumeMultiplier: number;
  /** Max ticks to retain per market */
  tickWindow: number;
  /** Price snapshots to retain for volume average */
  priceWindow: number;
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.02 = 2%) */
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

export const DEFAULT_CONFIG: TickMomentumBurstConfig = {
  burstThreshold: 5,
  minTickSize: 0.002,
  volumeMultiplier: 2.0,
  tickWindow: 50,
  priceWindow: 20,
  minVolume: 3000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 10 * 60_000,
  maxPositions: 5,
  cooldownMs: 60_000,
  positionSize: '8',
};

const STRATEGY_NAME = 'tick-momentum-burst' as StrategyName;

// ── Internal types ───────────────────────────────────────────────────────────

export interface PriceSnapshot {
  price: number;
  volume: number;
  timestamp: number;
}

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
 * Convert price series to tick series (price differences).
 * Returns array of length prices.length - 1.
 */
export function calcTickSeries(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const ticks: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    ticks.push(prices[i] - prices[i - 1]);
  }
  return ticks;
}

/**
 * Count consecutive same-sign ticks from the end of array.
 * Returns count, direction, and average absolute tick size.
 * Empty/single tick -> { count: 0, direction: 'flat', avgSize: 0 }
 */
export function countConsecutiveTicks(ticks: number[]): {
  count: number;
  direction: 'up' | 'down' | 'flat';
  avgSize: number;
} {
  if (ticks.length === 0) return { count: 0, direction: 'flat', avgSize: 0 };

  const lastTick = ticks[ticks.length - 1];
  if (lastTick === 0) return { count: 0, direction: 'flat', avgSize: 0 };

  const lastSign = lastTick > 0 ? 1 : -1;
  let count = 0;
  let sumAbs = 0;

  for (let i = ticks.length - 1; i >= 0; i--) {
    const tick = ticks[i];
    const sign = tick > 0 ? 1 : tick < 0 ? -1 : 0;
    if (sign !== lastSign) break;
    count++;
    sumAbs += Math.abs(tick);
  }

  return {
    count,
    direction: lastSign > 0 ? 'up' : 'down',
    avgSize: count > 0 ? sumAbs / count : 0,
  };
}

/**
 * Check whether a burst is confirmed given the consecutive count,
 * average tick size, and volume ratio against config thresholds.
 */
export function isBurstConfirmed(
  consecutiveCount: number,
  avgTickSize: number,
  volumeRatio: number,
  config: Pick<TickMomentumBurstConfig, 'burstThreshold' | 'minTickSize' | 'volumeMultiplier'>,
): boolean {
  return (
    consecutiveCount >= config.burstThreshold &&
    avgTickSize >= config.minTickSize &&
    volumeRatio >= config.volumeMultiplier
  );
}

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface TickMomentumBurstDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<TickMomentumBurstConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createTickMomentumBurstTick(deps: TickMomentumBurstDeps): () => Promise<void> {
  const {
    clob,
    orderManager,
    eventBus,
    gamma,
  } = deps;
  const cfg: TickMomentumBurstConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Per-market state
  const priceHistory = new Map<string, PriceSnapshot[]>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function recordPrice(tokenId: string, price: number, volume: number): void {
    let history = priceHistory.get(tokenId);
    if (!history) {
      history = [];
      priceHistory.set(tokenId, history);
    }
    history.push({ price, volume, timestamp: Date.now() });

    // Keep only priceWindow snapshots
    if (history.length > cfg.priceWindow) {
      history.splice(0, history.length - cfg.priceWindow);
    }
  }

  function getSnapshots(tokenId: string): PriceSnapshot[] {
    return priceHistory.get(tokenId) ?? [];
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

        // Estimate volume from book depth
        const bookVolume = book.bids.reduce((s, l) => s + parseFloat(l.size), 0)
          + book.asks.reduce((s, l) => s + parseFloat(l.size), 0);

        // Record price snapshot
        recordPrice(market.yesTokenId, ba.mid, bookVolume);
        const snapshots = getSnapshots(market.yesTokenId);

        // Need enough snapshots for tick analysis
        if (snapshots.length < 3) continue;

        // Build tick series from price history
        const prices = snapshots.map(s => s.price);
        const ticks = calcTickSeries(prices);

        // Trim ticks to tickWindow
        const windowedTicks = ticks.length > cfg.tickWindow
          ? ticks.slice(ticks.length - cfg.tickWindow)
          : ticks;

        // Count consecutive same-direction ticks
        const { count, direction, avgSize } = countConsecutiveTicks(windowedTicks);

        // Calculate volume ratio
        const avgVolume = snapshots.reduce((s, snap) => s + snap.volume, 0) / snapshots.length;
        const volumeRatio = avgVolume > 0 ? bookVolume / avgVolume : 0;

        // Check burst confirmation
        if (!isBurstConfirmed(count, avgSize, volumeRatio, cfg)) continue;

        // Determine signal
        // UP burst → BUY YES, DOWN burst → BUY NO
        const side: 'yes' | 'no' = direction === 'up' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

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
          burstCount: count,
          burstDirection: direction,
          avgTickSize: avgSize.toFixed(6),
          volumeRatio: volumeRatio.toFixed(2),
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

  return async function tickMomentumBurstTick(): Promise<void> {
    try {
      // 1. Check exits first
      await checkExits();

      // 2. Discover trending markets
      const markets = await gamma.getTrending(15);

      // 3. Scan for entries
      await scanEntries(markets);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
        trackedMarkets: priceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
