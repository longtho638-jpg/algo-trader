// Momentum scalper strategy for Polymarket binary markets
// Detects rapid price moves (>2% in 60s), rides momentum with tight trailing stops
// Exits on reversal or max hold time
import { logger } from '../../core/logger.js';
import { sleep } from '../../core/utils.js';
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';

/** Extract best bid/ask from raw order book levels */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

export interface MomentumConfig {
  /** Min price move % to trigger entry (0.02 = 2%) */
  entryThresholdPct: number;
  /** Lookback window in ms for momentum detection */
  lookbackMs: number;
  /** Trade size in USDC */
  sizeUsdc: number;
  /** Trailing stop distance as fraction (0.015 = 1.5%) */
  trailingStopPct: number;
  /** Max hold time in ms before forced exit */
  maxHoldMs: number;
  /** Scan interval in ms */
  scanIntervalMs: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** Cooldown after exit before re-entry on same market (ms) */
  cooldownMs: number;
}

interface PriceSnapshot {
  price: number;
  timestamp: number;
}

interface MomentumPosition {
  tokenId: string;
  side: 'long' | 'short';
  entryPrice: number;
  size: number;
  peakPrice: number;
  openedAt: number;
  orderId: string;
}

const DEFAULT_CONFIG: MomentumConfig = {
  entryThresholdPct: 0.02,
  lookbackMs: 60_000,
  sizeUsdc: 25,
  trailingStopPct: 0.015,
  maxHoldMs: 5 * 60_000,
  scanIntervalMs: 5_000,
  maxPositions: 3,
  cooldownMs: 120_000,
};

export class MomentumScalperStrategy {
  readonly name = 'momentum-scalper';
  private running = false;
  private readonly config: MomentumConfig;
  private readonly positions: MomentumPosition[] = [];
  private readonly priceHistory = new Map<string, PriceSnapshot[]>();
  private readonly cooldowns = new Map<string, number>();
  private realizedPnl = 0;

