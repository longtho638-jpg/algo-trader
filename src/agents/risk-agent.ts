// Risk Agent — returns risk limits, Kelly fraction info, and position sizing rules
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { RiskManager, kellyFraction } from '../core/risk-manager.js';
import { logger } from '../core/logger.js';
import type { RiskLimits } from '../core/types.js';

function buildLimitsFromEnv(): RiskLimits {
  return {
    maxPositionSize: process.env.MAX_POSITION_SIZE ?? '100',
    maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN ?? '0.20'),
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS ?? '5', 10),
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT ?? '0.05'),
    maxLeverage: parseFloat(process.env.MAX_LEVERAGE ?? '1'),
  };
}

export class RiskAgent implements SpecialistAgent {
  readonly name = 'risk';
  readonly description = 'Returns risk limits, Kelly fraction info, and position sizing rules';
  readonly taskTypes = ['risk' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'risk';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const limits = buildLimitsFromEnv();
      const manager = new RiskManager(limits);

      // Example Kelly calc using historical defaults (14.6% avg edge from paper trades)
      const winRate = parseFloat(process.env.HISTORICAL_WIN_RATE ?? '0.55');
      const avgWin = parseFloat(process.env.HISTORICAL_AVG_WIN ?? '1.146');
      const avgLoss = parseFloat(process.env.HISTORICAL_AVG_LOSS ?? '1.0');
      const kelly = kellyFraction(winRate, avgWin, avgLoss);

      const capital = process.env.PAPER_CAPITAL ?? '1000';
      const recommendedSize = manager.getRecommendedSize(capital, winRate, avgWin, avgLoss);

      logger.info('Risk agent executing', 'RiskAgent', { kelly: kelly.toFixed(4), recommendedSize });

      return successResult(this.name, task.id, {
        limits,
        kelly: {
          fraction: kelly,
          halfKelly: kelly * 0.5,
          winRate,
          avgWin,
          avgLoss,
          note: 'Half-Kelly applied for safety (capped at 25%)',
        },
        positioning: {
          capital,
          recommendedSize,
          stopLossPrice: `${(limits.stopLossPercent * 100).toFixed(1)}% below entry`,
        },
      }, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
