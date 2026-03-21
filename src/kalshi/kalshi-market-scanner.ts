// Kalshi market scanner — finds mispriced markets and cross-platform arb opportunities
// Misprice: YES price + NO price significantly != $1.00 (100 cents)
import type { KalshiClient, KalshiMarket } from './kalshi-client.js';
import { logger } from '../core/logger.js';

const MIN_SPREAD_THRESHOLD = 0.03;  // 3% minimum spread for cross-platform arb
const MIN_KALSHI_VOLUME = 100;      // minimum contract volume
const MIN_OPEN_INTEREST = 50;       // minimum open interest
const MISPRICE_THRESHOLD = 0.05;    // YES+NO must deviate >5 cents from $1.00

// --- Types ---

export interface KalshiOpportunity {
  ticker: string;
  market: KalshiMarket;
  type: 'misprice' | 'low-spread';
  /** Normalized YES mid price 0-1 */
  yesMid: number;
  /** Normalized NO mid price 0-1 */
  noMid: number;
  /** YES + NO - 1.0 (negative = discount, positive = premium) */
  mispriceGap: number;
  /** Bid-ask spread on YES side in cents */
  spread: number;
  score: number;
}

export interface CrossPlatformOpportunity {
  kalshiMarket: KalshiMarket;
  polymarketConditionId: string;
  /** Kalshi YES mid price normalized 0-1 */
  kalshiPrice: number;
  /** Polymarket YES mid price 0-1 */
  polymarketPrice: number;
  /** Absolute price difference */
  spread: number;
  /** 'buy-kalshi' = Kalshi cheaper; 'buy-polymarket' = Polymarket cheaper */
  direction: 'buy-kalshi' | 'buy-polymarket';
}

/** Minimal Polymarket price map passed in by caller */
export type PolymarketPriceMap = Map<string, { conditionId: string; title: string; midPrice: number }>;

// --- KalshiMarketScanner ---

export class KalshiMarketScanner {
  constructor(private client: KalshiClient) {}

  /** Scan active markets, detect mispriced and low-spread opportunities */
  async scanOpportunities(): Promise<KalshiOpportunity[]> {
    logger.info('Scanning Kalshi opportunities', 'KalshiMarketScanner');
    const markets = await this.client.getMarkets({ status: 'open', limit: 200 });

    const filtered = markets.filter(m =>
      m.status === 'open' &&
      m.volume >= MIN_KALSHI_VOLUME &&
      m.open_interest >= MIN_OPEN_INTEREST,
    );

    const opportunities: KalshiOpportunity[] = [];

    for (const m of filtered) {
      // Normalize prices from cents to 0-1
      const yesMid = (m.yes_bid + m.yes_ask) / 2 / 100;
      const noMid = (m.no_bid + m.no_ask) / 2 / 100;
      const mispriceGap = yesMid + noMid - 1.0;
      const spread = m.yes_ask - m.yes_bid; // cents

      const isMispriced = Math.abs(mispriceGap) > MISPRICE_THRESHOLD;
      const isLowSpread = spread <= 4; // tight spread = liquid market

      if (!isMispriced && !isLowSpread) continue;

      // Score: higher gap + tighter spread + more volume = better
      const score = Math.abs(mispriceGap) * 10 + (m.volume / 1000) - (spread / 100);

      opportunities.push({
        ticker: m.ticker,
        market: m,
        type: isMispriced ? 'misprice' : 'low-spread',
        yesMid,
        noMid,
        mispriceGap,
        spread,
        score,
      });
    }

    opportunities.sort((a, b) => b.score - a.score);
    logger.info('Opportunity scan complete', 'KalshiMarketScanner', {
      scanned: filtered.length, found: opportunities.length,
    });
    return opportunities;
  }

  /** Fetch all open Kalshi markets with sufficient volume */
  async scanMarkets(): Promise<KalshiMarket[]> {
    logger.info('Scanning Kalshi markets', 'KalshiMarketScanner');
    const markets = await this.client.getMarkets({ status: 'open', limit: 200 });
    const active = markets.filter(m => m.status === 'open' && m.volume >= MIN_KALSHI_VOLUME);
    logger.debug('Kalshi active markets', 'KalshiMarketScanner', { count: active.length });
    return active;
  }

  /**
   * Find arbitrage opportunities between Kalshi and Polymarket.
   * polymarketPrices: map of keyword -> { conditionId, title, midPrice 0-1 }
   */
  async findArbOpportunities(polymarketPrices: PolymarketPriceMap): Promise<CrossPlatformOpportunity[]> {
    const kalshiMarkets = await this.scanMarkets();
    const opportunities: CrossPlatformOpportunity[] = [];
    const polyEntries = Array.from(polymarketPrices.values());

    for (const km of kalshiMarkets) {
      const match = this.matchMarket(km, polyEntries);
      if (!match) continue;

      const kalshiMid = ((km.yes_bid + km.yes_ask) / 2) / 100;
      const polyMid = match.midPrice;
      const spread = Math.abs(kalshiMid - polyMid);
      if (spread < MIN_SPREAD_THRESHOLD) continue;

      const direction: CrossPlatformOpportunity['direction'] =
        kalshiMid < polyMid ? 'buy-kalshi' : 'buy-polymarket';

      opportunities.push({ kalshiMarket: km, polymarketConditionId: match.conditionId,
        kalshiPrice: kalshiMid, polymarketPrice: polyMid, spread, direction });

      logger.debug('Arb opportunity found', 'KalshiMarketScanner', {
        ticker: km.ticker, spread: spread.toFixed(4), direction,
      });
    }

    opportunities.sort((a, b) => b.spread - a.spread);
    logger.info('Arb scan complete', 'KalshiMarketScanner', { opportunities: opportunities.length });
    return opportunities;
  }

  matchMarkets(
    kalshiMarkets: KalshiMarket[],
    polyEntries: Array<{ conditionId: string; title: string; midPrice: number }>,
  ): Map<string, { conditionId: string; title: string; midPrice: number }> {
    const result = new Map<string, { conditionId: string; title: string; midPrice: number }>();
    for (const km of kalshiMarkets) {
      const match = this.matchMarket(km, polyEntries);
      if (match) result.set(km.ticker, match);
    }
    return result;
  }

  private matchMarket(
    km: KalshiMarket,
    polyEntries: Array<{ conditionId: string; title: string; midPrice: number }>,
  ): { conditionId: string; title: string; midPrice: number } | null {
    const kalshiWords = this.keywords(`${km.title} ${km.subtitle ?? ''}`);
    let bestScore = 0;
    let bestMatch: (typeof polyEntries)[number] | null = null;

    for (const entry of polyEntries) {
      const polyWords = this.keywords(entry.title);
      const common = kalshiWords.filter(w => polyWords.includes(w)).length;
      const score = common / Math.max(kalshiWords.length, polyWords.length, 1);
      if (score > bestScore) { bestScore = score; bestMatch = entry; }
    }

    return bestScore >= 0.3 ? bestMatch : null;
  }

  private keywords(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
  }
}
