/**
 * Bayesian Probability Updater strategy for Polymarket binary markets.
 *
 * Uses Bayesian inference to maintain a posterior probability estimate for each
 * market outcome. When trade flow and volume changes provide new "evidence,"
 * the posterior is updated. Trades when the posterior diverges significantly
 * from the current market price.
 *
 * Signal logic:
 *   1. Maintain a prior probability (initialized to current market mid price)
 *   2. Observe "evidence" from trade flow: volume changes, price velocity, book imbalance
 *   3. Calculate likelihood ratio from evidence strength
 *   4. Update posterior: posterior = (prior * likelihood) / normalizer
 *   5. When |posterior - mid| > divergence threshold -> trade toward posterior
 *   6. BUY YES if posterior > mid (market underpriced), BUY NO if posterior < mid (market overpriced)
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';

// -- Config -------------------------------------------------------------------

export interface BayesianProbUpdaterConfig {
  /** How fast prior decays toward market price (0 < alpha < 1) */
  priorDecayAlpha: number;
  /** Number of snapshots for evidence calculation */
  evidenceWindow: number;
  /** Scale factor for evidence -> likelihood conversion */
  likelihoodScale: number;
  /** Min |posterior - mid| to trigger trade */
  divergenceThreshold: number;
  /** Volume vs avg ratio considered a spike */
  volumeSpikeMultiplier: number;
  /** Minimum market volume filter */
  minVolume: number;
  /** Take-profit as fraction (0.035 = 3.5%) */
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

