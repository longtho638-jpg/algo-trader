/**
 * Risk Dashboard CLI — Real-time risk monitoring commands.
 *
 * Commands:
 *   risk:dashboard live    — Real-time updating UI (refreshes every 2s)
 *   risk:dashboard status  — Quick snapshot
 *   risk:dashboard report  — Export report (JSON/text)
 *
 * Usage:
 *   pnpm risk:dashboard live
 *   pnpm risk:dashboard status
 *   pnpm risk:dashboard report --format=json
 */

import { Command } from 'commander';
import * as chalk from 'chalk';
import { renderDashboard, renderStatusSnapshot, type DashboardData } from '../ui/risk-dashboard-ui';
import { PnLTracker } from '../risk/pnl-tracker';
import { CircuitBreaker } from '../risk/circuit-breaker';
import { DrawdownTracker } from '../risk/drawdown-tracker';
import { SharpeCalculator } from '../risk/sharpe-calculator';
import { RollingMetrics } from '../risk/rolling-metrics';
import { RiskEventEmitter } from '../core/risk-events';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Build dashboard data from risk modules
 */
function buildDashboardData(
  pnlTracker: PnLTracker,
  circuitBreaker: CircuitBreaker,
  drawdownTracker: DrawdownTracker,
  sharpeCalc: SharpeCalculator,
  rollingMetrics: RollingMetrics
): DashboardData {
  // Get PnL data
  const totalPnl = pnlTracker.getTotalPnL();
  const dailyPnl = pnlTracker.getDailyPnL();
  const rollingPnl = pnlTracker.getRollingPnL();
  const dailyPnlPct = rollingPnl.pnl24h !== 0 ? rollingPnl.pnl24h / 10000 : 0; // Assume 10k base

  // Get circuit state
  const circuitMetrics = circuitBreaker.getMetrics();

  // Get drawdown
  const drawdownMetrics = drawdownTracker.getMetrics();

  // Calculate Sharpe ratios from recent returns
  const returns = rollingMetrics.getReturns(24); // Last 24 hours
  const sharpeResult = returns.length > 1 ? sharpeCalc.calculate(returns) : undefined;

  // Get position limits
  const positions = pnlTracker.getAllStrategyPnL().map(strategy => {
    const limit = 600; // Default limit per strategy
    const current = Math.abs(strategy.totalPnl);
    return {
      name: strategy.strategy,
      current,
      limit,
      pct: (current / limit) * 100,
    };
  });

  // Get recent alerts from risk emitter
  const alerts = getRecentAlerts();

  return {
    totalPnl,
    dailyPnl,
    dailyPnlPct,
    drawdownPct: drawdownMetrics.drawdownPct / 100,
    circuitState: circuitMetrics.currentState as 'CLOSED' | 'WARNING' | 'TRIPPED',
    sharpe24h: sharpeResult?.sharpeRatio ?? 0,
    sortino24h: sharpeResult?.sortinoRatio ?? 0,
    calmar24h: sharpeResult?.calmarRatio ?? 0,
    positions,
    alerts,
  };
}

/**
 * Get recent alerts from RiskEventEmitter
 */
function getRecentAlerts(): Array<{ time: string; severity: 'info' | 'warning' | 'critical'; message: string }> {
  const emitter = RiskEventEmitter.getInstance();
  const recent = emitter.getLog(undefined, 5);

  return recent.map(entry => ({
    time: new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    severity: entry.event.severity as 'info' | 'warning' | 'critical',
    message: entry.event.message,
  }));
}

/**
 * Live dashboard with auto-refresh
 */
