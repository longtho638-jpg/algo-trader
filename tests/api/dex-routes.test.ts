import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleDexRoutes, setSwapRouter } from '../../src/api/dex-routes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Helper to create mock req/res
function createMocks(method = 'GET', user?: { id: string; tier: string }) {
  let status = 0;
  let body = '';
  const res = {
    writeHead: vi.fn((s: number) => { status = s; }),
    end: vi.fn((d?: string) => { if (d) body = d; }),
    headersSent: false,
  } as any as ServerResponse;

  const req = {
    method,
    url: '/',
    headers: {},
    user,
    on: vi.fn(),
  } as any as IncomingMessage;

  return { req, res, getStatus: () => status, getBody: () => body };
}

describe('DEX Routes', () => {
  beforeEach(() => {
    // Reset swap router to null
    setSwapRouter(null as any);
  });

  describe('Auth & guard checks', () => {
    it('returns 401 when no user attached', () => {
      const { req, res } = createMocks('GET');
      const handled = handleDexRoutes(req, res, '/api/dex/chains', 'GET');
      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('returns 503 when swap router not configured', () => {
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      const handled = handleDexRoutes(req, res, '/api/dex/chains', 'GET');
      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
    });

    it('returns 403 for free tier on POST /api/dex/swap', () => {
      setSwapRouter({
        getConfiguredChains: () => [],
        isChainReady: () => false,
        swap: vi.fn(),
      } as any);
      const { req, res } = createMocks('POST', { id: 'u1', tier: 'free' });
      const handled = handleDexRoutes(req, res, '/api/dex/swap', 'POST');
      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
    });
  });

  describe('GET /api/dex/chains', () => {
    it('returns configured chains', () => {
      setSwapRouter({
        getConfiguredChains: () => ['ethereum', 'polygon'],
        isChainReady: () => true,
        swap: vi.fn(),
      } as any);
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      const handled = handleDexRoutes(req, res, '/api/dex/chains', 'GET');
      expect(handled).toBe(true);
      const body = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(body.chains).toEqual(['ethereum', 'polygon']);
      expect(body.count).toBe(2);
    });
  });

  describe('Route matching', () => {
    it('returns false for unknown DEX path', () => {
      setSwapRouter({ getConfiguredChains: () => [], isChainReady: () => false, swap: vi.fn() } as any);
      const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
      const handled = handleDexRoutes(req, res, '/api/dex/unknown', 'GET');
      expect(handled).toBe(false);
    });

    it('returns false for wrong method on chains', () => {
      setSwapRouter({ getConfiguredChains: () => [], isChainReady: () => false, swap: vi.fn() } as any);
      const { req, res } = createMocks('POST', { id: 'u1', tier: 'pro' });
      const handled = handleDexRoutes(req, res, '/api/dex/chains', 'POST');
      expect(handled).toBe(false);
    });
  });
});
