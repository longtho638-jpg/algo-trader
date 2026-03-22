import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleKalshiRoutes, setKalshiDeps } from '../../src/api/kalshi-routes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

function createMocks(method = 'GET', user?: { id: string; tier: string }) {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
    headersSent: false,
  } as any as ServerResponse;

  const req = {
    method,
    url: '/',
    headers: {},
    user,
    on: vi.fn(),
  } as any as IncomingMessage;

  return { req, res };
}

function mockDeps() {
  return {
    client: {
      getMarkets: vi.fn().mockResolvedValue([{ ticker: 'TEST-YES', status: 'open' }]),
      getBalance: vi.fn().mockResolvedValue({ balance: 10000 }),
      getPositions: vi.fn().mockResolvedValue([]),
      placeOrder: vi.fn().mockResolvedValue({ order_id: 'o1' }),
    },
    scanner: {
      scanOpportunities: vi.fn().mockResolvedValue([]),
      findArbOpportunities: vi.fn().mockResolvedValue([]),
    },
    orderManager: {},
  } as any;
}

describe('Kalshi Routes', () => {
  beforeEach(() => {
    setKalshiDeps(null as any);
  });

  describe('Auth & guard checks', () => {
    it('returns 401 when no user', () => {
      const { req, res } = createMocks('GET');
      const handled = handleKalshiRoutes(req, res, '/api/kalshi/markets', 'GET');
      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('returns 503 when deps not configured', () => {
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      const handled = handleKalshiRoutes(req, res, '/api/kalshi/markets', 'GET');
      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
    });

    it('returns 403 for free tier', () => {
      setKalshiDeps(mockDeps());
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'free' });
      const handled = handleKalshiRoutes(req, res, '/api/kalshi/markets', 'GET');
      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
    });
  });

  describe('GET /api/kalshi/markets', () => {
    it('returns markets list', async () => {
      const deps = mockDeps();
      setKalshiDeps(deps);
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      const handled = handleKalshiRoutes(req, res, '/api/kalshi/markets', 'GET');
      expect(handled).toBe(true);
      // async handler — wait for microtask
      await vi.waitFor(() => {
        expect(deps.client.getMarkets).toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/kalshi/balance', () => {
    it('calls client.getBalance', async () => {
      const deps = mockDeps();
      setKalshiDeps(deps);
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      handleKalshiRoutes(req, res, '/api/kalshi/balance', 'GET');
      await vi.waitFor(() => {
        expect(deps.client.getBalance).toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/kalshi/positions', () => {
    it('calls client.getPositions', async () => {
      const deps = mockDeps();
      setKalshiDeps(deps);
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      handleKalshiRoutes(req, res, '/api/kalshi/positions', 'GET');
      await vi.waitFor(() => {
        expect(deps.client.getPositions).toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/kalshi/scan', () => {
    it('calls scanner.scanOpportunities', async () => {
      const deps = mockDeps();
      setKalshiDeps(deps);
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      handleKalshiRoutes(req, res, '/api/kalshi/scan', 'GET');
      await vi.waitFor(() => {
        expect(deps.scanner.scanOpportunities).toHaveBeenCalled();
      });
    });
  });

  describe('Route matching', () => {
    it('returns false for unknown kalshi path', () => {
      setKalshiDeps(mockDeps());
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      const handled = handleKalshiRoutes(req, res, '/api/kalshi/unknown', 'GET');
      expect(handled).toBe(false);
    });

    it('returns false for wrong method on markets', () => {
      setKalshiDeps(mockDeps());
      const { req, res } = createMocks('POST', { id: 'u1', tier: 'pro' });
      const handled = handleKalshiRoutes(req, res, '/api/kalshi/markets', 'POST');
      expect(handled).toBe(false);
    });

    it('returns false for wrong method on scan', () => {
      setKalshiDeps(mockDeps());
      const { req, res } = createMocks('POST', { id: 'u1', tier: 'pro' });
      const handled = handleKalshiRoutes(req, res, '/api/kalshi/scan', 'POST');
      expect(handled).toBe(false);
    });
  });
});
