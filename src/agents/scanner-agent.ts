// Scanner Agent — returns market categories and scanner config (no live deps)
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { logger } from '../core/logger.js';

const MARKET_CATEGORIES = [
  { id: 'polymarket', label: 'Polymarket Prediction Markets', markets: ['politics', 'crypto', 'sports', 'science'] },
  { id: 'cex', label: 'Centralized Exchanges', markets: ['spot', 'futures', 'options'] },
  { id: 'dex', label: 'Decentralized Exchanges', markets: ['uniswap-v4', 'curve', 'balancer'] },
];

const SCANNER_CONFIG = {
  minEdge: parseFloat(process.env.MIN_EDGE ?? '0.05'),
  minConfidence: parseFloat(process.env.MIN_CONFIDENCE ?? '0.6'),
  maxMarketsPerScan: parseInt(process.env.MAX_MARKETS ?? '50', 10),
  cooldownMs: parseInt(process.env.SCANNER_COOLDOWN_MS ?? '30000', 10),
};

export class ScannerAgent implements SpecialistAgent {
  readonly name = 'scanner';
  readonly description = 'Returns market categories and scanner configuration';
  readonly taskTypes = ['scan' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'scan';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { category, limit = 10 } = task.payload as { category?: string; limit?: number };

      const filtered = category
        ? MARKET_CATEGORIES.filter(c => c.id === category)
        : MARKET_CATEGORIES;

      logger.info('Scanner agent executing', 'ScannerAgent', { category, limit });

      return successResult(this.name, task.id, {
        categories: filtered,
        config: SCANNER_CONFIG,
        note: 'Live market scan requires active exchange connections. Use bot:start to enable live scanning.',
      }, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
