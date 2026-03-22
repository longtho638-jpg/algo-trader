import { describe, it, expect, vi } from 'vitest';
import { handleOptimizerRoutes, storeOptimizerResult } from '../../src/api/optimizer-routes.js';
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

describe('Optimizer Routes', () => {
  it('returns 401 when no user', () => {
    const { req, res } = createMocks('GET');
    const handled = handleOptimizerRoutes(req, res, '/api/optimizer/results', 'GET');
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
  });

  it('returns 403 for free tier', () => {
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'free' });
    const handled = handleOptimizerRoutes(req, res, '/api/optimizer/results', 'GET');
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
  });

  it('GET /api/optimizer/results returns null when no results', () => {
    const { req, res } = createMocks('GET', { id: 'u-new', tier: 'pro' });
    const handled = handleOptimizerRoutes(req, res, '/api/optimizer/results', 'GET');
    expect(handled).toBe(true);
    const body = JSON.parse((res.end as any).mock.calls[0][0]);
    expect(body.result).toBeNull();
  });

  it('GET /api/optimizer/results returns stored result', () => {
    const fakeResult = { bestParams: { a: 1 }, bestScore: 0.95 } as any;
    storeOptimizerResult('u-stored', fakeResult);
    const { req, res } = createMocks('GET', { id: 'u-stored', tier: 'pro' });
    const handled = handleOptimizerRoutes(req, res, '/api/optimizer/results', 'GET');
    expect(handled).toBe(true);
    const body = JSON.parse((res.end as any).mock.calls[0][0]);
    expect(body.result.bestScore).toBe(0.95);
  });

  it('returns false for unknown optimizer path', () => {
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
    const handled = handleOptimizerRoutes(req, res, '/api/optimizer/unknown', 'GET');
    expect(handled).toBe(false);
  });
});
