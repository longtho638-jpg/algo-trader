// Tests for tier-based feature gating middleware
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkTierGate } from '../src/api/tier-gate-middleware.js';
import type { Tier } from '../src/users/subscription-tier.js';

function makeReq(tier: Tier): IncomingMessage & { user: { id: string; email: string; tier: Tier } } {
  return { user: { id: 'u1', email: 'a@b.com', tier } } as any;
}

function makeRes(): ServerResponse & { _status: number; _body: any } {
  const res: any = {
    _status: 0,
    _body: null,
    writeHead(status: number, headers: Record<string, string>) {
      res._status = status;
    },
    end(body: string) {
      res._body = JSON.parse(body);
    },
  };
  return res;
}

describe('tier-gate-middleware', () => {
  it('allows free tier on ungated routes', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('free'), res, '/api/status')).toBe(true);
    expect(checkTierGate(makeReq('free'), res, '/api/trades')).toBe(true);
    expect(checkTierGate(makeReq('free'), res, '/api/pnl')).toBe(true);
  });

  it('blocks free tier on backtesting', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('free'), res, '/api/backtest')).toBe(false);
    expect(res._status).toBe(403);
    expect(res._body.requiredFeature).toBe('backtesting');
  });

  it('allows pro tier on backtesting', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('pro'), res, '/api/backtest')).toBe(true);
  });

  it('blocks free tier on marketplace (multi-market)', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('free'), res, '/api/marketplace/list')).toBe(false);
    expect(res._body.requiredFeature).toBe('multi-market');
  });

  it('allows pro tier on marketplace', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('pro'), res, '/api/marketplace/list')).toBe(true);
  });

  it('blocks free tier on tradingview webhooks', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('free'), res, '/api/webhooks/tradingview/abc')).toBe(false);
    expect(res._body.requiredFeature).toBe('webhook');
  });

  it('blocks pro tier on tradingview webhooks (webhook is enterprise only)', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('pro'), res, '/api/tv/generate-secret')).toBe(false);
  });

  it('allows enterprise tier on all gated routes', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('enterprise'), res, '/api/backtest')).toBe(true);
    expect(checkTierGate(makeReq('enterprise'), res, '/api/marketplace/list')).toBe(true);
    expect(checkTierGate(makeReq('enterprise'), res, '/api/webhooks/tradingview/abc')).toBe(true);
    expect(checkTierGate(makeReq('enterprise'), res, '/api/tv/generate-secret')).toBe(true);
    expect(checkTierGate(makeReq('enterprise'), res, '/api/pipeline/optimize')).toBe(true);
  });

  it('blocks free/pro tier on optimizer', () => {
    const res = makeRes();
    expect(checkTierGate(makeReq('free'), res, '/api/pipeline/optimize')).toBe(false);
    expect(checkTierGate(makeReq('pro'), res, '/api/pipeline/optimize')).toBe(false);
  });

  it('passes through when no user attached (let auth middleware handle)', () => {
    const res = makeRes();
    const req = {} as IncomingMessage;
    expect(checkTierGate(req, res, '/api/backtest')).toBe(true);
  });

  it('includes upgrade URL in 403 response', () => {
    const res = makeRes();
    checkTierGate(makeReq('free'), res, '/api/backtest');
    expect(res._body.upgradeUrl).toBe('https://cashclaw.cc/pricing');
  });
});
