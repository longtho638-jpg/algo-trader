import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { wireWsEvents } from '../../src/wiring/ws-event-wiring.js';
import { EventBus } from '../../src/events/event-bus.js';

describe('wireWsEvents', () => {
  let eventBus: EventBus;
  let mockWsServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    eventBus = new EventBus();

    mockWsServer = {
      broadcast: vi.fn(),
      getClientCount: vi.fn().mockReturnValue(3),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns broadcaster and dispose function', () => {
    const result = wireWsEvents(eventBus, mockWsServer);

    expect(result).toHaveProperty('broadcaster');
    expect(result).toHaveProperty('dispose');
    expect(typeof result.dispose).toBe('function');
    expect(result.broadcaster).toBeDefined();
  });

  it('broadcasts trade.executed events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const tradeData = {
      trade: {
        id: 'trade-1',
        pair: 'BTC/USDT',
        qty: 0.1,
        price: 50000,
        timestamp: Date.now(),
      },
    };

    eventBus.emit('trade.executed', tradeData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'trades',
      expect.objectContaining({
        type: 'trade',
        data: tradeData.trade,
      })
    );
  });

  it('broadcasts strategy.started events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const strategyData = {
      name: 'Polymarket Arbitrage',
      config: {
        id: 'polymarket-arb',
        name: 'Polymarket Arbitrage',
        type: 'polymarket-arb' as const,
        enabled: true,
        params: {},
        intervalMs: 30000,
      },
    };

    eventBus.emit('strategy.started', strategyData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'strategies',
      expect.objectContaining({
        type: 'strategy',
        data: expect.objectContaining({
          name: 'Polymarket Arbitrage',
          event: 'started',
        }),
      })
    );
  });

  it('broadcasts strategy.stopped events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const strategyData = {
      name: 'Polymarket Arbitrage',
      reason: 'manual stop',
    };

    eventBus.emit('strategy.stopped', strategyData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'strategies',
      expect.objectContaining({
        type: 'strategy',
        data: expect.objectContaining({
          name: 'Polymarket Arbitrage',
          event: 'stopped',
          detail: 'manual stop',
        }),
      })
    );
  });

  it('broadcasts strategy.error events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const strategyData = {
      name: 'Grid / DCA',
      error: 'Connection timeout',
    };

    eventBus.emit('strategy.error', strategyData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'strategies',
      expect.objectContaining({
        type: 'strategy',
        data: expect.objectContaining({
          name: 'Grid / DCA',
          event: 'error',
          detail: 'Connection timeout',
        }),
      })
    );
  });

  it('broadcasts pnl.snapshot events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const pnlData = {
      snapshot: {
        timestamp: Date.now(),
        unrealizedPnl: 1500,
        realizedPnl: 2000,
        totalPnl: 3500,
      },
    };

    eventBus.emit('pnl.snapshot', pnlData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'pnl',
      expect.objectContaining({
        type: 'pnl',
        data: pnlData.snapshot,
      })
    );
  });

  it('broadcasts alert.triggered events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const alertData = {
      level: 'warning' as const,
      message: 'High slippage detected',
    };

    eventBus.emit('alert.triggered', alertData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith('alerts', alertData);
  });

  it('does not broadcast events after dispose() is called', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    mockWsServer.broadcast.mockClear();

    wiring.dispose();

    eventBus.emit('trade.executed', {
      trade: {
        id: 'trade-2',
        pair: 'ETH/USDT',
        qty: 1,
        price: 3000,
        timestamp: Date.now(),
      },
    });

    expect(mockWsServer.broadcast).not.toHaveBeenCalled();
  });

  it('clears stats timer on dispose()', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    // Advance timers to trigger stat logging
    vi.advanceTimersByTime(60_000);
    expect(mockWsServer.getClientCount).toHaveBeenCalled();

    mockWsServer.getClientCount.mockClear();

    wiring.dispose();

    // After dispose, stats timer should be cleared
    vi.advanceTimersByTime(60_000);
    expect(mockWsServer.getClientCount).not.toHaveBeenCalled();
  });

  it('logs stats periodically every 60 seconds', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    mockWsServer.getClientCount.mockClear();

    // Advance by 60 seconds
    vi.advanceTimersByTime(60_000);

    // getClientCount should have been called in the stats timer
    expect(mockWsServer.getClientCount).toHaveBeenCalled();

    mockWsServer.getClientCount.mockClear();

    // Advance by another 60 seconds
    vi.advanceTimersByTime(60_000);

    expect(mockWsServer.getClientCount).toHaveBeenCalled();
  });

  it('broadcasts timestamp with each event', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const beforeTime = new Date().toISOString();
    eventBus.emit('trade.executed', {
      trade: {
        id: 'trade-1',
        pair: 'BTC/USDT',
        qty: 0.1,
        price: 50000,
        timestamp: Date.now(),
      },
    });
    const afterTime = new Date().toISOString();

    const broadcastCall = mockWsServer.broadcast.mock.calls[0][1];
    expect(broadcastCall.timestamp).toBeDefined();
    expect(broadcastCall.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('can dispose and wire again independently', () => {
    const wiring1 = wireWsEvents(eventBus, mockWsServer);

    mockWsServer.broadcast.mockClear();

    wiring1.dispose();

    // Wire again with same WS server
    const wiring2 = wireWsEvents(eventBus, mockWsServer);

    eventBus.emit('trade.executed', {
      trade: {
        id: 'trade-3',
        pair: 'DOGE/USDT',
        qty: 100,
        price: 0.10,
        timestamp: Date.now(),
      },
    });

    // Should broadcast after re-wiring
    expect(mockWsServer.broadcast).toHaveBeenCalled();
  });

  it('handles multiple event emissions in sequence', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    mockWsServer.broadcast.mockClear();

    // Emit multiple different events
    eventBus.emit('strategy.started', { name: 'Strategy 1', config: {} as any });
    eventBus.emit('trade.executed', { trade: {} as any });
    eventBus.emit('strategy.stopped', { name: 'Strategy 1', reason: 'test' });

    expect(mockWsServer.broadcast).toHaveBeenCalledTimes(3);
  });

  it('broadcasts system.startup events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const startupData = {
      version: '0.1.0',
      timestamp: Date.now(),
    };

    eventBus.emit('system.startup', startupData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'system',
      expect.objectContaining({
        event: 'startup',
      })
    );
  });

  it('broadcasts system.shutdown events to WS', () => {
    const wiring = wireWsEvents(eventBus, mockWsServer);

    const shutdownData = {
      reason: 'manual shutdown',
      timestamp: Date.now(),
    };

    eventBus.emit('system.shutdown', shutdownData);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'system',
      expect.objectContaining({
        event: 'shutdown',
      })
    );
  });
});
