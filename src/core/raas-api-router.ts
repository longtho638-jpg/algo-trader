/**
 * RaaS REST API Router — tenant/strategy management over plain Node http.
 * Delegates business logic to TenantStrategyManager.
 */

import * as http from 'http';
import { z } from 'zod';
import { TenantStrategyManager } from './tenant-strategy-manager';

// ── Zod schemas ─────────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  maxStrategies: z.number().int().positive(),
  maxDailyLossUsd: z.number().positive(),
  maxPositionSizeUsd: z.number().positive(),
  allowedExchanges: z.array(z.string()).min(1),
  tier: z.enum(['free', 'pro', 'enterprise']),
});

const AssignStrategySchema = z.object({
  strategyId: z.string().min(1),
  strategyName: z.string().min(1),
  accountName: z.string().min(1),
  configOverrides: z.record(z.string(), z.unknown()).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(res: http.ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function parseRoute(url: string): { tenantId?: string; sub?: string; subParam?: string } {
  // /api/tenants/:id/strategies/:name  OR  /api/tenants/:id/pnl
  const m = url.match(/^\/api\/tenants(?:\/([^/]+)(?:\/(strategies|pnl)(?:\/([^/]+))?)?)?/);
  if (!m) return {};
  return { tenantId: m[1], sub: m[2], subParam: m[3] };
}

// ── Router ───────────────────────────────────────────────────────────────────

let server: http.Server | null = null;
let activePort = 0;
const manager = new TenantStrategyManager();

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = (req.url ?? '/').split('?')[0];

  if (!url.startsWith('/api/tenants')) { json(res, 404, { error: 'not_found' }); return; }

  const { tenantId, sub, subParam } = parseRoute(url);

  try {
    // POST /api/tenants — create tenant
    if (method === 'POST' && !tenantId) {
      const body = await readBody(req);
      const parsed = CreateTenantSchema.safeParse(body);
      if (!parsed.success) { json(res, 400, { error: 'validation', details: parsed.error.issues }); return; }
      manager.addTenant(parsed.data);
      json(res, 201, manager.getTenant(parsed.data.id));
      return;
    }

    // GET /api/tenants — list
    if (method === 'GET' && !tenantId) {
      json(res, 200, manager.listTenants());
      return;
    }

    // GET /api/tenants/:id — get tenant
    if (method === 'GET' && tenantId && !sub) {
      const t = manager.getTenant(tenantId);
      if (!t) { json(res, 404, { error: 'not_found' }); return; }
      json(res, 200, t);
      return;
    }

    // POST /api/tenants/:id/strategies — assign strategy
    if (method === 'POST' && tenantId && sub === 'strategies') {
      const t = manager.getTenant(tenantId);
      if (!t) { json(res, 404, { error: 'not_found' }); return; }
      const body = await readBody(req);
      const parsed = AssignStrategySchema.safeParse(body);
      if (!parsed.success) { json(res, 400, { error: 'validation', details: parsed.error.issues }); return; }
      const { strategyId, strategyName, accountName, configOverrides } = parsed.data;
      const ok = manager.startStrategy(tenantId, strategyId, strategyName, accountName, configOverrides as Record<string, unknown> | undefined);
      if (!ok) { json(res, 400, { error: 'strategy_start_failed' }); return; }
      json(res, 201, manager.getTenant(tenantId));
      return;
    }

    // DELETE /api/tenants/:id/strategies/:name — remove strategy
    if (method === 'DELETE' && tenantId && sub === 'strategies' && subParam) {
      const t = manager.getTenant(tenantId);
      if (!t) { json(res, 404, { error: 'not_found' }); return; }
      const ok = manager.stopStrategy(tenantId, subParam);
      if (!ok) { json(res, 404, { error: 'strategy_not_found' }); return; }
      json(res, 200, { stopped: subParam });
      return;
    }

    // GET /api/tenants/:id/pnl — P&L
    if (method === 'GET' && tenantId && sub === 'pnl') {
      const perf = manager.getPerformance(tenantId);
      if (!perf) { json(res, 404, { error: 'not_found' }); return; }
      json(res, 200, perf);
      return;
    }

    json(res, 404, { error: 'not_found' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal_error';
    json(res, msg === 'invalid_json' ? 400 : 500, { error: msg });
  }
}

export function startApiServer(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => { void handleRequest(req, res); });
    server.on('error', reject);
    server.listen(port, () => {
      const addr = server!.address();
      activePort = (addr && typeof addr === 'object') ? addr.port : port;
      process.stdout.write(`RaaS API server listening on :${activePort}\n`);
      resolve(activePort);
    });
  });
}

export function stopApiServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) { resolve(); return; }
    const s = server;
    server = null;
    activePort = 0;
    s.close(() => resolve());
  });
}

export function getApiPort(): number { return activePort; }

/** Exposed for testing — shared manager instance */
export { manager as _manager };
