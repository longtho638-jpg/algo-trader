// src/strategies/mm/MarketSelector.ts
// Score and filter markets for MM — replace dumb liquidity > 10000 filter
import { ParsedMarket } from '../../adapters/GammaClient';

export interface MarketScore {
  market: ParsedMarket;
  score: number;
  breakdown: { volume: number; spread: number; time: number; depth: number };
}

// Categories safe for MM (no insider edge)
const SAFE_CATEGORIES = ['politics', 'crypto', 'tech', 'economics', 'science', 'culture'];
// Keywords that signal high adverse selection risk
const DANGER_KEYWORDS = ['today', 'tonight', 'tomorrow', 'this week', 'score', 'winner', 'weather', 'temperature', 'rain'];

export class MarketSelector {
  private readonly minDaysToResolution: number;
  private readonly minDailyVolume: number;
  private readonly minSpread: number;
  private readonly maxMarkets: number;

  constructor(config?: {
    minDaysToResolution?: number;
    minDailyVolume?: number;
    minSpread?: number;
    maxMarkets?: number;
  }) {
    this.minDaysToResolution = config?.minDaysToResolution ?? 2;
    this.minDailyVolume = config?.minDailyVolume ?? 5000;
    this.minSpread = config?.minSpread ?? 0.03;
    this.maxMarkets = config?.maxMarkets ?? 10;
  }

  select(markets: ParsedMarket[]): MarketScore[] {
    return markets
      .filter(m => this.passesHardFilters(m))
      .map(m => this.scoreMarket(m))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxMarkets);
  }

  private passesHardFilters(m: ParsedMarket): boolean {
    // 1. Must have > minDaysToResolution days left
    const daysLeft = (m.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft < this.minDaysToResolution) return false;

    // 2. Must have minimum daily volume
    if (m.volume < this.minDailyVolume) return false;

    // 3. Must have minimum spread (need room to quote)
    const impliedSpread = Math.abs(1 - m.yesPrice - m.noPrice);
    const priceSpread = Math.abs(m.yesPrice - (1 - m.noPrice));
    if (Math.max(impliedSpread, priceSpread) < this.minSpread) return false;

    // 4. Skip extreme prices (no room to make market)
    if (m.yesPrice < 0.05 || m.yesPrice > 0.95) return false;

    // 5. Skip dangerous categories (high adverse selection)
    const qLower = m.question.toLowerCase();
    if (DANGER_KEYWORDS.some(kw => qLower.includes(kw))) return false;

    return true;
  }

  private scoreMarket(m: ParsedMarket): MarketScore {
    const daysLeft = (m.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    const impliedSpread = Math.abs(m.yesPrice - (1 - m.noPrice));

    // Volume score: more volume = more fills = more income
    const volumeScore = Math.min(m.volume / 100000, 1);

    // Spread score: sweet spot 4-12¢
    const spreadScore = impliedSpread >= 0.04 && impliedSpread <= 0.12
      ? 1.0
      : impliedSpread > 0.12
        ? 0.7
        : Math.max(0, (impliedSpread - 0.02) / 0.02);

    // Time score: longer = safer
    const timeScore = Math.min(daysLeft / 30, 1);

    // Depth score: more depth = less adverse selection
    const depthScore = Math.min(m.liquidity / 50000, 1);

    const score = volumeScore * 0.30
               + spreadScore * 0.30
               + timeScore   * 0.25
               + depthScore  * 0.15;

    return {
      market: m,
      score,
      breakdown: {
        volume: Math.round(volumeScore * 100),
        spread: Math.round(spreadScore * 100),
        time: Math.round(timeScore * 100),
        depth: Math.round(depthScore * 100),
      },
    };
  }

  // Check if a market should be removed (approaching resolution)
  shouldEvict(m: ParsedMarket): boolean {
    const hoursLeft = (m.endDate.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursLeft < 48;
  }
}
