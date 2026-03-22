import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlgoTradeClient } from '../../src/sdk/algo-trade-client.js';
import { SdkError, buildHeaders } from '../../src/sdk/sdk-auth.js';

// Mock global fetch
const mockFetch = vi.fn();
const origFetch = globalThis.fetch;

describe('SDK Client', () => {
  let client: AlgoTradeClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new AlgoTradeClient({ baseUrl: 'http://localhost:3000', apiKey: 'test-key' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  describe('buildHeaders', () => {
    it('returns X-API-Key and Content-Type', () => {
      const headers = buildHeaders('my-key');
      expect(headers['X-API-Key']).toBe('my-key');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('SdkError', () => {
    it('has statusCode and endpoint', () => {
      const err = new SdkError('fail', 404, '/api/test');
      expect(err.statusCode).toBe(404);
      expect(err.endpoint).toBe('/api/test');
      expect(err.name).toBe('SdkError');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(SdkError);
    });
  });

  describe('getHealth', () => {
    it('calls GET /api/health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', version: '0.1.0' }),
      });
      const result = await client.getHealth();
      expect(result.status).toBe('ok');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('getStatus', () => {
    it('calls GET /api/status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ running: true, strategies: [] }),
      });
      const result = await client.getStatus();
      expect(result.running).toBe(true);
    });
  });

  describe('startStrategy', () => {
    it('calls POST /api/strategy/start with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, strategy: 'market-maker' }),
      });
      const result = await client.startStrategy('market-maker');
      expect(result.ok).toBe(true);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('http://localhost:3000/api/strategy/start');
      expect(callArgs[1].method).toBe('POST');
      expect(JSON.parse(callArgs[1].body)).toEqual({ name: 'market-maker' });
    });
  });

  describe('error handling', () => {
    it('throws SdkError on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: 'Not authorized' }),
      });
      await expect(client.getStatus()).rejects.toThrow(SdkError);
    });

    it('throws SdkError on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));
      await expect(client.getHealth()).rejects.toThrow(SdkError);
    });
  });

  describe('getDexChains', () => {
    it('calls GET /api/dex/chains', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ chains: ['ethereum'], count: 1 }),
      });
      const result = await client.getDexChains();
      expect(result.chains).toEqual(['ethereum']);
    });
  });

  describe('getKalshiMarkets', () => {
    it('calls GET /api/kalshi/markets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ markets: [{ ticker: 'BTC' }], count: 1 }),
      });
      const result = await client.getKalshiMarkets();
      expect(result.count).toBe(1);
    });
  });

  describe('crossScanKalshi', () => {
    it('calls POST /api/kalshi/cross-scan with prices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ opportunities: [], count: 0 }),
      });
      const result = await client.crossScanKalshi([{ conditionId: 'c1', title: 'Test', midPrice: 0.5 }]);
      expect(result.count).toBe(0);
      const callArgs = mockFetch.mock.calls[0];
      expect(JSON.parse(callArgs[1].body).prices).toHaveLength(1);
    });
  });

  describe('trailing slash normalization', () => {
    it('strips trailing slash from baseUrl', async () => {
      const c = new AlgoTradeClient({ baseUrl: 'http://host:3000/', apiKey: 'k' });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await c.getHealth();
      expect(mockFetch.mock.calls[0][0]).toBe('http://host:3000/api/health');
    });
  });
});
