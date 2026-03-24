// Prediction Executor — bridges PredictionLoop signals to live CLOB order execution
// Signal → license check → position sizing → order placement → alert → DB log
// This is the critical missing wire from "paper trading" to "live trading"

import type { ClobClient, OrderArgs } from './clob-client.js';
import type { RankedSignal } from './prediction-loop.js';
import type { LicensePayload } from '../license/license-generator.js';
import { canTrade } from '../license/license-validator.js';
import { detectCategory, type MarketCategory } from '../openclaw/category-prompts.js';
import { logger } from '../core/logger.js';

export interface ExecutorConfig {
  /** Total capital in USDC available for trading */
  capitalUsdc: number;
  /** Max fraction of capital per single trade (default: 0.05 = 5%) */
  maxPositionFraction: number;
  /** Min trade size in USDC (default: 5) */
  minTradeUsdc: number;
  /** Kelly fraction for position sizing (default: 0.5 = half-Kelly) */
  kellyFraction: number;
  /** Dry run mode — log orders but don't execute (default: false) */
  dryRun: boolean;
  /** Optional Telegram alert callback */
  onTrade?: (trade: ExecutedTrade) => void;
}

export interface ExecutedTrade {
  signalId: string;
  marketId: string;
  description: string;
  direction: 'buy_yes' | 'buy_no';
  tokenId: string;
  price: string;
  sizeUsdc: number;
  orderId: string;
  edge: number;
  confidence: number;
  timestamp: number;
  dryRun: boolean;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  capitalUsdc: 500,
  maxPositionFraction: 0.05,
  minTradeUsdc: 5,
  kellyFraction: 0.25,
  dryRun: false,
};

// Category capital weights (from research: Entertainment highest edge, Politics lowest)
const CATEGORY_CAPITAL_WEIGHTS: Record<MarketCategory, number> = {
  entertainment: 1.4,  // 70% more capital (highest LLM edge)
  tech: 1.2,           // 20% more capital (emerging edge)
  science: 1.2,
  economics: 1.0,
  geopolitics: 0.9,
  politics: 0.7,       // 30% less (tight spreads, institutional competition)
  sports: 0.8,
  other: 1.0,
};

// Max trades per category (signal orthogonality — avoid correlated bets)
const MAX_PER_CATEGORY = 2;

export class PredictionExecutor {
  private readonly client: ClobClient;
  private readonly config: ExecutorConfig;
  private readonly license: LicensePayload;
  private tradesToday = 0;
  private lastResetDay = '';
  private categoryCount: Map<MarketCategory, number> = new Map();

  constructor(client: ClobClient, license: LicensePayload, config?: Partial<ExecutorConfig>) {
    this.client = client;
    this.license = license;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute trades for a batch of ranked signals from PredictionLoop.
   * Returns array of executed trades.
   */
  async executeSignals(signals: RankedSignal[]): Promise<ExecutedTrade[]> {
    this.resetDailyCountIfNeeded();
    const executed: ExecutedTrade[] = [];

    for (const signal of signals) {
      if (signal.direction === 'skip') continue;

      // License trade limit check
      if (!canTrade(this.license, this.tradesToday)) {
        logger.warn(`Daily trade limit reached (${this.license.maxTradesPerDay})`, 'PredictionExecutor');
        break;
      }

      // Signal orthogonality: max 2 trades per category
      const category = detectCategory(signal.description);
      const catCount = this.categoryCount.get(category) ?? 0;
      if (catCount >= MAX_PER_CATEGORY) {
        logger.debug(`Skip: category ${category} at max (${MAX_PER_CATEGORY})`, 'PredictionExecutor');
        continue;
      }

      try {
        const trade = await this.executeSingle(signal, category);
        if (trade) {
          executed.push(trade);
          this.tradesToday++;
          this.categoryCount.set(category, catCount + 1);
          this.config.onTrade?.(trade);
        }
      } catch (err) {
        logger.error(`Trade failed: ${signal.marketId}`, 'PredictionExecutor', { err: String(err) });
      }
    }

    return executed;
  }

  private async executeSingle(signal: RankedSignal, category: MarketCategory = 'other'): Promise<ExecutedTrade | null> {
    // Position sizing: quarter-Kelly * category weight
    const categoryWeight = CATEGORY_CAPITAL_WEIGHTS[category] ?? 1.0;
    const sizeUsdc = this.calculateSize(signal.edge, signal.confidence) * categoryWeight;
    if (sizeUsdc < this.config.minTradeUsdc) {
      logger.debug(`Skip: size $${sizeUsdc.toFixed(2)} below min`, 'PredictionExecutor');
      return null;
    }

    // Determine which token to buy and at what price
    const isBuyYes = signal.direction === 'buy_yes';
    const tokenId = isBuyYes ? signal.yesTokenId : signal.noTokenId;
    const price = isBuyYes
      ? Math.min(signal.marketProb + 0.01, 0.99).toFixed(2)  // Limit order slightly above market
      : Math.min(1 - signal.marketProb + 0.01, 0.99).toFixed(2);

    // Size in shares = USDC / price
    const shares = (sizeUsdc / parseFloat(price)).toFixed(1);

    const orderArgs: OrderArgs = {
      tokenId,
      price,
      size: shares,
      side: 'buy',
      orderType: 'GTC',
    };

    let orderId = 'dry-run';

    if (this.config.dryRun) {
      logger.info(`[DRY RUN] Would ${signal.direction} ${signal.description.slice(0, 50)} | $${sizeUsdc.toFixed(2)}`, 'PredictionExecutor');
    } else {
      const order = await this.client.postOrder(orderArgs);
      orderId = order.id;
      logger.info(`EXECUTED: ${signal.direction} ${signal.description.slice(0, 50)} | $${sizeUsdc.toFixed(2)} | order:${orderId}`, 'PredictionExecutor');
    }

    return {
      signalId: `trade_${signal.marketId}_${Date.now()}`,
      marketId: signal.marketId,
      description: signal.description,
      direction: signal.direction as 'buy_yes' | 'buy_no',
      tokenId,
      price,
      sizeUsdc,
      orderId,
      edge: signal.edge,
      confidence: signal.confidence,
      timestamp: Date.now(),
      dryRun: this.config.dryRun,
    };
  }

  /**
   * Half-Kelly position sizing: size = capital * kellyFraction * |edge| * confidence
   * Capped at maxPositionFraction of capital.
   */
  private calculateSize(edge: number, confidence: number): number {
    const absEdge = Math.abs(edge);
    const kellyRaw = absEdge * confidence;
    const kellyAdjusted = kellyRaw * this.config.kellyFraction;
    const size = this.config.capitalUsdc * Math.min(kellyAdjusted, this.config.maxPositionFraction);
    return Math.round(size * 100) / 100;
  }

  private resetDailyCountIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastResetDay) {
      this.tradesToday = 0;
      this.categoryCount.clear();
      this.lastResetDay = today;
    }
  }
}
