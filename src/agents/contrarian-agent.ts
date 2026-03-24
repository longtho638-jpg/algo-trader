// Contrarian Agent — find markets where crowd consensus diverges from base-rate analysis
// Uses price extremity + volume concentration to detect herding behavior
// When crowd herds to one side AND price deviates from historical base rates → contrarian opportunity
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { logger } from '../core/logger.js';

interface ContrarianOpportunity {
  marketId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  herdingSide: 'YES' | 'NO';
  herdingIntensity: number; // 0-1, higher = stronger herding
  contrarianEdge: number; // estimated % if crowd is wrong
  riskLevel: 'low' | 'medium' | 'high';
}

export class ContrarianAgent implements SpecialistAgent {
  readonly name = 'contrarian';
  readonly description = 'Detect herding behavior and find contrarian opportunities where crowd may be wrong';
  readonly taskTypes = ['contrarian' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'contrarian';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const {
        minHerding = 0.70,
        maxPrice = 0.92,
        limit = 100,
      } = task.payload as { minHerding?: number; maxPrice?: number; limit?: number };

      logger.info(`Contrarian: scanning for herding >= ${minHerding}, price <= ${maxPrice}`, 'ContrarianAgent');

      const { GammaClient } = await import('../polymarket/gamma-client.js');
      const gamma = new GammaClient();
      const markets = await gamma.getTrending(limit);

      const opportunities: ContrarianOpportunity[] = [];

      for (const m of markets) {
        if (m.closed || m.resolved) continue;

        const highSide = Math.max(m.yesPrice, m.noPrice);
        const herdingSide: 'YES' | 'NO' = m.yesPrice >= m.noPrice ? 'YES' : 'NO';

        // Herding intensity: how extreme the price is (0.5 = no herding, 1.0 = max herding)
        const herdingIntensity = Math.round((highSide - 0.5) * 2 * 100) / 100;

        if (herdingIntensity < minHerding) continue;
        if (highSide > maxPrice) continue; // skip near-certain markets

        // Contrarian edge estimate: if crowd is wrong, buying the cheap side at (1-highSide) yields (1/(1-highSide) - 1)
        const cheapSide = 1 - highSide;
        const contrarianEdge = cheapSide > 0 ? Math.round((1 / cheapSide - 1) * 100) : 0;

        // Risk: higher herding + higher volume = more likely crowd is right
        let riskLevel: 'low' | 'medium' | 'high';
        if (herdingIntensity >= 0.9) riskLevel = 'high';
        else if (herdingIntensity >= 0.8) riskLevel = 'medium';
        else riskLevel = 'low';

        opportunities.push({
          marketId: m.id,
          question: m.question,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
          volume24h: m.volume24h,
          herdingSide,
          herdingIntensity,
          contrarianEdge,
          riskLevel,
        });
      }

      // Sort by herding intensity (lower = safer contrarian bet)
      opportunities.sort((a, b) => a.herdingIntensity - b.herdingIntensity);

      return successResult(this.name, task.id, {
        scanned: markets.length,
        opportunities: opportunities.length,
        results: opportunities,
        note: opportunities.length === 0
          ? `No contrarian opportunities found (herding >= ${minHerding}, price <= ${maxPrice})`
          : `Found ${opportunities.length} markets with crowd herding. Lower herdingIntensity + "low" risk = safer contrarian bets. Use LLM estimation to validate before trading.`,
      }, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
