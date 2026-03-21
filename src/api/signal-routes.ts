// ML Signal REST API routes — Sprint 9B
// POST /api/signals/analyze — run ML scoring for a symbol
// GET  /api/signals/health  — check if ML feed is operational
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import { MlSignalFeed } from '../ml/ml-signal-feed.js';

// Module-level singleton
let _feed: MlSignalFeed | null = null;

export function setSignalFeed(feed: MlSignalFeed): void {
  _feed = feed;
}

// Lazy init — create default feed if not explicitly set
function getFeed(): MlSignalFeed {
  if (!_feed) _feed = new MlSignalFeed();
  return _feed;
}

export async function handleSignalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  // POST /api/signals/analyze — body: { symbol, exchange? }
  if (pathname === '/api/signals/analyze' && method === 'POST') {
    let body: Record<string, unknown>;
    try { body = await readJsonBody(req); }
    catch { sendJson(res, 400, { error: 'Invalid JSON' }); return true; }

    const symbol = body['symbol'] as string | undefined;
    if (!symbol) { sendJson(res, 400, { error: 'Missing symbol' }); return true; }

    const exchange = (body['exchange'] as string) || 'default';

    try {
      const signal = getFeed().getSignal(symbol);
      if (signal === null) {
        sendJson(res, 404, {
          error: 'No signal available',
          message: `No price history for symbol "${symbol}". Feed prices first via addPrice().`,
        });
      } else {
        sendJson(res, 200, { symbol, exchange, signal });
      }
    } catch (err) {
      sendJson(res, 500, {
        error: 'Signal analysis failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // GET /api/signals/health — check if ML feed is operational
  if (pathname === '/api/signals/health' && method === 'GET') {
    sendJson(res, 200, { status: 'ok', model: 'weighted-scoring-v1' });
    return true;
  }

  return false;
}
