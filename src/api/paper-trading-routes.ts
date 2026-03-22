// Paper trading API routes for algo-trade RaaS platform
// POST /api/paper/start — start a new paper trading session
// POST /api/paper/stop — stop active session and get summary
// GET /api/paper/status — get active session status
// POST /api/paper/trade — execute a paper trade
// POST /api/paper/price — feed a market price into the session
// POST /api/paper/reset — reset the session

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import { PaperSession } from '../paper-trading/paper-session.js';
import type { StrategyName } from '../core/types.js';

// Per-user sessions keyed by userId
const sessions = new Map<string, PaperSession>();

function getOrCreateSession(userId: string): PaperSession {
  let session = sessions.get(userId);
  if (!session) {
    session = new PaperSession(`ps_${userId}_${Date.now().toString(36)}`);
    sessions.set(userId, session);
  }
  return session;
}

export function handlePaperTradingRoutes(
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
  const userId = authReq.user.id;

  // POST /api/paper/start
  if (pathname === '/api/paper/start' && method === 'POST') {
    void (async () => {
      try {
        const body = await readJsonBody<{ initialCapital?: number }>(req);
        const capital = body.initialCapital ?? 10000;
        if (capital <= 0 || capital > 10_000_000) {
          sendJson(res, 400, { error: 'initialCapital must be 1-10000000' });
          return;
        }
        const session = getOrCreateSession(userId);
        if (session.isActive()) {
          sendJson(res, 409, { error: 'Session already active. Stop it first or reset.' });
          return;
        }
        session.start(capital);
        sendJson(res, 200, { sessionId: session.sessionId, initialCapital: capital, status: 'active' });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  // POST /api/paper/stop
  if (pathname === '/api/paper/stop' && method === 'POST') {
    try {
      const session = sessions.get(userId);
      if (!session?.isActive()) {
        sendJson(res, 400, { error: 'No active session' });
        return true;
      }
      const summary = session.stop();
      sendJson(res, 200, { summary });
    } catch (err) {
      sendJson(res, 400, { error: String(err) });
    }
    return true;
  }

  // GET /api/paper/status
  if (pathname === '/api/paper/status' && method === 'GET') {
    const session = sessions.get(userId);
    if (!session) {
      sendJson(res, 200, { active: false, sessionId: null });
      return true;
    }
    if (session.isActive()) {
      const summary = session.getSessionSummary();
      sendJson(res, 200, { active: true, ...summary });
    } else {
      sendJson(res, 200, { active: false, sessionId: session.sessionId });
    }
    return true;
  }

  // POST /api/paper/trade
  if (pathname === '/api/paper/trade' && method === 'POST') {
    void (async () => {
      try {
        const body = await readJsonBody<{ symbol: string; side: string; size: string; strategy?: string }>(req);
        if (!body.symbol || !body.side || !body.size) {
          sendJson(res, 400, { error: 'Required: symbol, side, size' });
          return;
        }
        const session = sessions.get(userId);
        if (!session?.isActive()) {
          sendJson(res, 400, { error: 'No active session. Start one first.' });
          return;
        }
        const result = session.executeTrade({
          marketType: 'paper' as any,
          exchange: 'paper',
          symbol: body.symbol,
          side: body.side as 'buy' | 'sell',
          size: body.size,
          strategy: (body.strategy ?? 'market-maker') as StrategyName,
        });
        sendJson(res, 200, { trade: result });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  // POST /api/paper/price
  if (pathname === '/api/paper/price' && method === 'POST') {
    void (async () => {
      try {
        const body = await readJsonBody<{ symbol: string; price: number }>(req);
        if (!body.symbol || !body.price) {
          sendJson(res, 400, { error: 'Required: symbol, price' });
          return;
        }
        const session = sessions.get(userId);
        if (!session?.isActive()) {
          sendJson(res, 400, { error: 'No active session' });
          return;
        }
        session.setPrice(body.symbol, body.price);
        sendJson(res, 200, { symbol: body.symbol, price: body.price });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  // POST /api/paper/reset
  if (pathname === '/api/paper/reset' && method === 'POST') {
    const session = sessions.get(userId);
    if (!session) {
      sendJson(res, 400, { error: 'No session to reset' });
      return true;
    }
    session.reset();
    sendJson(res, 200, { sessionId: session.sessionId, status: 'reset' });
    return true;
  }

  return false;
}
