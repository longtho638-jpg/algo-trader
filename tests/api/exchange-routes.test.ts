import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleExchangeRoutes, setExchangeClient } from '../../src/api/exchange-routes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

function createMocks(method = 'GET', user?: { id: string; tier: string }) {
  let status = 0;
  let body = '';
  const res = {
    writeHead: vi.fn((s: number) => { status = s; }),
    end: vi.fn((d?: string) => { if (d) body = d; }),
    headersSent: false,
  } as any as ServerResponse;
  const req = { method, url: '/', headers: {}, user, on: vi.fn() } as any as IncomingMessage;
  return { req, res, getStatus: () => status, getBody: () => body };
}

describe('Exchange Routes', () => {
  beforeEach(() => {
    setExchangeClient(null as any);
  });

  it('returns 401 when no user', () => {
    const { req, res } = createMocks('GET');
    const handled = handleExchangeRoutes(req, res, '/api/exchanges', 'GET');
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
  });

  it('returns 503 when exchange client not configured', () => {
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
    const handled = handleExchangeRoutes(req, res, '/api/exchanges', 'GET');
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
  });

  it('GET /api/exchanges returns connected exchanges', () => {
    const mockClient = {
      listConnected: vi.fn(() => ['binance', 'bybit']),
      isPaperMode: vi.fn((name: string) => name === 'bybit'),
    };
    setExchangeClient(mockClient as any);
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
    const handled = handleExchangeRoutes(req, res, '/api/exchanges', 'GET');
    expect(handled).toBe(true);
    const body = JSON.parse((res.end as any).mock.calls[0][0]);
    expect(body.count).toBe(2);
    expect(body.exchanges[0].name).toBe('binance');
    expect(body.exchanges[1].paperMode).toBe(true);
  });

  it('returns false for unknown exchange path', () => {
    const mockClient = { listConnected: () => [], isPaperMode: () => false };
    setExchangeClient(mockClient as any);
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
    const handled = handleExchangeRoutes(req, res, '/api/exchanges/unknown/something', 'GET');
    expect(handled).toBe(false);
  });
});
