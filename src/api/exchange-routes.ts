// CEX exchange API routes for algo-trade RaaS platform
// GET /api/exchanges — list connected exchanges
// GET /api/exchanges/:name/balance — get exchange balance
// GET /api/exchanges/:name/ticker/:symbol — get ticker
// GET /api/exchanges/:name/markets — list available markets

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { ExchangeClient } from '../cex/exchange-client.js';

let _exchangeClient: ExchangeClient | null = null;
export function setExchangeClient(client: ExchangeClient): void {
  _exchangeClient = client;
}

export function handleExchangeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return true;
  }

  if (!_exchangeClient) {
    sendJson(res, 503, { error: 'Exchange client not configured' });
    return true;
  }

  // GET /api/exchanges
  if (pathname === '/api/exchanges' && method === 'GET') {
    const connected = _exchangeClient.listConnected();
    const exchanges = connected.map(name => ({
      name,
      paperMode: _exchangeClient!.isPaperMode(name),
    }));
    sendJson(res, 200, { exchanges, count: exchanges.length });
    return true;
  }

  // GET /api/exchanges/:name/balance
  const balanceMatch = pathname.match(/^\/api\/exchanges\/(\w+)\/balance$/);
  if (balanceMatch && method === 'GET') {
    const name = balanceMatch[1] as any;
    void (async () => {
      try {
        const balances = await _exchangeClient!.getBalance(name);
        sendJson(res, 200, { exchange: name, balances });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  // GET /api/exchanges/:name/ticker/:symbol
  const tickerMatch = pathname.match(/^\/api\/exchanges\/(\w+)\/ticker\/(.+)$/);
  if (tickerMatch && method === 'GET') {
    const name = tickerMatch[1] as any;
    const symbol = decodeURIComponent(tickerMatch[2]);
    void (async () => {
      try {
        const ticker = await _exchangeClient!.getTicker(name, symbol);
        sendJson(res, 200, { exchange: name, ticker });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  // GET /api/exchanges/:name/markets
  const marketsMatch = pathname.match(/^\/api\/exchanges\/(\w+)\/markets$/);
  if (marketsMatch && method === 'GET') {
    const name = marketsMatch[1] as any;
    void (async () => {
      try {
        const markets = await _exchangeClient!.getMarkets(name);
        sendJson(res, 200, { exchange: name, markets, count: markets.length });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  return false;
}