async function runLiveDashboard(): Promise<void> {
  const pnlTracker = new PnLTracker();
  const circuitBreaker = new CircuitBreaker({ breakerId: 'main' });
  const drawdownTracker = new DrawdownTracker({ initialValue: 10000 });
  const sharpeCalc = new SharpeCalculator();
  const rollingMetrics = new RollingMetrics(undefined, { '24h': { minSamples: 5 } });

  logger.info('Starting Risk Dashboard (live mode)...');
  logger.info('Press Ctrl+C to exit\n');

  // Clear screen and hide cursor
  process.stdout.write('\x1B[2J\x1B[?25l');

  let lastUpdate = 0;
  const updateInterval = 2000; // 2 seconds

  // Simulate data updates (in real app, subscribe to risk events)
  const simulateData = () => {
    const now = Date.now();
    const baseValue = 10000 + Math.sin(now / 10000) * 500 + (Math.random() - 0.5) * 200;

    // Update trackers
    drawdownTracker.updateValue(baseValue);
    circuitBreaker.updateValue(baseValue);

    // Simulate some PnL
    const strategyPnl = pnlTracker.getStrategyPnL('ListingArb');
    if (strategyPnl) {
      // In real app, this would come from actual trades
    }
  };

  // Render loop
  const renderLoop = () => {
    simulateData();

    const data = buildDashboardData(
      pnlTracker,
      circuitBreaker,
      drawdownTracker,
      sharpeCalc,
      rollingMetrics
    );

    // Move cursor to top and render
    process.stdout.write('\x1B[H');
    const output = renderDashboard(data);
    process.stdout.write(output + '\n');
    process.stdout.write(chalk.gray('  Auto-refresh: 2s | Press Ctrl+C to exit\n'));
  };

  // Initial render
  renderLoop();

  // Update every 2 seconds
  setInterval(() => {
    renderLoop();
  }, updateInterval);

  // Cleanup on exit
  process.on('SIGINT', () => {
    process.stdout.write('\x1B[?25h'); // Show cursor
    logger.info('\nDashboard closed.');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.stdout.write('\x1B[?25h');
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

/**
 * Quick status snapshot
 */
function showStatusSnapshot(): void {
  const pnlTracker = new PnLTracker();
  const circuitBreaker = new CircuitBreaker({ breakerId: 'main' });
  const drawdownTracker = new DrawdownTracker({ initialValue: 10000 });
  const sharpeCalc = new SharpeCalculator();
  const rollingMetrics = new RollingMetrics(undefined, { '24h': { minSamples: 5 } });

  const data = buildDashboardData(
    pnlTracker,
    circuitBreaker,
    drawdownTracker,
    sharpeCalc,
    rollingMetrics
  );

  const output = renderStatusSnapshot(data);
  console.log(output);
}

/**
 * Export report to file
 */
function exportReport(format: 'json' | 'text', outputFile?: string): void {
  const pnlTracker = new PnLTracker();
  const circuitBreaker = new CircuitBreaker({ breakerId: 'main' });
  const drawdownTracker = new DrawdownTracker({ initialValue: 10000 });
  const sharpeCalc = new SharpeCalculator();
  const rollingMetrics = new RollingMetrics(undefined, { '24h': { minSamples: 5 } });

  const data = buildDashboardData(
    pnlTracker,
    circuitBreaker,
    drawdownTracker,
    sharpeCalc,
    rollingMetrics
  );

  let content: string;
  let extension: string;

  if (format === 'json') {
    content = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data,
    }, null, 2);
    extension = 'json';
  } else {
    content = renderStatusSnapshot(data);
    extension = 'txt';
  }

  const filePath = outputFile || `risk-report-${Date.now()}.${extension}`;
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  fs.writeFileSync(absolutePath, content);
  logger.info(`Report exported to: ${absolutePath}`);
}

/**
 * Register risk:dashboard command with Commander
 */
export function registerRiskDashboardCommand(program: Command): void {
  const dashboardCommand = program
    .command('risk:dashboard')
    .description('Risk monitoring dashboard');

  dashboardCommand
    .argument('[mode]', 'Dashboard mode: live, status, report', 'status')
    .option('--format <type>', 'Report format: json, text', 'text')
    .option('--output <file>', 'Output file for report export')
    .action(async (mode: string, options: any) => {
      if (mode === 'live') {
        await runLiveDashboard();
      } else if (mode === 'status') {
        showStatusSnapshot();
      } else if (mode === 'report') {
        exportReport(options.format, options.output);
      } else {
        logger.error(`Unknown mode: ${mode}. Use: live, status, or report`);
        process.exit(1);
      }
    });

  // Sub-commands for alternative syntax
  dashboardCommand
    .command('live')
    .description('Real-time updating dashboard')
    .action(async () => {
      await runLiveDashboard();
    });

  dashboardCommand
    .command('status')
    .description('Quick status snapshot')
    .action(() => {
      showStatusSnapshot();
    });

  dashboardCommand
    .command('report')
    .description('Export risk report')
    .option('--format <type>', 'Report format: json, text', 'text')
    .option('--output <file>', 'Output file path')
    .action((options: any) => {
      exportReport(options.format, options.output);
    });
}
