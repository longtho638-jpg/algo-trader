// NewsSnipe Agent — detect markets with sudden momentum shifts (proxy for news events)
// Uses volume + price change velocity as news signal without requiring Twitter API
// High volume spike + rapid price movement = news-driven, tradeable window exists
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { logger } from '../core/logger.js';

interface NewsSignal {
  marketId: string;
  question: string;
  yesPrice: number;
  volume24h: number;
  liquidity: number;
  momentumScore: number; // higher = more likely news-driven
  priceExtremity: number; // how far from 0.50 — extreme = strong directional move
  signal: 'breaking' | 'developing' | 'fading';
}

export class NewsSniperAgent implements SpecialistAgent {
  readonly name = 'news-snipe';
  readonly description = 'Detect markets with sudden momentum shifts (news-driven price movements)';
  readonly taskTypes = ['news-snipe' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'news-snipe';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const {
        minMomentum = 5.0,
        limit = 100,
      } = task.payload as { minMomentum?: number; limit?: number };

      logger.info(`NewsSnipe: scanning for momentum >= ${minMomentum}`, 'NewsSniperAgent');

      const { GammaClient } = await import('../polymarket/gamma-client.js');
      const gamma = new GammaClient();
      const markets = await gamma.getTrending(limit);

      const signals: NewsSignal[] = [];

      for (const m of markets) {
        if (m.closed || m.resolved) continue;
        if (m.liquidity <= 0 || m.volume24h <= 0) continue;

        // Momentum = (volume24h / liquidity) * priceExtremity
        // High volume relative to pool + price far from 0.50 = strong directional conviction
        const volLiqRatio = m.volume24h / m.liquidity;
        const priceExtremity = Math.abs(m.yesPrice - 0.5) * 2; // 0-1 scale
        const momentumScore = Math.round(volLiqRatio * (1 + priceExtremity) * 100) / 100;

        if (momentumScore >= minMomentum) {
          let signal: 'breaking' | 'developing' | 'fading';
          if (momentumScore >= 20) signal = 'breaking';
          else if (momentumScore >= 10) signal = 'developing';
          else signal = 'fading';

          signals.push({
            marketId: m.id,
            question: m.question,
            yesPrice: m.yesPrice,
            volume24h: m.volume24h,
            liquidity: m.liquidity,
            momentumScore,
            priceExtremity: Math.round(priceExtremity * 100) / 100,
            signal,
          });
        }
      }

      signals.sort((a, b) => b.momentumScore - a.momentumScore);

      return successResult(this.name, task.id, {
        scanned: markets.length,
        signals: signals.length,
        results: signals,
        note: signals.length === 0
          ? `No news momentum detected (min=${minMomentum}). Markets are quiet.`
          : `Found ${signals.length} markets with news-like momentum. "breaking" = highest urgency. Trade quickly — window closes fast.`,
      }, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
