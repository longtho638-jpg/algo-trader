// Polymarket stats API — win rate, Kelly sizing, trade history
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-response-helpers.js';
import { getWinTracker } from '../polymarket/win-tracker.js';
import { KellyPositionSizer } from '../polymarket/kelly-position-sizer.js';

/**
 * Handle /api/polymarket/* routes. Returns true if matched.
 */
export async function handlePolymarketStatsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  // GET /api/polymarket/stats — win rate + Kelly sizing for all Polymarket strategies
  if (pathname === '/api/polymarket/stats' && method === 'GET') {
    const tracker = getWinTracker();
    const strategies = ['polymarket-arb', 'polymarket-cross-arb', 'polymarket-mm'];
    const kellySizer = new KellyPositionSizer(tracker);

    const result: Record<string, unknown> = {};
    for (const strat of strategies) {
      const winRate = tracker.getWinRate(strat);
      const sizing = kellySizer.getSize(strat);
      result[strat] = { winRate, sizing };
    }

    // Aggregate across all strategies
    const allStats = tracker.getWinRate();
    const allSizing = new KellyPositionSizer(tracker).getSize('polymarket-arb');

    sendJson(res, 200, {
      strategies: result,
      aggregate: { winRate: allStats, sizing: allSizing },
    });
    return true;
  }

  // GET /api/polymarket/trades — recent trade history with outcome labels
  if (pathname === '/api/polymarket/trades' && method === 'GET') {
    const tracker = getWinTracker();
    const trades = tracker.getTradeHistory(undefined, 50);
    sendJson(res, 200, { trades, count: trades.length });
    return true;
  }

  return false;
}
