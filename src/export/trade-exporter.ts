// Trade data export utilities — CSV, JSON, TSV with date/strategy filters
// No external dependencies, pure string manipulation
import type { TradeResult, PnlSnapshot, StrategyName } from '../core/types.js';

// CSV headers matching TradeResult fields
const TRADE_HEADERS = ['Date', 'Strategy', 'Side', 'Symbol', 'Price', 'Size', 'Fees', 'P&L'];

/** Escape a CSV cell value (wrap in quotes if contains comma/quote/newline) */
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Format a unix timestamp (ms) to ISO date string */
function formatDate(ts: number): string {
  return new Date(ts).toISOString();
}

/**
 * Convert a TradeResult to a row array.
 * P&L is not stored per-trade in TradeResult; derive as negative fees approximation.
 * Consumers can post-process if richer P&L is available.
 */
function tradeToRow(t: TradeResult): string[] {
  return [
    formatDate(t.timestamp),
    t.strategy,
    t.side,
    t.marketId,
    t.fillPrice,
    t.fillSize,
    t.fees,
    `-${t.fees}`, // approximation: realized P&L offset by fees
  ];
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

/** Filter trades within [from, to] unix ms range (inclusive) */
export function filterTradesByDateRange(
  trades: TradeResult[],
  from: number,
  to: number,
): TradeResult[] {
  return trades.filter((t) => t.timestamp >= from && t.timestamp <= to);
}

/** Filter trades by exact strategy name */
export function filterTradesByStrategy(
  trades: TradeResult[],
  strategy: StrategyName,
): TradeResult[] {
  return trades.filter((t) => t.strategy === strategy);
}

// ─── Export formatters ────────────────────────────────────────────────────────

/** Export trades as CSV string with headers */
export function exportTradesToCsv(trades: TradeResult[]): string {
  const header = TRADE_HEADERS.map(escapeCsv).join(',');
  const rows = trades.map((t) => tradeToRow(t).map(escapeCsv).join(','));
  return [header, ...rows].join('\n');
}

/** Export trades as JSON string, optionally pretty-printed */
export function exportTradesToJson(trades: TradeResult[], pretty = false): string {
  return pretty ? JSON.stringify(trades, null, 2) : JSON.stringify(trades);
}

/** Export trades as TSV (tab-separated values) with headers */
export function exportTradesToTsv(trades: TradeResult[]): string {
  const header = TRADE_HEADERS.join('\t');
  const rows = trades.map((t) => tradeToRow(t).join('\t'));
  return [header, ...rows].join('\n');
}

// ─── PnL snapshot export ──────────────────────────────────────────────────────

const PNL_HEADERS = ['Date', 'Equity', 'PeakEquity', 'Drawdown', 'RealizedPnL', 'UnrealizedPnL', 'TradeCount', 'WinCount'];

function snapshotToRow(s: PnlSnapshot): string[] {
  return [
    formatDate(s.timestamp),
    s.equity,
    s.peakEquity,
    s.drawdown.toFixed(6),
    s.realizedPnl,
    s.unrealizedPnl,
    String(s.tradeCount),
    String(s.winCount),
  ];
}

export function exportSnapshotsToCsv(snapshots: PnlSnapshot[]): string {
  const header = PNL_HEADERS.join(',');
  const rows = snapshots.map((s) => snapshotToRow(s).map(escapeCsv).join(','));
  return [header, ...rows].join('\n');
}

export function exportSnapshotsToJson(snapshots: PnlSnapshot[], pretty = false): string {
  return pretty ? JSON.stringify(snapshots, null, 2) : JSON.stringify(snapshots);
}

export type ExportFormat = 'csv' | 'json' | 'tsv';
