/**
 * Market Maker Strategy for Polymarket Prediction Markets
 *
 * Provides liquidity by quoting both bid/ask spreads on binary outcome tokens.
 * Features:
 * - Inventory-based skewing
 * - Fair value estimation from multiple sources
 * - Anti-crossing spread logic (prevents 422 postOnly errors)
 * - Source-aware freshness checking (FV changes trigger immediate re-quote)
 */

import { IStrategy, ISignal, SignalType } from '../interfaces/IStrategy';
import { ICandle } from '../interfaces/ICandle';
import { logger } from '../utils/logger';

// Types for Polymarket integration
export interface ParsedMarket {
  conditionId: string;
  slug?: string;
  question: string;
  yesBid?: number;
  yesAsk?: number;
  volume?: number;
  liquidity?: number;
}

export interface MMState {
  market: ParsedMarket;
  yesInventory: number;
  noInventory: number;
  activeOrderIds: string[];
  lastBid: number;
  lastAsk: number;
  lastQuoteTime: number;
  lastSource: string; // Track FV source for freshness bypass
  fillCount: number;
  adverseCount: number;
}

export interface MarketMakerConfig {
  spreadBps: number;        // Target spread in basis points (e.g., 500 = 5%)
  cancelThreshold: number;  // Price drift before cancel/replace (e.g., 0.02 = 2 cents)
  maxInventory: number;     // Max net inventory position
  skewFactor: number;       // Inventory skew multiplier (e.g., 0.01)
  minEdge: number;          // Minimum edge over opposite best (e.g., 0.01)
}

/**
 * Fair Value estimator with multiple sources
 */
interface FVEstimate {
  fv: number;
  source: string;
  confidence: number;
}

export class MarketMakerStrategy implements IStrategy {
  name = 'MarketMaker';
  private config: MarketMakerConfig;
  private states: Map<string, MMState> = new Map();
  private fairValues: Map<string, number> = new Map();
  private selectedMarkets: Set<string> = new Set();

  constructor(config?: Partial<MarketMakerConfig>) {
    this.config = {
      spreadBps: config?.spreadBps ?? 500,       // 5% default spread
      cancelThreshold: config?.cancelThreshold ?? 0.02,
      maxInventory: config?.maxInventory ?? 100,
      skewFactor: config?.skewFactor ?? 0.01,
      minEdge: config?.minEdge ?? 0.01,
    };
  }

  async init(history: ICandle[], config?: Record<string, unknown>): Promise<void> {
    logger.info('[MM] Initializing Market Maker strategy');
    if (config) {
      await this.updateConfig(config);
    }
  }

  async onStart(): Promise<void> {
    logger.info('[MM] Market Maker started');
  }

  async onFinish(): Promise<void> {
    logger.info('[MM] Market Maker stopping');
    // Cancel all active orders on shutdown
    for (const state of this.states.values()) {
      state.activeOrderIds = [];
    }
  }

  async updateConfig(config: Record<string, unknown>): Promise<void> {
    if (typeof config.spreadBps === 'number') this.config.spreadBps = config.spreadBps;
    if (typeof config.cancelThreshold === 'number') this.config.cancelThreshold = config.cancelThreshold;
    if (typeof config.maxInventory === 'number') this.config.maxInventory = config.maxInventory;
    if (typeof config.skewFactor === 'number') this.config.skewFactor = config.skewFactor;
    if (typeof config.minEdge === 'number') this.config.minEdge = config.minEdge;
    logger.info('[MM] Config updated:', JSON.stringify(this.config));
  }

  getConfigSchema(): Record<string, unknown> {
    return {
      spreadBps: { type: 'number', default: 500, min: 100, max: 2000 },
      cancelThreshold: { type: 'number', default: 0.02, min: 0.005, max: 0.1 },
      maxInventory: { type: 'number', default: 100, min: 10, max: 1000 },
      skewFactor: { type: 'number', default: 0.01, min: 0, max: 0.1 },
      minEdge: { type: 'number', default: 0.01, min: 0, max: 0.05 },
    };
  }

  getConfig(): Record<string, unknown> {
    return { ...this.config };
  }

