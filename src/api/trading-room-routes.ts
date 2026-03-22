// Trading Room API routes for algo-trade RaaS platform
// GET /api/trading-room/status — orchestrator status
// POST /api/trading-room/go-live — start AGI orchestrator
// POST /api/trading-room/go-safe — stop orchestrator gracefully

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { AgiOrchestrator, GoLiveConfig } from '../trading-room/agi-orchestrator.js';

let _orchestrator: AgiOrchestrator | null = null;
export function setTradingRoomOrchestrator(orch: AgiOrchestrator): void {
  _orchestrator = orch;
}

export function handleTradingRoomRoutes(
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

  // Enterprise tier check
  if (authReq.user.tier !== 'enterprise') {
    sendJson(res, 403, { error: 'Trading Room requires Enterprise tier' });
    return true;
  }

  if (!_orchestrator) {
    sendJson(res, 503, { error: 'Trading Room not configured' });
    return true;
  }

  // GET /api/trading-room/status
  if (pathname === '/api/trading-room/status' && method === 'GET') {
    const status = _orchestrator.getStatus();
    sendJson(res, 200, { status });
    return true;
  }

  // POST /api/trading-room/go-live
  if (pathname === '/api/trading-room/go-live' && method === 'POST') {
    void (async () => {
      try {
        const body = await readJsonBody<Partial<GoLiveConfig>>(req);
        const config: GoLiveConfig = {
          mode: body.mode ?? 'semi-auto',
          cycleIntervalMs: body.cycleIntervalMs ?? 60_000,
          watchSymbols: body.watchSymbols ?? [],
          preflightCheck: body.preflightCheck ?? true,
        };
        await _orchestrator!.goLive(config);
        sendJson(res, 200, { status: 'live', config });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  // POST /api/trading-room/go-safe
  if (pathname === '/api/trading-room/go-safe' && method === 'POST') {
    void (async () => {
      try {
        await _orchestrator!.goSafe();
        sendJson(res, 200, { status: 'safe' });
      } catch (err) {
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  return false;
}
