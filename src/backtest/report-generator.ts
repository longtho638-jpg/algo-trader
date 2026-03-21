// Backtest performance analytics and report generation
// Accepts BacktestResult from simulator and produces human-readable text reports

import type { TradeResult } from '../core/types.js';
import type { BacktestResult } from './simulator.js';
import { equityToReturns, calculateSharpeRatio, calculateMaxDrawdown } from './backtest-math-helpers.js';

/** Complete performance report for a backtest run (legacy: computed from raw trades+curve) */
export interface BacktestReport {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  initialCapital: number;
  finalEquity: number;
  totalFees: number;
}

// Re-export math helpers for consumers that previously imported from this module
export { calculateSharpeRatio, calculateMaxDrawdown } from './backtest-math-helpers.js';

// ─── Legacy generateReport path ───────────────────────────────────────────────

/** FIFO P&L matching for buy/sell pairs */
function computeTradePnl(trades: TradeResult[]): number[] {
  const pnls: number[] = [];
  const buyStack: { price: number; size: number }[] = [];
  for (const trade of trades) {
    const price = parseFloat(trade.fillPrice);
    const size = parseFloat(trade.fillSize);
    if (trade.side === 'buy') {
      buyStack.push({ price, size });
    } else if (trade.side === 'sell' && buyStack.length > 0) {
      const entry = buyStack.shift()!;
      pnls.push((price - entry.price) * Math.min(entry.size, size));
    }
  }
  return pnls;
}

/** Build BacktestReport from raw trades + equity curve (legacy path) */
export function generateReport(
  trades: TradeResult[],
  equityCurve: number[],
  initialCapital: number,
): BacktestReport {
  const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1] : initialCapital;
  const totalReturn = initialCapital > 0 ? (finalEquity - initialCapital) / initialCapital : 0;
  const totalFees = trades.reduce((s, t) => s + parseFloat(t.fees), 0);

  const pnls = computeTradePnl(trades);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);

  const winRate = pnls.length > 0 ? wins.length / pnls.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + p, 0) / losses.length) : 0;
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  return {
    totalReturn,
    sharpeRatio: calculateSharpeRatio(equityToReturns(equityCurve)),
    maxDrawdown: calculateMaxDrawdown(equityCurve),
    winRate, tradeCount: trades.length,
    avgWin, avgLoss, profitFactor,
    initialCapital, finalEquity, totalFees,
  };
}

// ─── Text report from BacktestResult ─────────────────────────────────────────

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: number, d = 2) => isFinite(v) ? v.toFixed(d) : v > 0 ? '+Inf' : '-Inf';

/** Equity curve sample: evenly spaced data points for display */
function sampleEquityCurve(curve: number[], maxPoints = 10): { index: number; equity: number }[] {
  if (curve.length === 0) return [];
  const step = Math.max(1, Math.floor(curve.length / maxPoints));
  const points: { index: number; equity: number }[] = [];
  for (let i = 0; i < curve.length; i += step) {
    points.push({ index: i, equity: parseFloat(curve[i].toFixed(2)) });
  }
  // Always include final point
  const last = curve.length - 1;
  if (points[points.length - 1].index !== last) {
    points.push({ index: last, equity: parseFloat(curve[last].toFixed(2)) });
  }
  return points;
}

/** Format trade log entries (capped at 20 for readability) */
function formatTradeLog(trades: TradeResult[]): string[] {
  const displayed = trades.slice(0, 20);
  const lines = displayed.map((t, i) => {
    const ts = new Date(t.timestamp).toISOString().slice(0, 10);
    return `  ${String(i + 1).padStart(3)}. [${ts}] ${t.side.toUpperCase().padEnd(4)} @ ${t.fillPrice}  size=${t.fillSize}  fee=${t.fees}`;
  });
  if (trades.length > 20) {
    lines.push(`  ... and ${trades.length - 20} more trades`);
  }
  return lines;
}

/**
 * Generate a complete text report from a BacktestResult.
 * Includes summary stats, trade log, and equity curve data points.
 */
export function formatBacktestResult(result: BacktestResult): string {
  const curveSamples = sampleEquityCurve(result.equityCurve);
  const curveLines = curveSamples.map(
    p => `    [${String(p.index).padStart(4)}] ${usd(p.equity)}`,
  );

  const sections = [
    '═══════════════════════════════════════════',
    '         BACKTEST PERFORMANCE REPORT       ',
    '═══════════════════════════════════════════',
    `  Initial Capital  : ${usd(result.initialCapital)}`,
    `  Final Equity     : ${usd(result.finalEquity)}`,
    `  Total Return     : ${pct(result.totalReturn)}`,
    `  Total Fees       : ${usd(result.totalFees)}`,
    '───────────────────────────────────────────',
    `  Trade Count      : ${result.tradeCount}`,
    `  Win Rate         : ${pct(result.winRate)}`,
    `  Profit Factor    : ${num(result.profitFactor)}`,
    '───────────────────────────────────────────',
    `  Sharpe Ratio     : ${num(result.sharpeRatio)}`,
    `  Max Drawdown     : ${pct(result.maxDrawdown)}`,
    '───────────────────────────────────────────',
    '  EQUITY CURVE (sampled):',
    ...curveLines,
    '───────────────────────────────────────────',
    `  TRADE LOG (${result.trades.length} total):`,
    ...formatTradeLog(result.trades),
    '═══════════════════════════════════════════',
  ];

  return sections.join('\n');
}

/** Legacy formatter kept for backward compatibility */
export function formatReport(report: BacktestReport): string {
  return [
    '═══════════════════════════════════════',
    '         BACKTEST PERFORMANCE REPORT    ',
    '═══════════════════════════════════════',
    `  Initial Capital  : ${usd(report.initialCapital)}`,
    `  Final Equity     : ${usd(report.finalEquity)}`,
    `  Total Return     : ${pct(report.totalReturn)}`,
    `  Total Fees       : ${usd(report.totalFees)}`,
    '───────────────────────────────────────',
    `  Trade Count      : ${report.tradeCount}`,
    `  Win Rate         : ${pct(report.winRate)}`,
    `  Avg Win          : ${usd(report.avgWin)}`,
    `  Avg Loss         : ${usd(report.avgLoss)}`,
    `  Profit Factor    : ${num(report.profitFactor)}`,
    '───────────────────────────────────────',
    `  Sharpe Ratio     : ${num(report.sharpeRatio)}`,
    `  Max Drawdown     : ${pct(report.maxDrawdown)}`,
    '═══════════════════════════════════════',
  ].join('\n');
}
