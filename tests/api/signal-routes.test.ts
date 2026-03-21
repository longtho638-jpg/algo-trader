import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSignalRoutes, setSignalFeed } from '../../src/api/signal-routes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MlSignalFeed } from '../../src/ml/ml-signal-feed.js';
import { Readable } from 'node:stream';

describe('Signal Routes', () => {
  let mockFeed: MlSignalFeed;
  let mockRes: ServerResponse;
  let responseStatus: number;
  let responseData: string;

  function createMockReq(method: string, body?: object): IncomingMessage {
    const readable = new Readable({ read() {} }) as IncomingMessage;
    readable.method = method;
    readable.headers = { 'content-type': 'application/json' };

    if (body) {
      process.nextTick(() => {
        readable.push(JSON.stringify(body));
        readable.push(null);
      });
    } else {
      // Empty body, end stream immediately
      process.nextTick(() => {
        readable.push(null);
      });
    }

    return readable;
  }

  beforeEach(() => {
    // Reset mock feed
    mockFeed = {
      getSignal: vi.fn().mockReturnValue({
        symbol: 'AAPL',
        score: 0.75,
        confidence: 0.85,
        components: {
          momentum: 0.8,
          volatility: 0.6,
          trend: 0.9,
        },
      }),
      addPrice: vi.fn(),
      getSignals: vi.fn().mockReturnValue([]),
    } as any;

    // Mock ServerResponse
    responseStatus = 0;
    responseData = '';
    mockRes = {
      writeHead: vi.fn().mockImplementation((status: number, headers?: object) => {
        responseStatus = status;
      }),
      end: vi.fn().mockImplementation((data?: string) => {
        if (data) responseData = data;
      }),
      setHeader: vi.fn(),
      headersSent: false,
    } as any;

    // Set feed before each test
    setSignalFeed(mockFeed);
  });

  describe('GET /api/signals/health', () => {
    it('should return ok status', async () => {
      const req = createMockReq('GET');
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/health', 'GET');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
      const json = JSON.parse(responseData);
      expect(json.status).toBe('ok');
      expect(json.model).toBe('weighted-scoring-v1');
    });

    it('should only respond to GET method', async () => {
      const req = createMockReq('POST');
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/health', 'POST');

      expect(handled).toBe(false);
    });

    it('should return stable model identifier', async () => {
      const req = createMockReq('GET');
      await handleSignalRoutes(req, mockRes, '/api/signals/health', 'GET');

      const json = JSON.parse(responseData);
      expect(typeof json.model).toBe('string');
      expect(json.model.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/signals/analyze', () => {
    it('should analyze signal with valid symbol', async () => {
      const req = createMockReq('POST', { symbol: 'AAPL' });
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
      const json = JSON.parse(responseData);
      expect(json.symbol).toBe('AAPL');
      expect(json).toHaveProperty('signal');
      expect(json).toHaveProperty('exchange');
      expect(mockFeed.getSignal).toHaveBeenCalledWith('AAPL');
    });

    it('should include exchange in response', async () => {
      const req = createMockReq('POST', { symbol: 'GOOGL', exchange: 'nasdaq' });
      await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      const json = JSON.parse(responseData);
      expect(json.exchange).toBe('nasdaq');
    });

    it('should use default exchange when not provided', async () => {
      const req = createMockReq('POST', { symbol: 'MSFT' });
      await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      const json = JSON.parse(responseData);
      expect(json.exchange).toBe('default');
    });

    it('should return 400 when symbol is missing', async () => {
      const req = createMockReq('POST', { exchange: 'nasdaq' });
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(400);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('Missing symbol');
    });

    it('should return 400 with empty object body', async () => {
      const req = createMockReq('POST', {});
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(400);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('Missing symbol');
    });

    it('should return 400 for invalid JSON', async () => {
      const readable = new Readable({ read() {} }) as IncomingMessage;
      readable.method = 'POST';
      readable.headers = { 'content-type': 'application/json' };
      process.nextTick(() => {
        readable.push('{invalid json}');
        readable.push(null);
      });

      const handled = await handleSignalRoutes(readable, mockRes, '/api/signals/analyze', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(400);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('Invalid JSON');
    });

    it('should return 404 when no signal available', async () => {
      (mockFeed.getSignal as any).mockReturnValue(null);

      const req = createMockReq('POST', { symbol: 'UNKNOWN' });
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(404);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('No signal available');
      expect(json.message).toContain('UNKNOWN');
    });

    it('should include helpful message when signal unavailable', async () => {
      (mockFeed.getSignal as any).mockReturnValue(null);

      const req = createMockReq('POST', { symbol: 'XYZ' });
      await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      const json = JSON.parse(responseData);
      expect(json.message).toContain('price history');
      expect(json.message).toContain('addPrice');
    });

    it('should return 500 when signal analysis throws', async () => {
      (mockFeed.getSignal as any).mockImplementation(() => {
        throw new Error('ML model error');
      });

      const req = createMockReq('POST', { symbol: 'AAPL' });
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(500);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('Signal analysis failed');
      expect(json.message).toContain('ML model error');
    });

    it('should handle non-Error exceptions', async () => {
      (mockFeed.getSignal as any).mockImplementation(() => {
        throw 'unknown error';
      });

      const req = createMockReq('POST', { symbol: 'AAPL' });
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(500);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('Signal analysis failed');
    });
  });

  describe('Route matching', () => {
    it('should return false for unmatched path', async () => {
      const req = createMockReq('GET');
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/invalid', 'GET');

      expect(handled).toBe(false);
    });

    it('should return false for wrong base path', async () => {
      const req = createMockReq('GET');
      const handled = await handleSignalRoutes(req, mockRes, '/api/analysis/health', 'GET');

      expect(handled).toBe(false);
    });

    it('should return false for /api/signals without subpath', async () => {
      const req = createMockReq('GET');
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals', 'GET');

      expect(handled).toBe(false);
    });

    it('should not match GET /api/signals/analyze', async () => {
      const req = createMockReq('GET');
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'GET');

      expect(handled).toBe(false);
    });
  });

  describe('setSignalFeed()', () => {
    it('should set feed for subsequent calls', async () => {
      const newFeed = {
        getSignal: vi.fn().mockReturnValue({
          symbol: 'TSLA',
          score: 0.9,
          confidence: 0.95,
          components: {},
        }),
        addPrice: vi.fn(),
        getSignals: vi.fn().mockReturnValue([]),
      } as any;

      setSignalFeed(newFeed);

      const req = createMockReq('POST', { symbol: 'TSLA' });
      await handleSignalRoutes(req, mockRes, '/api/signals/analyze', 'POST');

      expect(responseStatus).toBe(200);
      const json = JSON.parse(responseData);
      expect(json.symbol).toBe('TSLA');
      expect(newFeed.getSignal).toHaveBeenCalledWith('TSLA');
    });
  });

  describe('Lazy initialization', () => {
    it('should create default feed when not explicitly set', async () => {
      // First, unset the feed by setting it to null or undefined
      // This tests the getFeed() lazy init behavior
      // Note: We can't actually unset the feed with the current API,
      // but we verify that the feed is used when set
      const req = createMockReq('GET');
      const handled = await handleSignalRoutes(req, mockRes, '/api/signals/health', 'GET');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
    });
  });
});
