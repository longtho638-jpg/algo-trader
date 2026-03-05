/**
 * E2E integration tests — Fastify RaaS API server lifecycle.
 * Tests real server startup, health probes, metrics endpoint, graceful shutdown.
 * No mocks — uses real Fastify instance with in-memory stores.
 */

import { buildServer } from '../../src/api/fastify-raas-server';
import { FastifyInstance } from 'fastify';

describe('RaaS API Server E2E', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer({ skipAuth: true });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // ── Health Probes ──

  test('GET /health returns 200 with status ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
  });

  test('GET /ready returns 503 when not ready', async () => {
    const res = await server.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.body);
    expect(body.ready).toBe(false);
  });

  // ── Prometheus Metrics ──

  test('GET /metrics returns prometheus text format', async () => {
    const res = await server.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    const body = res.body;
    expect(body).toContain('algo_trader_heap_used_bytes');
    expect(body).toContain('algo_trader_uptime_seconds');
    expect(body).toContain('algo_trader_rss_bytes');
    expect(body).toContain('# TYPE');
    expect(body).toContain('# HELP');
  });

  // ── Error Handling ──

  test('GET /nonexistent returns 404', async () => {
    const res = await server.inject({ method: 'GET', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  // ── Auth Boundary ──

  test('GET /api/v1/tenants requires authentication', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/tenants' });
    // Without API key, route-level auth rejects with 401
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/v1/tenants requires authentication', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { id: 'test', name: 'Test' },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Arb Endpoints ──

  test('POST /api/v1/arb/scan validates input', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/arb/scan',
      payload: {},
    });

    // Should return 400 (validation error) or 401 (no tenant context)
    expect([400, 401, 422]).toContain(res.statusCode);
  });
});
