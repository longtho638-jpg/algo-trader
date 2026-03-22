// Pre-built job definitions for the algo-trade platform
import { logger } from '../core/logger.js';
import type { JobScheduler, JobFn } from './job-scheduler.js';
import { setHedgeResults } from '../dashboard/dashboard-server.js';

export interface JobDefinition {
  name: string;
  description: string;
  /** Human-readable interval expression accepted by parseInterval() */
  interval: string;
  handler: JobFn;
  enabled: boolean;
}

// ── Built-in handlers ──────────────────────────────────────────────────────

/** Generate daily P&L summary across all strategies. */
const dailyPnlReportHandler: JobFn = async () => {
  logger.info('Generating daily P&L report', 'dailyPnlReport');
  // Placeholder: real impl would query trade history + compute PnL
  const summary = { date: new Date().toISOString().slice(0, 10), realizedPnl: '0', unrealizedPnl: '0' };
  logger.info('Daily P&L report complete', 'dailyPnlReport', summary);
};

/** Check portfolio allocation drift and rebalance if threshold exceeded. */
const portfolioRebalanceHandler: JobFn = async () => {
  logger.info('Checking portfolio drift', 'portfolioRebalance');
  // Placeholder: real impl would compare current vs target allocations
  logger.info('Portfolio rebalance check complete', 'portfolioRebalance');
};

/** Verify all platform components are healthy (exchanges, DB, strategies). */
const healthCheckHandler: JobFn = async () => {
  logger.debug('Running health check', 'healthCheck');
  const components = ['exchange-binance', 'exchange-polymarket', 'database', 'strategy-runner'];
  const results: Record<string, boolean> = {};
  for (const c of components) results[c] = true; // Placeholder
  const allHealthy = Object.values(results).every(Boolean);
  if (!allHealthy) {
    logger.warn('Health check: some components unhealthy', 'healthCheck', results);
  } else {
    logger.debug('Health check: all components healthy', 'healthCheck');
  }
};

/** Archive audit log entries older than 30 days. */
const auditCleanupHandler: JobFn = async () => {
  logger.info('Running audit log cleanup', 'auditCleanup');
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  // Placeholder: real impl would delete/archive DB rows older than cutoff
  logger.info('Audit cleanup complete', 'auditCleanup', { cutoff: cutoff.toISOString() });
};

/** Scan markets for arbitrage / entry opportunities. */
const marketScanHandler: JobFn = async () => {
  logger.debug('Scanning markets for opportunities', 'marketScan');
  // Placeholder: real impl would query order books + run signal filters
  logger.debug('Market scan complete', 'marketScan');
};

/** PolyClaw hedge scan: discover hedge opportunities and push to dashboard */
const hedgeScanHandler: JobFn = async () => {
  logger.info('Running PolyClaw hedge scan', 'hedgeScan');
  try {
    // Dynamic import to avoid circular deps and allow optional AI gateway
    const { HedgeScanner } = await import('../polymarket/hedge-scanner.js');
    const { AiRouter } = await import('../openclaw/ai-router.js');
    const ai = new AiRouter();
    const scanner = new HedgeScanner(ai, { maxTier: 2 });
    const results = await scanner.scanTopMarkets(10);

    // Flatten portfolios for dashboard
    const flat = results.flatMap(r =>
      r.portfolios.map(p => ({
        tier: p.tier,
        coverage: p.coverage,
        profitPct: p.profitPct,
        targetQuestion: r.targetMarket.question,
        coverQuestion: p.coverMarket.question,
        targetId: r.targetMarket.id,
        coverId: p.coverMarket.id,
      }))
    );
    setHedgeResults(flat);
    logger.info('PolyClaw hedge scan complete', 'hedgeScan', { portfolios: flat.length });
  } catch (err) {
    logger.warn('Hedge scan job failed (AI gateway may be offline)', 'hedgeScan', { err: String(err) });
    // Non-fatal: dashboard shows stale data
  }
};

// ── Registry ───────────────────────────────────────────────────────────────

export const BUILT_IN_JOBS: JobDefinition[] = [
  {
    name: 'dailyPnlReport',
    description: 'Generate P&L summary across all strategies once per day',
    interval: 'daily at 09:00',
    handler: dailyPnlReportHandler,
    enabled: true,
  },
  {
    name: 'portfolioRebalance',
    description: 'Check allocation drift and rebalance portfolio every 4 hours',
    interval: 'every 4h',
    handler: portfolioRebalanceHandler,
    enabled: true,
  },
  {
    name: 'healthCheck',
    description: 'Verify all platform components are healthy every 5 minutes',
    interval: 'every 5m',
    handler: healthCheckHandler,
    enabled: true,
  },
  {
    name: 'auditCleanup',
    description: 'Archive audit log entries older than 30 days, runs weekly',
    interval: 'every 7d',
    handler: auditCleanupHandler,
    enabled: true,
  },
  {
    name: 'marketScan',
    description: 'Scan markets for trading opportunities every minute',
    interval: 'every 1m',
    handler: marketScanHandler,
    enabled: true,
  },
  {
    name: 'hedgeScan',
    description: 'PolyClaw AI hedge discovery — scan trending markets every 15 minutes',
    interval: 'every 15m',
    handler: hedgeScanHandler,
    enabled: true,
  },
];

/**
 * Register all enabled built-in jobs with the provided scheduler.
 * Disabled jobs are skipped with a debug log.
 */
export function registerBuiltInJobs(scheduler: JobScheduler): void {
  for (const job of BUILT_IN_JOBS) {
    if (!job.enabled) {
      logger.debug(`Built-in job disabled, skipping`, 'JobRegistry', { name: job.name });
      continue;
    }
    scheduler.schedule(job.name, job.interval, job.handler);
    logger.debug(`Built-in job registered`, 'JobRegistry', { name: job.name, interval: job.interval });
  }
  const enabled = BUILT_IN_JOBS.filter(j => j.enabled).length;
  logger.info(`Registered ${enabled}/${BUILT_IN_JOBS.length} built-in jobs`, 'JobRegistry');
}