  /**
   * Select markets to make in parallel
   */
  async selectMarkets(markets: ParsedMarket[], maxCount: number = 10): Promise<{ market: ParsedMarket; score: number }[]> {
    const scored = markets
      .filter(m => m.liquidity && m.volume && m.volume > 1000)
      .map(m => {
        const spread = (m.yesAsk || 1) - (m.yesBid || 0);
        const score = (m.volume || 0) * 0.5 + (m.liquidity || 0) * 0.3 + (1 / (spread + 0.01)) * 0.2;
        return { market: m, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCount);

    if (scored.length > 0) {
      const s = scored[0];
      logger.info(
        `[MM] Selected: ${s.market.slug || s.market.conditionId.slice(0, 12)} "${s.market.question.slice(0, 40)}" (score:${(s.score * 100).toFixed(0)})`
      );
    }

    return scored;
  }

  /**
   * Initialize or refresh market state
   */
  private initOrUpdateState(market: ParsedMarket): MMState {
    const existing = this.states.get(market.conditionId);
    if (existing) {
      existing.market = market;
      return existing;
    }

    const state: MMState = {
      market,
      yesInventory: 0,
      noInventory: 0,
      activeOrderIds: [],
      lastBid: 0,
      lastAsk: 0,
      lastQuoteTime: 0,
      lastSource: '',
      fillCount: 0,
      adverseCount: 0,
    };
    this.states.set(market.conditionId, state);
    return state;
  }

  /**
   * Calculate fair value from multiple sources
   */
  private estimateFairValue(market: ParsedMarket, externalData?: Record<string, unknown>): FVEstimate {
    // Source 1: Mid-market price
    const midPrice = ((market.yesBid || 0) + (market.yesAsk || 1)) / 2;

    // Source 2: External signal (e.g., prediction model, statistical edge)
    const modelFV = externalData?.modelFV as number | undefined;

    // Source 3: Volume-weighted historical average
    const histFV = externalData?.historicalAvg as number | undefined;

    // Combine sources with confidence weighting
    let fv = midPrice;
    let source = 'mid';
    let confidence = 0.5;

    if (modelFV && Math.abs(modelFV - midPrice) > 0.05) {
      fv = modelFV;
      source = 'model';
      confidence = 0.8;
    }

    if (histFV && Math.abs(histFV - midPrice) > 0.05) {
      // Blend with historical
      fv = fv * 0.7 + histFV * 0.3;
      source = source === 'model' ? 'model+hist' : 'hist';
      confidence = 0.6;
    }

    return { fv, source, confidence };
  }

  /**
   * Quote a market with bid/ask spread
   */
  async quoteMarket(
    market: ParsedMarket,
    client: any, // Polymarket API client
    externalData?: Record<string, unknown>
  ): Promise<void> {
    const state = this.initOrUpdateState(market);
    const { fv, source } = this.estimateFairValue(market, externalData);

    // Store fair value
    this.fairValues.set(market.conditionId, fv);

    // Calculate raw bid/ask around fair value
    const halfSpread = (this.config.spreadBps / 10000) / 2;
    let bid = fv * (1 - halfSpread);
    let ask = fv * (1 + halfSpread);

    // Skew based on inventory
    const netInventory = state.yesInventory - state.noInventory;
    const skew = netInventory * this.config.skewFactor;
    bid -= skew;
    ask -= skew;

    // Clamp to valid range
    bid = Math.max(0.02, Math.min(0.98, bid));
    ask = Math.max(0.02, Math.min(0.98, ask));

    // Get current market prices
    const bestBid = market.yesBid || 0;
    const bestAsk = market.yesAsk || 1;

    // Check if current quotes are still fresh enough (skip if source changed e.g. blind→informed)
    if (state.lastBid > 0 && state.lastAsk > 0 && state.lastSource === source) {
      const bidDrift = Math.abs(bid - state.lastBid);
      const askDrift = Math.abs(ask - state.lastAsk);
      if (bidDrift < this.config.cancelThreshold && askDrift < this.config.cancelThreshold) {
        return; // Quotes still fresh, same source
      }
    }

    // Cancel stale orders
    if (state.activeOrderIds.length > 0) {
      try {
        await client.cancelOrders(state.activeOrderIds);
      } catch (e: any) {
        logger.warn(`[MM] Cancel error: ${e.message}`);
      }
      state.activeOrderIds = [];
    }

    // Check if we already have orders on both sides
    const hasBid = state.lastBid > 0 && Date.now() - state.lastQuoteTime < 5000;
    const hasAsk = state.lastAsk > 0 && Date.now() - state.lastQuoteTime < 5000;

    // Check inventory limits + prevent crossing spread (avoids 422 postOnly errors)
    const shouldBid = !hasBid && bid >= 0.02 && bid < bestAsk && netInventory < this.config.maxInventory;
    const shouldAsk = !hasAsk && ask <= 0.98 && ask > bestBid && netInventory > -this.config.maxInventory;

    if (!shouldBid && !shouldAsk) {
      return;
    }

    const newOrders: any[] = [];
    if (shouldBid) {
      newOrders.push({
        market: market.conditionId,
        side: 'buy',
        price: bid,
        size: this.config.maxInventory / 10,
        postOnly: true,
      });
    }
    if (shouldAsk) {
      newOrders.push({
        market: market.conditionId,
        side: 'sell',
        price: ask,
        size: this.config.maxInventory / 10,
        postOnly: true,
      });
    }

    if (newOrders.length > 0) {
      // Post each order individually — one 422 must not kill the other
      for (const entry of newOrders) {
        try {
          const resp = await client.postOrders([entry]);
          resp.forEach((r: any) => {
            if (r.orderID) state.activeOrderIds.push(r.orderID);
          });
        } catch (e: any) {
          const is422 = e.status === 422 || e.response?.status === 422;
          if (!is422) logger.error(`[MM] Order failed: ${e.message}`);
        }
      }

      // Update state
      state.lastBid = shouldBid ? bid : state.lastBid;
      state.lastAsk = shouldAsk ? ask : state.lastAsk;
      state.lastQuoteTime = Date.now();
      state.lastSource = source;

      const netInv = state.yesInventory - state.noInventory;
      logger.log(
        `[MM] ${market.slug || market.conditionId.slice(0, 12)} BID:${bid.toFixed(2)} ASK:${ask.toFixed(2)} (${source} inv:${netInv})`
      );
    }
  }

  onFill(conditionId: string, side: 'BUY' | 'SELL', size: number): void {
    const state = this.states.get(conditionId);
    if (!state) return;
    // Bot quotes YES token only: BUY = acquired YES, SELL = sold YES.
    // noInventory stays 0 — position merge activates when both > 0 (future: quote both sides).
    if (side === 'BUY') state.yesInventory += size;
    if (side === 'SELL') state.yesInventory -= size;
    state.fillCount++;
    logger.debug(`[MM] Fill: ${side} ${size} on ${conditionId.slice(0, 12)}, inv=${state.yesInventory}`);
  }

  async onCandle(candle: ICandle): Promise<ISignal | null> {
    // Market maker doesn't generate signals from candles
    // It quotes markets based on external fair value estimates
    return null;
  }
}
