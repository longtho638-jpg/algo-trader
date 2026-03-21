// HTTP server for dashboard: serves static files + JSON API endpoints
// Pure node:http + node:fs — no Express
import { createServer as createHttpServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DashboardDataProvider } from './dashboard-data.js';

/** Map file extensions to MIME content-types */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
};

const PUBLIC_DIR = join(fileURLToPath(import.meta.url), '..', 'public');

// ── Revenue summary (Sprint 37) ─────────────────────────────────────────────

function getRevenueSummary() {
  // Demo revenue data — in production, wired to AdminAnalytics + UserStore
  const tiers = { free: 42, pro: 18, enterprise: 3 };
  const mrr = tiers.pro * 29 + tiers.enterprise * 199;
  const arr = mrr * 12;
  const target = 1_000_000;
  const timeline: { date: string; revenue: number }[] = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    // Simulate growth curve
    const base = mrr * (1 - i * 0.015);
    timeline.push({ date: d.toISOString().slice(0, 10), revenue: Math.max(0, Math.round(base)) });
  }
  return {
    mrr, arr, arrTarget: target,
    arrProgress: Math.round((arr / target) * 10000) / 100,
    totalUsers: tiers.free + tiers.pro + tiers.enterprise,
    tiers,
    marketplaceRevenue: 1240, // cents from strategy sales
    timeline,
  };
}

// ── Marketplace browse (Sprint 38) ──────────────────────────────────────────

const DEMO_STRATEGIES = [
  { id: 'strat-poly-arb', name: 'Polymarket Arbitrage', author: 'AlphaWhale', category: 'polymarket', priceCents: 4900, rating: 4.8, downloads: 156, description: 'Cross-market arbitrage exploiting price discrepancies between Polymarket and other prediction platforms.' },
  { id: 'strat-momentum', name: 'Momentum Scalper Pro', author: 'PolySniper', category: 'polymarket', priceCents: 2900, rating: 4.5, downloads: 234, description: 'High-frequency momentum strategy with adaptive entry/exit signals and Kelly-based position sizing.' },
  { id: 'strat-mm', name: 'Market Maker Suite', author: 'MMPro', category: 'crypto', priceCents: 9900, rating: 4.9, downloads: 89, description: 'Professional market-making strategy with dynamic spread adjustment and inventory management.' },
  { id: 'strat-mean-rev', name: 'Mean Reversion Alpha', author: 'QuantSage', category: 'crypto', priceCents: 3900, rating: 4.3, downloads: 167, description: 'Statistical mean-reversion strategy using Bollinger Bands and Z-score for entry timing.' },
  { id: 'strat-trend', name: 'Trend Following MACD', author: 'SteadyEddie', category: 'crypto', priceCents: 0, rating: 4.1, downloads: 412, description: 'Free trend-following strategy using MACD crossovers with multi-timeframe confirmation.' },
  { id: 'strat-kalshi', name: 'Kalshi Event Trader', author: 'ArbKing', category: 'other', priceCents: 5900, rating: 4.6, downloads: 78, description: 'Event-driven strategy for Kalshi markets with sentiment analysis and probability modeling.' },
];

function getMarketplaceBrowse() {
  return { items: DEMO_STRATEGIES, total: DEMO_STRATEGIES.length };
}

// ── Onboarding checklist (Sprint 39) ────────────────────────────────────────

function getOnboardingChecklist() {
  return {
    steps: [
      { step: 1, title: 'Create Account', description: 'Register and get your API key', icon: 'key', done: true },
      { step: 2, title: 'Explore Dashboard', description: 'View your trading overview and P&L charts', icon: 'chart', done: true },
      { step: 3, title: 'Run a Backtest', description: 'Test a strategy with historical data before going live', icon: 'flask', done: false },
      { step: 4, title: 'Start Paper Trading', description: 'Try strategies with simulated money — no risk', icon: 'play', done: false },
      { step: 5, title: 'Connect Notifications', description: 'Set up Telegram alerts for trade signals', icon: 'bell', done: false },
      { step: 6, title: 'Upgrade to Pro', description: 'Unlock live trading, AI tuning, and copy-trading', icon: 'star', done: false },
    ],
  };
}

/** Send JSON response */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Serve a static file from the public directory */
async function serveStatic(res: ServerResponse, filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    const body = '404 Not Found';
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }
}

/**
 * Create and start the dashboard HTTP server.
 * @param port - TCP port to listen on
 * @param dataProvider - DashboardDataProvider instance for API responses
 * @returns running http.Server instance
 */
export function createDashboardServer(port: number, dataProvider: DashboardDataProvider): Server {
  const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // Only handle GET requests
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      // API routes
      if (url === '/dashboard/api/summary') {
        sendJson(res, 200, dataProvider.getSummary());
        return;
      }

      if (url === '/dashboard/api/equity-curve') {
        sendJson(res, 200, dataProvider.getEquityCurve());
        return;
      }

      if (url === '/dashboard/api/strategies') {
        sendJson(res, 200, dataProvider.getStrategyBreakdown());
        return;
      }

      if (url.startsWith('/dashboard/api/portfolio')) {
        sendJson(res, 200, dataProvider.getPortfolioSummary());
        return;
      }

      if (url.startsWith('/dashboard/api/trades')) {
        const limit = parseInt(new URL(url, 'http://x').searchParams.get('limit') ?? '50', 10);
        sendJson(res, 200, dataProvider.getTradeHistory(undefined, limit));
        return;
      }

      if (url.startsWith('/dashboard/api/positions')) {
        sendJson(res, 200, dataProvider.getActivePositions());
        return;
      }

      if (url.startsWith('/dashboard/api/strategy-status')) {
        sendJson(res, 200, dataProvider.getStrategyStatus());
        return;
      }

      // GET /dashboard/api/revenue — admin revenue dashboard data
      if (url === '/dashboard/api/revenue') {
        sendJson(res, 200, getRevenueSummary());
        return;
      }

      // GET /dashboard/api/marketplace — browse marketplace strategies
      if (url.startsWith('/dashboard/api/marketplace')) {
        sendJson(res, 200, getMarketplaceBrowse());
        return;
      }

      // GET /dashboard/api/onboarding — onboarding checklist
      if (url === '/dashboard/api/onboarding') {
        sendJson(res, 200, getOnboardingChecklist());
        return;
      }

      // Static file serving — map / to index.html
      const staticPath = url === '/' ? '/index.html' : url;
      // Prevent directory traversal
      const safePath = join(PUBLIC_DIR, staticPath.replace(/\.\./g, ''));
      await serveStatic(res, safePath);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      sendJson(res, 500, { error: 'Internal Server Error', message });
    }
  });

  server.listen(port, () => {
    console.log(`[Dashboard] Server listening on http://localhost:${port}`);
  });

  return server;
}

/**
 * Gracefully shut down the dashboard server.
 */
export function stopDashboardServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
