// P&L snapshot API routes for algo-trade RaaS platform
// GET /api/pnl/snapshots — recent snapshots (default 30 days)
// GET /api/pnl/snapshots/range?from=YYYY-MM-DD&to=YYYY-MM-DD — date range
// GET /api/pnl/snapshots/today — today's snapshot
// POST /api/pnl/snapshots — manually trigger snapshot capture

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parse } from 'node:url';
import { sendJson } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import {
  initPnlSnapshotStore,
  getRecentSnapshots,
  getSnapshots,
  getTodaySnapshot,
  savePnlSnapshot,
  type PnlSnapshot,
} from '../portfolio/pnl-snapshot-store.js';

// Auto-init store
initPnlSnapshotStore(process.env['PNL_DB_PATH'] ?? 'data/pnl-snapshots.db');

export type SnapshotProvider = () => Omit<PnlSnapshot, 'date' | 'timestamp'>;

let _snapshotProvider: SnapshotProvider | null = null;
export function setPnlSnapshotProvider(provider: SnapshotProvider): void {
  _snapshotProvider = provider;
}

export function handlePnlSnapshotRoutes(
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

  // GET /api/pnl/snapshots
  if (pathname === '/api/pnl/snapshots' && method === 'GET') {
    const parsed = parse(req.url ?? '/', true);
    const limit = Math.min(365, Math.max(1, parseInt(String(parsed.query['limit'] ?? '30'), 10)));
    const snapshots = getRecentSnapshots(limit);
    sendJson(res, 200, { snapshots, count: snapshots.length });
    return true;
  }

  // GET /api/pnl/snapshots/range?from=...&to=...
  if (pathname === '/api/pnl/snapshots/range' && method === 'GET') {
    const parsed = parse(req.url ?? '/', true);
    const from = String(parsed.query['from'] ?? '');
    const to = String(parsed.query['to'] ?? '');
    if (!from || !to) {
      sendJson(res, 400, { error: 'Missing query params: from, to (YYYY-MM-DD)' });
      return true;
    }
    const snapshots = getSnapshots(from, to);
    sendJson(res, 200, { snapshots, count: snapshots.length, from, to });
    return true;
  }

  // GET /api/pnl/snapshots/today
  if (pathname === '/api/pnl/snapshots/today' && method === 'GET') {
    const snapshot = getTodaySnapshot();
    sendJson(res, 200, { snapshot });
    return true;
  }

  // POST /api/pnl/snapshots — manually capture snapshot
  if (pathname === '/api/pnl/snapshots' && method === 'POST') {
    if (!_snapshotProvider) {
      sendJson(res, 503, { error: 'Snapshot provider not configured' });
      return true;
    }
    const data = _snapshotProvider();
    const snapshot: PnlSnapshot = {
      ...data,
      date: new Date().toISOString().slice(0, 10),
      timestamp: Date.now(),
    };
    savePnlSnapshot(snapshot);
    sendJson(res, 201, { snapshot });
    return true;
  }

  return false;
}
