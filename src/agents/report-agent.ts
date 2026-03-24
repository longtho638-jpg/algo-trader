// Report Agent — queries database for trade summary, PnL, and win rate
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { logger } from '../core/logger.js';

export class ReportAgent implements SpecialistAgent {
  readonly name = 'report';
  readonly description = 'Generates trade performance report from database: PnL, win rate, trade summary';
  readonly taskTypes = ['report' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'report';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { period = 'all' } = task.payload as { period?: string };
      const dbPath = process.env.DB_PATH ?? 'data/algo-trade.db';

      logger.info('Report agent executing', 'ReportAgent', { period, dbPath });

      // Lazy import — requires better-sqlite3 runtime
      const { getDatabase } = await import('../data/database.js');
      const db = getDatabase(dbPath);

      const trades = db.getTrades(undefined, 500);
      const positions = db.getOpenPositions();

      // Compute summary stats
      const totalTrades = trades.length;
      const tradesWithPnl = trades.filter(t => t.pnl !== null);
      const wins = tradesWithPnl.filter(t => parseFloat(t.pnl!) > 0);
      const losses = tradesWithPnl.filter(t => parseFloat(t.pnl!) <= 0);

      const totalPnl = tradesWithPnl.reduce((s, t) => s + parseFloat(t.pnl!), 0);
      const winRate = tradesWithPnl.length > 0 ? wins.length / tradesWithPnl.length : 0;
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + parseFloat(t.pnl!), 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl!), 0) / losses.length) : 0;

      return successResult(this.name, task.id, {
        period,
        summary: {
          totalTrades,
          tradesWithPnl: tradesWithPnl.length,
          wins: wins.length,
          losses: losses.length,
          winRate: parseFloat(winRate.toFixed(4)),
          totalPnl: parseFloat(totalPnl.toFixed(4)),
          avgWin: parseFloat(avgWin.toFixed(4)),
          avgLoss: parseFloat(avgLoss.toFixed(4)),
          profitFactor: avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(3)) : null,
        },
        openPositions: positions.length,
        recentTrades: trades.slice(0, 10),
      }, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
