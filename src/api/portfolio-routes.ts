// REST API route handlers for user portfolio data (summary, equity curve, strategies)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-response-helpers.js';
import { PortfolioTracker } from '../portfolio/portfolio-tracker.js';

// Module-level singleton — set once at startup via setPortfolioTracker()
let _tracker: PortfolioTracker | null = null;

export function setPortfolioTracker(tracker: PortfolioTracker): void {
  _tracker = tracker;
}

/**
 * Handle all /api/portfolio/* routes.
 * Returns true if the route was matched (even on error), false if no match.
 */
export async function handlePortfolioRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (!_tracker) {
    sendJson(res, 503, { error: 'Portfolio not configured' });
    return true;
  }

  // GET /api/portfolio/summary
  if (pathname === '/api/portfolio/summary') {
    if (method !== 'GET') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }
    sendJson(res, 200, _tracker.getPortfolioSummary());
    return true;
  }

  // GET /api/portfolio/equity-curve
  if (pathname === '/api/portfolio/equity-curve') {
    if (method !== 'GET') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }
    sendJson(res, 200, { curve: _tracker.getEquityCurve() });
    return true;
  }

  // GET /api/portfolio/strategies
  if (pathname === '/api/portfolio/strategies') {
    if (method !== 'GET') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }
    const summary = _tracker.getPortfolioSummary();
    sendJson(res, 200, { strategies: summary.strategies });
    return true;
  }

  return false;
}
