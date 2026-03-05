/**
 * Tests for RaaS REST API Router — covers all endpoints, happy + error paths.
 */

import * as http from 'http';
import { startApiServer, stopApiServer, _manager } from './raas-api-router';

let port = 0;

function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c: Buffer) => { raw += c.toString(); });
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const BASE_TENANT = {
  id: 'tenant-test',
  name: 'Test Tenant',
  maxStrategies: 5,
  maxDailyLossUsd: 1000,
  maxPositionSizeUsd: 500,
  allowedExchanges: ['binance'],
  tier: 'pro' as const,
};

describe('raas-api-router', () => {
  beforeEach(async () => {
    // Reset manager state between tests
    for (const t of _manager.listTenants()) {
      _manager.removeTenant(t.config.id);
    }
    port = await startApiServer(0);
  });

  afterEach(async () => {
    await stopApiServer();
  });

  // ── POST /api/tenants ──────────────────────────────────────────────────────

  it('POST /api/tenants creates tenant and returns 201', async () => {
    const { status, data } = await request('POST', '/api/tenants', BASE_TENANT);
    expect(status).toBe(201);
    const d = data as { config: { id: string } };
    expect(d.config.id).toBe('tenant-test');
  });

  it('POST /api/tenants returns 400 on missing required fields', async () => {
    const { status, data } = await request('POST', '/api/tenants', { id: 'x' });
    expect(status).toBe(400);
    const d = data as { error: string };
    expect(d.error).toBe('validation');
  });

  it('POST /api/tenants returns 400 on invalid tier', async () => {
    const { status, data } = await request('POST', '/api/tenants', { ...BASE_TENANT, tier: 'vip' });
    expect(status).toBe(400);
    const d = data as { error: string };
    expect(d.error).toBe('validation');
  });

  // ── GET /api/tenants ───────────────────────────────────────────────────────

  it('GET /api/tenants returns empty array initially', async () => {
    const { status, data } = await request('GET', '/api/tenants');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(0);
  });

  it('GET /api/tenants lists created tenants', async () => {
    await request('POST', '/api/tenants', BASE_TENANT);
    const { status, data } = await request('GET', '/api/tenants');
    expect(status).toBe(200);
    expect((data as unknown[]).length).toBe(1);
  });

  // ── GET /api/tenants/:id ───────────────────────────────────────────────────

  it('GET /api/tenants/:id returns tenant', async () => {
    await request('POST', '/api/tenants', BASE_TENANT);
    const { status, data } = await request('GET', '/api/tenants/tenant-test');
    expect(status).toBe(200);
    const d = data as { config: { name: string } };
    expect(d.config.name).toBe('Test Tenant');
  });

  it('GET /api/tenants/:id returns 404 for unknown id', async () => {
    const { status, data } = await request('GET', '/api/tenants/ghost');
    expect(status).toBe(404);
    const d = data as { error: string };
    expect(d.error).toBe('not_found');
  });

  // ── POST /api/tenants/:id/strategies ──────────────────────────────────────

  it('POST /api/tenants/:id/strategies assigns strategy with 201', async () => {
    await request('POST', '/api/tenants', BASE_TENANT);
    _manager.addAccount('tenant-test', {
      exchangeId: 'binance',
      accountName: 'main',
      isTestnet: true,
      vaultKey: 'test-key',
    });
    const { status, data } = await request('POST', '/api/tenants/tenant-test/strategies', {
      strategyId: 'strat-1',
      strategyName: 'RSI Strategy',
      accountName: 'main',
    });
    expect(status).toBe(201);
    const d = data as { strategies: Array<{ strategyId: string }> };
    expect(d.strategies.some((s) => s.strategyId === 'strat-1')).toBe(true);
  });

  it('POST /api/tenants/:id/strategies returns 400 on validation error', async () => {
    await request('POST', '/api/tenants', BASE_TENANT);
    const { status, data } = await request('POST', '/api/tenants/tenant-test/strategies', {
      strategyId: 'strat-1',
    });
    expect(status).toBe(400);
    const d = data as { error: string };
    expect(d.error).toBe('validation');
  });

  it('POST /api/tenants/:id/strategies returns 404 for unknown tenant', async () => {
    const { status } = await request('POST', '/api/tenants/no-such/strategies', {
      strategyId: 's1', strategyName: 'x', accountName: 'main',
    });
    expect(status).toBe(404);
  });

  // ── DELETE /api/tenants/:id/strategies/:name ──────────────────────────────

  it('DELETE /api/tenants/:id/strategies/:name stops strategy', async () => {
    await request('POST', '/api/tenants', BASE_TENANT);
    _manager.addAccount('tenant-test', {
      exchangeId: 'binance', accountName: 'main', isTestnet: true, vaultKey: 'k',
    });
    _manager.startStrategy('tenant-test', 'strat-del', 'Del Strat', 'main');
    const { status, data } = await request('DELETE', '/api/tenants/tenant-test/strategies/strat-del');
    expect(status).toBe(200);
    const d = data as { stopped: string };
    expect(d.stopped).toBe('strat-del');
  });

  it('DELETE /api/tenants/:id/strategies/:name returns 404 for unknown strategy', async () => {
    await request('POST', '/api/tenants', BASE_TENANT);
    const { status } = await request('DELETE', '/api/tenants/tenant-test/strategies/ghost');
    expect(status).toBe(404);
  });

  // ── GET /api/tenants/:id/pnl ──────────────────────────────────────────────

  it('GET /api/tenants/:id/pnl returns performance summary', async () => {
    await request('POST', '/api/tenants', BASE_TENANT);
    const { status, data } = await request('GET', '/api/tenants/tenant-test/pnl');
    expect(status).toBe(200);
    const d = data as { totalPnl: number; totalTrades: number; activeStrategies: number };
    expect(typeof d.totalPnl).toBe('number');
    expect(typeof d.totalTrades).toBe('number');
    expect(typeof d.activeStrategies).toBe('number');
  });

  it('GET /api/tenants/:id/pnl returns 404 for unknown tenant', async () => {
    const { status } = await request('GET', '/api/tenants/ghost/pnl');
    expect(status).toBe(404);
  });

  // ── Unknown routes ─────────────────────────────────────────────────────────

  it('returns 404 for unknown route', async () => {
    const { status } = await request('GET', '/not-an-endpoint');
    expect(status).toBe(404);
  });
});
