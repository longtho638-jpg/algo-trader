import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleTradingRoomRoutes, setTradingRoomOrchestrator } from '../../src/api/trading-room-routes.js';
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

describe('Trading Room Routes', () => {
  beforeEach(() => {
    setTradingRoomOrchestrator(null as any);
  });

  it('returns 401 when no user attached', () => {
    const { req, res } = createMocks('GET');
    const handled = handleTradingRoomRoutes(req, res, '/api/trading-room/status', 'GET');
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
  });

  it('returns 403 for non-enterprise tier', () => {
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'pro' });
    const handled = handleTradingRoomRoutes(req, res, '/api/trading-room/status', 'GET');
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
  });

  it('returns 503 when orchestrator not configured', () => {
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'enterprise' });
    const handled = handleTradingRoomRoutes(req, res, '/api/trading-room/status', 'GET');
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
  });

  it('GET /api/trading-room/status returns orchestrator status', () => {
    const mockOrch = { getStatus: vi.fn(() => ({ mode: 'safe', running: false })) };
    setTradingRoomOrchestrator(mockOrch as any);
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'enterprise' });
    const handled = handleTradingRoomRoutes(req, res, '/api/trading-room/status', 'GET');
    expect(handled).toBe(true);
    expect(mockOrch.getStatus).toHaveBeenCalled();
    const body = JSON.parse((res.end as any).mock.calls[0][0]);
    expect(body.status.mode).toBe('safe');
  });

  it('returns false for unknown trading-room path', () => {
    const mockOrch = { getStatus: vi.fn() };
    setTradingRoomOrchestrator(mockOrch as any);
    const { req, res } = createMocks('GET', { id: 'u1', tier: 'enterprise' });
    const handled = handleTradingRoomRoutes(req, res, '/api/trading-room/unknown', 'GET');
    expect(handled).toBe(false);
  });
});
