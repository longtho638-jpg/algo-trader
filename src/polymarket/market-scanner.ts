// Scan Polymarket markets for arbitrage and spread opportunities
// Binary markets: YES + NO token prices should sum to ~1.0 (USDC)
import type { ClobClient, RawMarket } from './clob-client.js';
import { logger } from '../core/logger.js';
import { safeParseFloat } from '../core/utils.js';

const MIN_VOLUME_USDC = 1_000;    // $1K daily volume minimum
const MIN_SPREAD_PCT = 0.02;      // 2% spread threshold for arb detection
const MAX_PRICE_SUM_DELTA = 0.05; // YES+NO should be within 5 cents of 1.0

export interface MarketOpportunity {
  conditionId: string;
  description: string;
  yesTokenId: string;
  noTokenId: string;
  yesMidPrice: number;
  noMidPrice: number;
  priceSum: number;
  /** Deviation from 1.0: positive = overpriced, negative = underpriced */
  priceSumDelta: number;
  yesSpread: number;
  noSpread: number;
  volume: number;
  /** Score: higher = more attractive */
  score: number;
}

export interface ScanResult {
  scannedAt: number;
  totalMarkets: number;
  activeMarkets: number;
  opportunities: MarketOpportunity[];
}

export interface ScanOptions {
  minVolume?: number;
  minSpreadPct?: number;
  /** Min absolute price-sum deviation to qualify as arb opportunity */
  minPriceSumDelta?: number;
  /** Max markets to analyze (caps API calls in paper mode) */
  limit?: number;
  /** Upper volume cap — filters out high-volume markets dominated by sophisticated traders */
  maxVolume?: number;
  /** Minimum days until market resolution (prefer markets not too stale) */
  minResolutionDays?: number;
  /** Maximum days until market resolution (prefer markets resolving soon) */
  maxResolutionDays?: number;
  /** Exclude markets matching these categories (e.g. ['Cryptocurrency']) */
  excludeCategories?: string[];
  /** Exclude markets whose description matches price-prediction patterns (e.g. "above $X") */
  excludePriceMarkets?: boolean;
}

export class MarketScanner {
  constructor(private client: ClobClient) {}

  /** Scan all active markets and return ranked opportunities */
  async scan(options: ScanOptions = {}): Promise<ScanResult> {
    const minVolume = options.minVolume ?? MIN_VOLUME_USDC;
    const minSpread = options.minSpreadPct ?? MIN_SPREAD_PCT;

    logger.info('Starting market scan', 'MarketScanner');
    const rawMarkets = await this.fetchRawMarkets();
    let active = rawMarkets.filter(m => m.active && safeParseFloat(m.volume) >= minVolume);

    // Long-tail filter: exclude high-volume markets dominated by sophisticated players
    if (options.maxVolume !== undefined) {
      active = active.filter(m => safeParseFloat(m.volume) <= options.maxVolume!);
    }

    // Resolution window: prefer markets resolving within the specified day range
    if (options.minResolutionDays !== undefined || options.maxResolutionDays !== undefined) {
      const now = Date.now();
      active = active.filter(m => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const endDate = (m as any).end_date_iso as string | undefined;
        if (!endDate) return true; // keep if no date field
        const daysToClose = (new Date(endDate).getTime() - now) / 86_400_000;
        const minDays = options.minResolutionDays ?? 0;
        const maxDays = options.maxResolutionDays ?? Infinity;
        return daysToClose >= minDays && daysToClose <= maxDays;
      });
    }