  constructor(
    private readonly clob: ClobClient,
    config: Partial<MomentumConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(tokenIds: string[]): Promise<void> {
    this.running = true;
    logger.info('Momentum scalper started', this.name, { tokens: tokenIds.length });

    while (this.running) {
      try {
        await this.tick(tokenIds);
      } catch (err) {
        logger.error('Tick error', this.name, { error: String(err) });
      }
      await sleep(this.config.scanIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
    logger.info('Momentum scalper stopped', this.name, {
      positions: this.positions.length,
      realizedPnl: this.realizedPnl,
    });
  }

  private async tick(tokenIds: string[]): Promise<void> {
    // Update prices for all tracked tokens
    for (const tokenId of tokenIds) {
      try {
        const book = await this.clob.getOrderBook(tokenId);
        const { mid } = bestBidAsk(book);
        this.recordPrice(tokenId, mid);
      } catch { /* skip */ }
    }

    // Check exits first (trailing stop, max hold)
    await this.checkExits();

    // Look for new entries if under max positions
    if (this.positions.length < this.config.maxPositions) {
      await this.scanEntries(tokenIds);
    }
  }

  private recordPrice(tokenId: string, price: number): void {
    const now = Date.now();
    let history = this.priceHistory.get(tokenId);
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
    history.push({ price, timestamp: now });

    // Trim old entries
    const cutoff = now - this.config.lookbackMs * 2;
    const trimIdx = history.findIndex(s => s.timestamp > cutoff);
    if (trimIdx > 0) history.splice(0, trimIdx);
  }

  private getMomentum(tokenId: string): { direction: 'up' | 'down' | null; magnitude: number } {
    const history = this.priceHistory.get(tokenId);
    if (!history || history.length < 3) return { direction: null, magnitude: 0 };

    const now = Date.now();
    const lookbackStart = now - this.config.lookbackMs;
    const recentPrices = history.filter(s => s.timestamp >= lookbackStart);
    if (recentPrices.length < 2) return { direction: null, magnitude: 0 };

    const oldPrice = recentPrices[0].price;
    const newPrice = recentPrices[recentPrices.length - 1].price;
    const change = (newPrice - oldPrice) / oldPrice;

    if (Math.abs(change) >= this.config.entryThresholdPct) {
      return { direction: change > 0 ? 'up' : 'down', magnitude: Math.abs(change) };
    }
    return { direction: null, magnitude: Math.abs(change) };
  }

  private async scanEntries(tokenIds: string[]): Promise<void> {
    const now = Date.now();

    for (const tokenId of tokenIds) {
      // Skip if already in position or in cooldown
      if (this.positions.some(p => p.tokenId === tokenId)) continue;
      const cooldownUntil = this.cooldowns.get(tokenId) ?? 0;
      if (now < cooldownUntil) continue;

      const momentum = this.getMomentum(tokenId);
      if (!momentum.direction) continue;

      // Enter in direction of momentum
      const side: 'long' | 'short' = momentum.direction === 'up' ? 'long' : 'short';
      try {
        const book = await this.clob.getOrderBook(tokenId);
        const ba = bestBidAsk(book);
        const entryPrice = side === 'long' ? ba.ask : ba.bid;
        const size = this.config.sizeUsdc / entryPrice;

        const order = await this.clob.postOrder({
          tokenId,
          side: side === 'long' ? 'buy' : 'sell',
          price: entryPrice.toFixed(4),
          size: size.toFixed(4),
        });
        const orderId = order.id;

        this.positions.push({
          tokenId,
          side,
          entryPrice,
          size,
          peakPrice: entryPrice,
          openedAt: now,
          orderId,
        });

        logger.info('Momentum entry', this.name, {
          tokenId: tokenId.slice(0, 8),
          side,
          entryPrice,
          magnitude: (momentum.magnitude * 100).toFixed(2) + '%',
        });
      } catch (err) {
        logger.warn('Entry failed', this.name, { tokenId: tokenId.slice(0, 8), error: String(err) });
      }
    }
  }

  private async checkExits(): Promise<void> {
    const now = Date.now();
    const toClose: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const history = this.priceHistory.get(pos.tokenId);
      if (!history || history.length === 0) continue;

      const currentPrice = history[history.length - 1].price;

      // Update peak price for trailing stop
      if (pos.side === 'long' && currentPrice > pos.peakPrice) pos.peakPrice = currentPrice;
      if (pos.side === 'short' && currentPrice < pos.peakPrice) pos.peakPrice = currentPrice;

      let shouldExit = false;
      let reason = '';

      // Trailing stop
      if (pos.side === 'long') {
        const drawdown = (pos.peakPrice - currentPrice) / pos.peakPrice;
        if (drawdown >= this.config.trailingStopPct) {
          shouldExit = true;
          reason = `trailing stop (peak=${pos.peakPrice.toFixed(4)}, dd=${(drawdown * 100).toFixed(2)}%)`;
        }
      } else {
        const drawup = (currentPrice - pos.peakPrice) / pos.peakPrice;
        if (drawup >= this.config.trailingStopPct) {
          shouldExit = true;
          reason = `trailing stop (peak=${pos.peakPrice.toFixed(4)}, du=${(drawup * 100).toFixed(2)}%)`;
        }
      }

      // Max hold time
      if (!shouldExit && now - pos.openedAt > this.config.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      if (shouldExit) {
        try {
          await this.clob.postOrder({
            tokenId: pos.tokenId,
            side: pos.side === 'long' ? 'sell' : 'buy',
            price: currentPrice.toFixed(4),
            size: pos.size.toFixed(4),
          });

          const pnl = pos.side === 'long'
            ? (currentPrice - pos.entryPrice) * pos.size
            : (pos.entryPrice - currentPrice) * pos.size;
          this.realizedPnl += pnl;

          logger.info('Momentum exit', this.name, {
            tokenId: pos.tokenId.slice(0, 8),
            side: pos.side,
            pnl: pnl.toFixed(4),
            reason,
          });

          this.cooldowns.set(pos.tokenId, now + this.config.cooldownMs);
          toClose.push(i);
        } catch (err) {
          logger.warn('Exit failed', this.name, { tokenId: pos.tokenId.slice(0, 8), error: String(err) });
        }
      }
    }

    // Remove closed positions (reverse order to preserve indices)
    for (let i = toClose.length - 1; i >= 0; i--) {
      this.positions.splice(toClose[i], 1);
    }
  }

  getStatus(): { running: boolean; positions: number; realizedPnl: number } {
    return { running: this.running, positions: this.positions.length, realizedPnl: this.realizedPnl };
  }
}
