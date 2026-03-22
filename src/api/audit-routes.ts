// Audit query API: search events, get stats
// GET /api/audit/events?category&userId&from&to&limit
// GET /api/audit/stats

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuditStore, type AuditQueryFilters } from '../audit/audit-store.js';
import type { AuditCategory } from '../audit/audit-logger.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export function handleAuditRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  if (!pathname.startsWith('/api/audit/')) return false;
  if (method !== 'GET') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }

  const store = getAuditStore();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // GET /api/audit/events
  if (pathname === '/api/audit/events') {
    const filters: AuditQueryFilters = {};
    const cat = url.searchParams.get('category');
    if (cat) filters.category = cat as AuditCategory;
    const userId = url.searchParams.get('userId');
    if (userId) filters.userId = userId;
    const from = url.searchParams.get('from');
    if (from) filters.from = from;
    const to = url.searchParams.get('to');
    if (to) filters.to = to;
    const limit = url.searchParams.get('limit');
    if (limit) filters.limit = Math.min(1000, Math.max(1, parseInt(limit, 10)));

    const events = store.queryEvents(filters);
    sendJson(res, 200, { events, count: events.length });
    return true;
  }

  // GET /api/audit/stats
  if (pathname === '/api/audit/stats') {
    const total = store.getEventCount();
    const trade = store.getEventCount('trade');
    const auth = store.getEventCount('auth');
    const config = store.getEventCount('config');
    const system = store.getEventCount('system');
    sendJson(res, 200, { total, byCategory: { trade, auth, config, system } });
    return true;
  }

  return false;
}
