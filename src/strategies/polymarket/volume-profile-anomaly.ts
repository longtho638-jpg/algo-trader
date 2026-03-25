/**
 * Volume Profile Anomaly strategy for Polymarket binary markets.
 *
 * Builds volume profiles (volume-at-price) for each market and detects when
 * price breaks out from high-volume nodes (HVN) or enters low-volume nodes
 * (LVN). High-volume nodes act as support/resistance — breakouts from them
 * signal strong directional moves.
 *
 * Signal logic:
 *   1. Build a volume profile: divide price range [0,1] into bins (e.g., 20 bins of 0.05 width)
 *   2. Track cumulative volume in each bin from orderbook snapshots
 *   3. Identify HVN (bins with volume > hvnMultiplier * average volume)
 *   4. Identify LVN (bins with volume < lvnMultiplier * average volume)
 *   5. When price breaks above an HVN into an LVN → bullish breakout → BUY YES
 *   6. When price breaks below an HVN into an LVN → bearish breakout → BUY NO
 *   7. Expect fast moves through LVN (low resistance)
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface VolumeProfileAnomalyConfig {
  /** Number of price bins for volume profile */
  numBins: number;
  /** Volume > avg * this = HVN */
  hvnMultiplier: number;
  /** Volume < avg * this = LVN */
  lvnMultiplier: number;
  /** Max snapshots for profile building */
  profileWindow: number;
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Consecutive ticks in LVN to confirm breakout */
  breakoutConfirmTicks: number;
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

export const DEFAULT_CONFIG: VolumeProfileAnomalyConfig = {
  numBins: 20,
  hvnMultiplier: 1.5,
  lvnMultiplier: 0.5,
  profileWindow: 40,
  minVolume: 5000,
  breakoutConfirmTicks: 2,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'volume-profile-anomaly' as StrategyName;

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
 * Convert a price [0,1] to a bin index [0, numBins-1].
 */
export function priceToBin(price: number, numBins: number): number {
  const bin = Math.floor(price * numBins);
  return Math.max(0, Math.min(numBins - 1, bin));
}

/**
 * Build a volume profile from price/volume snapshots.
 * Returns array of length numBins with cumulative volume per bin.
 */
export function buildVolumeProfile(
  snapshots: { price: number; volume: number }[],
  numBins: number,
): number[] {
  const profile = new Array(numBins).fill(0);
  for (const snap of snapshots) {
    const bin = priceToBin(snap.price, numBins);
    profile[bin] += snap.volume;
  }
  return profile;
}

/**
 * Classify each bin as HVN, LVN, or normal based on average volume.
 */
export function classifyBins(
  profile: number[],
  hvnMult: number,
  lvnMult: number,
): ('hvn' | 'lvn' | 'normal')[] {
  const total = profile.reduce((s, v) => s + v, 0);
  const avg = profile.length > 0 ? total / profile.length : 0;

  return profile.map(vol => {
    if (avg === 0) return 'normal';
    if (vol > avg * hvnMult) return 'hvn';
    if (vol < avg * lvnMult) return 'lvn';
    return 'normal';
  });
}

/**
 * Detect breakout from HVN to LVN.
 * HVN -> LVN + up = bullish, HVN -> LVN + down = bearish, else null.
 */
export function detectBreakout(
  prevBinClass: string,
  currentBinClass: string,
  priceDirection: 'up' | 'down',
): 'bullish' | 'bearish' | null {
  if (prevBinClass === 'hvn' && currentBinClass === 'lvn') {
    return priceDirection === 'up' ? 'bullish' : 'bearish';
  }
  return null;
}

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface VolumeProfileAnomalyDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<VolumeProfileAnomalyConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createVolumeProfileAnomalyTick(deps: VolumeProfileAnomalyDeps): () => Promise<void> {
  const {
    clob,
    orderManager,
    eventBus,
    gamma,
  } = deps;
  const cfg: VolumeProfileAnomalyConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Per-market state
  const snapshotHistory = new Map<string, { price: number; volume: number }[]>();
  const prevBinIndex = new Map<string, number>();
  const confirmCounters = new Map<string, number>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function recordSnapshot(tokenId: string, price: number, volume: number): void {
    let history = snapshotHistory.get(tokenId);
    if (!history) {
      history = [];
      snapshotHistory.set(tokenId, history);
    }
    history.push({ price, volume });

    if (history.length > cfg.profileWindow) {
      history.splice(0, history.length - cfg.profileWindow);
    }
  }

  function getSnapshots(tokenId: string): { price: number; volume: number }[] {
    return snapshotHistory.get(tokenId) ?? [];
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
        continue;
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

        // Record snapshot
        recordSnapshot(market.yesTokenId, ba.mid, bookVolume);
        const snapshots = getSnapshots(market.yesTokenId);

        // Need enough snapshots to build a meaningful profile
        if (snapshots.length < 3) continue;

        // Build volume profile and classify bins
        const profile = buildVolumeProfile(snapshots, cfg.numBins);
        const binClasses = classifyBins(profile, cfg.hvnMultiplier, cfg.lvnMultiplier);

        // Get current and previous bin
        const currentBin = priceToBin(ba.mid, cfg.numBins);
        const prevBin = prevBinIndex.get(market.yesTokenId);
        prevBinIndex.set(market.yesTokenId, currentBin);

        if (prevBin === undefined) continue;

        // Determine price direction
        const priceDirection: 'up' | 'down' = currentBin > prevBin ? 'up' : 'down';
        if (currentBin === prevBin) continue;

        // Detect breakout
        const breakout = detectBreakout(binClasses[prevBin], binClasses[currentBin], priceDirection);
        if (!breakout) continue;

        // Confirm breakout with consecutive ticks
        const key = `${market.yesTokenId}:${breakout}`;
        const count = (confirmCounters.get(key) ?? 0) + 1;
        confirmCounters.set(key, count);

        if (count < cfg.breakoutConfirmTicks) continue;

        // Reset confirmation counter
        confirmCounters.delete(key);

        // Determine signal
        const side: 'yes' | 'no' = breakout === 'bullish' ? 'yes' : 'no';
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
          breakout,
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

  return async function volumeProfileAnomalyTick(): Promise<void> {
    try {
      // 1. Check exits first
      await checkExits();

      // 2. Discover trending markets
      const markets = await gamma.getTrending(15);

      // 3. Scan for entries
      await scanEntries(markets);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
        trackedMarkets: snapshotHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
