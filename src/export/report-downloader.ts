// Downloadable report generation — wraps export data with filename + content-type metadata
import type { TradeResult, PnlSnapshot } from '../core/types.js';
import {
  exportTradesToCsv,
  exportTradesToJson,
  exportTradesToTsv,
  exportSnapshotsToCsv,
  exportSnapshotsToJson,
  type ExportFormat,
} from './trade-exporter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DownloadableReport {
  filename: string;
  contentType: string;
  data: string;
}

/** Portfolio summary shape passed to generatePortfolioReport */
export interface PortfolioSummary {
  totalEquity: string;
  totalUnrealizedPnl: string;
  openPositions: number;
  strategies: Array<{
    name: string;
    allocation: string;
    tradeCount: number;
  }>;
}

// ─── Content-type map ─────────────────────────────────────────────────────────

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
  tsv: 'text/tab-separated-values',
};

function ext(format: ExportFormat): string {
  return format; // 'csv' | 'json' | 'tsv'
}

// ─── Report generators ────────────────────────────────────────────────────────

/** Generate a downloadable trade history file in the requested format */
export function generateTradeReport(
  trades: TradeResult[],
  format: ExportFormat,
): DownloadableReport {
  const ts = new Date().toISOString().slice(0, 10);
  let data: string;

  switch (format) {
    case 'csv':
      data = exportTradesToCsv(trades);
      break;
    case 'tsv':
      data = exportTradesToTsv(trades);
      break;
    case 'json':
    default:
      data = exportTradesToJson(trades, true);
  }

  return {
    filename: `trades-${ts}.${ext(format)}`,
    contentType: CONTENT_TYPES[format],
    data,
  };
}

/** Generate a downloadable P&L snapshot report */
export function generatePnlReport(
  snapshots: PnlSnapshot[],
  format: ExportFormat,
): DownloadableReport {
  const ts = new Date().toISOString().slice(0, 10);
  let data: string;

  switch (format) {
    case 'csv':
      data = exportSnapshotsToCsv(snapshots);
      break;
    case 'json':
    default:
      // TSV not implemented for snapshots — fall back to JSON
      data = exportSnapshotsToJson(snapshots, true);
  }

  return {
    filename: `pnl-${ts}.${ext(format)}`,
    contentType: CONTENT_TYPES[format],
    data,
  };
}

/** Generate a downloadable portfolio overview report */
export function generatePortfolioReport(
  summary: PortfolioSummary,
  format: ExportFormat,
): DownloadableReport {
  const ts = new Date().toISOString().slice(0, 10);
  let data: string;

  if (format === 'csv') {
    const header = 'Strategy,Allocation,TradeCount';
    const rows = summary.strategies.map(
      (s) => `${s.name},${s.allocation},${s.tradeCount}`,
    );
    const meta = [
      `# Portfolio Report ${ts}`,
      `# TotalEquity: ${summary.totalEquity}`,
      `# UnrealizedPnL: ${summary.totalUnrealizedPnl}`,
      `# OpenPositions: ${summary.openPositions}`,
      '',
    ];
    data = [...meta, header, ...rows].join('\n');
  } else {
    data = JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ...summary,
      },
      null,
      2,
    );
  }

  return {
    filename: `portfolio-${ts}.${ext(format)}`,
    contentType: CONTENT_TYPES[format],
    data,
  };
}