    // Category filter: exclude stock/crypto price markets where LLM has no edge
    if (options.excludeCategories?.length) {
      const excludeSet = new Set(options.excludeCategories.map(c => c.toLowerCase()));
      active = active.filter(m => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cat = ((m as any).category as string | undefined)?.toLowerCase() ?? '';
        return !excludeSet.has(cat);
      });
    }

    // Price-prediction pattern filter: "above $X", "close above", "dip to $X", "price of"
    if (options.excludePriceMarkets) {
      const pricePattern = /\b(above|below|close above|close below|dip to|price of|finish.*above|finish.*below)\b.*\$[\d,.]+/i;
      active = active.filter(m => !pricePattern.test(m.description));
    }

    if (options.limit && options.limit > 0) {
      active = active.slice(0, options.limit);
    }

    logger.debug('Filtered markets', 'MarketScanner', { total: rawMarkets.length, active: active.length });

    const opportunities: MarketOpportunity[] = [];

    for (const market of active) {
      const opp = await this.analyzeMarket(market).catch(err => {
        logger.warn('Failed to analyze market', 'MarketScanner', {
          conditionId: market.condition_id,
          err: String(err),
        });
        return null;
      });
      if (opp && this.isOpportunity(opp, minSpread)) {
        opportunities.push(opp);
      }
    }

    // Rank by score descending
    opportunities.sort((a, b) => b.score - a.score);

    logger.info('Scan complete', 'MarketScanner', { opportunities: opportunities.length });
    return {
      scannedAt: Date.now(),
      totalMarkets: rawMarkets.length,
      activeMarkets: active.length,
      opportunities,
    };
  }

  /**
   * Scan and return ranked opportunities directly.
   * Alias used by strategies and pipeline.
   */
  async scanOpportunities(options: ScanOptions = {}): Promise<MarketOpportunity[]> {
    const result = await this.scan(options);
    return result.opportunities;
  }

  /** Get top N opportunities from a fresh scan */
  async getTopOpportunities(n = 10, options: ScanOptions = {}): Promise<MarketOpportunity[]> {
    const result = await this.scan(options);
    return result.opportunities.slice(0, n);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async fetchRawMarkets(): Promise<RawMarket[]> {
    // In paper mode the client returns simulated markets; real mode hits CLOB API
    if (this.client.isPaperMode) {
      // Delegate to client's internal paper markets via getMarkets side-channel
      const res = await fetch('data:application/json,[{"condition_id":"paper-condition-1","question_id":"paper-q-1","tokens":[{"token_id":"paper-yes-1","outcome":"Yes"},{"token_id":"paper-no-1","outcome":"No"}],"minimum_order_size":"5","minimum_tick_size":"0.01","description":"[PAPER] Will BTC exceed $100K?","active":true,"volume":"50000"}]').catch(() => null);
      if (res?.ok) return res.json() as Promise<RawMarket[]>;
      // Fallback: return minimal paper market inline
      return [{
        condition_id: 'paper-condition-1',
        question_id: 'paper-q-1',
        tokens: [
          { token_id: 'paper-yes-1', outcome: 'Yes' },
          { token_id: 'paper-no-1', outcome: 'No' },
        ],
        minimum_order_size: '5',
        minimum_tick_size: '0.01',
        description: '[PAPER] Will BTC exceed $100K?',
        active: true,
        volume: '50000',
      }];
    }

    const res = await fetch('https://clob.polymarket.com/markets', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch markets: ${res.status}`);
    const data = await res.json() as { data?: RawMarket[] } | RawMarket[];
    return Array.isArray(data) ? data : (data.data ?? []);
  }

  private async analyzeMarket(market: RawMarket): Promise<MarketOpportunity | null> {
    const yesToken = market.tokens.find(t => t.outcome === 'Yes');
    const noToken = market.tokens.find(t => t.outcome === 'No');
    if (!yesToken || !noToken) return null;

    const [yesPrice, noPrice] = await Promise.all([
      this.client.getPrice(yesToken.token_id),
      this.client.getPrice(noToken.token_id),
    ]);

    const yesMid = safeParseFloat(yesPrice.mid);
    const noMid  = safeParseFloat(noPrice.mid);
    const yesBid = safeParseFloat(yesPrice.bid);
    const yesAsk = safeParseFloat(yesPrice.ask);
    const noBid  = safeParseFloat(noPrice.bid);
    const noAsk  = safeParseFloat(noPrice.ask);

    const priceSum      = yesMid + noMid;
    const priceSumDelta = priceSum - 1.0;
    const yesSpread     = yesAsk - yesBid;
    const noSpread      = noAsk - noBid;
    const volume        = safeParseFloat(market.volume);

    // Score = |delta| * log(volume) - spread penalty
    const score = Math.abs(priceSumDelta) * Math.log10(Math.max(volume, 1)) - (yesSpread + noSpread);

    return {
      conditionId: market.condition_id,
      description: market.description,
      yesTokenId:  yesToken.token_id,
      noTokenId:   noToken.token_id,
      yesMidPrice: yesMid,
      noMidPrice:  noMid,
      priceSum,
      priceSumDelta,
      yesSpread,
      noSpread,
      volume,
      score,
    };
  }

  private isOpportunity(opp: MarketOpportunity, minSpreadPct: number): boolean {
    const hasArb    = Math.abs(opp.priceSumDelta) > MAX_PRICE_SUM_DELTA;
    const hasSpread = opp.yesSpread > minSpreadPct || opp.noSpread > minSpreadPct;
    return hasArb || hasSpread;
  }
}
