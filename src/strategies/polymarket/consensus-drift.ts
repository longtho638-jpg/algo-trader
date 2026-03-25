/**
 * Consensus Drift strategy for Polymarket binary markets.
 *
 * Tracks aggregate market positioning across related markets within the same
 * event to detect consensus shifts before individual market prices fully adjust.
 * When markets within the same event show directional drift (multiple markets
 * shifting the same way), trades the laggard markets that haven't adjusted yet.
 *
 * Signal logic:
 *   1. Group markets by event (using gamma.getTrending)
 *   2. For each event with multiple markets, track price changes (drift)
 *   3. Calculate "consensus drift" = average price change across all markets
 *   4. Identify laggard markets whose drift deviates from consensus
 *   5. When |marketDrift - consensusDrift| > driftThreshold → trade
 *   6. BUY YES if laggard is below consensus, BUY NO if above
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface ConsensusDriftConfig {
  /** Number of snapshots for drift calculation */
  driftWindow: number;
  /** Minimum |marketDrift - consensusDrift| to trade */
  driftThreshold: number;
  /** EMA alpha for drift tracking */
  driftEmaAlpha: number;
  /** Minimum markets in event to analyze */
  minMarketsPerEvent: number;
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.03 = 3%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.02 = 2%) */
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

export const DEFAULT_CONFIG: ConsensusDriftConfig = {
  driftWindow: 15,
  driftThreshold: 0.03,
  driftEmaAlpha: 0.12,
  minMarketsPerEvent: 2,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME = 'consensus-drift' as StrategyName;

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
 * Calculate drift from an array of prices.
 * Drift = last price - first price.
 * Returns 0 if fewer than 2 prices.
 */
export function calcDrift(prices: number[]): number {
  if (prices.length < 2) return 0;
  return prices[prices.length - 1] - prices[0];
}

/**
 * Calculate consensus drift as the average of all individual drifts.
 * Returns 0 if the array is empty.
 */
export function calcConsensusDrift(drifts: number[]): number {
  if (drifts.length === 0) return 0;
  let sum = 0;
  for (const d of drifts) sum += d;
  return sum / drifts.length;
}

/**
 * Find laggard markets whose drift deviates significantly from consensus.
 * Returns markets where |drift - consensus| > threshold.
 * direction: 'below' if marketDrift < consensus, 'above' if marketDrift > consensus.
 */
export function findLaggards(
  marketDrifts: Map<string, number>,
  consensus: number,
  threshold: number,
): { marketId: string; gap: number; direction: 'above' | 'below' }[] {
  const results: { marketId: string; gap: number; direction: 'above' | 'below' }[] = [];

  for (const [marketId, drift] of marketDrifts) {
    const gap = Math.abs(drift - consensus);
    if (gap > threshold) {
      const direction: 'above' | 'below' = drift < consensus ? 'below' : 'above';
      results.push({ marketId, gap, direction });
    }
  }

  return results;
}

/**
 * Update an exponential moving average for drift tracking.
 * newEma = alpha * drift + (1 - alpha) * prevEma
 * Returns drift when prevEma is null (initial case).
 */
export function updateDriftEma(prevEma: number | null, drift: number, alpha: number): number {
  if (prevEma === null) return drift;
  if (alpha <= 0) return prevEma;
  if (alpha >= 1) return drift;
  return alpha * drift + (1 - alpha) * prevEma;
}

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface ConsensusDriftDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<ConsensusDriftConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createConsensusDriftTick(deps: ConsensusDriftDeps): () => Promise<void> {
  const {
    clob,
    orderManager,
    eventBus,
    gamma,
  } = deps;
  const cfg: ConsensusDriftConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Per-market state
  const priceHistory = new Map<string, number[]>();
  const driftEmaState = new Map<string, number>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function recordPrice(tokenId: string, price: number): void {
    let history = priceHistory.get(tokenId);
    if (!history) {
      history = [];
      priceHistory.set(tokenId, history);
    }
    history.push(price);

    // Keep only driftWindow snapshots
    if (history.length > cfg.driftWindow) {
      history.splice(0, history.length - cfg.driftWindow);
    }
  }

  function getPrices(tokenId: string): number[] {
    return priceHistory.get(tokenId) ?? [];
  }

  function updateDriftEmaState(tokenId: string, drift: number): number {
    const prev = driftEmaState.get(tokenId) ?? null;
    const ema = updateDriftEma(prev, drift, cfg.driftEmaAlpha);
    driftEmaState.set(tokenId, ema);
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

    // Group markets by event slug
    const eventGroups = new Map<string, GammaMarket[]>();
    for (const market of markets) {
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if ((market.volume ?? 0) < cfg.minVolume) continue;

      const eventSlug = market.slug;
      let group = eventGroups.get(eventSlug);
      if (!group) {
        group = [];
        eventGroups.set(eventSlug, group);
      }
      group.push(market);
    }

    // Process each event group
    for (const [_eventSlug, group] of eventGroups) {
      if (positions.length >= cfg.maxPositions) break;
      if (group.length < cfg.minMarketsPerEvent) continue;

      // Fetch prices and record snapshots for each market in the group
      const marketMids = new Map<string, number>();
      for (const market of group) {
        try {
          const book = await clob.getOrderBook(market.yesTokenId);
          const ba = bestBidAsk(book);
          if (ba.mid <= 0 || ba.mid >= 1) continue;

          recordPrice(market.yesTokenId, ba.mid);
          marketMids.set(market.conditionId, ba.mid);
        } catch {
          continue;
        }
      }

      // Calculate drifts for each market in the group
      const marketDrifts = new Map<string, number>();
      const driftValues: number[] = [];
      const marketByCondition = new Map<string, GammaMarket>();

      for (const market of group) {
        const prices = getPrices(market.yesTokenId);
        if (prices.length < 2) continue;

        const drift = calcDrift(prices);
        marketDrifts.set(market.conditionId, drift);
        driftValues.push(drift);
        marketByCondition.set(market.conditionId, market);

        // Update drift EMA
        updateDriftEmaState(market.yesTokenId, drift);
      }

      if (driftValues.length < cfg.minMarketsPerEvent) continue;

      // Calculate consensus drift
      const consensus = calcConsensusDrift(driftValues);

      // Find laggards
      const laggards = findLaggards(marketDrifts, consensus, cfg.driftThreshold);

      // Trade laggards
      for (const laggard of laggards) {
        if (positions.length >= cfg.maxPositions) break;

        const market = marketByCondition.get(laggard.marketId);
        if (!market) continue;

        if (hasPosition(market.yesTokenId)) continue;
        if (market.noTokenId && hasPosition(market.noTokenId)) continue;
        if (isOnCooldown(market.yesTokenId)) continue;

        const mid = marketMids.get(market.conditionId);
        if (mid === undefined) continue;

        try {
          const book = await clob.getOrderBook(market.yesTokenId);
          const ba = bestBidAsk(book);

          // BUY YES if laggard is below consensus (underpriced)
          // BUY NO if laggard is above consensus (overpriced)
          const side: 'yes' | 'no' = laggard.direction === 'below' ? 'yes' : 'no';
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
            consensus: consensus.toFixed(4),
            marketDrift: (marketDrifts.get(market.conditionId) ?? 0).toFixed(4),
            gap: laggard.gap.toFixed(4),
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
  }

  // ── Main tick ────────────────────────────────────────────────────────────

  return async function consensusDriftTick(): Promise<void> {
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
