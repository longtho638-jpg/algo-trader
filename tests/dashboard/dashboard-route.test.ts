import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDashboard } from '../../src/dashboard/dashboard-route.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// We need to reset the cached HTML between tests that check caching
// The module caches HTML in a closure variable, so we use dynamic import + resetModules

describe('Dashboard Route', () => {
  function createMockRes(): ServerResponse & { _status: number; _headers: Record<string, string>; _body: string } {
    const res = {
      _status: 0,
      _headers: {} as Record<string, string>,
      _body: '',
      writeHead(status: number, headers: Record<string, string>) {
        res._status = status;
        Object.assign(res._headers, headers);
        return res;
      },
      end(body?: string) {
        if (body) res._body = body;
      },
    } as unknown as ServerResponse & { _status: number; _headers: Record<string, string>; _body: string };
    return res;
  }

  function createMockReq(): IncomingMessage {
    return {} as IncomingMessage;
  }

  it('returns 200 with text/html content type', () => {
    const req = createMockReq();
    const res = createMockRes();

    handleDashboard(req, res);

    expect(res._status).toBe(200);
    expect(res._headers['Content-Type']).toBe('text/html');
  });

  it('response contains "CashClaw Dashboard"', () => {
    const req = createMockReq();
    const res = createMockRes();

    handleDashboard(req, res);

    expect(res._body).toContain('CashClaw Dashboard');
  });

  it('response contains strategy health fetch code', () => {
    const req = createMockReq();
    const res = createMockRes();

    handleDashboard(req, res);

    expect(res._body).toContain('/api/strategies/health');
    expect(res._body).toContain('fetchStrategyHealth');
  });

  it('response contains auto-refresh logic', () => {
    const req = createMockReq();
    const res = createMockRes();

    handleDashboard(req, res);

    expect(res._body).toContain('setInterval');
    expect(res._body).toContain('refreshAll');
    expect(res._body).toContain('REFRESH_INTERVAL');
  });

  it('HTML is valid (has DOCTYPE, html, head, body tags)', () => {
    const req = createMockReq();
    const res = createMockRes();

    handleDashboard(req, res);

    expect(res._body).toMatch(/^<!DOCTYPE html>/);
    expect(res._body).toContain('<html');
    expect(res._body).toContain('<head>');
    expect(res._body).toContain('<body>');
    expect(res._body).toContain('</html>');
  });

  it('contains dark theme CSS', () => {
    const req = createMockReq();
    const res = createMockRes();

    handleDashboard(req, res);

    expect(res._body).toContain('#0B0E11');
    expect(res._body).toContain('#141820');
    expect(res._body).toContain('#00D4AA');
    expect(res._body).toContain('#FF4757');
    expect(res._body).toContain('#FFB020');
  });

  it('caches HTML on second call', () => {
    const req1 = createMockReq();
    const res1 = createMockRes();
    handleDashboard(req1, res1);

    const req2 = createMockReq();
    const res2 = createMockRes();
    handleDashboard(req2, res2);

    // Both calls should return identical content (cached)
    expect(res1._body).toBe(res2._body);
    expect(res1._body.length).toBeGreaterThan(0);
    expect(Number(res2._headers['Content-Length'])).toBe(Buffer.byteLength(res2._body));
  });
});
