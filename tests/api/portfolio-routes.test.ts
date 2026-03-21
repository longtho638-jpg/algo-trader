import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handlePortfolioRoutes, setPortfolioTracker } from '../../src/api/portfolio-routes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PortfolioTracker } from '../../src/portfolio/portfolio-tracker.js';

describe('Portfolio Routes', () => {
  let mockTracker: PortfolioTracker;
  let mockRes: ServerResponse;
  let mockReq: IncomingMessage;
  let responseStatus: number;
  let responseData: string;

  beforeEach(() => {
    // Reset mock tracker with typical portfolio data
    mockTracker = {
      getPortfolioSummary: vi.fn().mockReturnValue({
        totalEquity: 10000,
        totalRealizedPnl: 1000,
        totalUnrealizedPnl: 500,
        peakEquity: 11000,
        drawdown: 0.05,
        totalTradeCount: 50,
        totalWinCount: 30,
        winRate: 0.6,
        strategies: [
          {
            name: 'mean-reversion',
            equity: 6000,
            realizedPnl: 600,
            tradeCount: 30,
            winCount: 18,
            winRate: 0.6,
            avgWin: 50,
            avgLoss: 30,
          },
          {
            name: 'momentum',
            equity: 4000,
            realizedPnl: 400,
            tradeCount: 20,
            winCount: 12,
            winRate: 0.6,
            avgWin: 45,
            avgLoss: 35,
          },
        ],
        snapshotAt: Date.now(),
      }),
      getEquityCurve: vi.fn().mockReturnValue([
        { timestamp: Date.now() - 86400000, equity: 9000 },
        { timestamp: Date.now() - 43200000, equity: 9500 },
        { timestamp: Date.now(), equity: 10000 },
      ]),
      addTrade: vi.fn(),
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

    // Mock IncomingMessage
    mockReq = { method: 'GET', url: '/', headers: {} } as any;

    // Set tracker before each test
    setPortfolioTracker(mockTracker);
  });

  describe('handlePortfolioRoutes() without tracker', () => {
    it('should return 503 when tracker is not set', async () => {
      setPortfolioTracker(null as any);

      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/summary', 'GET');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(503);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('Portfolio not configured');
    });
  });

  describe('GET /api/portfolio/summary', () => {
    it('should return portfolio summary', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/summary', 'GET');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
      const json = JSON.parse(responseData);
      expect(json.totalEquity).toBe(10000);
      expect(json.totalRealizedPnl).toBe(1000);
      expect(json.strategies).toHaveLength(2);
      expect(mockTracker.getPortfolioSummary).toHaveBeenCalled();
    });

    it('should return 405 for non-GET method', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/summary', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(405);
      const json = JSON.parse(responseData);
      expect(json.error).toBe('Method Not Allowed');
    });

    it('should return 405 for DELETE method', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/summary', 'DELETE');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(405);
    });

    it('should return 405 for PUT method', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/summary', 'PUT');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(405);
    });
  });

  describe('GET /api/portfolio/equity-curve', () => {
    it('should return equity curve array', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/equity-curve', 'GET');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
      const json = JSON.parse(responseData);
      expect(json).toHaveProperty('curve');
      expect(Array.isArray(json.curve)).toBe(true);
      expect(json.curve).toHaveLength(3);
      expect(json.curve[0]).toHaveProperty('timestamp');
      expect(json.curve[0]).toHaveProperty('equity');
      expect(mockTracker.getEquityCurve).toHaveBeenCalled();
    });

    it('should return 405 for non-GET method on equity-curve', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/equity-curve', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(405);
    });

    it('should return equity curve with correct structure', async () => {
      await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/equity-curve', 'GET');

      const json = JSON.parse(responseData);
      json.curve.forEach((point: any) => {
        expect(typeof point.timestamp).toBe('number');
        expect(typeof point.equity).toBe('number');
        expect(point.equity).toBeGreaterThan(0);
      });
    });
  });

  describe('GET /api/portfolio/strategies', () => {
    it('should return strategy breakdown', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/strategies', 'GET');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
      const json = JSON.parse(responseData);
      expect(json).toHaveProperty('strategies');
      expect(Array.isArray(json.strategies)).toBe(true);
      expect(json.strategies).toHaveLength(2);
      expect(mockTracker.getPortfolioSummary).toHaveBeenCalled();
    });

    it('should include strategy details', async () => {
      await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/strategies', 'GET');

      const json = JSON.parse(responseData);
      const strategy = json.strategies[0];
      expect(strategy).toHaveProperty('name');
      expect(strategy).toHaveProperty('equity');
      expect(strategy).toHaveProperty('realizedPnl');
      expect(strategy).toHaveProperty('tradeCount');
      expect(strategy).toHaveProperty('winCount');
      expect(strategy).toHaveProperty('winRate');
    });

    it('should return 405 for non-GET method on strategies', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/strategies', 'POST');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(405);
    });

    it('should return 405 for DELETE method on strategies', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/strategies', 'DELETE');

      expect(handled).toBe(true);
      expect(responseStatus).toBe(405);
    });
  });

  describe('Route matching', () => {
    it('should return false for unmatched path', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/invalid', 'GET');

      expect(handled).toBe(false);
    });

    it('should return false for wrong base path', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/trades/summary', 'GET');

      expect(handled).toBe(false);
    });

    it('should return false for /api/portfolio without subpath', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio', 'GET');

      expect(handled).toBe(false);
    });

    it('should return false for /api/portfolio/summary/nested', async () => {
      const handled = await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/summary/nested', 'GET');

      expect(handled).toBe(false);
    });
  });

  describe('setPortfolioTracker()', () => {
    it('should set tracker for subsequent calls', async () => {
      const newTracker = {
        getPortfolioSummary: vi.fn().mockReturnValue({
          totalEquity: 5000,
          totalRealizedPnl: 500,
          totalUnrealizedPnl: 0,
          peakEquity: 6000,
          drawdown: 0.1,
          totalTradeCount: 10,
          totalWinCount: 6,
          winRate: 0.6,
          strategies: [],
          snapshotAt: Date.now(),
        }),
        getEquityCurve: vi.fn().mockReturnValue([]),
        addTrade: vi.fn(),
      } as any;

      setPortfolioTracker(newTracker);

      await handlePortfolioRoutes(mockReq, mockRes, '/api/portfolio/summary', 'GET');

      expect(responseStatus).toBe(200);
      const json = JSON.parse(responseData);
      expect(json.totalEquity).toBe(5000);
      expect(newTracker.getPortfolioSummary).toHaveBeenCalled();
    });
  });
});