export const DEFAULT_CONFIG: BayesianProbUpdaterConfig = {
  priorDecayAlpha: 0.05,
  evidenceWindow: 20,
  likelihoodScale: 2.0,
  divergenceThreshold: 0.04,
  volumeSpikeMultiplier: 2.5,
  minVolume: 5000,
  takeProfitPct: 0.035,
  stopLossPct: 0.02,
  maxHoldMs: 25 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME = 'bayesian-prob-updater' as StrategyName;

// -- Internal types -----------------------------------------------------------

interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

// -- Pure helpers (exported for testing) --------------------------------------

/**
 * Combines evidence signals into a single likelihood ratio.
 * ratio = exp(scale * (priceVelocity * 0.4 + (volumeRatio - 1) * 0.3 + bookImbalance * 0.3))
 * Clamped to [0.1, 10.0].
 */
export function calcLikelihoodRatio(
  priceVelocity: number,
  volumeRatio: number,
  bookImbalance: number,
  scale: number,
): number {
  const evidence = priceVelocity * 0.4 + (volumeRatio - 1) * 0.3 + bookImbalance * 0.3;
  const ratio = Math.exp(scale * evidence);
  return Math.min(10.0, Math.max(0.1, ratio));
}

/**
 * Bayesian update: posterior = (prior * likelihood) / ((prior * likelihood) + ((1 - prior) * (1/likelihood)))
 * Clamped to [0.01, 0.99].
 */
export function updatePosterior(prior: number, likelihood: number): number {
  const numerator = prior * likelihood;
  const denominator = numerator + (1 - prior) * (1 / likelihood);
  if (denominator === 0) return prior;
  const posterior = numerator / denominator;
  return Math.min(0.99, Math.max(0.01, posterior));
}

/**
 * Linear regression slope over last N prices, normalized.
 * If < 2 prices, returns 0.
 */
export function calcPriceVelocity(prices: number[]): number {
  if (prices.length < 2) return 0;

  const n = prices.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += prices[i];
    sumXY += i * prices[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;

  // Normalize by mean price
  const meanPrice = sumY / n;
  if (meanPrice === 0) return 0;

  return slope / meanPrice;
}

/**
 * (totalBidSize - totalAskSize) / (totalBidSize + totalAskSize)
 * Returns 0 if both sides empty.
 */
export function calcBookImbalance(
  bids: { price: string; size: string }[],
  asks: { price: string; size: string }[],
): number {
  let totalBid = 0;
  let totalAsk = 0;

  for (const b of bids) totalBid += parseFloat(b.size);
  for (const a of asks) totalAsk += parseFloat(a.size);

  const total = totalBid + totalAsk;
  if (total === 0) return 0;

  return (totalBid - totalAsk) / total;
}

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// -- Dependencies -------------------------------------------------------------

export interface BayesianProbUpdaterDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<BayesianProbUpdaterConfig>;
}

// -- Tick factory -------------------------------------------------------------

export function createBayesianProbUpdaterTick(deps: BayesianProbUpdaterDeps): () => Promise<void> {
  const {
    clob,
    orderManager,
    eventBus,
    gamma,
  } = deps;
  const cfg: BayesianProbUpdaterConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Per-market state
  const priceHistory = new Map<string, number[]>();
  const volumeHistory = new Map<string, number[]>();
  const priorState = new Map<string, number>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // -- Helpers ----------------------------------------------------------------

  function recordSnapshot(tokenId: string, price: number, volume: number): void {
    let prices = priceHistory.get(tokenId);
    if (!prices) {
      prices = [];
      priceHistory.set(tokenId, prices);
    }
    prices.push(price);
    if (prices.length > cfg.evidenceWindow) {
      prices.splice(0, prices.length - cfg.evidenceWindow);
    }

    let volumes = volumeHistory.get(tokenId);
    if (!volumes) {
      volumes = [];
      volumeHistory.set(tokenId, volumes);
    }
    volumes.push(volume);
    if (volumes.length > cfg.evidenceWindow) {
      volumes.splice(0, volumes.length - cfg.evidenceWindow);
    }
  }

  function getPrices(tokenId: string): number[] {
    return priceHistory.get(tokenId) ?? [];
  }

  function getVolumeRatio(tokenId: string): number {
    const vols = volumeHistory.get(tokenId) ?? [];
    if (vols.length < 2) return 1;
    const avg = vols.slice(0, -1).reduce((s, v) => s + v, 0) / (vols.length - 1);
    if (avg === 0) return 1;
    return vols[vols.length - 1] / avg;
  }

  function getPrior(tokenId: string, mid: number): number {
    const existing = priorState.get(tokenId);
    if (existing === undefined) {
      priorState.set(tokenId, mid);
      return mid;
    }
    // Decay prior toward market price
    const decayed = existing + cfg.priorDecayAlpha * (mid - existing);
    priorState.set(tokenId, decayed);
    return decayed;
  }

  function isOnCooldown(tokenId: string): boolean {
    const until = cooldowns.get(tokenId) ?? 0;
    return Date.now() < until;
  }

  function hasPosition(tokenId: string): boolean {
    return positions.some(p => p.tokenId === tokenId);
  }

  // -- Exit logic -------------------------------------------------------------

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

  // -- Entry logic ------------------------------------------------------------

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
        const prices = getPrices(market.yesTokenId);

        // Need at least 2 snapshots for meaningful evidence
        if (prices.length < 2) continue;

        // Compute evidence signals
        const priceVelocity = calcPriceVelocity(prices);
        const volumeRatio = getVolumeRatio(market.yesTokenId);
        const bookImbalance = calcBookImbalance(book.bids, book.asks);

        // Get / update prior
        const prior = getPrior(market.yesTokenId, ba.mid);

        // Compute likelihood and posterior
        const likelihood = calcLikelihoodRatio(priceVelocity, volumeRatio, bookImbalance, cfg.likelihoodScale);
        const posterior = updatePosterior(prior, likelihood);

        // Check divergence threshold
        const divergence = posterior - ba.mid;
        if (Math.abs(divergence) < cfg.divergenceThreshold) continue;

        // Determine signal
        // posterior > mid -> market underpriced -> BUY YES
        // posterior < mid -> market overpriced -> BUY NO
        const side: 'yes' | 'no' = divergence > 0 ? 'yes' : 'no';
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
          prior: prior.toFixed(4),
          posterior: posterior.toFixed(4),
          divergence: divergence.toFixed(4),
          priceVelocity: priceVelocity.toFixed(4),
          volumeRatio: volumeRatio.toFixed(4),
          bookImbalance: bookImbalance.toFixed(4),
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

  // -- Main tick --------------------------------------------------------------

  return async function bayesianProbUpdaterTick(): Promise<void> {
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
