// REST API handlers for data export endpoints — file download responses
// Pattern mirrors src/api/routes.ts: (req, res, deps) pure node:http, no framework
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TradeResult, PnlSnapshot, StrategyName } from '../core/types.js';
import { filterTradesByDateRange, filterTradesByStrategy, type ExportFormat } from './trade-exporter.js';
import {
  generateTradeReport,
  generatePnlReport,
  generatePortfolioReport,
  type PortfolioSummary,
} from './report-downloader.js';

// ─── Deps interface ───────────────────────────────────────────────────────────

/** Minimal data provider interface — decouples from TradingEngine for testability */
export interface ExportDeps {
  getTrades(): TradeResult[];
  getPnlSnapshots(): PnlSnapshot[];
  getPortfolioSummary(): PortfolioSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_FORMATS = new Set<string>(['csv', 'json', 'tsv']);

function parseFormat(raw: string | null): ExportFormat {
  return VALID_FORMATS.has(raw ?? '') ? (raw as ExportFormat) : 'csv';
}

/** Send a file download response with Content-Disposition header */
function sendFile(
  res: ServerResponse,
  filename: string,
  contentType: string,
  data: string,
): void {
  const body = Buffer.from(data, 'utf8');
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': body.byteLength,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  const body = JSON.stringify({ error: message });
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/** Parse URLSearchParams from a raw URL string safely */
function parseQuery(url: string | undefined): URLSearchParams {
  try {
    const full = `http://x${url ?? ''}`;
    return new URL(full).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

// ─── Endpoint handlers ────────────────────────────────────────────────────────

/**
 * GET /api/export/trades
 * Query params: format=csv|json|tsv, from=<ms>, to=<ms>, strategy=<name>
 */
function handleExportTrades(req: IncomingMessage, res: ServerResponse, deps: ExportDeps): void {
  const q = parseQuery(req.url);
  const format = parseFormat(q.get('format'));

  let trades = deps.getTrades();

  const fromRaw = q.get('from');
  const toRaw = q.get('to');
  if (fromRaw && toRaw) {
    const from = parseInt(fromRaw, 10);
    const to = parseInt(toRaw, 10);
    if (!isNaN(from) && !isNaN(to)) {
      trades = filterTradesByDateRange(trades, from, to);
    }
  }

  const strategy = q.get('strategy');
  if (strategy) {
    trades = filterTradesByStrategy(trades, strategy as StrategyName);
  }

  const report = generateTradeReport(trades, format);
  sendFile(res, report.filename, report.contentType, report.data);
}

/**
 * GET /api/export/pnl
 * Query params: format=csv|json, period=daily (reserved for future filtering)
 */
function handleExportPnl(req: IncomingMessage, res: ServerResponse, deps: ExportDeps): void {
  const q = parseQuery(req.url);
  const format = parseFormat(q.get('format'));

  const snapshots = deps.getPnlSnapshots();
  const report = generatePnlReport(snapshots, format);
  sendFile(res, report.filename, report.contentType, report.data);
}

/**
 * GET /api/export/portfolio
 * Query params: format=csv|json
 */
function handleExportPortfolio(req: IncomingMessage, res: ServerResponse, deps: ExportDeps): void {
  const q = parseQuery(req.url);
  const format = parseFormat(q.get('format'));

  const summary = deps.getPortfolioSummary();
  const report = generatePortfolioReport(summary, format);
  sendFile(res, report.filename, report.contentType, report.data);
}

// ─── Main export router ───────────────────────────────────────────────────────

/**
 * Route /api/export/* requests.
 * Call this from the main handleRequest router for any pathname starting with /api/export.
 */
export function handleExportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ExportDeps,
): void {
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  // Extract pathname without query string
  const pathname = (req.url ?? '').split('?')[0];

  if (pathname === '/api/export/trades') {
    handleExportTrades(req, res, deps);
    return;
  }

  if (pathname === '/api/export/pnl') {
    handleExportPnl(req, res, deps);
    return;
  }

  if (pathname === '/api/export/portfolio') {
    handleExportPortfolio(req, res, deps);
    return;
  }

  sendError(res, 404, 'Export endpoint not found');
}
