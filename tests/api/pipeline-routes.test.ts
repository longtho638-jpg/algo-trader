import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handlePipelineRoutes, setOrchestrator } from '../../src/api/pipeline-routes.js';
import type { ServerResponse } from 'node:http';

describe('Pipeline Routes', () => {
  let mockOrchestrator: any;
  let mockRes: ServerResponse;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ServerResponse
    mockRes = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn(),
      setHeader: vi.fn(),
      headersSent: false,
    } as unknown as ServerResponse;

    // Mock StrategyOrchestrator
    mockOrchestrator = {
      startAll: vi.fn(),
      stopAll: vi.fn(),
      start: vi.fn().mockReturnValue(true),
      stop: vi.fn().mockReturnValue(true),
      getStatus: vi.fn().mockReturnValue([
        {
          id: 'polymarket-arb',
          name: 'Polymarket Arbitrage',
          status: 'stopped',
          lastTick: null,
          tickCount: 0,
          errorCount: 0,
          lastError: null,
        },
      ]),
      getStrategyStatus: vi.fn().mockReturnValue({
        id: 'polymarket-arb',
        name: 'Polymarket Arbitrage',
        status: 'running',
        lastTick: null,
        tickCount: 0,
        errorCount: 0,
        lastError: null,
      }),
      isHealthy: vi.fn().mockReturnValue(true),
    };

    // Set the orchestrator
    setOrchestrator(mockOrchestrator);
  });

  afterEach(() => {
    setOrchestrator(null as any);
  });

  describe('handlePipelineRoutes', () => {
    it('returns 503 when orchestrator not set', async () => {
      setOrchestrator(null as any);

      const result = await handlePipelineRoutes({} as any, mockRes, '/api/pipeline/status', 'GET');

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.error).toBe('Pipeline not configured');
    });

    it('POST /api/pipeline/start calls startAll and returns strategies', async () => {
      const result = await handlePipelineRoutes({} as any, mockRes, '/api/pipeline/start', 'POST');

      expect(result).toBe(true);
      expect(mockOrchestrator.startAll).toHaveBeenCalledTimes(1);
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.ok).toBe(true);
      expect(parsed.strategies).toBeDefined();
      expect(Array.isArray(parsed.strategies)).toBe(true);
    });

    it('POST /api/pipeline/stop calls stopAll and returns stopped count', async () => {
      mockOrchestrator.getStatus.mockReturnValue([
        { status: 'running', id: 'strat-1' },
        { status: 'running', id: 'strat-2' },
        { status: 'stopped', id: 'strat-3' },
      ]);

      const result = await handlePipelineRoutes({} as any, mockRes, '/api/pipeline/stop', 'POST');

      expect(result).toBe(true);
      expect(mockOrchestrator.stopAll).toHaveBeenCalledTimes(1);
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.ok).toBe(true);
      expect(parsed.stopped).toBe(2);
    });

    it('GET /api/pipeline/status returns healthy and strategies', async () => {
      const result = await handlePipelineRoutes({} as any, mockRes, '/api/pipeline/status', 'GET');

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.healthy).toBe(true);
      expect(parsed.strategies).toBeDefined();
      expect(Array.isArray(parsed.strategies)).toBe(true);
    });

    it('POST /api/pipeline/strategy/:id/start calls start(id)', async () => {
      const result = await handlePipelineRoutes(
        {} as any,
        mockRes,
        '/api/pipeline/strategy/polymarket-arb/start',
        'POST'
      );

      expect(result).toBe(true);
      expect(mockOrchestrator.start).toHaveBeenCalledWith('polymarket-arb');
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });

    it('POST /api/pipeline/strategy/:id/stop calls stop(id)', async () => {
      const result = await handlePipelineRoutes(
        {} as any,
        mockRes,
        '/api/pipeline/strategy/polymarket-arb/stop',
        'POST'
      );

      expect(result).toBe(true);
      expect(mockOrchestrator.stop).toHaveBeenCalledWith('polymarket-arb');
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });

    it('returns strategy status in response for start action', async () => {
      const result = await handlePipelineRoutes(
        {} as any,
        mockRes,
        '/api/pipeline/strategy/polymarket-arb/start',
        'POST'
      );

      expect(result).toBe(true);
      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.strategy).toBeDefined();
      expect(parsed.strategy.id).toBe('polymarket-arb');
    });

    it('returns 404 when strategy not found', async () => {
      mockOrchestrator.getStrategyStatus.mockReturnValue(undefined);

      const result = await handlePipelineRoutes(
        {} as any,
        mockRes,
        '/api/pipeline/strategy/unknown-strat/start',
        'POST'
      );

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(404, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.error).toContain('not found');
    });

    it('returns 405 Method Not Allowed for GET /api/pipeline/start', async () => {
      const result = await handlePipelineRoutes({} as any, mockRes, '/api/pipeline/start', 'GET');

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(405, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.error).toBe('Method Not Allowed');
    });

    it('returns 405 Method Not Allowed for POST /api/pipeline/status', async () => {
      const result = await handlePipelineRoutes({} as any, mockRes, '/api/pipeline/status', 'POST');

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(405, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.error).toBe('Method Not Allowed');
    });

    it('returns 405 Method Not Allowed for GET strategy start', async () => {
      const result = await handlePipelineRoutes(
        {} as any,
        mockRes,
        '/api/pipeline/strategy/polymarket-arb/start',
        'GET'
      );

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    });

    it('returns false (404 fallthrough) for unmatched path', async () => {
      const result = await handlePipelineRoutes({} as any, mockRes, '/api/unknown', 'GET');

      expect(result).toBe(false);
    });

    it('returns 200 with strategy status even when start() returns false (already running)', async () => {
      mockOrchestrator.start.mockReturnValue(false);

      const result = await handlePipelineRoutes(
        {} as any,
        mockRes,
        '/api/pipeline/strategy/polymarket-arb/start',
        'POST'
      );

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.ok).toBe(false);
      expect(parsed.strategy).toBeDefined();
    });

    it('returns 200 with strategy status even when stop() returns false (already stopped)', async () => {
      mockOrchestrator.stop.mockReturnValue(false);

      const result = await handlePipelineRoutes(
        {} as any,
        mockRes,
        '/api/pipeline/strategy/polymarket-arb/stop',
        'POST'
      );

      expect(result).toBe(true);
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const endCall = (mockRes.end as any).mock.calls[0][0];
      const parsed = JSON.parse(endCall);
      expect(parsed.ok).toBe(false);
      expect(parsed.strategy).toBeDefined();
    });
  });

  describe('setOrchestrator', () => {
    it('sets the orchestrator for route handlers', async () => {
      const newOrch = {
        startAll: vi.fn(),
        stopAll: vi.fn(),
        start: vi.fn().mockReturnValue(true),
        stop: vi.fn().mockReturnValue(true),
        getStatus: vi.fn().mockReturnValue([]),
        getStrategyStatus: vi.fn().mockReturnValue(undefined),
        isHealthy: vi.fn().mockReturnValue(true),
      };

      setOrchestrator(newOrch);

      const result = await handlePipelineRoutes({} as any, mockRes, '/api/pipeline/status', 'GET');

      expect(result).toBe(true);
      expect(newOrch.getStatus).toHaveBeenCalled();
    });
  });
});
